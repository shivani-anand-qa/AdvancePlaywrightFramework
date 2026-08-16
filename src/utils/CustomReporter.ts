import type { Reporter, FullConfig, FullResult, Suite, TestCase, TestStep, TestResult } from '@playwright/test/reporter';
import fs from 'fs';
import path from 'path';

type Outcome = 'expected' | 'unexpected' | 'flaky' | 'skipped';

interface TestStepRecord {
    title: string;
    durationMs: number;
    status: 'pass' | 'fail';
    error?: string;
    startedAt: string;
    videoRange?: string;
    logs: string[];
}

interface TestRecord {
    seq: number;
    suite: string;
    title: string;
    author: string;
    priority: string;
    tags: string[];
    file: string;
    start: string;
    end: string;
    durationMs: number;
    status: Outcome;
    error?: string;
    steps?: TestStepRecord[];
    logs: string[];
    screenshotHref?: string;
    videoHref?: string;
    traceHref?: string;
}

interface Summary {
    total: number;
    passed: number;
    failed: number;
    flaky: number;
    skipped: number;
    passRate: string;
    environment: string;
    browser: string;
    platform: string;
    workers: number;
    runId: string;
    startedAt: string;
    durationMs: number;
}

interface CustomReporterOptions {
    outputDir?: string;
    outputFile?: string;
}

const ANSI = {
    reset: '\x1b[0m',
    bold: '\x1b[1m',
    gray: '\x1b[90m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    cyan: '\x1b[36m',
};

function paint(text: string, code: string): string {
    return code + text + ANSI.reset;
}

function pad(n: number): string {
    return String(n).padStart(2, '0');
}

function formatRunId(date: Date): string {
    return (
        date.getFullYear() +
        pad(date.getMonth() + 1) +
        pad(date.getDate()) +
        '_' +
        pad(date.getHours()) +
        pad(date.getMinutes()) +
        pad(date.getSeconds())
    );
}

function formatClockTime(date: Date): string {
    return pad(date.getHours()) + ':' + pad(date.getMinutes()) + ':' + pad(date.getSeconds());
}

function formatPlatform(): string {
    switch (process.platform) {
        case 'darwin':
            return 'Mac';
        case 'win32':
            return 'Windows';
        case 'linux':
            return 'Linux';
        default:
            return process.platform;
    }
}

function formatDuration(ms: number): string {
    if (ms < 1000) return Math.round(ms) + 'ms';
    return (ms / 1000).toFixed(2) + 's';
}

function stripAnsi(text: string): string {
    return text.replace(/\x1b\[[0-9;]*m/g, '');
}

/** Formats a millisecond offset as m:ss.cc, clamped to zero (video/step timing can race by a few ms). */
function formatTimeOffset(ms: number): string {
    const totalCentis = Math.round(Math.max(0, ms) / 10);
    const minutes = Math.floor(totalCentis / 6000);
    const seconds = Math.floor((totalCentis % 6000) / 100);
    const centis = totalCentis % 100;
    return minutes + ':' + String(seconds).padStart(2, '0') + '.' + String(centis).padStart(2, '0');
}

function formatVideoRange(offsetMs: number, durationMs: number): string {
    return formatTimeOffset(offsetMs) + ' - ' + formatTimeOffset(offsetMs + durationMs);
}

/** Playwright's own browser/context lifecycle bookkeeping — not useful in a step-by-step debug view. */
const BOILERPLATE_STEP_TITLES = /^(Launch browser|Create context|Create page|Close context|Close browser|Close page)$/;

/**
 * Flattens a test result's step tree into the entries worth showing. Prefers named `test.step()`
 * groups where the suite uses them (stops descending once it finds one, so its inner pw:api calls
 * don't also show up as separate rows); falls back to raw pw:api/expect calls otherwise.
 */
function collectSteps(
    steps: readonly TestStep[],
    resultStartTime: Date,
    getStepLogs: (step: TestStep) => string[]
): TestStepRecord[] {
    const out: TestStepRecord[] = [];
    for (const step of steps) {
        const isNamedStep = step.category === 'test.step';
        const isAction = (step.category === 'pw:api' || step.category === 'expect') && !BOILERPLATE_STEP_TITLES.test(step.title);

        if (isNamedStep || isAction) {
            const offsetMs = step.startTime.getTime() - resultStartTime.getTime();
            out.push({
                title: step.title,
                durationMs: step.duration,
                status: step.error ? 'fail' : 'pass',
                error: step.error ? stripAnsi(step.error.message ?? '') : undefined,
                startedAt: formatClockTime(step.startTime),
                videoRange: formatVideoRange(offsetMs, step.duration),
                logs: getStepLogs(step),
            });
            if (!isNamedStep && step.steps.length) out.push(...collectSteps(step.steps, resultStartTime, getStepLogs));
        } else if (step.steps.length) {
            out.push(...collectSteps(step.steps, resultStartTime, getStepLogs));
        }
    }
    return out;
}

function outcomeColor(outcome: Outcome): string {
    switch (outcome) {
        case 'expected':
            return ANSI.green;
        case 'flaky':
            return ANSI.yellow;
        case 'skipped':
            return ANSI.gray;
        case 'unexpected':
        default:
            return ANSI.red;
    }
}

function outcomeIcon(outcome: Outcome): string {
    switch (outcome) {
        case 'expected':
            return '✓';
        case 'flaky':
            return '⟳';
        case 'skipped':
            return '○';
        case 'unexpected':
        default:
            return '✗';
    }
}

export default class CustomReporter implements Reporter {
    private readonly outputDir: string;
    private readonly outputFile: string;
    private suite!: Suite;
    private config!: FullConfig;
    private startTime = 0;
    private runId = '';

    // Console/log output is only handed to the reporter as it streams in (onStdOut/onStdErr), scoped
    // to whichever test+step is currently running — buffer it here so buildRecords() can look it up
    // per result / per step once the run is over.
    private readonly resultLogs = new WeakMap<TestResult, string[]>();
    private readonly stepLogs = new WeakMap<TestStep, string[]>();
    private readonly openSteps = new WeakMap<TestResult, TestStep[]>();

    constructor(options: CustomReporterOptions = {}) {
        this.outputDir = options.outputDir ?? 'test-results/custom-report';
        this.outputFile = options.outputFile ?? 'index.html';
    }

    onBegin(config: FullConfig, suite: Suite): void {
        this.config = config;
        this.suite = suite;
        this.startTime = Date.now();
        this.runId = formatRunId(new Date(this.startTime));

        const environment = (process.env.TTA_ENV || 'qa').toLowerCase();
        const browser = config.projects[0]?.name ?? 'chromium';
        const total = suite.allTests().length;

        console.log('');
        console.log(paint('─'.repeat(56), ANSI.cyan));
        console.log(paint(' 🎭 Automation Report — Run Starting', ANSI.bold + ANSI.cyan));
        console.log(paint('─'.repeat(56), ANSI.cyan));
        console.log(' Environment : ' + paint(environment, ANSI.yellow));
        console.log(' Browser     : ' + browser);
        console.log(' Workers     : ' + config.workers);
        console.log(' Run ID      : ' + this.runId);
        console.log(' Tests       : ' + total);
        console.log(paint('─'.repeat(56), ANSI.cyan));
        console.log('');
    }

    onTestEnd(test: TestCase): void {
        const lastResult = test.results[test.results.length - 1];
        if (!lastResult) return;

        const outcome = test.outcome() as Outcome;
        const icon = outcomeIcon(outcome);
        const color = outcomeColor(outcome);
        const fullTitle = test.titlePath().slice(3).join(' › ');
        const retries = test.results.length - 1;
        const retrySuffix = retries > 0 ? paint(' (' + retries + ' retries)', ANSI.yellow) : '';

        console.log(
            '  ' + paint(icon, color) + ' ' + fullTitle + retrySuffix + ' ' + paint(formatDuration(lastResult.duration), ANSI.gray)
        );

        if (outcome === 'unexpected' && lastResult.errors[0]?.message) {
            const firstLine = stripAnsi(lastResult.errors[0].message).split('\n')[0];
            console.log(paint('      ↳ ' + firstLine, ANSI.red));
        }
    }

    onStepBegin(test: TestCase, result: TestResult, step: TestStep): void {
        if (!this.openSteps.has(result)) this.openSteps.set(result, []);
        this.openSteps.get(result)!.push(step);
        this.stepLogs.set(step, []);
    }

    onStepEnd(test: TestCase, result: TestResult): void {
        this.openSteps.get(result)?.pop();
    }

    onStdOut(chunk: string | Buffer, test: void | TestCase, result: void | TestResult): void {
        this.captureOutput(chunk, result);
    }

    onStdErr(chunk: string | Buffer, test: void | TestCase, result: void | TestResult): void {
        this.captureOutput(chunk, result);
    }

    private captureOutput(chunk: string | Buffer, result: void | TestResult): void {
        if (!result) return;
        const lines = chunk
            .toString()
            .split('\n')
            .map((line) => stripAnsi(line).replace(/\r$/, ''))
            .filter((line) => line.length > 0);
        if (!lines.length) return;

        if (!this.resultLogs.has(result)) this.resultLogs.set(result, []);
        this.resultLogs.get(result)!.push(...lines);

        const stack = this.openSteps.get(result);
        const currentStep = stack?.[stack.length - 1];
        if (currentStep) {
            if (!this.stepLogs.has(currentStep)) this.stepLogs.set(currentStep, []);
            this.stepLogs.get(currentStep)!.push(...lines);
        }
    }

    async onEnd(result: FullResult): Promise<void> {
        const durationMs = Date.now() - this.startTime;
        const records = this.buildRecords();
        const summary = this.buildSummary(records, durationMs);

        this.printSummary(summary, result.status);

        fs.mkdirSync(this.outputDir, { recursive: true });

        fs.writeFileSync(
            path.join(this.outputDir, 'results.json'),
            JSON.stringify({ summary, tests: records }, null, 2),
            'utf-8'
        );

        fs.writeFileSync(path.join(this.outputDir, this.outputFile), this.buildHtml(summary, records), 'utf-8');

        console.log(paint('  Report: ' + path.join(this.outputDir, this.outputFile), ANSI.cyan));
        console.log('');
    }

    private buildRecords(): TestRecord[] {
        return this.suite.allTests().map((test, index) => {
            const lastResult = test.results[test.results.length - 1];
            const outcome = test.outcome() as Outcome;

            const parent = test.parent;
            const suiteName = parent.type === 'describe' ? parent.title : path.basename(test.location.file).replace(/\.spec\.ts$|\.ts$/, '');

            const authorAnnotation = test.annotations.find((a) => a.type === 'author');
            const author = authorAnnotation?.description ?? process.env.TEST_AUTHOR ?? 'Unassigned';

            const priorityTag = test.tags.find((t) => /^@?p[0-3]$/i.test(t));
            const priority = priorityTag ? priorityTag.replace('@', '').toUpperCase() : 'P2';
            const tags = test.tags.filter((t) => t !== priorityTag);

            const file = path.relative(process.cwd(), test.location.file) + ':' + test.location.line;
            const start = lastResult ? formatClockTime(lastResult.startTime) : '—';
            const end = lastResult
                ? formatClockTime(new Date(lastResult.startTime.getTime() + lastResult.duration))
                : '—';
            const durationMs = test.results.reduce((sum, r) => sum + r.duration, 0);

            // For a flaky test, `lastResult` is the retry that finally passed — it has no error,
            // no interesting steps, and (since screenshots are only-on-failure) often no screenshot.
            // Source debug info from the attempt that actually failed instead.
            const failingResult = test.results.find((r) => r.status === 'failed' || r.status === 'timedOut' || r.status === 'interrupted');
            const sourceResult = outcome === 'unexpected' || outcome === 'flaky' ? (failingResult ?? lastResult) : lastResult;

            const rawError = sourceResult?.errors[0]?.message;
            const error = rawError ? stripAnsi(rawError) : undefined;

            const steps = sourceResult
                ? collectSteps(sourceResult.steps, sourceResult.startTime, (step) => this.stepLogs.get(step) ?? [])
                : undefined;
            const logs = sourceResult ? this.resultLogs.get(sourceResult) ?? [] : [];

            const attachments = sourceResult?.attachments ?? [];
            const screenshot = attachments.find((a) => a.contentType.startsWith('image/') && a.path);
            const video = attachments.find((a) => a.contentType.startsWith('video/') && a.path);
            const trace = attachments.find((a) => a.name === 'trace' && a.path);

            return {
                seq: index + 1,
                suite: suiteName,
                title: test.title,
                author,
                priority,
                tags,
                file,
                start,
                end,
                durationMs,
                status: outcome,
                error,
                steps,
                logs,
                screenshotHref: screenshot?.path ? this.relativeAttachmentPath(screenshot.path) : undefined,
                videoHref: video?.path ? this.relativeAttachmentPath(video.path) : undefined,
                traceHref: trace?.path ? this.relativeAttachmentPath(trace.path) : undefined,
            };
        });
    }

    private relativeAttachmentPath(absolutePath: string): string {
        return path.relative(this.outputDir, absolutePath).split(path.sep).join('/');
    }

    private buildSummary(records: TestRecord[], durationMs: number): Summary {
        const total = records.length;
        const passed = records.filter((r) => r.status === 'expected').length;
        const failed = records.filter((r) => r.status === 'unexpected').length;
        const flaky = records.filter((r) => r.status === 'flaky').length;
        const skipped = records.filter((r) => r.status === 'skipped').length;
        const passRate = total > 0 ? (((passed + flaky) / total) * 100).toFixed(1) : '0.0';

        return {
            total,
            passed,
            failed,
            flaky,
            skipped,
            passRate,
            environment: (process.env.TTA_ENV || 'qa').toLowerCase(),
            browser: this.config.projects[0]?.name ?? 'chromium',
            platform: formatPlatform(),
            workers: this.config.workers,
            runId: this.runId,
            startedAt: new Date(this.startTime).toLocaleString(),
            durationMs,
        };
    }

    private printSummary(summary: Summary, overallStatus: FullResult['status']): void {
        console.log('');
        console.log(paint('─'.repeat(56), ANSI.cyan));
        console.log(paint(' Summary', ANSI.bold + ANSI.cyan));
        console.log(paint('─'.repeat(56), ANSI.cyan));
        console.log('  ' + paint('✓ Passed', ANSI.green) + '  : ' + summary.passed);
        console.log('  ' + paint('✗ Failed', ANSI.red) + '  : ' + summary.failed);
        console.log('  ' + paint('⟳ Flaky', ANSI.yellow) + '   : ' + summary.flaky);
        console.log('  ' + paint('○ Skipped', ANSI.gray) + ' : ' + summary.skipped);
        console.log('  Pass rate : ' + summary.passRate + '%');
        console.log('  Duration  : ' + formatDuration(summary.durationMs));
        console.log('  Result    : ' + (overallStatus === 'passed' ? paint(overallStatus, ANSI.green) : paint(overallStatus, ANSI.red)));
        console.log(paint('─'.repeat(56), ANSI.cyan));
    }

    private buildHtml(summary: Summary, records: TestRecord[]): string {
        const dataJson = JSON.stringify({ summary, records });

        return (
            '<!doctype html>\n' +
            '<html lang="en">\n' +
            '<head>\n' +
            '<meta charset="utf-8" />\n' +
            '<title>Automation Report</title>\n' +
            '<meta name="viewport" content="width=device-width, initial-scale=1" />\n' +
            '<style>' +
            this.css() +
            '</style>\n' +
            '</head>\n' +
            '<body>\n' +
            '<div class="banner">\n' +
            '  <h1><span aria-hidden="true">🎭</span><span>Automation Report</span><span aria-hidden="true" class="ghost">🎭</span></h1>\n' +
            '  <div class="sub">Advanced Playwright Framework</div>\n' +
            '</div>\n' +
            '<div class="shell">\n' +
            '  <div class="cards" id="cards"></div>\n' +
            '  <div class="metabar" id="metabar"></div>\n' +
            '  <div class="filterbar">\n' +
            '    <div class="filtergroup" id="priority-filters"><span class="glabel">Priority</span></div>\n' +
            '    <div class="sep"></div>\n' +
            '    <div class="filtergroup" id="status-filters"><span class="glabel">Status</span></div>\n' +
            '    <div class="sep"></div>\n' +
            '    <div class="filtergroup" id="tag-filters"><span class="glabel">Tags</span></div>\n' +
            '  </div>\n' +
            '  <div class="table-wrap">\n' +
            '    <table>\n' +
            '      <thead>\n' +
            '        <tr>\n' +
            '          <th style="width:36px">#</th>\n' +
            '          <th>Suite</th>\n' +
            '          <th style="min-width:220px">Test</th>\n' +
            '          <th>Author</th>\n' +
            '          <th>Priority</th>\n' +
            '          <th>Tags</th>\n' +
            '          <th>File</th>\n' +
            '          <th class="num">Start</th>\n' +
            '          <th class="num">End</th>\n' +
            '          <th class="num">Duration</th>\n' +
            '          <th>Status</th>\n' +
            '          <th>Screenshot</th>\n' +
            '          <th>Video</th>\n' +
            '          <th>Trace</th>\n' +
            '        </tr>\n' +
            '      </thead>\n' +
            '      <tbody id="rows"></tbody>\n' +
            '    </table>\n' +
            '  </div>\n' +
            '</div>\n' +
            '<script>\n' +
            'var DATA = ' +
            dataJson +
            ';\n' +
            this.clientScript() +
            '\n</script>\n' +
            '</body>\n' +
            '</html>\n'
        );
    }

    private css(): string {
        return [
            ':root {',
            '  --bg: #f4f5f9; --surface: #ffffff; --surface-2: #eef1f6; --border: #dfe3ec;',
            '  --text: #161a24; --muted: #5c6577; --accent: #0e6f5c; --accent-2: #1a4d8f; --accent-soft: #e6f3ef;',
            '  --pass: #158a5f; --pass-soft: #e5f5ec; --fail: #c8383d; --fail-soft: #fbeaea;',
            '  --flaky: #a5730c; --flaky-soft: #faf1de; --skip: #6b7280; --skip-soft: #eef0f3;',
            '  --mono: ui-monospace, "SF Mono", "Cascadia Code", Consolas, monospace;',
            '  --sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;',
            '}',
            '* { box-sizing: border-box; }',
            'body { margin: 0; background: var(--bg); color: var(--text); font-family: var(--sans); padding: 0 0 64px; }',
            '.banner { background: linear-gradient(120deg, var(--accent-2), var(--accent)); padding: 34px 20px 40px; text-align: center; margin-bottom: -26px; }',
            '.banner h1 { display: flex; align-items: baseline; justify-content: center; gap: 10px; color: #fff; font-size: clamp(22px, 3vw, 28px); margin: 0; letter-spacing: -0.01em; text-shadow: 0 1px 12px rgba(0,0,0,0.15); }',
            '.banner h1 .ghost { visibility: hidden; }',
            '.banner .sub { color: rgba(255,255,255,0.85); font-family: var(--mono); font-size: 12.5px; margin-top: 8px; }',
            '.shell { max-width: 1160px; margin: 0 auto; padding: 0 20px; }',
            '.cards { position: relative; display: grid; grid-template-columns: repeat(7, 1fr); gap: 10px; margin-bottom: 16px; }',
            '.card { background: var(--surface); border: 1px solid var(--border); border-left: 3px solid var(--border); border-radius: 10px; padding: 14px 16px; box-shadow: 0 6px 20px -14px rgba(15,23,42,0.35); }',
            '.card .num { font-family: var(--mono); font-variant-numeric: tabular-nums; font-size: 24px; font-weight: 600; line-height: 1.1; }',
            '.card .label { font-size: 10.5px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.06em; margin-top: 5px; }',
            '.card.total { border-left-color: var(--accent-2); } .card.total .num { color: var(--accent-2); }',
            '.card.pass { border-left-color: var(--pass); } .card.pass .num { color: var(--pass); }',
            '.card.fail { border-left-color: var(--fail); } .card.fail .num { color: var(--fail); }',
            '.card.flaky { border-left-color: var(--flaky); } .card.flaky .num { color: var(--flaky); }',
            '.card.skip { border-left-color: var(--skip); } .card.skip .num { color: var(--skip); }',
            '.card.rate { border-left-color: var(--accent); } .card.rate .num { color: var(--accent); }',
            '.card.duration { border-left-color: var(--accent-2); } .card.duration .num { color: var(--accent-2); }',
            '.metabar, .filterbar { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 12px 16px; margin-bottom: 10px; display: flex; align-items: center; gap: 22px; flex-wrap: wrap; font-size: 12.5px; }',
            '.meta-item { display: flex; align-items: center; gap: 7px; }',
            '.meta-item .k { color: var(--muted); text-transform: uppercase; font-size: 10.5px; letter-spacing: 0.05em; }',
            '.meta-item .v { font-family: var(--mono); font-weight: 600; }',
            '.pill { display: inline-flex; align-items: center; gap: 5px; background: var(--accent-soft); color: var(--accent); border-radius: 999px; padding: 3px 10px; font-family: var(--mono); font-weight: 600; font-size: 12px; }',
            '.filtergroup { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }',
            '.filtergroup .glabel { color: var(--muted); font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.06em; margin-right: 2px; }',
            '.chk { display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--border); border-radius: 7px; padding: 5px 10px; cursor: pointer; user-select: none; font-size: 12.5px; color: var(--muted); background: var(--surface-2); }',
            '.chk input { accent-color: var(--accent); }',
            '.chk.checked { color: var(--text); border-color: var(--accent); background: var(--accent-soft); }',
            '.chk .n { font-family: var(--mono); opacity: 0.7; }',
            '.chk.zero { opacity: 0.45; cursor: not-allowed; }',
            '.sep { width: 1px; align-self: stretch; background: var(--border); }',
            '.table-wrap { overflow-x: auto; border: 1px solid var(--border); border-radius: 10px; background: var(--surface); }',
            'table { width: 100%; border-collapse: collapse; min-width: 1260px; }',
            'thead th { position: sticky; top: 0; text-align: left; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); font-weight: 700; padding: 10px 12px; background: var(--surface-2); border-bottom: 1px solid var(--border); white-space: nowrap; }',
            'tbody tr.row { border-bottom: 1px solid var(--border); cursor: pointer; }',
            'tbody tr.row:hover { background: var(--surface-2); }',
            'tbody tr.row[hidden], tbody tr.detail[hidden] { display: none; }',
            'td { padding: 10px 12px; vertical-align: top; font-size: 12.5px; }',
            'td.num { font-family: var(--mono); font-variant-numeric: tabular-nums; color: var(--muted); white-space: nowrap; }',
            '.test-name { font-weight: 600; }',
            '.file { font-family: var(--mono); font-size: 11px; color: var(--muted); }',
            '.badge { display: inline-flex; align-items: center; gap: 4px; font-family: var(--mono); font-size: 10.5px; font-weight: 700; padding: 3px 9px; border-radius: 999px; text-transform: uppercase; letter-spacing: 0.03em; white-space: nowrap; }',
            '.badge.expected { background: var(--pass-soft); color: var(--pass); }',
            '.badge.unexpected { background: var(--fail-soft); color: var(--fail); }',
            '.badge.flaky { background: var(--flaky-soft); color: var(--flaky); }',
            '.badge.skipped { background: var(--skip-soft); color: var(--skip); }',
            '.prio { font-family: var(--mono); font-size: 11px; font-weight: 700; padding: 2px 7px; border-radius: 5px; }',
            '.prio.P0 { background: var(--fail-soft); color: var(--fail); }',
            '.prio.P1 { background: var(--flaky-soft); color: var(--flaky); }',
            '.prio.P2, .prio.P3 { background: var(--surface-2); color: var(--muted); }',
            '.tag { display: inline-block; font-family: var(--mono); font-size: 10.5px; color: var(--accent-2); background: var(--surface-2); border-radius: 5px; padding: 2px 6px; margin: 1px 3px 1px 0; }',
            '.action { display: inline-flex; align-items: center; gap: 4px; border: 1px solid var(--border); background: var(--surface-2); color: var(--text); border-radius: 6px; padding: 4px 8px; font-size: 11px; font-family: var(--mono); cursor: pointer; white-space: nowrap; text-decoration: none; }',
            '.action.view { color: var(--pass); } .action.play { color: var(--flaky); } .action.trace { color: var(--accent-2); }',
            '.na { color: var(--muted); font-family: var(--mono); font-size: 11px; }',
            '.chevron { display: inline-block; transition: transform 0.15s ease; color: var(--muted); margin-right: 4px; }',
            'tr.row.open .chevron { transform: rotate(90deg); }',
            'tr.detail td { background: #fcfcfd; padding: 0; }',
            '.detail-inner { padding: 14px 18px 18px 42px; display: flex; flex-direction: column; gap: 16px; }',
            '.detail-label, .detail-section-label { font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.06em; font-weight: 700; margin-bottom: 8px; }',
            '.detail-label { color: var(--fail); }',
            '.detail-section-label.toggle { cursor: pointer; user-select: none; display: flex; align-items: center; gap: 6px; }',
            '.detail-section-label.toggle .sec-arrow { display: inline-block; font-size: 9px; transition: transform 0.15s ease; }',
            '.detail-section-label.toggle.collapsed .sec-arrow { transform: rotate(-90deg); }',
            '.error { font-family: var(--mono); font-size: 11.5px; line-height: 1.6; color: var(--fail); background: var(--fail-soft); border: 1px solid #f3caca; border-radius: 8px; padding: 10px 12px; white-space: pre-wrap; overflow-x: auto; }',
            '.log-block { font-family: var(--mono); font-size: 11px; line-height: 1.6; color: #d7dce6; background: #12151f; border-radius: 8px; padding: 10px 12px; white-space: pre-wrap; overflow: auto; max-height: 260px; }',
            '.steps { border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }',
            '.step-group { border-bottom: 1px solid var(--border); }',
            '.step-group:last-child { border-bottom: none; }',
            '.step { display: flex; align-items: center; gap: 10px; padding: 6px 12px; font-size: 11.5px; font-family: var(--mono); cursor: pointer; }',
            '.step.fail { background: var(--fail-soft); }',
            '.step .step-arrow { font-size: 9px; color: var(--muted); transition: transform 0.15s ease; }',
            '.step.open .step-arrow { transform: rotate(90deg); }',
            '.step-icon { width: 14px; text-align: center; }',
            '.step.ok .step-icon { color: var(--pass); }',
            '.step.fail .step-icon { color: var(--fail); }',
            '.step-title { flex: 1; }',
            '.step.fail .step-title { color: var(--fail); font-weight: 600; }',
            '.step-dur { color: var(--muted); font-size: 11px; }',
            '.step-sub-error { margin: 0 12px 8px 34px; font-family: var(--mono); font-size: 11px; color: var(--fail); border-left: 2px solid var(--fail); padding: 4px 10px; }',
            '.step-detail { padding: 10px 14px 12px 34px; background: var(--surface-2); border-top: 1px solid var(--border); }',
            '.step-meta { display: flex; gap: 16px; flex-wrap: wrap; font-size: 11px; color: var(--muted); font-family: var(--mono); margin-bottom: 8px; }',
            '.step-console-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); font-weight: 700; margin-bottom: 4px; }',
            '.media-row { display: flex; gap: 14px; flex-wrap: wrap; }',
            '.media-card { border: 1px solid var(--border); border-radius: 8px; overflow: hidden; background: var(--surface); width: 220px; }',
            '.media-card .thumb-img { width: 100%; height: 130px; object-fit: cover; display: block; background: var(--surface-2); }',
            '.media-card .thumb-video { width: 100%; height: 130px; display: block; background: #000; }',
            '.media-card .trace-thumb { height: 130px; display: flex; align-items: center; justify-content: center; color: var(--muted); font-size: 12px; background: var(--surface-2); }',
            '.media-card .cap { padding: 6px 10px; font-size: 11px; display: flex; justify-content: space-between; align-items: center; color: var(--muted); }',
            '.media-card .cap a { color: var(--accent-2); text-decoration: none; font-weight: 600; }',
            '@media (prefers-reduced-motion: reduce) { .chevron { transition: none; } }',
            '@media (max-width: 1000px) { .cards { grid-template-columns: repeat(4, 1fr); } }',
            '@media (max-width: 640px) { .cards { grid-template-columns: repeat(3, 1fr); } }',
            '@media (max-width: 420px) { .cards { grid-template-columns: repeat(2, 1fr); } }',
        ].join('\n');
    }

    private clientScript(): string {
        return [
            "function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\"/g,'&quot;'); }",
            "function fmtDuration(ms) { if (ms === 0) return '—'; if (ms < 1000) return Math.round(ms) + 'ms'; return (ms / 1000).toFixed(2) + 's'; }",
            '',
            'var summary = DATA.summary;',
            'var records = DATA.records;',
            "var badgeLabel = { expected: 'passed', unexpected: 'failed', flaky: 'flaky', skipped: 'skipped' };",
            '',
            "document.getElementById('cards').innerHTML =",
            "  '<div class=\"card total\"><div class=\"num\">' + summary.total + '</div><div class=\"label\">Total tests</div></div>' +",
            "  '<div class=\"card pass\"><div class=\"num\">' + summary.passed + '</div><div class=\"label\">Passed</div></div>' +",
            "  '<div class=\"card fail\"><div class=\"num\">' + summary.failed + '</div><div class=\"label\">Failed</div></div>' +",
            "  '<div class=\"card flaky\"><div class=\"num\">' + summary.flaky + '</div><div class=\"label\">Flaky</div></div>' +",
            "  '<div class=\"card skip\"><div class=\"num\">' + summary.skipped + '</div><div class=\"label\">Skipped</div></div>' +",
            "  '<div class=\"card rate\"><div class=\"num\">' + summary.passRate + '%</div><div class=\"label\">Pass rate</div></div>' +",
            "  '<div class=\"card duration\"><div class=\"num\">' + fmtDuration(summary.durationMs) + '</div><div class=\"label\">Duration</div></div>';",
            '',
            "document.getElementById('metabar').innerHTML =",
            "  '<div class=\"meta-item\"><span class=\"k\">Environment</span><span class=\"pill\">🌐 ' + esc(summary.environment) + '</span></div>' +",
            "  '<div class=\"meta-item\"><span class=\"k\">Browser</span><span class=\"pill\">🌐 ' + esc(summary.browser) + '</span></div>' +",
            "  '<div class=\"meta-item\"><span class=\"k\">Platform</span><span class=\"v\">' + esc(summary.platform) + '</span></div>' +",
            "  '<div class=\"meta-item\"><span class=\"k\">Workers</span><span class=\"v\">' + summary.workers + '</span></div>' +",
            "  '<div class=\"meta-item\"><span class=\"k\">Run ID</span><span class=\"v\">' + esc(summary.runId) + '</span></div>' +",
            "  '<div class=\"meta-item\"><span class=\"k\">Started</span><span class=\"v\">' + esc(summary.startedAt) + '</span></div>' +",
            "  '<div class=\"meta-item\"><span class=\"k\">Duration</span><span class=\"v\">' + fmtDuration(summary.durationMs) + '</span></div>';",
            '',
            "var priorities = ['All', 'P0', 'P1', 'P2', 'P3'];",
            "var statuses = ['All', 'expected', 'unexpected', 'flaky', 'skipped'];",
            "var statusLabels = { expected: 'Passed', unexpected: 'Failed', flaky: 'Flaky', skipped: 'Skipped' };",
            "var allTags = Array.prototype.concat.apply([], records.map(function(r){ return r.tags; }))",
            "  .filter(function(t, i, arr) { return arr.indexOf(t) === i; }).sort();",
            "var activePriority = 'All';",
            "var activeStatus = 'All';",
            'var activeTags = [];',
            '',
            'function countPriority(p) { return p === "All" ? records.length : records.filter(function(r){ return r.priority === p; }).length; }',
            'function countStatus(s) { return s === "All" ? records.length : records.filter(function(r){ return r.status === s; }).length; }',
            'function countTag(t) { return records.filter(function(r){ return r.tags.indexOf(t) !== -1; }).length; }',
            '',
            'function renderFilters() {',
            "  var pHtml = '<span class=\"glabel\">Priority</span>';",
            '  priorities.forEach(function(p) {',
            '    var n = countPriority(p);',
            '    var zero = n === 0 && p !== "All";',
            "    pHtml += '<label class=\"chk' + (activePriority === p ? ' checked' : '') + (zero ? ' zero' : '') + '\" data-group=\"priority\" data-value=\"' + p + '\">' +",
            "      '<input type=\"checkbox\"' + (activePriority === p ? ' checked' : '') + (zero ? ' disabled' : '') + ' />' + p + ' <span class=\"n\">' + n + '</span></label>';",
            '  });',
            "  document.getElementById('priority-filters').innerHTML = pHtml;",
            '',
            "  var sHtml = '<span class=\"glabel\">Status</span>';",
            '  statuses.forEach(function(s) {',
            '    var n = countStatus(s);',
            '    var zero = n === 0 && s !== "All";',
            "    var label = s === 'All' ? 'All' : statusLabels[s];",
            "    sHtml += '<label class=\"chk' + (activeStatus === s ? ' checked' : '') + (zero ? ' zero' : '') + '\" data-group=\"status\" data-value=\"' + s + '\">' +",
            "      '<input type=\"checkbox\"' + (activeStatus === s ? ' checked' : '') + (zero ? ' disabled' : '') + ' />' + label + ' <span class=\"n\">' + n + '</span></label>';",
            '  });',
            "  document.getElementById('status-filters').innerHTML = sHtml;",
            '',
            "  var tHtml = '<span class=\"glabel\">Tags</span>';",
            "  var allTagsChecked = activeTags.length === 0;",
            "  tHtml += '<label class=\"chk' + (allTagsChecked ? ' checked' : '') + '\" data-group=\"tag\" data-value=\"All\">' +",
            "    '<input type=\"checkbox\"' + (allTagsChecked ? ' checked' : '') + ' />All <span class=\"n\">' + records.length + '</span></label>';",
            '  allTags.forEach(function(t) {',
            '    var n = countTag(t);',
            "    var checked = activeTags.indexOf(t) !== -1;",
            "    tHtml += '<label class=\"chk' + (checked ? ' checked' : '') + '\" data-group=\"tag\" data-value=\"' + t + '\">' +",
            "      '<input type=\"checkbox\"' + (checked ? ' checked' : '') + ' />' + esc(t) + ' <span class=\"n\">' + n + '</span></label>';",
            '  });',
            "  document.getElementById('tag-filters').innerHTML = allTags.length ? tHtml : '<span class=\"glabel\">Tags</span><span class=\"na\">no tags in this suite</span>';",
            '',
            "  Array.prototype.forEach.call(document.querySelectorAll('.chk'), function(el) {",
            "    el.addEventListener('click', function(e) {",
            '      e.preventDefault();',
            '      if (el.classList.contains("zero")) return;',
            '      var group = el.getAttribute("data-group");',
            '      var value = el.getAttribute("data-value");',
            '      if (group === "priority") activePriority = value;',
            '      if (group === "status") activeStatus = value;',
            '      if (group === "tag") {',
            '        if (value === "All") {',
            '          activeTags = [];',
            '        } else {',
            '          var idx = activeTags.indexOf(value);',
            '          if (idx === -1) activeTags.push(value); else activeTags.splice(idx, 1);',
            '        }',
            '      }',
            '      renderFilters();',
            '      applyFilters();',
            '    });',
            '  });',
            '}',
            '',
            'function applyFilters() {',
            "  Array.prototype.forEach.call(document.querySelectorAll('#rows tr.row'), function(row) {",
            '    var i = parseInt(row.getAttribute("data-i"), 10);',
            '    var r = records[i];',
            '    var tagMatch = activeTags.length === 0 || activeTags.some(function(t) { return r.tags.indexOf(t) !== -1; });',
            '    var match = (activePriority === "All" || r.priority === activePriority) && (activeStatus === "All" || r.status === activeStatus) && tagMatch;',
            '    row.hidden = !match;',
            '    var detail = row.nextElementSibling;',
            '    if (detail && detail.classList.contains("detail")) {',
            '      detail.hidden = !match || !row.classList.contains("open");',
            '    }',
            '  });',
            '}',
            '',
            'function buildLogBlock(lines) {',
            '  return "<pre class=\\"log-block\\">" + esc(lines.join(String.fromCharCode(10))) + "</pre>";',
            '}',
            '',
            'function buildTestLogsHtml(r) {',
            '  if (!r.logs || !r.logs.length) return "";',
            '  return "<div><div class=\\"detail-section-label toggle\\" data-toggle=\\"logs\\"><span class=\\"sec-arrow\\">▼</span>Test Logs (" + r.logs.length + " lines)</div><div class=\\"toggle-body\\">" + buildLogBlock(r.logs) + "</div></div>";',
            '}',
            '',
            'function buildStepsHtml(r, ri) {',
            '  if (!r.steps || !r.steps.length) return "";',
            '  var groups = r.steps.map(function(s, si) {',
            '    var cls = s.status === "fail" ? "step fail" : "step ok";',
            '    var icon = s.status === "fail" ? "✗" : "✓";',
            '    var head = "<div class=\\"" + cls + "\\" data-ri=\\"" + ri + "\\" data-si=\\"" + si + "\\">" +',
            '      "<span class=\\"step-arrow\\">▶</span><span class=\\"step-icon\\">" + icon + "</span>" +',
            '      "<span class=\\"step-title\\">" + esc(s.title) + "</span><span class=\\"step-dur\\">" + fmtDuration(s.durationMs) + "</span></div>";',
            '    var subError = (s.status === "fail" && s.error) ?',
            '      "<div class=\\"step-sub-error\\">↳ " + esc(s.error.split(String.fromCharCode(10))[0]) + "</div>" : "";',
            '    var meta = "<div class=\\"step-meta\\"><span>⏱ Started: " + esc(s.startedAt) + "</span><span>⧗ Duration: " + fmtDuration(s.durationMs) + "</span>" +',
            '      (r.videoHref && s.videoRange ? "<span>🎬 Video: " + esc(s.videoRange) + "</span>" : "") + "</div>";',
            '    var consoleBlock = (s.logs && s.logs.length)',
            '      ? "<div class=\\"step-console-label\\">Console Output (" + s.logs.length + " lines)</div>" + buildLogBlock(s.logs)',
            '      : "";',
            '    var body = "<div class=\\"step-detail\\" hidden>" + meta + consoleBlock + "</div>";',
            '    return "<div class=\\"step-group\\">" + head + subError + body + "</div>";',
            '  }).join("");',
            '  return "<div><div class=\\"detail-section-label toggle\\" data-toggle=\\"steps\\"><span class=\\"sec-arrow\\">▼</span>Test Steps</div><div class=\\"toggle-body\\"><div class=\\"steps\\">" + groups + "</div></div></div>";',
            '}',
            '',
            'function buildMediaHtml(r) {',
            '  var cards = "";',
            '  if (r.screenshotHref) {',
            '    cards += "<div class=\\"media-card\\"><a href=\\"" + esc(r.screenshotHref) + "\\" target=\\"_blank\\" rel=\\"noopener\\"><img class=\\"thumb-img\\" src=\\"" + esc(r.screenshotHref) + "\\" alt=\\"screenshot\\" /></a><div class=\\"cap\\"><span>screenshot</span><a href=\\"" + esc(r.screenshotHref) + "\\" target=\\"_blank\\" rel=\\"noopener\\">View full ↗</a></div></div>";',
            '  }',
            '  if (r.videoHref) {',
            '    cards += "<div class=\\"media-card\\"><video class=\\"thumb-video\\" src=\\"" + esc(r.videoHref) + "\\" controls muted preload=\\"metadata\\"></video><div class=\\"cap\\"><span>video</span><a href=\\"" + esc(r.videoHref) + "\\" target=\\"_blank\\" rel=\\"noopener\\">Open ↗</a></div></div>";',
            '  }',
            '  if (r.traceHref) {',
            '    cards += "<div class=\\"media-card\\"><div class=\\"trace-thumb\\">⏺ trace.zip</div><div class=\\"cap\\"><span>trace</span><a href=\\"" + esc(r.traceHref) + "\\" target=\\"_blank\\" rel=\\"noopener\\">Open ↗</a></div></div>";',
            '  }',
            '  if (!cards) return "";',
            '  return "<div><div class=\\"detail-section-label media\\">🖼 Screenshot &amp; Video</div><div class=\\"media-row\\">" + cards + "</div></div>";',
            '}',
            '',
            "var rowsHtml = records.map(function(r, i) {",
            "  var hasError = !!r.error;",
            "  var expandable = hasError || (r.steps && r.steps.length > 0) || (r.logs && r.logs.length > 0) || !!r.screenshotHref || !!r.videoHref || !!r.traceHref;",
            "  var chevron = expandable ? '<span class=\"chevron\">▶</span>' : '<span class=\"chevron\" style=\"visibility:hidden\">▶</span>';",
            "  var tagsHtml = r.tags.length ? r.tags.map(function(t){ return '<span class=\"tag\">' + esc(t) + '</span>'; }).join('') : '<span class=\"na\">—</span>';",
            "  var screenshotHtml = r.screenshotHref ? '<a class=\"action view\" href=\"' + esc(r.screenshotHref) + '\" target=\"_blank\" rel=\"noopener\">👁 View</a>' : '<span class=\"na\">n/a</span>';",
            "  var videoHtml = r.videoHref ? '<a class=\"action play\" href=\"' + esc(r.videoHref) + '\" target=\"_blank\" rel=\"noopener\">▶ Play</a>' : '<span class=\"na\">n/a</span>';",
            "  var traceHtml = r.traceHref ? '<a class=\"action trace\" href=\"' + esc(r.traceHref) + '\" target=\"_blank\" rel=\"noopener\">⏺ Open</a>' : '<span class=\"na\">n/a</span>';",
            "  var row = '<tr class=\"row\" data-i=\"' + i + '\">' +",
            "    '<td class=\"num\">' + r.seq + '</td>' +",
            "    '<td>' + esc(r.suite) + '</td>' +",
            "    '<td class=\"test-name\">' + chevron + esc(r.title) + '</td>' +",
            "    '<td>' + esc(r.author) + '</td>' +",
            "    '<td><span class=\"prio ' + r.priority + '\">' + r.priority + '</span></td>' +",
            "    '<td>' + tagsHtml + '</td>' +",
            "    '<td class=\"file\">' + esc(r.file) + '</td>' +",
            "    '<td class=\"num\">' + esc(r.start) + '</td>' +",
            "    '<td class=\"num\">' + esc(r.end) + '</td>' +",
            "    '<td class=\"num\">' + fmtDuration(r.durationMs) + '</td>' +",
            "    '<td><span class=\"badge ' + r.status + '\">' + badgeLabel[r.status] + '</span></td>' +",
            "    '<td>' + screenshotHtml + '</td>' +",
            "    '<td>' + videoHtml + '</td>' +",
            "    '<td>' + traceHtml + '</td>' +",
            "  '</tr>';",
            "  var detail = '<tr class=\"detail\" hidden><td colspan=\"14\">' +",
            "    (expandable ? ('<div class=\"detail-inner\">' + (hasError ? '<div><div class=\"detail-label\">Error</div><div class=\"error\">' + esc(r.error) + '</div></div>' : '') + buildTestLogsHtml(r) + buildStepsHtml(r, i) + buildMediaHtml(r) + '</div>') : '') +",
            "  '</td></tr>';",
            '  return row + detail;',
            "}).join('');",
            "document.getElementById('rows').innerHTML = rowsHtml;",
            '',
            "Array.prototype.forEach.call(document.querySelectorAll('#rows tr.row'), function(row) {",
            "  row.addEventListener('click', function() {",
            '    var detail = row.nextElementSibling;',
            '    if (!detail || !detail.querySelector(".detail-inner")) return;',
            '    var opening = !row.classList.contains("open");',
            '    row.classList.toggle("open", opening);',
            '    detail.hidden = !opening;',
            '  });',
            '});',
            '',
            "document.getElementById('rows').addEventListener('click', function(e) {",
            '  var stepEl = e.target.closest ? e.target.closest(".step") : null;',
            '  if (stepEl) {',
            '    e.stopPropagation();',
            '    var stepDetail = stepEl.nextElementSibling;',
            '    if (stepDetail && stepDetail.classList.contains("step-sub-error")) stepDetail = stepDetail.nextElementSibling;',
            '    if (!stepDetail || !stepDetail.classList.contains("step-detail")) return;',
            '    var opening = stepDetail.hidden;',
            '    stepDetail.hidden = !opening;',
            '    stepEl.classList.toggle("open", opening);',
            '    return;',
            '  }',
            '  var toggleEl = e.target.closest ? e.target.closest(".detail-section-label.toggle") : null;',
            '  if (toggleEl) {',
            '    e.stopPropagation();',
            '    var body = toggleEl.nextElementSibling;',
            '    if (!body) return;',
            '    var collapsing = !toggleEl.classList.contains("collapsed");',
            '    toggleEl.classList.toggle("collapsed", collapsing);',
            '    body.hidden = collapsing;',
            '  }',
            '});',
            '',
            'renderFilters();',
        ].join('\n');
    }
}

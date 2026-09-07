export interface BuildSummary {
    runId: string;
    tests: Record<string, string>;
}

export interface FlakyResult {
    flaky: string[];
    summary?: string;
    counts: {
        flaky: number;
        failing: number;
        total: number;
    };
}

export async function analyzeFlaky(
    prev: BuildSummary,
    curr: BuildSummary,
    includeSummary: boolean,
): Promise<FlakyResult> {
    const testNames = new Set([...Object.keys(prev.tests), ...Object.keys(curr.tests)]);

    const flaky: string[] = [];
    let failing = 0;

    for (const name of testNames) {
        const prevStatus = prev.tests[name];
        const currStatus = curr.tests[name];
        if (currStatus === 'failed' || currStatus === 'timedOut') failing++;
        if (prevStatus && currStatus && prevStatus !== currStatus) {
            flaky.push(name);
        }
    }

    const counts = { flaky: flaky.length, failing, total: testNames.size };

    const summary =
        includeSummary && flaky.length > 0
            ? `${flaky.length} of ${testNames.size} test(s) changed status between build ${prev.runId} and ${curr.runId}: ${flaky.slice(0, 5).join(', ')}${flaky.length > 5 ? ', …' : ''}.`
            : undefined;

    return { flaky, summary, counts };
}

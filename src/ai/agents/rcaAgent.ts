export interface RcaVerdict {
    severity: 'Critical' | 'High' | 'Medium' | 'Low';
    priority: 'High' | 'Medium' | 'Low';
    rootCause: string;
    fixes: string[];
}

export interface FailureInput {
    title: string;
    file: string;
    error: string;
    stack?: string;
}

interface Rule {
    pattern: RegExp;
    severity: RcaVerdict['severity'];
    priority: RcaVerdict['priority'];
    rootCause: string;
    fixes: string[];
}

const RULES: Rule[] = [
    {
        pattern: /timeout.*exceeded|Timeout \d+ms exceeded/i,
        severity: 'High',
        priority: 'High',
        rootCause:
            'The action or assertion did not complete within the configured timeout, most likely because the target element never reached the expected state.',
        fixes: [
            'Confirm the element/selector is correct and visible at the time the step runs.',
            'Add an explicit wait for the expected state instead of relying on the default timeout.',
            'Check whether the environment under test is slower than usual (network, backend latency).',
        ],
    },
    {
        pattern: /strict mode violation|resolved to \d+ elements/i,
        severity: 'Medium',
        priority: 'Medium',
        rootCause:
            'The locator matched more than one element on the page, which Playwright strict mode rejects.',
        fixes: [
            'Narrow the locator (e.g. add text, role, or a data-testid) so it matches exactly one element.',
            'Use .first()/.nth() only if matching multiple elements is intentional.',
        ],
    },
    {
        pattern: /net::ERR_|ECONNREFUSED|ENOTFOUND|fetch failed/i,
        severity: 'Critical',
        priority: 'High',
        rootCause:
            'A network-level request failed before the page or API could respond, indicating connectivity or environment issues rather than a test logic bug.',
        fixes: [
            'Verify the target baseURL/environment is reachable from where the test runs.',
            'Check for VPN/proxy/firewall restrictions in CI or on the Jenkins agent.',
            'Retry once to rule out a transient outage.',
        ],
    },
    {
        pattern: /locator.*not found|no element(?:s)? found|waiting for locator/i,
        severity: 'High',
        priority: 'High',
        rootCause:
            'The locator never appeared in the DOM, which usually means the selector is wrong or a prior step did not navigate/render as expected.',
        fixes: [
            "Re-check the selector against the current DOM (it may have changed).",
            'Confirm the preceding step actually reached the page/state this locator expects.',
        ],
    },
    {
        pattern: /expect\(.*\)\.(to|not)|toBe|toEqual|toHaveText|toHaveValue/i,
        severity: 'Medium',
        priority: 'Medium',
        rootCause:
            'An assertion received a value that did not match what the test expected, indicating a functional mismatch or a stale expectation.',
        fixes: [
            'Compare the actual vs expected values in the failure output to confirm whether the app or the test is wrong.',
            'Update the expectation if the underlying UI/data intentionally changed.',
        ],
    },
];

const DEFAULT_FIXES = [
    'Review the error message and stack trace to identify the failing step.',
    'Re-run the test in headed mode locally to observe the failure interactively.',
];

export async function analyzeFailure(input: FailureInput): Promise<RcaVerdict> {
    const haystack = `${input.error}\n${input.stack ?? ''}`;
    const match = RULES.find((rule) => rule.pattern.test(haystack));
    if (match) {
        return {
            severity: match.severity,
            priority: match.priority,
            rootCause: match.rootCause,
            fixes: match.fixes,
        };
    }
    return {
        severity: 'Medium',
        priority: 'Medium',
        rootCause: `Failure did not match a known pattern. Raw error: ${input.error}`,
        fixes: DEFAULT_FIXES,
    };
}

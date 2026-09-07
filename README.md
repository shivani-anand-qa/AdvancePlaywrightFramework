# Advanced Playwright Framework

A TypeScript-based end-to-end and API test automation framework built on [Playwright](https://playwright.dev/), designed for multi-environment execution (dev, QA, staging, production) with a page-object-friendly structure, custom fixtures, custom reporting, and CI integration via GitHub Actions.

## Status

The framework is built out end to end against the TTACart demo app:

- `BasePage` + `UtilElementLocator` (action/wait helpers) + `logger` (Winston, console + `logs/combined.log`)
- Page objects for the full shopping flow: `LoginPage`, `InventoryPage`, `ItemDetailPage`, `CartPage`, `CheckoutStepOne`, `CheckoutStepTwo`, `CheckoutCompletePage`
- `src/fixtures/test-base.ts` — a custom `test` extending Playwright's, pre-wired with one fixture per page object plus reusable state fixtures (`invalidLogin`, `validLogin`, `loginWithInventory`, `loginWithSelectedItem`) so specs can skip repeating login/navigation boilerplate
- `src/config/env.ts` / `src/config/credentials.ts` / `src/config/screenshotFlag.ts` — typed env var access, test credentials, and the `ATTACH_SCREENSHOTS` flag
- `src/utils/visualStep.ts` — a `test.step` wrapper that optionally attaches a screenshot per step (gated by `ATTACH_SCREENSHOTS`) for the custom reporter to pick up
- `src/utils/DataGenerator.ts` — Faker-backed credentials/checkout data helpers
- `CustomReporter` — a self-contained HTML report (`tta-report/report_<runId>.html`) with filterable/sortable results, per-step timing, console logs, screenshot/video/trace links, run history, and lightweight AI-assisted failure/flaky analysis (see below), in addition to the built-in `html`/`list` reporters
- Specs: `src/tests/login/login.spec.ts` (standard + locked-out user), and `src/tests/e2e/` (browse & cart, checkout, fixture-driven flows)

Still a placeholder: `src/api/` (empty).

### AI-assisted reporting (`src/ai/`)

`CustomReporter` calls into `src/ai/agents/`:
- `rcaAgent.ts` — rule-based root-cause analysis of a failure's error/stack (timeouts, strict-mode violations, network errors, missing locators, assertion mismatches), returning a severity/priority/root-cause/fix-suggestions verdict.
- `flakyAnalyzer.ts` — diffs two run summaries (`reports/runs/run-*.json`) to flag tests whose status changed between runs.
- `config/providers.ts` — `hasApiKey()` checks for `ANTHROPIC_API_KEY`; when present the reporter includes an AI-generated flaky summary in addition to the rule-based analysis.

This is heuristic/local analysis only — no network calls are made unless `ANTHROPIC_API_KEY` is set.

## Tech Stack

- **Playwright** (`@playwright/test`) — browser automation and test runner
- **TypeScript** — strict mode, path aliases for clean imports
- **dotenv** — environment configuration
- **Winston** — logging
- **Allure Playwright** — test reporting
- **Faker.js** — test data generation
- **Ajv / ajv-formats** — JSON schema validation (useful for API tests)
- **csv-parse / xlsx** — external test data sources
- **jsonpath-plus** — JSON querying for API responses

## Project Structure

```
├── src/
│   ├── ai/             # Local RCA + flaky-test analysis used by CustomReporter
│   │   ├── agents/     # rcaAgent, flakyAnalyzer
│   │   └── config/     # providers (ANTHROPIC_API_KEY detection)
│   ├── api/            # API clients / request wrappers (placeholder)
│   ├── config/         # env.ts, credentials.ts, screenshotFlag.ts
│   ├── fixtures/       # test-base.ts — custom `test` with page-object + state fixtures
│   ├── pages/          # Page Object Model classes
│   ├── testdata/       # Test data files (JSON/CSV/XLSX)
│   ├── tests/
│   │   ├── login/      # Login spec(s)
│   │   └── e2e/        # Browse/cart/checkout spec(s)
│   └── utils/          # CustomReporter, DataGenerator, UtilElementLocator, logger, visualStep
├── .github/workflows/  # CI pipeline (GitHub Actions)
├── playwright.config.ts
├── tsconfig.json
└── .env                # Local environment variables (not committed)
```

Generated at test-run time (git-ignored, not part of the repo): `tta-report/` (custom HTML reports, screenshots/videos/traces) and `reports/runs/` (per-run JSON summaries used by the flaky analyzer).

## Path Aliases

Configured in `tsconfig.json` for cleaner imports:

| Alias | Resolves to |
|---|---|
| `@api/*` | `src/api/*` |
| `@config/*` | `src/config/*` |
| `@fixtures/*` | `src/fixtures/*` |
| `@pages/*` | `src/pages/*` |
| `@testdata/*` | `src/testdata/*` |
| `@utils/*` | `src/utils/*` |

## Environment Configuration

The framework resolves its `baseURL` dynamically based on `TTA_ENV`, unless `BASE_URL` is explicitly set. Create a `.env` file in the project root with the following variables:

```
TTA_ENV=qa                 # dev | qa | stg | prod | api
BASE_URL=                  # optional override — takes priority over TTA_ENV
QA_BASE_URL=
STG_BASE_URL=
PROD_BASE_URL=
DEV_BASE_URL=
API_BASE_URL=
LOG_LEVEL=info
TEST_ENV=QA
TEST_AUTHOR=
USERNAME=
PASSWORD=
STANDARD_USER=             # defaults to standard_user (src/config/credentials.ts)
TTA_SECRET=                # defaults to tta_secret (src/config/credentials.ts)
ATTACH_SCREENSHOTS=false   # true to attach a screenshot to each visualStep in the report
ANTHROPIC_API_KEY=         # optional — enables the AI-generated flaky-test summary in CustomReporter
```

`.env` is git-ignored and must never be committed.

## Getting Started

### Prerequisites
- Node.js (LTS recommended)
- npm

### Installation

```bash
npm install
npx playwright install --with-deps
```

### Running Tests

```bash
npx playwright test
```

Run against a specific environment:

```bash
TTA_ENV=stg npx playwright test
```

Run a single spec file:

```bash
npx playwright test src/tests/login/login.spec.ts
```

Run a single test by name:

```bash
npx playwright test -g "has title"
```

View the HTML report after a run:

```bash
npx playwright show-report
```

There is no lint or typecheck script configured; `tsc` is not wired up beyond the `tsconfig.json` used implicitly by Playwright's TypeScript support.

## Reporting

- **HTML reporter** — built-in Playwright report (`playwright-report/`)
- **List reporter** — console output
- **Custom reporter** — `src/utils/CustomReporter.ts`, writes a self-contained report to `tta-report/report_<runId>.html` (plus per-run JSON under `reports/runs/`) with summary cards, priority/status/tag filters, per-test steps and console logs, links to each test's screenshot/video/trace, run history, and RCA/flaky-test analysis (see [AI-assisted reporting](#ai-assisted-reporting-srcai))
- **Screenshots** on failure (plus per-step, when `ATTACH_SCREENSHOTS=true`), **video** and **trace** on every run
- **Logging** — Winston-based (`src/utils/logger.ts`); writes to the console and to `logs/combined.log`, level controlled by `LOG_LEVEL`

## Continuous Integration

Tests run automatically via GitHub Actions (`.github/workflows/playwright.yml`) on every push and pull request to `main`/`master`. The workflow installs dependencies, installs Playwright browsers, runs the full suite, and uploads the HTML report as a build artifact.

## License

ISC

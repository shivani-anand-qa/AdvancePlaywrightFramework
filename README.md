# Advanced Playwright Framework

A TypeScript-based end-to-end and API test automation framework built on [Playwright](https://playwright.dev/), designed for multi-environment execution (dev, QA, staging, production) with a page-object-friendly structure, custom reporting, and CI integration via GitHub Actions.

## Status

The framework's core scaffolding is implemented and working end to end for the login flow:

- `BasePage` + `UtilElementLocator` (action/wait helpers) + `logger` (Winston, console + `logs/combined.log`)
- `LoginPage`, exercised by `src/tests/login.spec.ts` against the TTACart demo app (standard + locked-out user flows)
- `CustomReporter` — a self-contained HTML report (`test-results/custom-report/index.html`) with filterable/sortable results, per-step timing, console logs, and screenshot/video/trace links, in addition to the built-in `html`/`list` reporters
- `DataGenerator` — Faker-backed credentials/checkout data helpers

Still placeholders (empty files, to be built out): `CartPage`, `CheckoutStepOne`, `CheckoutStepTwo`, `CheckoutCompletePage`, `InventoryPage`, `ItemDetailPage`, plus the `src/api/`, `src/config/`, `src/fixtures/`, and `src/testdata/` directories.

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
│   ├── api/          # API clients / request wrappers
│   ├── config/        # Environment & framework configuration
│   ├── fixtures/       # Custom Playwright fixtures
│   ├── pages/         # Page Object Model classes
│   ├── testdata/       # Test data files (JSON/CSV/XLSX)
│   ├── tests/          # Spec files
│   └── utils/          # Shared utilities (e.g. CustomReporter)
├── docs/               # Project documentation
├── rules/              # Project/test rules or standards
├── .github/workflows/  # CI pipeline (GitHub Actions)
├── playwright.config.ts
├── tsconfig.json
└── .env                # Local environment variables (not committed)
```

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
npx playwright test src/tests/login.spec.ts
```

View the HTML report after a run:

```bash
npx playwright show-report
```

## Reporting

- **HTML reporter** — built-in Playwright report (`playwright-report/`)
- **List reporter** — console output
- **Custom reporter** — `src/utils/CustomReporter.ts`, writes a self-contained report to `test-results/custom-report/index.html` (plus a `results.json` alongside it) with summary cards, priority/status/tag filters, per-test steps and console logs, and links to each test's screenshot/video/trace
- **Screenshots** on failure, **video** and **trace** on every run
- **Logging** — Winston-based (`src/utils/logger.ts`); writes to the console and to `logs/combined.log`, level controlled by `LOG_LEVEL`

## Continuous Integration

Tests run automatically via GitHub Actions (`.github/workflows/playwright.yml`) on every push and pull request to `main`/`master`. The workflow installs dependencies, installs Playwright browsers, runs the full suite, and uploads the HTML report as a build artifact.

## License

ISC

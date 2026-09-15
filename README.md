# Advanced Playwright Framework

A TypeScript Playwright test automation framework for the TTACart demo app, built around the Page Object Model with a shared element-action wrapper, environment-based configuration, and a custom HTML test reporter.

## Stack

- [Playwright Test](https://playwright.dev/) + TypeScript
- Page Object Model (`BasePage` → per-page classes)
- [`winston`](https://github.com/winstonjs/winston) for structured logging
- [`@faker-js/faker`](https://fakerjs.dev/) for test data generation
- A custom reporter (`src/utils/CustomReporter.ts`) that renders a self-contained HTML report

## Project structure

```
src/
  pages/          Page Object classes (BasePage, LoginPage, InventoryPage, CartPage,
                   CheckoutStepOnePage, CheckoutStepTwoPage, CheckoutCompletePage, ...)
  fixtures/
    test-base.ts  Custom `test`/`expect`, pre-wired with a fixture for every Page
                   Object, plus reusable state fixtures (see below)
  config/
    credentials.ts  Login credentials sourced from env vars
  testdata/
    logintestdata.json  Shared password + all TTACart usernames
  tests/
    login/        Login spec(s) against the raw Page Objects
    e2e/          End-to-end specs (checkout flow, .env-sourced twin, fixture-driven
                   login/inventory/cart)
  api/
    01_restfulbooker_raw/  API specs against restful-booker.herokuapp.com (ping,
                            CRUD flow, isolated-context requests, ...)
  utils/
    UtilElementLocator.ts  Wraps Playwright locators/actions with logging, incl.
                           waitForPageLoad() (networkidle, swallowed on timeout)
                           used by BasePage.goto()
    CustomReporter.ts      Custom Playwright HTML reporter
    DataGenerator.ts       Faker-backed test data generation helpers
    visualStep.ts          test.step wrapper that optionally attaches screenshots
    logger.ts              winston logger factory
playwright.config.ts
.env.example    Template listing every env var the project reads (`.env` itself is gitignored)
docs/           Supporting diagrams, e.g. env-detour-diagram.html
learnings/      Write-ups of non-obvious decisions, e.g. tooltip_env.md
```

### Fixtures (`src/fixtures/test-base.ts`)

Import `test`/`expect` from `@fixtures/test-base` instead of `@playwright/test` to get every Page Object handed to you pre-constructed:

```ts
import { test, expect } from '@fixtures/test-base';

test('add to cart', async ({ inventoryPage, cartPage }) => {
    await inventoryPage.open();
    await inventoryPage.addToCart('test-allthethings-tshirt-red');
    await cartPage.open();
    expect(await cartPage.rowCount()).toBe(1);
});
```

Plain page-object fixtures (`loginPage`, `inventoryPage`, `itemDetailPage`, `cartPage`, `checkoutStepOnePage`, `checkoutStepTwoPage`, `checkoutCompletePage`) hand over constructed objects without navigating anywhere. On top of those, a few **state fixtures** perform reusable setup only when a test asks for one:

| Fixture | Ends at |
| --- | --- |
| `invalidLogin` | Login page, after submitting a random/invalid username+password |
| `validLogin` | Inventory page, logged in as `standard_user` (from `logintestdata.json`) |
| `loginWithInventory` | Inventory page, logged in and asserted fully loaded |
| `loginWithSelectedItem` | Inventory page, logged in with one item already added to the cart |

See `src/tests/e2e/e2e_usingfixture.spec.ts` for usage of each.

## Getting started

```bash
npm install
npx playwright install
```

## Running tests

```bash
npx playwright test
```

Run a single spec:

```bash
npx playwright test src/tests/e2e/e2e-checkout.spec.ts
```

### Projects

There are two Playwright projects, each scoped to its own `testDir` so browser and API tests never mix:

| Project | `testDir` | What runs there |
| --- | --- | --- |
| `chromium` | `src/tests` | The TTACart UI suite (headed Chrome) |
| `api` | `src/api` | Pure API specs (`request` fixture only, no browser) against `restful-booker.herokuapp.com` |

Run just one:

```bash
npx playwright test --project=api
npx playwright test --project=chromium
```

A file only becomes a runnable test if it (a) sits under one of those two `testDir`s and (b) is named with a literal `.spec.ts` or `.test.ts` segment (e.g. `foo.spec.ts` — `foo_spec.ts` is invisible to Playwright's default discovery, no error, it's just silently not picked up).

### Test tags

Every `src/tests/e2e/*.spec.ts` suite prefixes its `test.describe` title with plain-text tags (e.g. `@P0 @Regression E2E @Login ...`, `@P0 @Regression E2E @Checkout ...`) so subsets can be run with Playwright's `--grep`:

```bash
npx playwright test --grep "@Login"
npx playwright test --grep "@P0"
```

These are naming-convention tags in the title, not Playwright's native `tag` option — there's no dedicated `--project`/config wiring for them.

### Environment

The base URL is resolved from `TTA_ENV` (default `qa`), or overridden directly with `BASE_URL`:

```bash
TTA_ENV=stage npx playwright test
BASE_URL=http://localhost:3000 npx playwright test
```

Supported `TTA_ENV` values: `qa`, `dev`/`local`, `stg`/`stage`/`staging`, `prod`/`production`, `api`.

`src/tests/e2e/e2e-checkout.spec.ts` and `src/tests/e2e/e2e-checkout-env.spec.ts` log in via `src/config/credentials.ts`, which reads `STANDARD_USER`/`TTA_SECRET`. `playwright.config.ts` calls `dotenv.config()` on startup, so a `.env` file at the repo root (copy `.env.example` to get started) is picked up automatically — no shell exports needed:

```bash
cp .env.example .env   # first time only
npx playwright test src/tests/e2e/e2e-checkout-env.spec.ts
```

If `.env` is missing or a key is unset, `credentials.ts` falls back to the site's own demo credentials (`standard_user`/`tta_secret`), so a missing `.env` degrades gracefully instead of breaking the run — see `learnings/tooltip_env.md` for how that was decided, including a fail-fast approach that was tried and reverted because it could crash the entire suite's collection, not just one spec.

(`src/tests/e2e/e2e_usingfixture.spec.ts` gets its credentials from `src/testdata/logintestdata.json` instead and doesn't touch this path.)

Other env vars:

- `LOG_LEVEL` (default `info`) — winston log level, see `src/utils/logger.ts`
- `ATTACH_SCREENSHOTS` (default off) — set to `true` to attach a screenshot to the report whenever a `visualStep` fails

## Reports

Test runs produce two reports:

- Playwright's built-in HTML report (`playwright-report/`) — view with `npx playwright show-report`
- A custom HTML report (`custom-report/`) generated by `CustomReporter.ts`, including a test table, screenshots, video, and trace links, plus an "AI Data" tab for any `ai-data` attachments a test captures

To view the custom report locally:

```bash
npx http-server custom-report -p 8899
# or
python3 -m http.server 8899 -d custom-report
```

Screenshots are captured on failure, video and traces are always recorded (see `use` in `playwright.config.ts`).

> **Note:** passing `--reporter=<name>` on the CLI (e.g. `--reporter=list`) replaces the entire `reporter` array from `playwright.config.ts` — it doesn't add to it. That run won't produce a custom report at all. Omit `--reporter` to get all three configured reporters (`html`, `list`, and `CustomReporter.ts`).

## Type checking

```bash
npx tsc --noEmit
```

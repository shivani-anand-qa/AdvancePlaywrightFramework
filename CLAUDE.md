# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

This is an early-stage scaffold, not a built-out framework. Most directories under `src/` (`api/`, `config/`, `fixtures/`, `pages/`, `testdata/`, `utils/`) currently contain only a `.gitkeep` placeholder — the architecture described in README.md (page objects, API clients, custom fixtures, reporter, env config loader) is the intended shape, not yet-implemented code. Notably, `playwright.config.ts` already references `./src/utils/CustomReporter.ts` as a reporter, but that file does not exist yet — running tests will fail on the reporter until it's created (or the reference is removed from `playwright.config.ts`).

`package.json` has no `scripts` defined; use the `npx playwright` CLI directly (see Commands below).

## Commands

Install dependencies and browsers (first-time setup):
```bash
npm install
npx playwright install --with-deps
```

Run the full suite:
```bash
npx playwright test
```

Run a single spec file:
```bash
npx playwright test src/tests/example.spec.ts
```

Run a single test by name:
```bash
npx playwright test -g "has title"
```

Run against a specific environment (see Environment resolution below):
```bash
TTA_ENV=stg npx playwright test
```

View the HTML report after a run:
```bash
npx playwright show-report
```

There is no lint or typecheck script configured; `tsc` is not wired up beyond the `tsconfig.json` used implicitly by Playwright's TypeScript support.

## Architecture

### Environment / baseURL resolution

`playwright.config.ts` resolves `baseURL` at config-load time via `resolveBaseURL()`:
1. If `BASE_URL` env var is set, it wins outright.
2. Otherwise, `TTA_ENV` (default `qa`) selects among `DEV_BASE_URL`, `QA_BASE_URL`, `STG_BASE_URL`, `PROD_BASE_URL`, `API_BASE_URL`, each with a hardcoded fallback URL for that environment (e.g. `qa`/default falls back to `https://app.thetestingacademy.com`; `api` falls back to `https://restful-booker.herokuapp.com`).
3. `.env` is loaded via `dotenv` before resolution runs, and is git-ignored — never commit it.

When adding new environments or base URLs, extend the `switch` in `resolveBaseURL()` and document the new env var in README.md's environment table.

### Path aliases

`tsconfig.json` defines aliases mirroring the `src/` subfolders — use these instead of relative imports once files exist in these folders:
- `@api/*` → `src/api/*`
- `@config/*` → `src/config/*`
- `@fixtures/*` → `src/fixtures/*`
- `@pages/*` → `src/pages/*`
- `@testdata/*` → `src/testdata/*`
- `@utils/*` → `src/utils/*`

### Test execution config

- `testDir` is `./src/tests`; only one project is configured (`chromium` / Desktop Chrome) — no cross-browser matrix yet.
- `fullyParallel: true`, retries only on CI (`process.env.CI` → 2 retries, 0 locally).
- `screenshot: 'only-on-failure'`, but `video: 'on'` and `trace: 'on'` capture unconditionally for every run.
- Reporters: `html`, `list`, and the (currently missing) custom reporter at `src/utils/CustomReporter.ts`.

### CI

`.github/workflows/playwright.yml` runs on push/PR to `main`/`master`: `npm ci` → `npx playwright install --with-deps` → `npx playwright test`, then uploads `playwright-report/` as a build artifact regardless of pass/fail.

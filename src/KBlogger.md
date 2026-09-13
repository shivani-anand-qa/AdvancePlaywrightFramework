# Logger — Supported Levels

`src/utils/logger.ts` wraps Winston with its default `npm` log levels (no custom levels are configured). Levels are ordered by severity, most severe first:

| Level     | Priority | When to use |
|-----------|----------|-------------|
| `error`   | 0        | A failure that breaks the current test/step — assertion failures, thrown exceptions, unrecoverable errors. |
| `warn`    | 1        | Something unexpected but not fatal — a retry, a fallback path, a deprecated call. |
| `info`    | 2        | High-level progress — page navigation, login attempts, major test milestones. **This is the default level.** |
| `http`    | 3        | HTTP-specific traffic — request/response logging for API calls. |
| `verbose` | 4        | More detail than `info` but not full debug noise — intermediate steps worth tracing. |
| `debug`   | 5        | Fine-grained diagnostic detail — element lookups, locator resolution, timing. |
| `silly`   | 6        | The most detailed level — everything, including noisy internals. |

The active level is controlled by the `LOG_LEVEL` environment variable and defaults to `'info'` if unset. Setting `LOG_LEVEL` to a given level logs that level **and everything above it in severity** (e.g. `LOG_LEVEL=debug` also logs `error`, `warn`, `info`, `http`, and `verbose`).

Output goes to:
- **Console** — pretty-printed and colourised.
- **`logs/combined.log`** — plain text, kept as a CI artifact.

## Usage

```ts
import { createLogger } from '@utils/logger';

const log = createLogger('LoginPage');

log.error('Login request failed: %s', err.message);
log.warn('Retrying login after transient network error');
log.info('Open login page');
log.http('POST /api/login -> 200');
log.verbose('Filling username field with "standard_user"');
log.debug('Resolved locator [data-test="username"]');
log.silly('Raw response payload: %o', responseBody);
```

## Scoped loggers

Every Page Object should create its own scoped logger tagged with its class name, so log lines show where they originated:

```ts
import { createLogger, type Logger } from '@utils/logger';

export class LoginPage {
    private readonly log: Logger = createLogger('LoginPage');

    async loginAs(user: string) {
        this.log.info(`loginAs ${user}`);
        // ...
    }
}
```

Example output line:

```
2026-09-12 16:50:59 [info] [LoginPage] loginAs standard_user
```

## Running with a different level

```bash
LOG_LEVEL=debug npx playwright test
```

# Testing guide

Three layers, each runnable on its own. Everything below runs from the repository root with dependencies installed (`npm ci`) and Node 24 (`.nvmrc`).

| Layer                | Command                                                         | Needs                       | What it proves                                                                                                                                                                                                                |
| -------------------- | --------------------------------------------------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit                 | `npm test`                                                      | nothing                     | Pure domain logic (money, position replay and average cost, order decision rule, validators) and services with mocked repositories. About 10 s.                                                                               |
| Integration          | `npm run test:e2e`                                              | Docker                      | The real HTTP pipeline against a disposable Postgres 16 started by Testcontainers, with the real migrations and the challenge dataset. Includes the functional test of order placement required by the challenge. About 30 s. |
| Coverage gate        | `npm run test:cov`                                              | Docker                      | Unit and integration together, one merged report in `coverage/` with enforced thresholds: 85 % statements, functions and lines, 80 % branches. This is what CI runs.                                                          |
| Load and concurrency | `npm run k6:smoke`, `npm run k6:load`, `npm run k6:concurrency` | Docker, [k6](https://k6.io) | Latency regression guards and a 50-user simultaneous-buy burst that must never overdraw the account.                                                                                                                          |

`make help` lists the same commands as make targets.

## Unit tests

```bash
npm test                      # all unit suites
npx jest --config jest.config.js src/modules/orders   # one folder
```

Unit suites live next to the code as `*.spec.ts` under `src/`. They never touch the network or the database.

## Integration tests

```bash
npm run test:e2e
```

- `test/setup/global-setup.ts` starts `postgres:16-alpine` through Testcontainers, runs the migrations and the seed, and exports `DATABASE_URL` to the suites; `global-teardown.ts` stops the container. Nothing is left running afterwards (`docker ps` is clean).
- Suites are in `test/integration/*.e2e-spec.ts` and run serially because they share one database. The `orders` table is restored to the dataset between tests.
- The app under test is the real `AppModule` wired through the same `setupApp` as `main.ts`, so middleware, guards, validation and the error filter are all exercised.
- Requirements: a working Docker daemon and permission to pull `postgres:16-alpine` once. If Testcontainers cannot start its helper container (Ryuk) on a locked-down machine, set `TESTCONTAINERS_RYUK_DISABLED=true`.

## Coverage

```bash
npm run test:cov
open coverage/lcov-report/index.html
```

`jest.coverage.config.js` runs both Jest projects in one process and merges their coverage. Thresholds apply to the merged report and fail the run when not met. DTOs, models, migrations, seeders and the bootstrap file are excluded from the measurement; test files are never counted.

## Load and concurrency (k6)

The scripts hit a running deployment, by default `http://localhost:3000` (override with `BASE_URL`). Start the stack first:

```bash
RATE_LIMIT_ENABLED=false docker compose up --build -d   # the per-IP rate limit, when enabled, would throttle k6
```

| Script                   | Scenario                                                                                                                                 | Thresholds                                                                                                      |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `npm run k6:smoke`       | 1 virtual user for 30 s walking health, search, portfolio and a LIMIT order that is cancelled right away. `DURATION=10s` shortens it.    | `http_req_failed < 1 %`, `p(95) < 300 ms`, checks > 99 %                                                        |
| `npm run k6:load`        | Ramp 0 → 20 → 50 → 0 virtual users over about 2 min: 50 % search, 30 % portfolio, 15 % LIMIT + cancel, 5 % small MARKET buys.            | GET `p(95) < 200 ms`, POST `p(95) < 400 ms`, `http_req_failed < 1 %`, no dropped iterations                     |
| `npm run k6:concurrency` | `scripts/seed-k6.ts` resets user 2 and credits a known cash balance, then 50 virtual users fire the same MARKET BUY at the same instant. | Exactly ⌊available ÷ notional⌋ orders `FILLED`, the rest `REJECTED`, cash never negative, accounting consistent |

Thresholds are regression guards calibrated for a laptop running Docker, not service-level objectives. Results are written to `k6/results/` (ignored by git).

## Lint, types and formatting

```bash
npm run lint          # ESLint with type-aware rules
npm run typecheck     # tsc --noEmit
npm run format:check  # Prettier
```

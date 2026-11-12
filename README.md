# Cocos Backend Challenge

[![CI](https://github.com/emariotti3/cocos-challenge-emariotti3/actions/workflows/ci.yml/badge.svg)](https://github.com/emariotti3/cocos-challenge-emariotti3/actions/workflows/ci.yml)
![Node 24](https://img.shields.io/badge/node-24-339933?logo=node.js&logoColor=white)
![NestJS 11](https://img.shields.io/badge/NestJS-11-E0234E?logo=nestjs&logoColor=white)
![Postgres 16](https://img.shields.io/badge/Postgres-16-4169E1?logo=postgresql&logoColor=white)
![Coverage thresholds](https://img.shields.io/badge/coverage-%E2%89%A585%25%20enforced-brightgreen)

Versión en español: [README.es.md](README.es.md).

REST API for a brokerage account: **portfolio valuation**, **instrument search** and **order placement** (MARKET / LIMIT, with cancellation) and **cash deposits / withdrawals** on top of the provided Postgres schema. Built as a production-style service: validated configuration, migrations, structured logs, RFC 7807 errors, rate limiting, health checks, Prometheus metrics with a Grafana dashboard, unit + integration + load tests, and a CI pipeline.

The original statement is in [`backend-challenge.md`](backend-challenge.md). Every assumption and design choice is documented in [`docs/DECISIONS.md`](docs/DECISIONS.md) (also in Spanish: [`docs/DECISIONS.es.md`](docs/DECISIONS.es.md)).

There is also an [overview page](https://claude.ai/artifact/U3Qu9VvY3gs7DziB4Ecf6g) (in Spanish) with sequence diagrams of the main flows, the stage-by-stage plan, the repository layout and the Postman collection instructions.

## Where to look first

If you have ten minutes, these files carry most of the design:

| What                                                          | Where                                                                                                                |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| The functional test of order placement the challenge asks for | [`test/integration/orders.e2e-spec.ts`](test/integration/orders.e2e-spec.ts) (real HTTP pipeline, real Postgres)     |
| The market acceptance rule, as a pure function                | [`src/modules/orders/domain/order-decision.ts`](src/modules/orders/domain/order-decision.ts)                         |
| Cash, reservations and availability derived from the ledger   | [`src/modules/portfolio/portfolio.repository.ts`](src/modules/portfolio/portfolio.repository.ts)                     |
| Position replay with weighted average cost                    | [`src/modules/portfolio/domain/position-calculator.ts`](src/modules/portfolio/domain/position-calculator.ts)         |
| The per-user lock that makes concurrent orders safe           | [`src/modules/users/users.repository.ts`](src/modules/users/users.repository.ts)                                     |
| Every schema change and why                                   | [`src/database/migrations/0002_constraints_and_indexes.ts`](src/database/migrations/0002_constraints_and_indexes.ts) |
| Every assumption, with the alternatives rejected              | [`docs/DECISIONS.md`](docs/DECISIONS.md)                                                                             |

## Contents

- [Where to look first](#where-to-look-first)
- [Quick start](#quick-start)
- [API](#api)
- [Business rules in one page](#business-rules-in-one-page)
- [Architecture](#architecture)
- [Local development](#local-development)
- [Configuration](#configuration)
- [Testing](#testing)
- [Load and concurrency tests (k6)](#load-and-concurrency-tests-k6)
- [Observability](#observability)
- [CI](#ci)
- [Project structure](#project-structure)
- [Notes on the provided schema](#notes-on-the-provided-schema)

## Quick start

Requirements: Docker with Compose v2. Nothing else.

```bash
docker compose up --build -d          # postgres + api (migrations and seed run on start)
curl -s localhost:3000/health/ready    # {"status":"ok",...}
curl -s localhost:3000/api/v1/users/1/portfolio | jq
open http://localhost:3000/docs        # Swagger UI
```

With the shipped dataset, user 1 should show `totalValue` **904784.00**, available cash **627500.00**, positions in PAMP and METR, and a warning for the inconsistent BMA position (see [ADR-006](docs/DECISIONS.md#adr-006-inconsistent-seed-data-the-negative-bma-position)).

Ready-made requests: [`docs/api.http`](docs/api.http) (VS Code REST Client) or import [`docs/postman_collection.json`](docs/postman_collection.json) together with [`docs/postman_environment.json`](docs/postman_environment.json) into Postman. The OpenAPI document is exported to [`docs/openapi.json`](docs/openapi.json).

Stop everything with `docker compose down` (add `-v` to drop the database volume).

## API

Base path `/api/v1`. Money values are **decimal strings with two decimals** in ARS. Errors are `application/problem+json` with a stable `code` (see below). There is no authentication (not required by the challenge): the user is a path parameter and unknown users return `404 USER_NOT_FOUND`.

| Method | Path                                                               | Purpose                                                                                                                                            |
| ------ | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`  | `/instruments?q=&ticker=&name=&page=&limit=`                       | Search by ticker and/or name (case-insensitive, partial, trigram-ranked). Returns last price and daily return. No filter = full tradable list.     |
| `GET`  | `/instruments/:id`                                                 | One instrument with its latest price.                                                                                                              |
| `GET`  | `/users/:userId/portfolio`                                         | Total account value, cash (`total`, `reserved`, `available`) and positions with market value, average cost, P&L and returns.                       |
| `POST` | `/users/:userId/orders`                                            | Place an order. Returns `201` with status `FILLED`, `NEW` **or `REJECTED`** (rejected orders are persisted, as required).                          |
| `POST` | `/users/:userId/orders/:orderId/cancel`                            | Cancel a `NEW` order (`409` otherwise).                                                                                                            |
| `POST` | `/users/:userId/cash/deposits`                                     | Deposit whole ARS. Recorded as a `FILLED` order with side `CASH_IN` on the `ARS` instrument (`price 1`, `size = amount`).                          |
| `POST` | `/users/:userId/cash/withdrawals`                                  | Withdraw whole ARS (side `CASH_OUT`). Checked against _available_ cash under the same per-user lock; insufficient cash is persisted as `REJECTED`. |
| `GET`  | `/users/:userId/orders?status=&side=&instrumentId=&limit=&cursor=` | Order history, newest first, cursor-paginated.                                                                                                     |
| `GET`  | `/users/:userId/orders/:orderId`                                   | One order.                                                                                                                                         |
| `GET`  | `/health/live`, `/health/ready`                                    | Liveness / readiness (database ping).                                                                                                              |
| `GET`  | `/metrics`                                                         | Prometheus exposition.                                                                                                                             |
| `GET`  | `/docs`, `/docs-json`                                              | Swagger UI / OpenAPI JSON.                                                                                                                         |

### Placing an order

```jsonc
POST /api/v1/users/1/orders
{ "instrumentId": 47, "side": "BUY", "type": "MARKET", "size": 10 }          // exact shares
{ "instrumentId": 47, "side": "BUY", "type": "MARKET", "amount": "100000" }  // ARS budget -> floor(100000 / 925.85) = 108 shares
{ "instrumentId": 47, "side": "SELL", "type": "LIMIT", "size": 10, "price": "1000.00" }
```

```json
{
  "id": 12,
  "userId": 1,
  "instrumentId": 47,
  "ticker": "PAMP",
  "side": "BUY",
  "type": "MARKET",
  "status": "FILLED",
  "size": 10,
  "price": "925.85",
  "notional": "9258.50",
  "rejectionReason": null,
  "datetime": "2025-11-12T02:07:01.001Z"
}
```

| Outcome                                                                                   | HTTP | `status` / `code`                                           |
| ----------------------------------------------------------------------------------------- | ---- | ----------------------------------------------------------- |
| MARKET order accepted                                                                     | 201  | `FILLED` (executed at the last close)                       |
| LIMIT order accepted                                                                      | 201  | `NEW` (rests at the limit price; reserves cash or shares)   |
| Not enough available cash (BUY)                                                           | 201  | `REJECTED`, `rejectionReason: INSUFFICIENT_FUNDS`           |
| Not enough available shares (SELL)                                                        | 201  | `REJECTED`, `rejectionReason: INSUFFICIENT_SHARES`          |
| Malformed request (LIMIT without price, MARKET with price, both `size` and `amount`, ...) | 400  | `VALIDATION_ERROR` with `errors[{path,message}]`            |
| Unknown user / instrument / order                                                         | 404  | `USER_NOT_FOUND`, `INSTRUMENT_NOT_FOUND`, `ORDER_NOT_FOUND` |
| Cash instrument, no market price for a MARKET order, budget below one share               | 422  | `NOT_TRADABLE`, `NO_MARKET_PRICE`, `AMOUNT_TOO_SMALL`       |
| Cancelling a non-NEW order                                                                | 409  | `ORDER_NOT_CANCELLABLE`                                     |
| Too many requests                                                                         | 429  | `RATE_LIMITED` (+ `Retry-After`)                            |
| Account lock not acquired within 5 s / statement over 10 s                                | 503  | `LEDGER_BUSY` (safe to retry)                               |

### Error format (RFC 7807)

```json
{
  "type": "/problems/amount-too-small",
  "title": "Unprocessable Entity",
  "status": 422,
  "detail": "Amount 900.00 does not cover one share at 925.85",
  "instance": "/api/v1/users/1/orders",
  "code": "AMOUNT_TOO_SMALL",
  "amount": "900.00",
  "price": "925.85",
  "requestId": "3f9c1d4e-..."
}
```

Send `X-Request-Id` to correlate; it is echoed in the response header, the problem body and every log line.

## Business rules in one page

Everything is derived from the `orders` ledger; no balance is stored.

- **Cash** is the `ARS` instrument (type `MONEDA`). `cash.total` = Σ FILLED (`CASH_IN` + `SELL`) − Σ FILLED (`CASH_OUT` + `BUY`), each `size × price`.
- **Reservations.** A `NEW` LIMIT BUY reserves `size × price`; a `NEW` LIMIT SELL reserves `size` shares. `cash.available = total − reserved`; `availableQuantity = quantity − reservedQuantity`. Sufficiency checks use the _available_ figures ([ADR-005](docs/DECISIONS.md#adr-005-pending-limit-orders-reserve-cash-and-shares)).
- **Positions** replay FILLED BUY/SELL trades in order with a weighted-average cost. `marketValue = quantity × latest close`, `totalReturnPct = (marketValue − costBasis) / costBasis`, `dailyReturnPct = (close − previousClose) / previousClose` ([ADR-007](docs/DECISIONS.md#adr-007-weighted-average-cost-and-returns)).
- **Sizing.** `size` or `amount` (never both); `size = floor(amount / price)` with the last close for MARKET and the limit price for LIMIT. No fractional shares.
- **Lifecycle.** MARKET → `FILLED` at the last close. LIMIT → `NEW`. Only `NEW` can be cancelled → `CANCELLED`. Insufficient cash/shares → `REJECTED` (persisted).
- **Cash transfers.** Deposits and withdrawals are orders with side `CASH_IN` / `CASH_OUT` on `ARS`, as in the dataset, but only through the `/cash` endpoints: `POST /orders` refuses those sides (400) and the `ARS` instrument (422). A withdrawal above the available cash is persisted as `REJECTED` ([ADR-017](docs/DECISIONS.md#adr-017-cash-transfers-are-orders-with-side-cash_in--cash_out-through-their-own-endpoints)).
- **Concurrency.** Order placement, cancellation and cash movements for one user are serialized with a row lock inside a `READ COMMITTED` transaction, so concurrent operations can never overdraw cash or shares, whether they compete through orders, withdrawals or both ([ADR-010](docs/DECISIONS.md#adr-010-concurrency-per-user-row-lock-instead-of-serializable)).
- **Data quirks handled.** Negative/oversold positions (the seed sells more BMA than it bought) are excluded from holdings and reported in `warnings[]`; instruments without market data get `null` prices and cannot be bought at market.

### Order lifecycle and what each transition moves

Every row in `orders` enters in one of three states and only one transition exists afterwards. Nothing ever moves from `NEW` to `FILLED`: there is no matching engine, as the challenge asks.

```mermaid
stateDiagram-v2
    direction LR
    [*] --> FILLED: MARKET BUY / SELL within available cash / shares
    [*] --> FILLED: CASH_IN, or CASH_OUT within available cash
    [*] --> NEW: LIMIT BUY / SELL within available cash / shares
    [*] --> REJECTED: BUY, SELL or CASH_OUT beyond availability (persisted, still 201)
    NEW --> CANCELLED: POST /orders/:id/cancel (releases the reservation)
    FILLED --> [*]
    REJECTED --> [*]
    CANCELLED --> [*]
```

| Row                 | `cash.total`   | `cash.reserved` | Position `quantity` | Position `reservedQuantity` |
| ------------------- | -------------- | --------------- | ------------------- | --------------------------- |
| `FILLED` BUY        | − size × price |                 | + size              |                             |
| `FILLED` SELL       | + size × price |                 | − size              |                             |
| `FILLED` CASH_IN    | + amount       |                 |                     |                             |
| `FILLED` CASH_OUT   | − amount       |                 |                     |                             |
| `NEW` LIMIT BUY     |                | + size × price  |                     |                             |
| `NEW` LIMIT SELL    |                |                 |                     | + size                      |
| `REJECTED` (any)    |                |                 |                     |                             |
| `NEW` → `CANCELLED` |                | − size × price  |                     | − size                      |

`cash.available = total − reserved` and `availableQuantity = quantity − reservedQuantity` are what every sufficiency check reads, always under the per-user lock. `FILLED`, `REJECTED` and `CANCELLED` are terminal: cancelling any of them is a `409 ORDER_NOT_CANCELLABLE`.

## Architecture

```mermaid
flowchart LR
  C[Client] -->|HTTP /api/v1| M[Middleware<br/>metrics · helmet · cors · pino]
  M --> G[Guards<br/>throttler · user exists]
  G --> V[ValidationPipe<br/>class-validator DTOs]
  V --> IC[InstrumentsController] & PC[PortfolioController] & OC[OrdersController]
  IC --> IS[InstrumentsService] --> IR[(InstrumentsRepository)]
  IS --> MS[MarketdataService] --> MR[(MarketdataRepository)]
  PC --> PS[PortfolioService] --> PR[(PortfolioRepository<br/>ledger aggregates)]
  PS --> MS
  PS --> PCALC[position-calculator<br/>pure]
  OC --> OS[OrdersService] --> OR[(OrdersRepository)]
  OS --> PR
  OS --> UR[(UsersRepository<br/>FOR UPDATE lock)]
  OS --> DEC[decideOrder<br/>pure]
  IR & MR & PR & OR & UR --> DB[(Postgres 16)]
  X[ProblemDetailsFilter] -.->|problem+json| C
  OS --> MET[MetricsService] -.-> PROM[Prometheus] -.-> GRAF[Grafana]
```

- **NestJS 11 modular monolith**, TypeScript strict. Controllers translate HTTP; services hold use cases; repositories are the only classes that touch **Sequelize** (models for CRUD, raw SQL with bind parameters for the ledger aggregates).
- **Money** is never a float: `NUMERIC` stays a string until the `Money` class (decimal.js); responses carry 2-decimal strings. Timestamps are stored and read as UTC.
- **Schema**: the provided DDL as baseline migration, then constraints, uniques, indexes (including `pg_trgm` for search) and a `rejection_reason` column, applied with `umzug` on container start ([ADR-003](docs/DECISIONS.md#adr-003-migrations-with-umzug-and-schema-hardening)).
- **Hardening**: zod-validated env (fail fast), helmet, CORS allow-list, per-IP rate limiting (stricter for order placement), request ids, structured JSON logs, Terminus health checks, graceful shutdown, non-root container with `HEALTHCHECK`.

### Placing an order, step by step

```mermaid
sequenceDiagram
  autonumber
  participant C as Client
  participant API as OrdersController
  participant S as OrdersService
  participant DB as Postgres
  C->>API: POST /users/1/orders {instrumentId, side, type, size | amount, price?}
  API->>API: UserExistsGuard (404) · ValidationPipe (400)
  API->>S: placeOrder(user, dto)
  S->>DB: instrument (404 unknown · 422 NOT_TRADABLE for cash)
  alt MARKET
    S->>DB: latest close (422 NO_MARKET_PRICE if none)
  else LIMIT
    Note over S: price = request price
  end
  Note over S: size = size ?? floor(amount / price) · 422 AMOUNT_TOO_SMALL if 0
  S->>DB: BEGIN · SELECT id FROM users WHERE id = $1 FOR UPDATE
  Note over S,DB: every other order or cancel of this user waits here
  S->>DB: available cash = Σ FILLED − NEW BUY reservations
  opt SELL
    S->>DB: available shares = net FILLED − NEW SELL reservations
  end
  Note over S: decideOrder → FILLED · NEW · REJECTED (pure function)
  S->>DB: INSERT orders (status, rejection_reason) · COMMIT
  S-->>C: 201 {status, size, price, notional, rejectionReason}
```

The availability check and the insert share one transaction under the user's row lock, which is what makes the two concurrency tests pass: ten simultaneous buys against cash for six fill exactly six.

## Local development

```bash
nvm use                      # Node 24 (.nvmrc)
npm ci
cp .env.example .env
docker compose up -d postgres
npm run db:migrate && npx tsx src/database/cli.ts seed
npm run start:dev            # tsc --watch + node --watch on dist, http://localhost:3000
```

Useful scripts (also wrapped in the `Makefile`, run `make help`):

| Script                                                 | What it does                                           |
| ------------------------------------------------------ | ------------------------------------------------------ |
| `npm run build`                                        | Compile to `dist/` (plain `tsc`, no bundler)           |
| `npm run start:dev`                                    | Rebuild and restart on change                          |
| `npm run db:migrate` / `db:migrate:undo` / `db:status` | Apply / revert / inspect migrations (`umzug`)          |
| `npx tsx src/database/cli.ts seed` / `seed:undo`       | Load / remove the challenge dataset                    |
| `npm run lint` / `format` / `typecheck`                | ESLint (type-aware), Prettier, `tsc --noEmit`          |
| `npm test`                                             | Unit tests                                             |
| `npm run test:e2e`                                     | Integration tests (Testcontainers)                     |
| `npm run test:cov`                                     | Unit + integration with merged coverage and thresholds |
| `npm run k6:smoke` / `k6:load` / `k6:concurrency`      | Load tests (see below)                                 |
| `npm run openapi:export`                               | Regenerate `docs/openapi.json`                         |

No local `psql`? `make psql` opens one inside the Postgres container.

## Configuration

All variables are validated at boot (`src/config/env.schema.ts`); invalid values stop the process with a clear message. `.env` is loaded if present and never overrides real environment variables.

| Variable                  | Default       | Description                                                                       |
| ------------------------- | ------------- | --------------------------------------------------------------------------------- |
| `NODE_ENV`                | `development` | `development` enables pretty logs; `production` / `test` emit JSON                |
| `PORT`                    | `3000`        | HTTP port                                                                         |
| `LOG_LEVEL`               | `info`        | pino level (`silent` in tests)                                                    |
| `DATABASE_URL`            | required      | `postgres://user:pass@host:5432/db`                                               |
| `DB_POOL_MAX`             | `10`          | Sequelize pool size                                                               |
| `RUN_SEED`                | `true`        | Container entrypoint loads the challenge dataset after migrating                  |
| `CORS_ORIGINS`            | `*`           | Comma-separated allow-list, or `*`                                                |
| `RATE_LIMIT_ENABLED`      | `true`        | Per-IP throttling (disable for load tests)                                        |
| `RATE_LIMIT_TTL_SECONDS`  | `60`          | Throttling window                                                                 |
| `RATE_LIMIT_LIMIT`        | `100`         | Requests per window per IP                                                        |
| `RATE_LIMIT_ORDERS_LIMIT` | `20`          | Ledger mutations (orders, cancellations, deposits, withdrawals) per window per IP |
| `METRICS_ENABLED`         | `true`        | Expose `/metrics`                                                                 |

## Testing

| Layer                                          | Tool                                  | What it proves                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---------------------------------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit (`src/**/*.spec.ts`)                      | Jest                                  | Pure domain logic: `Money`, position replay and average cost, order decision rule, validators, services with mocked repositories                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Integration (`test/integration/*.e2e-spec.ts`) | Jest + Supertest + **Testcontainers** | The real HTTP pipeline against a disposable Postgres 16 with the real migrations and seed. Includes the challenge's **functional test of order placement** (27 scenarios: fills, reservations, rejections persisted as `REJECTED`, every validation path, cancellation, pagination, and two **concurrency** tests proving no overdraft), **18 cash scenarios** (deposits, withdrawals against available cash, rejections persisted, cash sides refused on the orders endpoint, concurrent withdrawals and withdrawals racing buys), the portfolio asserted verbatim against the seed, search and operational endpoints |
| Load / correctness                             | k6                                    | Smoke, ramping load with latency thresholds, and a 50-VU simultaneous-buy burst asserting the account never goes negative                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

```bash
npm test               # ~10 s
npm run test:e2e       # ~30 s, needs Docker (starts postgres:16-alpine)
npm run test:cov       # both projects, merged coverage -> coverage/lcov-report/index.html
```

Coverage thresholds are enforced (85% statements / functions / lines, 80% branches); the last local run reported ~97% statements and ~86% branches over `src/` excluding DTOs, models, migrations and bootstrap.

## Load and concurrency tests (k6)

[k6](https://k6.io) scripts live in `k6/`. Point them at any deployment with `BASE_URL` (default `http://localhost:3000`). Disable rate limiting for load runs: `RATE_LIMIT_ENABLED=false docker compose up -d api`.

| Script                   | Scenario                                                                                   | Thresholds                                                                                                      |
| ------------------------ | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `npm run k6:smoke`       | 1 VU, 30 s: health, search, portfolio, LIMIT + cancel                                      | `http_req_failed < 1%`, `p(95) < 300 ms`, checks > 99%                                                          |
| `npm run k6:load`        | Ramp 0→20→50→0 VUs over 2 min; 50% search, 30% portfolio, 15% LIMIT+cancel, 5% MARKET buys | GET `p(95) < 200 ms`, POST `p(95) < 400 ms`, `http_req_failed < 1%`, no dropped iterations                      |
| `npm run k6:concurrency` | Seeds user 2 with 1,000,000 ARS, then **50 VUs fire the same MARKET BUY at once**          | Exactly ⌊available / notional⌋ orders `FILLED`, the rest `REJECTED`, cash never negative, accounting consistent |

Stage durations are overridable (`DURATION`, `RAMP_UP`, `PLATEAU`, `RAMP_DOWN`, `VUS`, `SIZE`). Results are written to `k6/results/`. Thresholds are regression guards calibrated for a laptop running Docker, not production SLOs.

## Observability

```bash
docker compose --profile observability up -d     # + prometheus (:9090) + grafana (:3001, anonymous viewer, admin/admin)
npm run k6:load                                   # generate traffic
open http://localhost:3001/d/cocos-api            # provisioned "Cocos API" dashboard
```

Metrics exposed at `/metrics` (route **templates**, bounded cardinality):

- `http_server_request_duration_seconds{method,route,status_code}` histogram, `http_server_requests_in_flight`
- `orders_placed_total{status,side,type}`, `orders_rejected_total{reason}`, `orders_cancelled_total`
- `db_pool_connections{state}` and the default Node.js process metrics (event loop lag, heap, CPU, GC)

![Grafana dashboard "Cocos API" after a k6 load run: request rate and p95 latency tiles, orders filled and rejected in the last hour, request rate by route and latency percentiles](docs/grafana-dashboard.png)

The dashboard (`docker/grafana/provisioning/dashboards/cocos-api.json`) shows request rate by route, latency percentiles, response classes, order outcomes and rejection reasons, pool usage and runtime health.

Logs are JSON (pino) with `req.id`; health and metrics scrapes are not logged. Every operation that moves cash or shares (place, cancel, deposit, withdraw) leaves a structured trail with `operation`, `userId` and the business fields: `debug` on receipt and again once the decision is taken under the lock (balances read, decision, lock wait), `info` on fills and settled transfers, `warn` on every `REJECTED` outcome, `debug` for expected refusals (404/409/422 with their `code`) and `error` with the stack and full context when the transaction fails. Portfolio anomalies (negative positions, missing prices) are logged at `warn`. Run with `LOG_LEVEL=debug` to see the whole trail.

## CI

`.github/workflows/ci.yml` runs on every push and pull request:

1. **lint**: ESLint, Prettier check, `tsc --noEmit`
2. **unit**: Jest unit project
3. **coverage**: unit + integration (Testcontainers on the runner's Docker) with thresholds; a coverage table is written to the job summary and `coverage/` is uploaded as an artifact (optional Codecov upload if `CODECOV_TOKEN` is set)
4. **docker**: builds the image, starts the compose stack with it, waits for readiness, checks the seeded portfolio and runs the k6 smoke test

Dependabot keeps npm, GitHub Actions and the base image current.

## Project structure

```
src/
  main.ts, app.module.ts, app.setup.ts     # bootstrap and the shared HTTP pipeline (also used by tests)
  config/                                  # zod env schema + typed AppConfig
  common/                                  # errors, problem+json filter, Money, pagination cursor, validators, throttling, operation logging
  database/                                # Sequelize module, models, umzug migrations + seeders, CLI, pg type parsers
  health/                                  # Terminus liveness / readiness
  observability/                           # pino logging module, Prometheus metrics module
  modules/
    instruments/                           # search + get, with latest prices
    marketdata/                            # latest close / previous close per instrument
    portfolio/                             # ledger aggregates, pure position calculator, valuation
    orders/                                # place / cancel / list, decision rule
    cash/                                  # deposits (CASH_IN) / withdrawals (CASH_OUT), decision rule
    users/                                 # user lookup, UserExistsGuard, per-user row lock (withLock)
test/
  setup/                                   # Testcontainers global setup / teardown
  helpers/                                 # test app factory, DB reset to seed
  integration/                             # *.e2e-spec.ts
k6/                                        # smoke.js, load.js, concurrency.js (+ lib/)
docker/                                    # Dockerfile, entrypoint, prometheus + grafana provisioning
docs/                                      # DECISIONS.md (+ .es), TESTING.md, api.http, Postman collection + environment, openapi.json, grafana-dashboard.png
```

## Notes on the provided schema

The original `database.sql` is applied verbatim as the first migration. Changes on top of it (all additive, justified in [ADR-003](docs/DECISIONS.md#adr-003-migrations-with-umzug-and-schema-hardening)): `NOT NULL` and `CHECK` constraints, unique ticker / account number / (instrument, date), indexes for the ledger queries and trigram search, `datetime DEFAULT now()`, and a nullable `orders.rejection_reason` column. Column names are lowercase in Postgres because the original DDL does not quote its camelCase identifiers; the challenge text mentions a `marketdata.datetime` column, but the DDL defines it as `date`.

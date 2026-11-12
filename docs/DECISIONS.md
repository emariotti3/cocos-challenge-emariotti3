# Design decisions and assumptions

Architecture Decision Records for the Cocos backend challenge. Each entry states the context, the decision, its consequences and the alternatives considered. Numbers quoted for "user 1" refer to the dataset shipped in `database.sql`. Spanish version: [DECISIONS.es.md](DECISIONS.es.md).

## ADR-001 NestJS modular monolith

**Context.** The challenge allows any Node.js framework. The API has three bounded areas (instruments/market data, portfolio, orders) that share one database.

**Decision.** One NestJS application split into feature modules (`instruments`, `marketdata`, `portfolio`, `orders`, `users`) plus cross-cutting modules (`config`, `database`, `health`, `observability`, `common`). Controllers only translate HTTP; services hold use cases; repositories are the only classes that touch Sequelize.

**Consequences.** Dependency injection makes every service unit-testable with mocked repositories; Swagger, validation pipes, guards and Terminus come for free. A modular monolith is the right size for this scope and can be split later along module boundaries.

**Alternatives.** Plain Express (less structure, more hand-written plumbing), Fastify adapter (not needed at this scale).

## ADR-002 Sequelize behind repositories, raw SQL for aggregates

**Context.** The team is fluent in Sequelize. The heavy queries (cash balance, positions, availability) are aggregates over `orders` that an ORM query builder expresses poorly.

**Decision.** Sequelize v6 with `sequelize-typescript` models for the four tables; all access goes through repository classes. Aggregates use `sequelize.query` with **bind parameters** (`$name`) and typed row mappers. Services depend on repositories, never on models, so the ORM is swappable.

**Consequences.** Predictable SQL that can be `EXPLAIN`ed and indexed; no N+1; the ORM still gives connection pooling, transactions and the model metadata used by health checks and tests.

**Alternatives.** TypeORM (closer to Nest idioms, less familiar to the author), Prisma (raw SQL less ergonomic for the aggregate-heavy parts), Kysely (good fit, but more hand-rolled infrastructure).

## ADR-003 Migrations with umzug and schema hardening

**Context.** The provided `database.sql` is a functional baseline; the challenge explicitly allows and asks to justify schema changes.

**Decision.** Three ordered steps run by `umzug` (TypeScript in dev, compiled JS in the image, same history rows):

1. `0001_baseline`: the provided DDL verbatim. Identifiers stay unquoted, so Postgres folds them to lowercase (`instrumentid`, `userid`, `accountnumber`, `previousclose`). Models map those column names explicitly.
2. `0002_constraints_and_indexes`:
   - `NOT NULL` on all business columns and `CHECK` constraints on `side`, `type`, `status`, `size > 0`, `price >= 0`: invalid rows cannot be persisted even by a buggy writer.
   - `UNIQUE (instruments.ticker)`, `UNIQUE (users.accountnumber)`, `UNIQUE (marketdata.instrumentid, date)`.
   - `orders (userid, status, instrumentid)`: serves the cash summary, the position replay and the per-instrument availability check. `orders (userid, datetime DESC, id DESC)`: order history with keyset pagination. `marketdata (instrumentid, date DESC)`: latest price per instrument via `DISTINCT ON`. GIN trigram indexes on `instruments.ticker` and `name` for `ILIKE '%term%'` search (the planner uses a sequential scan on 66 rows, the index pays off at real catalogue sizes).
   - `orders.datetime DEFAULT now()`.
   - New nullable column `orders.rejection_reason`: a REJECTED row should say why (`INSUFFICIENT_FUNDS` / `INSUFFICIENT_SHARES`) for support and auditing.
3. Seed (`0001_challenge_dataset`, separate history table): the INSERT block from `database.sql`, copied verbatim, idempotent, skippable with `RUN_SEED=false`.

`orders.datetime` stays `TIMESTAMP` (no time zone) to avoid semantic drift from the given schema; the app always writes and reads it as UTC (see ADR-004).

**Alternatives.** `sequelize-cli` (JavaScript-only migrations), `sequelize.sync()` (never in production), TypeORM entity-diff migrations.

## ADR-004 Money and time are never floats or local time

**Decision.** `NUMERIC` comes back from `pg` as a string and stays a string until it reaches the `Money` class (decimal.js). Every monetary field in a response is a 2-decimal **string** (`"753000.00"`). `TIMESTAMP` values are parsed as UTC through a custom `pg` type parser; `DATE` values are returned as `yyyy-mm-dd` strings.

**Consequences.** `0.1 + 0.2` style errors are impossible; totals match the database to the cent; results do not depend on the host time zone. Clients must parse strings (the usual practice in financial APIs).

## ADR-005 Pending LIMIT orders reserve cash and shares

**Context.** The challenge defines "pesos disponibles para operar" and asks to reject orders that exceed what is available, but does not say whether orders in state `NEW` count. A LIMIT BUY that rests on the book will consume cash if it fills; a broker that ignored it would let the user spend the same pesos twice.

**Decision.** Availability is net of pending reservations:

- `cash.total` = sum of FILLED movements (`CASH_IN`, `SELL` add; `CASH_OUT`, `BUY` subtract), each `size * price`.
- `cash.reserved` = `size * price` of `NEW` BUY orders. `cash.available = total - reserved`.
- `availableShares(i)` = net FILLED quantity minus `size` of `NEW` SELL orders for `i`.
- Acceptance checks use the **available** figures. Both `total` and `available` are returned, so either interpretation is visible.

For user 1: total 753,000.00, reserved 125,500.00 (50 x 710 + 60 x 1500), available 627,500.00. The rule lives in one SQL expression (`PortfolioRepository`) and one pure function (`decideOrder`), so switching to the other interpretation is a one-line change.

## ADR-006 Inconsistent seed data: the negative BMA position

**Context.** User 1 bought 20 BMA and later sold 30 (both FILLED), so the net position is -10. Real data can carry such inconsistencies after migrations or manual fixes.

**Decision.** Positions with a non-positive net quantity are never returned as holdings. The portfolio response carries a `warnings[]` array (`NEGATIVE_POSITION`, `OVERSOLD_POSITION`, `NO_MARKET_PRICE`) and the anomaly is logged at `warn`. Selling an instrument with a non-positive position is `REJECTED` with `INSUFFICIENT_SHARES`. The API never crashes or reports a negative market value.

## ADR-007 Weighted average cost and returns

**Decision.** Positions are rebuilt by replaying FILLED BUY/SELL orders in `(datetime, id)` order. A BUY adds `size * price` to the cost basis; a SELL removes the sold fraction of the basis at the current average, leaving the average cost unchanged. A fully exited position resets its basis. Then:

- `marketValue = quantity * latest close`
- `averageCost = costBasis / quantity`
- `unrealizedPnl = marketValue - costBasis`
- `totalReturnPct = (marketValue - costBasis) / costBasis * 100`
- `dailyReturnPct = (close - previousClose) / previousClose * 100` (from the latest `marketdata` row)
- `totalValue = cash.total + sum(marketValue)`

Realized P&L is intentionally out of scope. FIFO would also be defensible; weighted average is what most Argentine brokers display and is simpler to explain.

## ADR-008 Order sizing and validation rules

- `size` (whole shares) **or** `amount` (ARS budget), never both. `size = floor(amount / price_ref)`; `price_ref` is the last close for MARKET and the limit price for LIMIT. A budget that buys zero shares is `422 AMOUNT_TOO_SMALL` and nothing is persisted (there is no order to send).
- `price` is **required for LIMIT** and **rejected for MARKET** (`400`). Silently ignoring a client-sent price would hide client bugs; strictness is cheaper to relax than to tighten.
- MARKET orders on an instrument without market data are `422 NO_MARKET_PRICE` (they cannot be priced); LIMIT orders on such instruments are accepted.
- The cash instrument (`MONEDA`) is not tradable (`422 NOT_TRADABLE`); `CASH_IN`/`CASH_OUT` are not placeable through this endpoint.
- Validation errors are `400` with a structured `errors[]` (one message per field, most fundamental check first).

## ADR-009 REJECTED orders are persisted and returned with 201

**Context.** The challenge requires that an order exceeding available cash or shares is saved with status `REJECTED`.

**Decision.** Market rejections are a legitimate outcome of a correctly formed request: the row is inserted with `status = REJECTED` and `rejection_reason`, and the response is `201 Created` with the order body. Only malformed or unpriceable requests (ADR-008) are HTTP errors.

## ADR-010 Concurrency: per-user row lock instead of SERIALIZABLE

**Context.** Balances are derived by summing `orders`, so two concurrent orders for the same user would each read the same available cash and both be accepted.

**Decision.** Every operation that changes a user's balances (`placeOrder`, `cancelOrder`, cash deposits and withdrawals) runs through `UsersRepository.withLock`: one transaction, pinned to `READ COMMITTED`, that first executes `SELECT id FROM users WHERE id = $1 FOR UPDATE`. All balance-changing work for a user is serialized on that lock; different users never contend. Availability is read inside the transaction, after the lock is granted, and the insert happens before commit. The isolation level is explicit because the guarantee depends on it: under `REPEATABLE READ` the balance reads would come from a snapshot taken before the lock and the check would silently stop working.

`withLock` also sets `SET LOCAL lock_timeout = '5s'` and `statement_timeout = '10s'`: a waiter that cannot get the row, or a statement that hangs, is aborted and surfaced as `503 LEDGER_BUSY` (retryable) instead of holding one of the `DB_POOL_MAX` connections indefinitely while every other request queues behind it. The portfolio read uses a separate `REPEATABLE READ` read-only transaction, so its three ledger queries see one snapshot and an order committing mid-read never shows up as debited cash without the matching position.

**Consequences.** No retry loops, no `40001` serialization failures, predictable latency; the integration suite proves that 10 simultaneous buys fill exactly 6 (what the cash allows), that 10 simultaneous withdrawals do the same, and that withdrawals racing buys never spend more than the available cash; the k6 concurrency scenario repeats the first case under real HTTP load. Two orders for the _same instrument_ are just a special case: the lock is per user, not per instrument, so they serialize like any other pair.

**Alternatives.** `SERIALIZABLE` isolation (needs client-side retries and conflicts constantly on sum-over-orders reads), `pg_advisory_xact_lock(userId)` (equivalent without touching the `users` row; a reasonable swap), a stored balance column with `CHECK (balance >= 0)` (contradicts the "derive from orders" requirement).

## ADR-011 User identification without authentication

**Decision.** Authentication is out of scope, so the user is a path parameter: `/users/:userId/portfolio`, `/users/:userId/orders`. A guard validates the id, loads the user once (404 `USER_NOT_FOUND`) and attaches it to the request. Replacing the guard with a JWT guard that populates `request.user` is the intended upgrade; controllers do not change.

**Alternatives.** `X-User-Id` header (less discoverable in Swagger and REST clients).

## ADR-012 Errors as RFC 7807 problem+json

**Decision.** Every error, including validation and unhandled ones, is rendered by one filter as `application/problem+json` with `type`, `title`, `status`, `detail`, `instance`, a stable machine-readable `code` (`INSUFFICIENT_FUNDS`, `ORDER_NOT_CANCELLABLE`, ...) and the `requestId`. Unexpected errors are logged with the stack and returned as a generic 500 that never leaks SQL or internals.

## ADR-013 Search with pg_trgm

**Decision.** `GET /instruments` matches `ticker` and `name` case-insensitively with `ILIKE '%term%'` (metacharacters escaped), ranks by trigram similarity when a free-text query is given, excludes `MONEDA`, paginates, and includes the latest price and daily return so a client can render a list in one call. Without filters it returns the full tradable list.

## ADR-014 Operational endpoints and hardening

- `/health/live` (process up), `/health/ready` (database ping) via Terminus; `/metrics` (Prometheus) and `/docs` (Swagger) live outside the `/api/v1` prefix and are excluded from rate limiting.
- `helmet`, CORS allow-list from env, request body limit, `trust proxy`.
- Rate limiting per IP: 100 requests/min by default, 20/min for order placement and cancellation; disabled in tests and load runs through `RATE_LIMIT_ENABLED=false`. `429` responses carry `Retry-After`.
- Structured JSON logs (pino) with a request id (`X-Request-Id` honored or generated, echoed back). Health and metrics scrapes are not logged.
- Graceful shutdown through Nest shutdown hooks; the container runs as the unprivileged `node` user with a `HEALTHCHECK`.
- Configuration is validated at boot with zod; an invalid or missing variable fails fast with a descriptive message.

## ADR-015 Testing strategy

- **Unit** (Jest): pure domain functions (`Money`, position replay, order decision, validators) and services with mocked repositories.
- **Integration** (Jest + Supertest + Testcontainers): the real HTTP pipeline against a disposable Postgres 16 with the real migrations and seed; covers the challenge-mandated functional test of order placement (27 scenarios including concurrency), portfolio totals (asserted verbatim against the seed), search, health and error shapes. The `orders` table is restored to the seed between tests.
- **Load / correctness** (k6): `smoke`, `load` (ramping to 50 VUs with thresholds) and `concurrency` (50 simultaneous buys against a seeded account; asserts no overdraft). Thresholds are regression guards calibrated for a laptop, not SLOs.
- **Coverage**: unit and integration projects run together; CI fails below 85% statements/functions/lines and 80% branches.

## ADR-016 Observability

**Decision.** `prom-client` registry with default Node metrics plus `http_server_request_duration_seconds` (by method, route **template**, status), `http_server_requests_in_flight`, `orders_placed_total{status,side,type}`, `orders_rejected_total{reason}`, `orders_cancelled_total` and `db_pool_connections{state}`. A compose profile (`--profile observability`) starts Prometheus and Grafana with a provisioned dashboard (traffic, latency percentiles, error classes, order outcomes, pool, event loop, memory, CPU).

**Logging of sensitive operations.** Everything that moves cash or shares (order placement, cancellation, deposits, withdrawals) emits a fixed set of structured pino events, all carrying `req.id`, `operation`, `userId` and the business fields (instrument, side, type, size, price, amounts): `debug` when the request is received and again once the decision is taken under the lock (balances read, decision, rejection reason, lock wait time); `info` on fills, resting orders and settled transfers; `warn` on every `REJECTED` outcome, which is the signal worth alerting on in volume; `debug` for expected refusals (404/409/422 with their `code`), so the error log is not flooded by contract behaviour; and `error` with the stack and the full business context when the transaction fails for any other reason (`common/logging/operation-log.ts`). The global filter also logs 5xx with the HTTP context, so an unexpected failure can be reconciled from either side. Request bodies are never logged wholesale; only the named fields above.

## ADR-017 Cash transfers are orders with side CASH_IN / CASH_OUT, through their own endpoints

**Context.** The statement says incoming and outgoing transfers can be modelled as orders with side `CASH_IN` / `CASH_OUT`, and the dataset records them on the `ARS` instrument with `price = 1` and `size = amount`. Without an endpoint, the only way to fund an account was to edit the database.

**Decision.** `POST /users/:userId/cash/deposits` and `POST /users/:userId/cash/withdrawals` (`{ amount }`, whole ARS) insert exactly that row: instrument `ARS`, type `MARKET`, `price 1.00`, `size = amount`. Deposits settle as `FILLED`. Withdrawals are checked against _available_ cash (total minus pending LIMIT BUY reservations, ADR-005) and, like market rejections (ADR-009), an insufficient withdrawal is persisted as `REJECTED` with `INSUFFICIENT_FUNDS` and returned with 201. Both run inside `UsersRepository.withLock`, the same per-user row lock as order placement (ADR-010), so a withdrawal and a MARKET BUY racing for the same pesos are serialized and only one can win.

Cash sides are deliberately **not** reachable through `POST /orders`: the DTO accepts only `BUY` / `SELL` (400 with a message pointing at the cash endpoints) and the `ARS` instrument itself is `422 NOT_TRADABLE`, so there is no way to mint cash with a trade. Transfers and trades share the ledger table but are different operations: different validation (an amount, no instrument, no price), different authorization in a real broker (a transfer is confirmed by a payment rail or the back office, not by the trading UI) and different rate limits. The stored row is indistinguishable from the seed's, so the portfolio needs no special case and transfers appear in the order history filtered with `side=CASH_IN|CASH_OUT`.

**Consequences.** Amounts are whole pesos because `size` is an `INTEGER` column; supporting cents would mean `size = 1, price = amount` (bounded by `NUMERIC(10,2)`) and breaking the dataset's convention. A transfer is never `NEW`, so it can never be cancelled (409 like any FILLED/REJECTED order). In production these endpoints would be driven by a payment provider's confirmations with an idempotency key rather than called by the client directly.

**Alternatives.** Accept `CASH_IN` / `CASH_OUT` in `POST /orders` (one validation schema for two unrelated operations, and the trading endpoint could create money); a dedicated `cash_movements` table (duplicates the ledger and contradicts the statement); seeding scripts only (what the k6 concurrency scenario used before; `scripts/seed-k6.ts` still exists for repeatable runs).

## Known limitations and next steps

- Positions are recomputed from the ledger on every read. This is correct and simple at this scale; the scale-out path is a positions snapshot table maintained in the same transaction as the order insert (or a materialized view), documented here rather than built.
- No idempotency key on `POST /orders` or the cash endpoints; a retry after a network timeout can create a duplicate order or transfer. Adding an `Idempotency-Key` header backed by a small table is the first production follow-up.
- LIMIT orders rest as `NEW` forever: there is no matching engine (the challenge says not to simulate the market).
- The `price` column is `NUMERIC(10,2)`, which caps prices below 100,000,000 ARS; fine for the listed equities.
- Cash transfers are whole ARS (`size` is an integer and `price` is 1, as in the dataset); see ADR-017 for the cents trade-off.
- Migrations run from the container entrypoint on every start with no cross-replica lock. With one `api` replica (this compose file) that is fine; before scaling out, run migrations as a one-off job or wrap `cli.ts up` in `pg_advisory_lock`.

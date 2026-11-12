# Cocos Backend Challenge

[![CI](https://github.com/emariotti3/cocos-challenge-emariotti3/actions/workflows/ci.yml/badge.svg)](https://github.com/emariotti3/cocos-challenge-emariotti3/actions/workflows/ci.yml)
![Node 24](https://img.shields.io/badge/node-24-339933?logo=node.js&logoColor=white)
![NestJS 11](https://img.shields.io/badge/NestJS-11-E0234E?logo=nestjs&logoColor=white)
![Postgres 16](https://img.shields.io/badge/Postgres-16-4169E1?logo=postgresql&logoColor=white)
![Coverage thresholds](https://img.shields.io/badge/coverage-%E2%89%A585%25%20enforced-brightgreen)

English version: [README.md](README.md).

API REST para una cuenta comitente: **valuación del portafolio**, **búsqueda de instrumentos** y **envío de órdenes** (MARKET / LIMIT, con cancelación) y **depósitos / retiros de efectivo** sobre el esquema Postgres provisto. Construida como un servicio de producción: configuración validada, migraciones, logs estructurados, errores RFC 7807, rate limiting, health checks, métricas Prometheus con dashboard en Grafana, tests unitarios + de integración + de carga, y pipeline de CI.

El enunciado original está en [`backend-challenge.md`](backend-challenge.md). Cada supuesto y decisión de diseño está documentado en [`docs/DECISIONS.es.md`](docs/DECISIONS.es.md) (también en inglés: [`docs/DECISIONS.md`](docs/DECISIONS.md)).

Hay además una [página de resumen](https://claude.ai/artifact/U3Qu9VvY3gs7DziB4Ecf6g) en español con diagramas de secuencia de los flujos principales, el plan por etapas, la estructura del repo y las instrucciones para la colección Postman.

## Por dónde empezar

Si tenés diez minutos, estos archivos concentran la mayor parte del diseño:

| Qué                                                              | Dónde                                                                                                                |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| El test funcional del envío de órdenes que pide el enunciado     | [`test/integration/orders.e2e-spec.ts`](test/integration/orders.e2e-spec.ts) (pipeline HTTP real, Postgres real)     |
| La regla de aceptación del mercado, como función pura            | [`src/modules/orders/domain/order-decision.ts`](src/modules/orders/domain/order-decision.ts)                         |
| Efectivo, reservas y disponibilidad derivados del ledger         | [`src/modules/portfolio/portfolio.repository.ts`](src/modules/portfolio/portfolio.repository.ts)                     |
| Replay de posiciones con costo promedio ponderado                | [`src/modules/portfolio/domain/position-calculator.ts`](src/modules/portfolio/domain/position-calculator.ts)         |
| El candado por usuario que hace seguras las órdenes concurrentes | [`src/modules/users/users.repository.ts`](src/modules/users/users.repository.ts)                                     |
| Cada cambio del esquema y su justificación                       | [`src/database/migrations/0002_constraints_and_indexes.ts`](src/database/migrations/0002_constraints_and_indexes.ts) |
| Cada supuesto, con las alternativas descartadas                  | [`docs/DECISIONS.es.md`](docs/DECISIONS.es.md)                                                                       |

## Contenido

- [Por dónde empezar](#por-dónde-empezar)
- [Inicio rápido](#inicio-rápido)
- [API](#api)
- [Reglas de negocio en una página](#reglas-de-negocio-en-una-página)
- [Arquitectura](#arquitectura)
- [Desarrollo local](#desarrollo-local)
- [Configuración](#configuración)
- [Testing](#testing)
- [Pruebas de carga y concurrencia (k6)](#pruebas-de-carga-y-concurrencia-k6)
- [Observabilidad](#observabilidad)
- [CI](#ci)
- [Estructura del proyecto](#estructura-del-proyecto)
- [Notas sobre el esquema provisto](#notas-sobre-el-esquema-provisto)

## Inicio rápido

Requisitos: Docker con Compose v2. Nada más.

```bash
docker compose up --build -d          # postgres + api (migraciones y seed corren al arrancar)
curl -s localhost:3000/health/ready    # {"status":"ok",...}
curl -s localhost:3000/api/v1/users/1/portfolio | jq
open http://localhost:3000/docs        # Swagger UI
```

Con el dataset incluido, el usuario 1 debe mostrar `totalValue` **904784.00**, efectivo disponible **627500.00**, posiciones en PAMP y METR, y un warning por la posición inconsistente en BMA (ver [ADR-006](docs/DECISIONS.es.md#adr-006-datos-inconsistentes-del-seed-la-posición-negativa-de-bma)).

Requests listos para usar: [`docs/api.http`](docs/api.http) (extensión REST Client de VS Code) o importá en Postman [`docs/postman_collection.json`](docs/postman_collection.json) junto con [`docs/postman_environment.json`](docs/postman_environment.json). El documento OpenAPI se exporta a [`docs/openapi.json`](docs/openapi.json).

Para apagar todo: `docker compose down` (agregá `-v` para borrar el volumen de la base).

## API

Ruta base `/api/v1`. Los valores monetarios son **strings decimales con dos decimales** en ARS. Los errores son `application/problem+json` con un `code` estable (ver abajo). No hay autenticación (el enunciado no la requiere): el usuario es un parámetro de ruta y un usuario desconocido devuelve `404 USER_NOT_FOUND`.

| Método | Ruta                                                               | Propósito                                                                                                                                                                                              |
| ------ | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET`  | `/instruments?q=&ticker=&name=&page=&limit=`                       | Búsqueda por ticker y/o nombre (sin distinguir mayúsculas, parcial, ordenada por similitud trigram). Devuelve último precio y retorno diario. Sin filtro = listado completo de instrumentos operables. |
| `GET`  | `/instruments/:id`                                                 | Un instrumento con su último precio.                                                                                                                                                                   |
| `GET`  | `/users/:userId/portfolio`                                         | Valor total de la cuenta, efectivo (`total`, `reserved`, `available`) y posiciones con valor de mercado, costo promedio, P&L y rendimientos.                                                           |
| `POST` | `/users/:userId/orders`                                            | Envía una orden. Devuelve `201` con estado `FILLED`, `NEW` **o `REJECTED`** (las rechazadas se persisten, como pide el enunciado).                                                                     |
| `POST` | `/users/:userId/orders/:orderId/cancel`                            | Cancela una orden `NEW` (`409` en otro caso).                                                                                                                                                          |
| `POST` | `/users/:userId/cash/deposits`                                     | Deposita pesos enteros. Se registra como una orden `FILLED` con side `CASH_IN` sobre el instrumento `ARS` (`price 1`, `size = amount`).                                                                |
| `POST` | `/users/:userId/cash/withdrawals`                                  | Retira pesos enteros (side `CASH_OUT`). Se valida contra el efectivo _disponible_ bajo el mismo candado por usuario; si no alcanza, se persiste como `REJECTED`.                                       |
| `GET`  | `/users/:userId/orders?status=&side=&instrumentId=&limit=&cursor=` | Historial de órdenes, más recientes primero, paginado por cursor.                                                                                                                                      |
| `GET`  | `/users/:userId/orders/:orderId`                                   | Una orden.                                                                                                                                                                                             |
| `GET`  | `/health/live`, `/health/ready`                                    | Liveness / readiness (ping a la base).                                                                                                                                                                 |
| `GET`  | `/metrics`                                                         | Exposición Prometheus.                                                                                                                                                                                 |
| `GET`  | `/docs`, `/docs-json`                                              | Swagger UI / OpenAPI JSON.                                                                                                                                                                             |

### Enviar una orden

```jsonc
POST /api/v1/users/1/orders
{ "instrumentId": 47, "side": "BUY", "type": "MARKET", "size": 10 }          // acciones exactas
{ "instrumentId": 47, "side": "BUY", "type": "MARKET", "amount": "100000" }  // presupuesto en ARS -> floor(100000 / 925.85) = 108 acciones
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

| Resultado                                                                                      | HTTP | `status` / `code`                                           |
| ---------------------------------------------------------------------------------------------- | ---- | ----------------------------------------------------------- |
| Orden MARKET aceptada                                                                          | 201  | `FILLED` (ejecutada al último close)                        |
| Orden LIMIT aceptada                                                                           | 201  | `NEW` (queda al precio límite; reserva efectivo o acciones) |
| Efectivo disponible insuficiente (BUY)                                                         | 201  | `REJECTED`, `rejectionReason: INSUFFICIENT_FUNDS`           |
| Acciones disponibles insuficientes (SELL)                                                      | 201  | `REJECTED`, `rejectionReason: INSUFFICIENT_SHARES`          |
| Pedido mal formado (LIMIT sin precio, MARKET con precio, `size` y `amount` a la vez, ...)      | 400  | `VALIDATION_ERROR` con `errors[{path,message}]`             |
| Usuario / instrumento / orden desconocidos                                                     | 404  | `USER_NOT_FOUND`, `INSTRUMENT_NOT_FOUND`, `ORDER_NOT_FOUND` |
| Instrumento de efectivo, sin precio de mercado para una MARKET, presupuesto menor a una acción | 422  | `NOT_TRADABLE`, `NO_MARKET_PRICE`, `AMOUNT_TOO_SMALL`       |
| Cancelar una orden que no está en NEW                                                          | 409  | `ORDER_NOT_CANCELLABLE`                                     |
| Demasiados requests                                                                            | 429  | `RATE_LIMITED` (+ `Retry-After`)                            |

### Formato de error (RFC 7807)

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

Enviá `X-Request-Id` para correlacionar; se devuelve en el header de la respuesta, en el cuerpo del problema y en cada línea de log.

## Reglas de negocio en una página

Todo se deriva del ledger de `orders`; no se guarda ningún saldo.

- **Efectivo** es el instrumento `ARS` (tipo `MONEDA`). `cash.total` = Σ FILLED (`CASH_IN` + `SELL`) − Σ FILLED (`CASH_OUT` + `BUY`), cada uno `size × price`.
- **Reservas.** Una LIMIT BUY en `NEW` reserva `size × price`; una LIMIT SELL en `NEW` reserva `size` acciones. `cash.available = total − reserved`; `availableQuantity = quantity − reservedQuantity`. Los chequeos de suficiencia usan las cifras _disponibles_ ([ADR-005](docs/DECISIONS.es.md#adr-005-las-órdenes-limit-pendientes-reservan-efectivo-y-acciones)).
- **Posiciones**: se reproducen los trades FILLED BUY/SELL en orden con costo promedio ponderado. `marketValue = quantity × último close`, `totalReturnPct = (marketValue − costBasis) / costBasis`, `dailyReturnPct = (close − previousClose) / previousClose` ([ADR-007](docs/DECISIONS.es.md#adr-007-costo-promedio-ponderado-y-rendimientos)).
- **Tamaño.** `size` o `amount` (nunca ambos); `size = floor(amount / precio)` con el último close para MARKET y el precio límite para LIMIT. Sin fracciones de acción.
- **Ciclo de vida.** MARKET → `FILLED` al último close. LIMIT → `NEW`. Solo `NEW` se puede cancelar → `CANCELLED`. Efectivo/acciones insuficientes → `REJECTED` (persistida).
- **Transferencias.** Los depósitos y retiros son órdenes con side `CASH_IN` / `CASH_OUT` sobre `ARS`, como en el dataset, pero solo a través de los endpoints `/cash`: `POST /orders` rechaza esos sides (400) y el instrumento `ARS` (422). Un retiro mayor al efectivo disponible se persiste como `REJECTED` ([ADR-017](docs/DECISIONS.es.md#adr-017-las-transferencias-son-órdenes-con-side-cash_in--cash_out-a-través-de-sus-propios-endpoints)).
- **Concurrencia.** El envío, la cancelación y los movimientos de efectivo de un usuario se serializan con un candado de fila dentro de una transacción `READ COMMITTED`, así las operaciones concurrentes nunca pueden sobregirar efectivo ni acciones, compitan entre órdenes, retiros o ambos ([ADR-010](docs/DECISIONS.es.md#adr-010-concurrencia-candado-por-usuario-en-lugar-de-serializable)).
- **Rarezas de datos contempladas.** Las posiciones negativas o sobrevendidas (el seed vende más BMA de lo que compró) se excluyen de las tenencias y se informan en `warnings[]`; los instrumentos sin market data tienen precio `null` y no se pueden comprar a mercado.

## Arquitectura

```mermaid
flowchart LR
  C[Cliente] -->|HTTP /api/v1| M[Middleware<br/>metrics · helmet · cors · pino]
  M --> G[Guards<br/>throttler · user exists]
  G --> V[ValidationPipe<br/>DTOs class-validator]
  V --> IC[InstrumentsController] & PC[PortfolioController] & OC[OrdersController]
  IC --> IS[InstrumentsService] --> IR[(InstrumentsRepository)]
  IS --> MS[MarketdataService] --> MR[(MarketdataRepository)]
  PC --> PS[PortfolioService] --> PR[(PortfolioRepository<br/>agregados del ledger)]
  PS --> MS
  PS --> PCALC[position-calculator<br/>puro]
  OC --> OS[OrdersService] --> OR[(OrdersRepository)]
  OS --> PR
  OS --> UR[(UsersRepository<br/>candado FOR UPDATE)]
  OS --> DEC[decideOrder<br/>puro]
  IR & MR & PR & OR & UR --> DB[(Postgres 16)]
  X[ProblemDetailsFilter] -.->|problem+json| C
  OS --> MET[MetricsService] -.-> PROM[Prometheus] -.-> GRAF[Grafana]
```

- **Monolito modular en NestJS 11**, TypeScript strict. Los controladores traducen HTTP; los servicios contienen los casos de uso; los repositorios son las únicas clases que tocan **Sequelize** (modelos para CRUD, SQL crudo con bind parameters para los agregados del ledger).
- **El dinero** nunca es un float: `NUMERIC` sigue siendo string hasta la clase `Money` (decimal.js); las respuestas llevan strings de dos decimales. Los timestamps se guardan y leen en UTC.
- **Esquema**: el DDL provisto como migración base, luego constraints, únicos, índices (incluido `pg_trgm` para la búsqueda) y la columna `rejection_reason`, aplicados con `umzug` al arrancar el contenedor ([ADR-003](docs/DECISIONS.es.md#adr-003-migraciones-con-umzug-y-endurecimiento-del-esquema)).
- **Endurecimiento**: entorno validado con zod (falla rápido), helmet, lista de orígenes CORS, rate limiting por IP (más estricto para el envío de órdenes), ids de request, logs JSON estructurados, health checks con Terminus, apagado graceful, contenedor sin root con `HEALTHCHECK`.

### Envío de una orden, paso a paso

```mermaid
sequenceDiagram
  autonumber
  participant C as Cliente
  participant API as OrdersController
  participant S as OrdersService
  participant DB as Postgres
  C->>API: POST /users/1/orders {instrumentId, side, type, size | amount, price?}
  API->>API: UserExistsGuard (404) · ValidationPipe (400)
  API->>S: placeOrder(user, dto)
  S->>DB: instrumento (404 desconocido · 422 NOT_TRADABLE para efectivo)
  alt MARKET
    S->>DB: último close (422 NO_MARKET_PRICE si no hay)
  else LIMIT
    Note over S: precio = precio del request
  end
  Note over S: size = size ?? floor(amount / precio) · 422 AMOUNT_TOO_SMALL si es 0
  S->>DB: BEGIN · SELECT id FROM users WHERE id = $1 FOR UPDATE
  Note over S,DB: cualquier otra orden o cancelación de este usuario espera acá
  S->>DB: efectivo disponible = Σ FILLED − reservas de BUY en NEW
  opt SELL
    S->>DB: acciones disponibles = neto FILLED − reservas de SELL en NEW
  end
  Note over S: decideOrder → FILLED · NEW · REJECTED (función pura)
  S->>DB: INSERT orders (status, rejection_reason) · COMMIT
  S-->>C: 201 {status, size, price, notional, rejectionReason}
```

La verificación de disponibilidad y el INSERT comparten una transacción bajo el candado de la fila del usuario; eso es lo que hace pasar los dos tests de concurrencia: diez compras simultáneas contra efectivo para seis llenan exactamente seis.

## Desarrollo local

```bash
nvm use                      # Node 24 (.nvmrc)
npm ci
cp .env.example .env
docker compose up -d postgres
npm run db:migrate && npx tsx src/database/cli.ts seed
npm run start:dev            # tsc --watch + node --watch sobre dist, http://localhost:3000
```

Scripts útiles (también envueltos en el `Makefile`, corré `make help`):

| Script                                                 | Qué hace                                                   |
| ------------------------------------------------------ | ---------------------------------------------------------- |
| `npm run build`                                        | Compila a `dist/` (`tsc` plano, sin bundler)               |
| `npm run start:dev`                                    | Recompila y reinicia ante cambios                          |
| `npm run db:migrate` / `db:migrate:undo` / `db:status` | Aplica / revierte / inspecciona migraciones (`umzug`)      |
| `npx tsx src/database/cli.ts seed` / `seed:undo`       | Carga / elimina el dataset del challenge                   |
| `npm run lint` / `format` / `typecheck`                | ESLint (con tipos), Prettier, `tsc --noEmit`               |
| `npm test`                                             | Tests unitarios                                            |
| `npm run test:e2e`                                     | Tests de integración (Testcontainers)                      |
| `npm run test:cov`                                     | Unitarios + integración con cobertura combinada y umbrales |
| `npm run k6:smoke` / `k6:load` / `k6:concurrency`      | Pruebas de carga (ver abajo)                               |
| `npm run openapi:export`                               | Regenera `docs/openapi.json`                               |

¿Sin `psql` local? `make psql` abre uno dentro del contenedor de Postgres.

## Configuración

Todas las variables se validan al arrancar (`src/config/env.schema.ts`); un valor inválido detiene el proceso con un mensaje claro. `.env` se carga si existe y nunca pisa variables de entorno reales.

| Variable                  | Default       | Descripción                                                                           |
| ------------------------- | ------------- | ------------------------------------------------------------------------------------- |
| `NODE_ENV`                | `development` | `development` activa logs legibles; `production` / `test` emiten JSON                 |
| `PORT`                    | `3000`        | Puerto HTTP                                                                           |
| `LOG_LEVEL`               | `info`        | Nivel de pino (`silent` en tests)                                                     |
| `DATABASE_URL`            | obligatoria   | `postgres://user:pass@host:5432/db`                                                   |
| `DB_POOL_MAX`             | `10`          | Tamaño del pool de Sequelize                                                          |
| `RUN_SEED`                | `true`        | El entrypoint del contenedor carga el dataset del challenge después de migrar         |
| `CORS_ORIGINS`            | `*`           | Lista separada por comas, o `*`                                                       |
| `RATE_LIMIT_ENABLED`      | `true`        | Throttling por IP (desactivar para pruebas de carga)                                  |
| `RATE_LIMIT_TTL_SECONDS`  | `60`          | Ventana de throttling                                                                 |
| `RATE_LIMIT_LIMIT`        | `100`         | Requests por ventana por IP                                                           |
| `RATE_LIMIT_ORDERS_LIMIT` | `20`          | Mutaciones del ledger (órdenes, cancelaciones, depósitos, retiros) por ventana por IP |
| `METRICS_ENABLED`         | `true`        | Expone `/metrics`                                                                     |

## Testing

| Capa                                           | Herramienta                           | Qué demuestra                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ---------------------------------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unitarios (`src/**/*.spec.ts`)                 | Jest                                  | Lógica de dominio pura: `Money`, replay de posiciones y costo promedio, regla de decisión de órdenes, validadores, servicios con repositorios simulados                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Integración (`test/integration/*.e2e-spec.ts`) | Jest + Supertest + **Testcontainers** | El pipeline HTTP real contra un Postgres 16 descartable con las migraciones y el seed reales. Incluye el **test funcional del envío de órdenes** exigido por el enunciado (27 escenarios: fills, reservas, rechazos persistidos como `REJECTED`, cada camino de validación, cancelación, paginación y dos tests de **concurrencia** que prueban que no hay sobregiro), **18 escenarios de efectivo** (depósitos, retiros contra el disponible, rechazos persistidos, sides de efectivo rechazados en el endpoint de órdenes, retiros concurrentes y retiros compitiendo con compras), el portafolio comparado literalmente contra el seed, búsqueda y endpoints operativos |
| Carga / corrección                             | k6                                    | Smoke, carga en rampa con umbrales de latencia, y una ráfaga de 50 VUs comprando a la vez que verifica que la cuenta nunca queda en negativo                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

```bash
npm test               # ~10 s
npm run test:e2e       # ~30 s, necesita Docker (levanta postgres:16-alpine)
npm run test:cov       # ambos proyectos, cobertura combinada -> coverage/lcov-report/index.html
```

Los umbrales de cobertura se aplican (85 % de sentencias / funciones / líneas, 80 % de ramas); la última corrida local reportó ~97 % de sentencias y ~86 % de ramas sobre `src/` excluyendo DTOs, modelos, migraciones y bootstrap.

## Pruebas de carga y concurrencia (k6)

Los scripts de [k6](https://k6.io) viven en `k6/`. Apuntalos a cualquier despliegue con `BASE_URL` (default `http://localhost:3000`). Desactivá el rate limiting para las corridas de carga: `RATE_LIMIT_ENABLED=false docker compose up -d api`.

| Script                   | Escenario                                                                                       | Umbrales                                                                                                                     |
| ------------------------ | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `npm run k6:smoke`       | 1 VU, 30 s: health, búsqueda, portafolio, LIMIT + cancelación                                   | `http_req_failed < 1%`, `p(95) < 300 ms`, checks > 99%                                                                       |
| `npm run k6:load`        | Rampa 0→20→50→0 VUs en 2 min; 50% búsqueda, 30% portafolio, 15% LIMIT+cancel, 5% compras MARKET | GET `p(95) < 200 ms`, POST `p(95) < 400 ms`, `http_req_failed < 1%`, sin iteraciones descartadas                             |
| `npm run k6:concurrency` | Siembra al usuario 2 con 1.000.000 ARS y luego **50 VUs disparan la misma MARKET BUY a la vez** | Exactamente ⌊disponible / nocional⌋ órdenes `FILLED`, el resto `REJECTED`, efectivo nunca negativo, contabilidad consistente |

Las duraciones son configurables (`DURATION`, `RAMP_UP`, `PLATEAU`, `RAMP_DOWN`, `VUS`, `SIZE`). Los resultados se escriben en `k6/results/`. Los umbrales son guardas de regresión calibradas para una laptop con Docker, no SLOs de producción.

## Observabilidad

```bash
docker compose --profile observability up -d     # + prometheus (:9090) + grafana (:3001, lectura anónima, admin/admin)
npm run k6:load                                   # generar tráfico
open http://localhost:3001/d/cocos-api            # dashboard "Cocos API" provisto
```

Métricas expuestas en `/metrics` (**plantillas** de ruta, cardinalidad acotada):

- Histograma `http_server_request_duration_seconds{method,route,status_code}`, `http_server_requests_in_flight`
- `orders_placed_total{status,side,type}`, `orders_rejected_total{reason}`, `orders_cancelled_total`
- `db_pool_connections{state}` y las métricas por defecto del proceso Node.js (lag del event loop, heap, CPU, GC)

![Dashboard de Grafana "Cocos API" tras una corrida de carga con k6: tasa de requests y latencia p95, órdenes ejecutadas y rechazadas en la última hora, tasa por ruta y percentiles de latencia](docs/grafana-dashboard.png)

El dashboard (`docker/grafana/provisioning/dashboards/cocos-api.json`) muestra tasa de requests por ruta, percentiles de latencia, clases de respuesta, resultados de órdenes y motivos de rechazo, uso del pool y salud del runtime.

Los logs son JSON (pino) con `req.id`; los scrapes de health y métricas no se loguean. Toda operación que mueve efectivo o acciones (enviar, cancelar, depositar, retirar) deja un rastro estructurado con `operation`, `userId` y los campos de negocio: `debug` al recibirla y de nuevo al decidirla bajo el candado (saldos leídos, decisión, espera del candado), `info` en fills y transferencias liquidadas, `warn` en todo resultado `REJECTED`, `debug` en los rechazos esperados (404/409/422 con su `code`) y `error` con el stack y el contexto completo cuando la transacción falla. Las anomalías del portafolio (posiciones negativas, precios faltantes) se loguean en `warn`. Con `LOG_LEVEL=debug` se ve el rastro completo.

## CI

`.github/workflows/ci.yml` corre en cada push y pull request:

1. **lint**: ESLint, chequeo de Prettier, `tsc --noEmit`
2. **unit**: proyecto Jest de unitarios
3. **coverage**: unitarios + integración (Testcontainers sobre el Docker del runner) con umbrales; se escribe una tabla de cobertura en el resumen del job y `coverage/` se sube como artefacto (subida opcional a Codecov si existe `CODECOV_TOKEN`)
4. **docker**: construye la imagen, levanta el stack de compose con ella, espera el readiness, verifica el portafolio sembrado y corre el smoke de k6

Dependabot mantiene al día npm, GitHub Actions y la imagen base.

## Estructura del proyecto

```
src/
  main.ts, app.module.ts, app.setup.ts     # bootstrap y pipeline HTTP compartido (también lo usan los tests)
  config/                                  # esquema zod del entorno + AppConfig tipado
  common/                                  # errores, filtro problem+json, Money, cursor de paginación, validadores, throttling, logging de operaciones
  database/                                # módulo Sequelize, modelos, migraciones y seeders umzug, CLI, parsers de tipos pg
  health/                                  # liveness / readiness con Terminus
  observability/                           # módulo de logging pino, módulo de métricas Prometheus
  modules/
    instruments/                           # búsqueda + detalle, con últimos precios
    marketdata/                            # último close / previous close por instrumento
    portfolio/                             # agregados del ledger, calculadora pura de posiciones, valuación
    orders/                                # envío / cancelación / listado, regla de decisión
    cash/                                  # depósitos (CASH_IN) / retiros (CASH_OUT), regla de decisión
    users/                                 # lookup de usuario, UserExistsGuard, candado de fila por usuario (withLock)
test/
  setup/                                   # setup / teardown global de Testcontainers
  helpers/                                 # fábrica de app de test, reset de la base al seed
  integration/                             # *.e2e-spec.ts
k6/                                        # smoke.js, load.js, concurrency.js (+ lib/)
docker/                                    # Dockerfile, entrypoint, provisioning de prometheus + grafana
docs/                                      # DECISIONS.md (+ .es), TESTING.md, api.http, colección y entorno Postman, openapi.json, grafana-dashboard.png
```

## Notas sobre el esquema provisto

El `database.sql` original se aplica tal cual como primera migración. Los cambios por encima (todos aditivos, justificados en [ADR-003](docs/DECISIONS.es.md#adr-003-migraciones-con-umzug-y-endurecimiento-del-esquema)): constraints `NOT NULL` y `CHECK`, únicos en ticker / número de cuenta / (instrumento, fecha), índices para las consultas del ledger y la búsqueda trigram, `datetime DEFAULT now()`, y una columna nullable `orders.rejection_reason`. Los nombres de columna quedan en minúsculas en Postgres porque el DDL original no entrecomilla sus identificadores camelCase; el enunciado menciona una columna `marketdata.datetime`, pero el DDL la define como `date`.

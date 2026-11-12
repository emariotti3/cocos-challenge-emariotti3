# Decisiones de diseño y supuestos

Registros de decisiones de arquitectura (ADR) del backend challenge de Cocos. Cada entrada describe el contexto, la decisión, sus consecuencias y las alternativas consideradas. Los números citados para el "usuario 1" corresponden al dataset incluido en `database.sql`. Versión en inglés: [DECISIONS.md](DECISIONS.md).

## ADR-001 Monolito modular en NestJS

**Contexto.** El enunciado permite cualquier framework de Node.js. La API tiene tres áreas acotadas (instrumentos y market data, portafolio, órdenes) que comparten una base de datos.

**Decisión.** Una única aplicación NestJS dividida en módulos de dominio (`instruments`, `marketdata`, `portfolio`, `orders`, `users`) más módulos transversales (`config`, `database`, `health`, `observability`, `common`). Los controladores solo traducen HTTP; los servicios contienen los casos de uso; los repositorios son las únicas clases que tocan Sequelize.

**Consecuencias.** La inyección de dependencias hace que cada servicio sea testeable con repositorios simulados; Swagger, pipes de validación, guards y Terminus vienen incluidos. Un monolito modular es el tamaño correcto para este alcance y puede partirse más adelante siguiendo los límites de los módulos.

**Alternativas.** Express puro (menos estructura, más plomería a mano), adaptador Fastify (innecesario a esta escala).

## ADR-002 Sequelize detrás de repositorios, SQL crudo para agregados

**Contexto.** El equipo domina Sequelize. Las consultas pesadas (saldo de efectivo, posiciones, disponibilidad) son agregados sobre `orders` que un query builder de ORM expresa mal.

**Decisión.** Sequelize v6 con modelos `sequelize-typescript` para las cuatro tablas; todo acceso pasa por clases repositorio. Los agregados usan `sequelize.query` con **bind parameters** (`$nombre`) y mapeadores de filas tipados. Los servicios dependen de repositorios, nunca de modelos, así el ORM es reemplazable.

**Consecuencias.** SQL predecible que se puede analizar con `EXPLAIN` e indexar; sin N+1; el ORM sigue aportando pool de conexiones, transacciones y la metadata de modelos que usan los health checks y los tests.

**Alternativas.** TypeORM (más cercano a los idiomas de Nest, menos familiar para la autora), Prisma (SQL crudo menos ergonómico para las partes de agregación), Kysely (buen encaje, pero más infraestructura a mano).

## ADR-003 Migraciones con umzug y endurecimiento del esquema

**Contexto.** El `database.sql` provisto es una base funcional; el enunciado permite y pide justificar cambios de esquema.

**Decisión.** Tres pasos ordenados ejecutados por `umzug` (TypeScript en desarrollo, JavaScript compilado en la imagen, mismas filas de historial):

1. `0001_baseline`: el DDL provisto tal cual. Los identificadores quedan sin comillas, por lo que Postgres los pasa a minúsculas (`instrumentid`, `userid`, `accountnumber`, `previousclose`). Los modelos mapean esos nombres de columna explícitamente.
2. `0002_constraints_and_indexes`:
   - `NOT NULL` en todas las columnas de negocio y `CHECK` sobre `side`, `type`, `status`, `size > 0`, `price >= 0`: ni siquiera un escritor con bugs puede persistir filas inválidas.
   - `UNIQUE (instruments.ticker)`, `UNIQUE (users.accountnumber)`, `UNIQUE (marketdata.instrumentid, date)`.
   - `orders (userid, status, instrumentid)`: sirve el resumen de efectivo, el replay de posiciones y el chequeo de disponibilidad por instrumento. `orders (userid, datetime DESC, id DESC)`: historial con paginación por cursor. `marketdata (instrumentid, date DESC)`: último precio por instrumento con `DISTINCT ON`. Índices GIN trigram sobre `instruments.ticker` y `name` para búsquedas `ILIKE '%term%'` (el planificador usa un seq scan sobre 66 filas; el índice rinde con catálogos reales).
   - `orders.datetime DEFAULT now()`.
   - Nueva columna nullable `orders.rejection_reason`: una fila REJECTED debe decir por qué (`INSUFFICIENT_FUNDS` / `INSUFFICIENT_SHARES`) para soporte y auditoría.
3. Seed (`0001_challenge_dataset`, tabla de historial separada): el bloque de INSERT de `database.sql`, copiado tal cual, idempotente y omisible con `RUN_SEED=false`.

`orders.datetime` se mantiene como `TIMESTAMP` (sin zona horaria) para no alterar la semántica del esquema dado; la aplicación siempre escribe y lee en UTC (ver ADR-004).

**Alternativas.** `sequelize-cli` (migraciones solo en JavaScript), `sequelize.sync()` (nunca en producción), migraciones por diff de entidades de TypeORM.

## ADR-004 El dinero y el tiempo nunca son floats ni hora local

**Decisión.** `NUMERIC` llega desde `pg` como string y sigue siendo string hasta la clase `Money` (decimal.js). Todo campo monetario de una respuesta es un **string** con dos decimales (`"753000.00"`). Los valores `TIMESTAMP` se parsean como UTC mediante un type parser propio de `pg`; los `DATE` se devuelven como strings `yyyy-mm-dd`.

**Consecuencias.** Los errores del estilo `0.1 + 0.2` son imposibles; los totales coinciden con la base al centavo; los resultados no dependen de la zona horaria del host. Los clientes deben parsear strings (práctica habitual en APIs financieras).

## ADR-005 Las órdenes LIMIT pendientes reservan efectivo y acciones

**Contexto.** El enunciado define "pesos disponibles para operar" y pide rechazar órdenes que superen lo disponible, pero no dice si las órdenes en estado `NEW` cuentan. Una LIMIT BUY que descansa en el libro consumirá efectivo si se ejecuta; un broker que la ignorara dejaría que el usuario gaste los mismos pesos dos veces.

**Decisión.** La disponibilidad se calcula neta de reservas pendientes:

- `cash.total` = suma de movimientos FILLED (`CASH_IN`, `SELL` suman; `CASH_OUT`, `BUY` restan), cada uno `size * price`.
- `cash.reserved` = `size * price` de las órdenes BUY en `NEW`. `cash.available = total - reserved`.
- `availableShares(i)` = cantidad neta FILLED menos `size` de las órdenes SELL en `NEW` para `i`.
- Los chequeos de aceptación usan las cifras **disponibles**. Se devuelven tanto `total` como `available`, así cualquiera de las dos interpretaciones es visible.

Para el usuario 1: total 753.000,00; reservado 125.500,00 (50 x 710 + 60 x 1500); disponible 627.500,00. La regla vive en una sola expresión SQL (`PortfolioRepository`) y una función pura (`decideOrder`), por lo que cambiar a la otra interpretación es un cambio de una línea.

## ADR-006 Datos inconsistentes del seed: la posición negativa de BMA

**Contexto.** El usuario 1 compró 20 BMA y luego vendió 30 (ambas FILLED), así que la posición neta es -10. Los datos reales pueden arrastrar inconsistencias así después de migraciones o correcciones manuales.

**Decisión.** Las posiciones con cantidad neta no positiva nunca se devuelven como tenencias. La respuesta del portafolio lleva un arreglo `warnings[]` (`NEGATIVE_POSITION`, `OVERSOLD_POSITION`, `NO_MARKET_PRICE`) y la anomalía se loguea en nivel `warn`. Vender un instrumento con posición no positiva se `REJECTED` con `INSUFFICIENT_SHARES`. La API nunca falla ni reporta un valor de mercado negativo.

## ADR-007 Costo promedio ponderado y rendimientos

**Decisión.** Las posiciones se reconstruyen reproduciendo las órdenes FILLED BUY/SELL en orden `(datetime, id)`. Una BUY suma `size * price` al costo; una SELL quita la fracción vendida del costo al promedio vigente, dejando el costo promedio sin cambios. Una posición totalmente cerrada reinicia su costo. Luego:

- `marketValue = quantity * último close`
- `averageCost = costBasis / quantity`
- `unrealizedPnl = marketValue - costBasis`
- `totalReturnPct = (marketValue - costBasis) / costBasis * 100`
- `dailyReturnPct = (close - previousClose) / previousClose * 100` (de la última fila de `marketdata`)
- `totalValue = cash.total + sum(marketValue)`

El P&L realizado queda fuera de alcance a propósito. FIFO también sería defendible; el promedio ponderado es lo que muestran la mayoría de los brokers argentinos y es más simple de explicar.

## ADR-008 Reglas de tamaño y validación de órdenes

- `size` (acciones enteras) **o** `amount` (presupuesto en ARS), nunca ambos. `size = floor(amount / precio_ref)`; `precio_ref` es el último close para MARKET y el precio límite para LIMIT. Un presupuesto que no compra ninguna acción es `422 AMOUNT_TOO_SMALL` y no se persiste nada (no hay orden que enviar).
- `price` es **obligatorio en LIMIT** y **rechazado en MARKET** (`400`). Ignorar en silencio un precio enviado por el cliente ocultaría bugs del cliente; ser estricto es más barato de relajar que de endurecer.
- Las órdenes MARKET sobre un instrumento sin market data son `422 NO_MARKET_PRICE` (no se pueden valuar); las LIMIT sobre esos instrumentos se aceptan.
- El instrumento de efectivo (`MONEDA`) no es operable (`422 NOT_TRADABLE`); `CASH_IN`/`CASH_OUT` no se pueden enviar por este endpoint.
- Los errores de validación son `400` con un `errors[]` estructurado (un mensaje por campo, primero el chequeo más básico).

## ADR-009 Las órdenes REJECTED se persisten y responden 201

**Contexto.** El enunciado exige que una orden que supera el efectivo o las acciones disponibles se guarde con estado `REJECTED`.

**Decisión.** Un rechazo del mercado es un resultado legítimo de un pedido bien formado: la fila se inserta con `status = REJECTED` y `rejection_reason`, y la respuesta es `201 Created` con el cuerpo de la orden. Solo los pedidos mal formados o imposibles de valuar (ADR-008) son errores HTTP.

## ADR-010 Concurrencia: candado por usuario en lugar de SERIALIZABLE

**Contexto.** Los saldos se derivan sumando `orders`, así que dos órdenes concurrentes del mismo usuario leerían el mismo efectivo disponible y ambas serían aceptadas.

**Decisión.** `OrdersService.placeOrder` y `cancelOrder` corren dentro de una transacción que primero ejecuta `SELECT id FROM users WHERE id = $1 FOR UPDATE`. Todo el trabajo que cambia saldos de un usuario se serializa sobre ese candado; usuarios distintos nunca compiten. La disponibilidad se lee dentro de la transacción y el INSERT ocurre antes del commit.

**Consecuencias.** Sin bucles de reintento, sin fallos de serialización `40001`, latencia predecible; la suite de integración prueba que 10 compras simultáneas llenan exactamente 6 (lo que permite el efectivo) y el escenario de concurrencia de k6 hace lo mismo bajo carga HTTP real.

**Alternativas.** Aislamiento `SERIALIZABLE` (requiere reintentos del lado cliente y conflictúa constantemente con lecturas de suma sobre órdenes), `pg_advisory_xact_lock(userId)` (equivalente sin tocar la fila de `users`; un reemplazo razonable), una columna de saldo almacenada con `CHECK (balance >= 0)` (contradice el requisito de "derivar desde las órdenes").

## ADR-011 Identificación del usuario sin autenticación

**Decisión.** La autenticación está fuera de alcance, así que el usuario es un parámetro de ruta: `/users/:userId/portfolio`, `/users/:userId/orders`. Un guard valida el id, carga el usuario una vez (404 `USER_NOT_FOUND`) y lo adjunta al request. Reemplazar el guard por uno JWT que complete `request.user` es la evolución prevista; los controladores no cambian.

**Alternativas.** Header `X-User-Id` (menos descubrible en Swagger y en clientes REST).

## ADR-012 Errores como problem+json (RFC 7807)

**Decisión.** Todo error, incluidos los de validación y los no controlados, lo renderiza un único filtro como `application/problem+json` con `type`, `title`, `status`, `detail`, `instance`, un `code` estable legible por máquinas (`INSUFFICIENT_FUNDS`, `ORDER_NOT_CANCELLABLE`, ...) y el `requestId`. Los errores inesperados se loguean con stack y se devuelven como un 500 genérico que nunca filtra SQL ni detalles internos.

## ADR-013 Búsqueda con pg_trgm

**Decisión.** `GET /instruments` compara `ticker` y `name` sin distinguir mayúsculas con `ILIKE '%term%'` (metacaracteres escapados), ordena por similitud trigram cuando hay texto libre, excluye `MONEDA`, pagina e incluye el último precio y el retorno diario para que un cliente pueda renderizar una lista en una sola llamada. Sin filtros devuelve el listado completo de instrumentos operables.

## ADR-014 Endpoints operativos y endurecimiento

- `/health/live` (proceso arriba), `/health/ready` (ping a la base) vía Terminus; `/metrics` (Prometheus) y `/docs` (Swagger) viven fuera del prefijo `/api/v1` y están exentos del rate limiting.
- `helmet`, lista de orígenes CORS por variable de entorno, límite de tamaño de body, `trust proxy`.
- Rate limiting por IP: 100 requests/min por defecto, 20/min para enviar y cancelar órdenes; deshabilitado en tests y corridas de carga con `RATE_LIMIT_ENABLED=false`. Las respuestas `429` llevan `Retry-After`.
- Logs JSON estructurados (pino) con id de request (`X-Request-Id` se respeta o se genera, y se devuelve). Los scrapes de health y métricas no se loguean.
- Apagado graceful mediante los shutdown hooks de Nest; el contenedor corre con el usuario sin privilegios `node` y tiene `HEALTHCHECK`.
- La configuración se valida al arrancar con zod; una variable inválida o faltante falla rápido con un mensaje descriptivo.

## ADR-015 Estrategia de testing

- **Unitarios** (Jest): funciones de dominio puras (`Money`, replay de posiciones, decisión de órdenes, validadores) y servicios con repositorios simulados.
- **Integración** (Jest + Supertest + Testcontainers): el pipeline HTTP real contra un Postgres 16 descartable con las migraciones y el seed reales; cubre el test funcional del envío de órdenes exigido por el enunciado (27 escenarios, incluida concurrencia), los totales del portafolio (comparados literalmente contra el seed), búsqueda, health y formatos de error. La tabla `orders` se restaura al seed entre tests.
- **Carga / corrección** (k6): `smoke`, `load` (rampa hasta 50 VUs con umbrales) y `concurrency` (50 compras simultáneas contra una cuenta sembrada; verifica que no haya sobregiro). Los umbrales son guardas de regresión calibradas para una laptop, no SLOs.
- **Cobertura**: unitarios e integración corren juntos; CI falla por debajo de 85 % de sentencias/funciones/líneas y 80 % de ramas.

## ADR-016 Observabilidad

**Decisión.** Registro `prom-client` con las métricas por defecto de Node más `http_server_request_duration_seconds` (por método, **plantilla** de ruta y status), `http_server_requests_in_flight`, `orders_placed_total{status,side,type}`, `orders_rejected_total{reason}`, `orders_cancelled_total` y `db_pool_connections{state}`. Un perfil de compose (`--profile observability`) levanta Prometheus y Grafana con un dashboard provisto (tráfico, percentiles de latencia, clases de error, resultados de órdenes, pool, event loop, memoria, CPU).

## Limitaciones conocidas y próximos pasos

- Las posiciones se recalculan desde el ledger en cada lectura. Es correcto y simple a esta escala; el camino de crecimiento es una tabla de snapshot de posiciones mantenida en la misma transacción que el INSERT de la orden (o una vista materializada), documentado aquí en lugar de construido.
- No hay idempotency key en `POST /orders`; un reintento tras un timeout de red puede crear una orden duplicada. Agregar un header `Idempotency-Key` respaldado por una tabla pequeña es el primer paso recomendado para producción.
- Las órdenes LIMIT quedan en `NEW` indefinidamente: no hay motor de matching (el enunciado pide no simular el mercado).
- La columna `price` es `NUMERIC(10,2)`, lo que limita los precios por debajo de 100.000.000 ARS; suficiente para las acciones listadas.

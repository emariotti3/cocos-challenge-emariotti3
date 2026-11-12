// Concurrency correctness: N virtual users fire the same MARKET BUY at the
// exact same moment against one account. The API must fill only as many as
// the available cash allows and reject the rest; the account can never go
// negative. Run `npm run k6:concurrency` (seeds user 2 with 1,000,000 ARS first).
import http from 'k6/http';
import { check } from 'k6';
import { Counter } from 'k6/metrics';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.1.0/index.js';
import { API, INSTRUMENT_ID, JSON_HEADERS, summaryTrendStats } from './lib/config.js';
import { resultsPath } from './lib/helpers.js';

const USER_ID = __ENV.USER_ID || '2';
const VUS = Number(__ENV.VUS || 50);
const SIZE = Number(__ENV.SIZE || 100);

const filled = new Counter('orders_filled');
const rejected = new Counter('orders_rejected');

export const options = {
  scenarios: {
    burst: { executor: 'shared-iterations', vus: VUS, iterations: VUS, maxDuration: '1m' },
  },
  summaryTrendStats,
  thresholds: {
    http_req_failed: ['rate<0.01'],
    checks: ['rate>0.99'],
    'http_req_duration{name:place_order}': ['p(95)<500'],
  },
};

export function setup() {
  const before = http.get(`${API}/users/${USER_ID}/portfolio`).json();
  const instrument = http.get(`${API}/instruments/${INSTRUMENT_ID}`).json();
  const notional = Number(instrument.lastPrice) * SIZE;
  const expectedFills = Math.floor(Number(before.cash.available) / notional);
  console.log(
    `user ${USER_ID}: available=${before.cash.available} price=${instrument.lastPrice} size=${SIZE} ` +
      `notional=${notional.toFixed(2)} -> expecting exactly ${expectedFills} FILLED of ${VUS}`,
  );
  return {
    available: Number(before.cash.available),
    price: Number(instrument.lastPrice),
    expectedFills,
    quantityBefore: positionQty(before),
  };
}

export default function () {
  const res = http.post(
    `${API}/users/${USER_ID}/orders`,
    JSON.stringify({ instrumentId: INSTRUMENT_ID, side: 'BUY', type: 'MARKET', size: SIZE }),
    { headers: JSON_HEADERS, tags: { name: 'place_order' } },
  );
  check(res, { 'order 201': (r) => r.status === 201 });
  const status = res.status === 201 ? res.json('status') : 'ERROR';
  if (status === 'FILLED') filled.add(1);
  if (status === 'REJECTED') rejected.add(1);
}

export function teardown(data) {
  const after = http.get(`${API}/users/${USER_ID}/portfolio`).json();
  const quantityBought = positionQty(after) - data.quantityBefore;
  const spent = quantityBought * data.price;
  const available = Number(after.cash.available);
  console.log(
    `bought ${quantityBought} shares (${quantityBought / SIZE} fills), spent ${spent.toFixed(2)}, available now ${available}`,
  );
  check(after, {
    'available cash is not negative': () => available >= 0,
    'filled exactly what the cash allowed': () => quantityBought / SIZE === data.expectedFills,
    'cash accounting is consistent': () => Math.abs(data.available - spent - available) < 0.01,
  });
}

function positionQty(portfolioBody) {
  const position = (portfolioBody.positions || []).find((p) => p.instrumentId === INSTRUMENT_ID);
  return position ? position.quantity : 0;
}

export function handleSummary(data) {
  return { stdout: textSummary(data), [resultsPath('concurrency')]: JSON.stringify(data, null, 2) };
}

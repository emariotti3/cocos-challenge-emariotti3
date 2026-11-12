// Smoke: 1 VU for 30s walks the main flows. Catches gross regressions and
// verifies the deployment answers before running heavier scenarios.
import { sleep } from 'k6';
import { INSTRUMENT_ID, SEARCH_TERMS, summaryTrendStats } from './lib/config.js';
import {
  cancelOrder,
  health,
  pick,
  placeOrder,
  portfolio,
  resultsPath,
  search,
} from './lib/helpers.js';

export const options = {
  vus: 1,
  duration: __ENV.DURATION || '30s',
  summaryTrendStats,
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<300'],
    checks: ['rate>0.99'],
  },
};

export default function () {
  health();
  search(pick(SEARCH_TERMS));
  portfolio();
  // A resting LIMIT buy at 1 ARS reserves a negligible amount and is cancelled right away.
  const placed = placeOrder({
    instrumentId: INSTRUMENT_ID,
    side: 'BUY',
    type: 'LIMIT',
    size: 1,
    price: '1.00',
  });
  if (placed.status === 201 && placed.json('status') === 'NEW') cancelOrder(placed.json('id'));
  sleep(0.5);
}

export function handleSummary(data) {
  return { stdout: textSummary(data), [resultsPath('smoke')]: JSON.stringify(data, null, 2) };
}

import { textSummary } from 'https://jslib.k6.io/k6-summary/0.1.0/index.js';

// Load: ramps to 50 virtual users with a realistic mix (mostly reads, some
// resting LIMIT orders that get cancelled, a few small MARKET buys).
// Thresholds are regression guards calibrated for a laptop + Docker, not SLOs.
import { sleep } from 'k6';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.1.0/index.js';
import { INSTRUMENT_ID, SEARCH_TERMS, summaryTrendStats } from './lib/config.js';
import { cancelOrder, pick, placeOrder, portfolio, resultsPath, search } from './lib/helpers.js';

export const options = {
  scenarios: {
    mixed_traffic: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: __ENV.RAMP_UP || '30s', target: 20 },
        { duration: __ENV.PLATEAU || '60s', target: 50 },
        { duration: __ENV.RAMP_DOWN || '30s', target: 0 },
      ],
      gracefulRampDown: '10s',
    },
  },
  summaryTrendStats,
  thresholds: {
    http_req_failed: ['rate<0.01'],
    checks: ['rate>0.99'],
    'http_req_duration{name:search}': ['p(95)<200'],
    'http_req_duration{name:portfolio}': ['p(95)<200'],
    'http_req_duration{name:place_order}': ['p(95)<400'],
    'http_req_duration{name:cancel_order}': ['p(95)<400'],
    dropped_iterations: ['count==0'],
  },
};

export default function () {
  const roll = Math.random();
  if (roll < 0.5) {
    search(pick(SEARCH_TERMS));
  } else if (roll < 0.8) {
    portfolio();
  } else if (roll < 0.95) {
    const placed = placeOrder({
      instrumentId: INSTRUMENT_ID,
      side: 'BUY',
      type: 'LIMIT',
      size: 1,
      price: '1.00',
    });
    if (placed.status === 201 && placed.json('status') === 'NEW') cancelOrder(placed.json('id'));
  } else {
    // Small market buys; once the budget is exhausted these are (correctly) REJECTED.
    placeOrder(
      { instrumentId: INSTRUMENT_ID, side: 'BUY', type: 'MARKET', size: 1 },
      undefined,
      'place_order',
    );
  }
  sleep(Math.random() * 0.4 + 0.1);
}

export function handleSummary(data) {
  return { stdout: textSummary(data), [resultsPath('load')]: JSON.stringify(data, null, 2) };
}

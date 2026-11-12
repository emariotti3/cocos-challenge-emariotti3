import http from 'k6/http';
import { check } from 'k6';
import { API, JSON_HEADERS, USER_ID } from './config.js';

export function health() {
  const res = http.get(`${API.replace('/api/v1', '')}/health/live`, { tags: { name: 'health' } });
  check(res, { 'health 200': (r) => r.status === 200 });
  return res;
}

export function search(term) {
  const res = http.get(`${API}/instruments?q=${encodeURIComponent(term)}&limit=20`, {
    tags: { name: 'search' },
  });
  check(res, {
    'search 200': (r) => r.status === 200,
    'search has data array': (r) => Array.isArray(r.json('data')),
  });
  return res;
}

export function portfolio(userId = USER_ID) {
  const res = http.get(`${API}/users/${userId}/portfolio`, { tags: { name: 'portfolio' } });
  check(res, {
    'portfolio 200': (r) => r.status === 200,
    'portfolio has cash': (r) => typeof r.json('cash.available') === 'string',
  });
  return res;
}

export function placeOrder(body, userId = USER_ID, tagName = 'place_order') {
  const res = http.post(`${API}/users/${userId}/orders`, JSON.stringify(body), {
    headers: JSON_HEADERS,
    tags: { name: tagName },
  });
  check(res, {
    'order 201': (r) => r.status === 201,
    'order has status': (r) => ['FILLED', 'NEW', 'REJECTED'].includes(r.json('status')),
  });
  return res;
}

export function cancelOrder(orderId, userId = USER_ID) {
  const res = http.post(`${API}/users/${userId}/orders/${orderId}/cancel`, null, {
    tags: { name: 'cancel_order' },
  });
  check(res, {
    'cancel 200': (r) => r.status === 200,
    cancelled: (r) => r.json('status') === 'CANCELLED',
  });
  return res;
}

export function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

export function resultsPath(name) {
  return `k6/results/${name}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
}

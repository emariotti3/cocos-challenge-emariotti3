export const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
export const API = `${BASE_URL}/api/v1`;
export const USER_ID = __ENV.USER_ID || '1';
export const JSON_HEADERS = { 'Content-Type': 'application/json' };

/** Mix of ticker and name fragments that exist in the seed dataset. */
export const SEARCH_TERMS = [
  'pamp',
  'ggal',
  'banco',
  'ypf',
  'loma',
  'tx',
  'cepu',
  'alua',
  'mirg',
  'gas',
  'molinos',
  'bma',
];

/** PAMP: id 47, last close 925.85 in the seed data. */
export const INSTRUMENT_ID = Number(__ENV.INSTRUMENT_ID || 47);

export const summaryTrendStats = ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'];

import { isPositiveDecimal } from './decimal.validators';

describe('isPositiveDecimal', () => {
  it.each(['925.85', '1', '0.01', 925.85, 1000000, '  12.5 '])('accepts %p', (value) => {
    expect(isPositiveDecimal(value)).toBe(true);
  });

  it.each([
    '0',
    '-1',
    0,
    -5,
    'abc',
    '1e3',
    '1.234',
    1.234,
    '',
    null,
    undefined,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    {},
  ])('rejects %p', (value) => {
    expect(isPositiveDecimal(value)).toBe(false);
  });

  it('honours the upper bound and decimals options', () => {
    expect(isPositiveDecimal('99999999.99', { lessThan: 100_000_000 })).toBe(true);
    expect(isPositiveDecimal('100000000', { lessThan: 100_000_000 })).toBe(false);
    expect(isPositiveDecimal('1.2345', { maxDecimals: 4 })).toBe(true);
  });
});

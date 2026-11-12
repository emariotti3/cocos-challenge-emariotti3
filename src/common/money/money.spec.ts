import { Money, percentChange } from './money';

describe('Money', () => {
  it('keeps decimal precision that floats lose', () => {
    expect(Money.of('0.1').plus('0.2').toFixed()).toBe('0.30');
    expect(Money.of('925.85').times(108).toFixed()).toBe('99991.80');
  });

  it('accepts strings, numbers, Money and sums iterables', () => {
    expect(Money.sum(['1.10', 2, Money.of('3.3')]).toFixed()).toBe('6.40');
    expect(Money.sum([]).isZero()).toBe(true);
  });

  it('rejects non-numeric input', () => {
    expect(() => Money.of('abc')).toThrow(TypeError);
    expect(() => Money.of(Number.NaN)).toThrow(TypeError);
  });

  it('floorDiv returns whole units only', () => {
    expect(Money.of('100000').floorDiv('925.85')).toBe(108);
    expect(Money.of('2500').floorDiv('1000')).toBe(2);
    expect(Money.of('900').floorDiv('925.85')).toBe(0);
  });

  it('throws on division by zero', () => {
    expect(() => Money.of(1).dividedBy(0)).toThrow(RangeError);
  });

  it('compares correctly', () => {
    const a = Money.of('10.00');
    expect(a.eq('10')).toBe(true);
    expect(a.gt('9.99')).toBe(true);
    expect(a.gte('10')).toBe(true);
    expect(a.lt('10.01')).toBe(true);
    expect(a.lte('10')).toBe(true);
    expect(a.minus('10.01').isNegative()).toBe(true);
    expect(Money.zero().isNegative()).toBe(false);
    expect(a.isPositive()).toBe(true);
  });

  it('rounds half up when formatting', () => {
    expect(Money.of('1.005').toFixed()).toBe('1.01');
    expect(Money.of('-0.445').toFixed()).toBe('-0.45');
  });

  it('serializes to a 2-decimal string in JSON', () => {
    expect(JSON.stringify({ total: Money.of('753000') })).toBe('{"total":"753000.00"}');
  });
});

describe('percentChange', () => {
  it('computes the seed daily returns', () => {
    expect(percentChange('925.85', '921.80')).toBe('0.44');
    expect(percentChange('229.50', '232.00')).toBe('-1.08');
  });

  it('returns null without a usable base', () => {
    expect(percentChange('10', '0')).toBeNull();
    expect(percentChange('10', null)).toBeNull();
    expect(percentChange('10', undefined)).toBeNull();
  });
});

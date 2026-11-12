import DecimalJs from 'decimal.js';

/** A private clone: this precision/rounding applies to Money only, not to every decimal.js user in the process. */
const Decimal = DecimalJs.clone({ precision: 40, rounding: DecimalJs.ROUND_HALF_UP });
type Decimal = DecimalJs;

export type MoneyInput = Money | Decimal | string | number;

/**
 * Immutable arbitrary-precision amount. Postgres NUMERIC values arrive as
 * strings and stay exact here; formatting to 2 decimals happens only at the
 * API boundary via `toFixed`/`toJSON`. Never route money through JS floats.
 */
export class Money {
  private constructor(private readonly value: Decimal) {}

  static of(input: MoneyInput): Money {
    if (input instanceof Money) return input;
    if (input instanceof Decimal) return new Money(input);
    let decimal: Decimal;
    try {
      decimal = new Decimal(input);
    } catch {
      throw new TypeError(`Invalid money amount: ${String(input)}`);
    }
    if (!decimal.isFinite()) throw new TypeError(`Invalid money amount: ${String(input)}`);
    return new Money(decimal);
  }

  static zero(): Money {
    return new Money(new Decimal(0));
  }

  static sum(values: Iterable<MoneyInput>): Money {
    let total = Money.zero();
    for (const value of values) total = total.plus(value);
    return total;
  }

  plus(other: MoneyInput): Money {
    return new Money(this.value.plus(Money.of(other).value));
  }

  minus(other: MoneyInput): Money {
    return new Money(this.value.minus(Money.of(other).value));
  }

  times(other: MoneyInput): Money {
    return new Money(this.value.times(Money.of(other).value));
  }

  dividedBy(other: MoneyInput): Money {
    const divisor = Money.of(other);
    if (divisor.isZero()) throw new RangeError('Division by zero');
    return new Money(this.value.dividedBy(divisor.value));
  }

  /** Whole units of `other` that fit in this amount (e.g. shares for a budget). */
  floorDiv(other: MoneyInput): number {
    return this.dividedBy(other).value.floor().toNumber();
  }

  negated(): Money {
    return new Money(this.value.negated());
  }

  compare(other: MoneyInput): -1 | 0 | 1 {
    return this.value.comparedTo(Money.of(other).value) as -1 | 0 | 1;
  }

  eq(other: MoneyInput): boolean {
    return this.compare(other) === 0;
  }

  gt(other: MoneyInput): boolean {
    return this.compare(other) > 0;
  }

  gte(other: MoneyInput): boolean {
    return this.compare(other) >= 0;
  }

  lt(other: MoneyInput): boolean {
    return this.compare(other) < 0;
  }

  lte(other: MoneyInput): boolean {
    return this.compare(other) <= 0;
  }

  isZero(): boolean {
    return this.value.isZero();
  }

  isNegative(): boolean {
    return this.value.isNegative() && !this.value.isZero();
  }

  isPositive(): boolean {
    return this.value.greaterThan(0);
  }

  /** Fixed-point string, ROUND_HALF_UP. Default 2 decimals (ARS cents). */
  toFixed(decimals = 2): string {
    return this.value.toFixed(decimals);
  }

  /** Lossy; only for metrics/logging, never for business math. */
  toNumber(): number {
    return this.value.toNumber();
  }

  toJSON(): string {
    return this.toFixed(2);
  }

  toString(): string {
    return this.value.toString();
  }
}

/**
 * `(current - base) / base * 100` as a 2-decimal string, or `null` when the
 * base is zero/absent (no meaningful return can be computed).
 */
export function percentChange(
  current: MoneyInput,
  base: MoneyInput | null | undefined,
): string | null {
  if (base === null || base === undefined) return null;
  const baseMoney = Money.of(base);
  if (baseMoney.isZero()) return null;
  return Money.of(current).minus(baseMoney).dividedBy(baseMoney).times(100).toFixed(2);
}

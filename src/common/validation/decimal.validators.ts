import {
  registerDecorator,
  type ValidationArguments,
  type ValidationOptions,
} from 'class-validator';
import Decimal from 'decimal.js';

export interface DecimalConstraints {
  /** Maximum number of decimal places accepted (default 2 = cents). */
  maxDecimals?: number;
  /** Exclusive upper bound. */
  lessThan?: number;
}

/**
 * Accepts a positive decimal given as a JSON number or a numeric string
 * (strings are preferred to avoid binary float artifacts). Rejects NaN,
 * Infinity, scientific notation, more than `maxDecimals` decimals, and values
 * at or above `lessThan`.
 */
export function isPositiveDecimal(value: unknown, constraints: DecimalConstraints = {}): boolean {
  const { maxDecimals = 2, lessThan } = constraints;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return false;
  } else if (typeof value === 'string') {
    if (!/^\d+(\.\d+)?$/.test(value.trim())) return false;
  } else {
    return false;
  }
  const decimal = new Decimal(typeof value === 'number' ? value : value.trim());
  if (!decimal.isFinite() || decimal.lte(0)) return false;
  if (decimal.decimalPlaces() > maxDecimals) return false;
  if (lessThan !== undefined && decimal.gte(lessThan)) return false;
  return true;
}

export function IsPositiveDecimal(
  constraints: DecimalConstraints = {},
  options?: ValidationOptions,
) {
  return (object: object, propertyName: string): void => {
    registerDecorator({
      name: 'isPositiveDecimal',
      target: object.constructor,
      propertyName,
      options,
      validator: {
        validate: (value: unknown) => isPositiveDecimal(value, constraints),
        defaultMessage: (args: ValidationArguments) =>
          `${args.property} must be a positive number with at most ${constraints.maxDecimals ?? 2} decimals` +
          (constraints.lessThan !== undefined ? ` and lower than ${constraints.lessThan}` : ''),
      },
    });
  };
}

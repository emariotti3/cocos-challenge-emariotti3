import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsPositive,
  Max,
  registerDecorator,
  ValidateIf,
  type ValidationArguments,
} from 'class-validator';
import { OrderSide, OrderType } from '../../../common/domain/enums';
import {
  IsPositiveDecimal,
  isPositiveDecimal,
} from '../../../common/validation/decimal.validators';

export const MAX_ORDER_SIZE = 1_000_000_000;
/** NUMERIC(10,2) upper bound for prices. */
export const MAX_PRICE_EXCLUSIVE = 100_000_000;
/** Budget cap; keeps floor(amount / price) comfortably inside MAX_ORDER_SIZE for any price >= 0.01. */
export const MAX_AMOUNT_EXCLUSIVE = 10_000_000_000;

export type TradeSide = OrderSide.BUY | OrderSide.SELL;

/** `amount` cannot be combined with `size`. */
function NotWithSize() {
  return (object: object, propertyName: string): void => {
    registerDecorator({
      name: 'notWithSize',
      target: object.constructor,
      propertyName,
      validator: {
        validate: (_value: unknown, args: ValidationArguments) =>
          (args.object as PlaceOrderDto).size === undefined,
        defaultMessage: () => 'amount and size are mutually exclusive; send only one',
      },
    });
  };
}

/**
 * `price` is required (and must be a valid price) for LIMIT orders and must be
 * omitted for MARKET orders, which execute at the last close.
 */
function PriceMatchesOrderType() {
  return (object: object, propertyName: string): void => {
    registerDecorator({
      name: 'priceMatchesOrderType',
      target: object.constructor,
      propertyName,
      validator: {
        validate: (value: unknown, args: ValidationArguments) => {
          const { type } = args.object as PlaceOrderDto;
          if (type === OrderType.MARKET) return value === undefined;
          if (type === OrderType.LIMIT) {
            return (
              value !== undefined &&
              isPositiveDecimal(value, { maxDecimals: 2, lessThan: MAX_PRICE_EXCLUSIVE })
            );
          }
          return true; // an invalid type is reported by @IsEnum on `type`
        },
        defaultMessage: (args: ValidationArguments) => {
          const dto = args.object as PlaceOrderDto;
          if (dto.type === OrderType.MARKET)
            return 'price must not be sent for MARKET orders (executed at the last close)';
          if (dto.price === undefined) return 'price is required for LIMIT orders';
          return `price must be a positive number with at most 2 decimals and lower than ${MAX_PRICE_EXCLUSIVE}`;
        },
      },
    });
  };
}

export class PlaceOrderDto {
  @ApiProperty({ example: 47, description: 'Instrument id (see GET /instruments)' })
  @IsPositive()
  @IsInt()
  instrumentId!: number;

  @ApiProperty({ enum: [OrderSide.BUY, OrderSide.SELL], example: OrderSide.BUY })
  @IsIn([OrderSide.BUY, OrderSide.SELL])
  side!: TradeSide;

  @ApiProperty({
    enum: OrderType,
    example: OrderType.MARKET,
    description:
      'MARKET executes immediately at the last close (FILLED). LIMIT is accepted as NEW at the given price.',
  })
  @IsEnum(OrderType)
  type!: OrderType;

  @ApiPropertyOptional({
    example: 10,
    minimum: 1,
    description: 'Exact number of shares. Send either `size` or `amount`, not both.',
  })
  @ValidateIf((dto: PlaceOrderDto) => dto.size !== undefined || dto.amount === undefined)
  @Max(MAX_ORDER_SIZE)
  @IsPositive()
  @IsInt({ message: 'size must be a positive integer number of shares (or send amount instead)' })
  size?: number;

  @ApiPropertyOptional({
    type: String,
    example: '100000.00',
    description:
      'ARS budget. Converted to the maximum whole number of shares at the execution price (close for MARKET, `price` for LIMIT). No fractional shares.',
  })
  @ValidateIf((dto: PlaceOrderDto) => dto.amount !== undefined)
  @IsPositiveDecimal({ maxDecimals: 2, lessThan: MAX_AMOUNT_EXCLUSIVE })
  @NotWithSize()
  amount?: string | number;

  @ApiPropertyOptional({
    type: String,
    example: '900.00',
    description: 'Limit price in ARS. Required for LIMIT, forbidden for MARKET.',
  })
  @ValidateIf((dto: PlaceOrderDto) => dto.price !== undefined || dto.type === OrderType.LIMIT)
  @PriceMatchesOrderType()
  price?: string | number;
}

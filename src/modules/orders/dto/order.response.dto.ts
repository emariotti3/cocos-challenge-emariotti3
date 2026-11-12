import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OrderSide, OrderStatus, OrderType, RejectionReason } from '../../../common/domain/enums';

export class OrderResponseDto {
  @ApiProperty({ example: 12 })
  id!: number;

  @ApiProperty({ example: 1 })
  userId!: number;

  @ApiProperty({ example: 47 })
  instrumentId!: number;

  @ApiProperty({ example: 'PAMP' })
  ticker!: string;

  @ApiProperty({ enum: OrderSide, example: OrderSide.BUY })
  side!: OrderSide;

  @ApiProperty({ enum: OrderType, example: OrderType.MARKET })
  type!: OrderType;

  @ApiProperty({
    enum: OrderStatus,
    example: OrderStatus.FILLED,
    description:
      'MARKET -> FILLED, LIMIT -> NEW, insufficient cash/shares -> REJECTED (persisted), cancelled by user -> CANCELLED',
  })
  status!: OrderStatus;

  @ApiProperty({
    example: 10,
    description: 'Shares (resolved from `amount` when a budget was sent)',
  })
  size!: number;

  @ApiProperty({
    example: '925.85',
    description: 'Execution price (MARKET: last close) or limit price',
  })
  price!: string;

  @ApiProperty({ example: '9258.50', description: 'size * price' })
  notional!: string;

  @ApiPropertyOptional({ enum: RejectionReason, nullable: true, example: null })
  rejectionReason!: RejectionReason | null;

  @ApiProperty({ example: '2023-07-14T15:04:05.000Z' })
  datetime!: string;
}

export class OrderListMetaDto {
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Pass as `cursor` to fetch the next page; null on the last page',
  })
  nextCursor!: string | null;
}

export class OrderListResponseDto {
  @ApiProperty({ type: [OrderResponseDto] })
  data!: OrderResponseDto[];

  @ApiProperty({ type: OrderListMetaDto })
  meta!: OrderListMetaDto;
}

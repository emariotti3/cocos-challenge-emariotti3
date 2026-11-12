import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CURRENCY } from '../../../common/domain/constants';
import { PositionWarningCode } from '../domain/position-calculator';

export class CashSummaryDto {
  @ApiProperty({ example: '753000.00', description: 'Net cash from all FILLED movements' })
  total!: string;

  @ApiProperty({
    example: '125500.00',
    description: 'Cash committed by pending (NEW) LIMIT BUY orders',
  })
  reserved!: string;

  @ApiProperty({ example: '627500.00', description: 'total - reserved: spendable on new orders' })
  available!: string;
}

export class PositionDto {
  @ApiProperty({ example: 47 })
  instrumentId!: number;

  @ApiProperty({ example: 'PAMP' })
  ticker!: string;

  @ApiProperty({ example: 'Pampa Holding S.A.' })
  name!: string;

  @ApiProperty({ example: 40, description: 'Net FILLED quantity' })
  quantity!: number;

  @ApiProperty({ example: 0, description: 'Shares committed by pending (NEW) LIMIT SELL orders' })
  reservedQuantity!: number;

  @ApiProperty({ example: 40, description: 'quantity - reservedQuantity: sellable now' })
  availableQuantity!: number;

  @ApiProperty({ type: String, nullable: true, example: '925.85', description: 'Latest close' })
  lastPrice!: string | null;

  @ApiProperty({
    example: '37034.00',
    description: 'quantity * lastPrice ("0.00" without market data)',
  })
  marketValue!: string;

  @ApiProperty({ example: '930.00', description: 'Weighted average purchase price' })
  averageCost!: string;

  @ApiProperty({ example: '37200.00', description: 'quantity * averageCost' })
  costBasis!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    example: '-166.00',
    description: 'marketValue - costBasis',
  })
  unrealizedPnl!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: '-0.45',
    description: '(marketValue - costBasis) / costBasis * 100',
  })
  totalReturnPct!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: '0.44',
    description: '(close - previousClose) / previousClose * 100',
  })
  dailyReturnPct!: string | null;
}

export class PortfolioWarningDto {
  @ApiProperty({
    example: PositionWarningCode.NEGATIVE_POSITION,
    enum: Object.values(PositionWarningCode),
  })
  code!: string;

  @ApiProperty({ example: 31 })
  instrumentId!: number;

  @ApiPropertyOptional({ example: -10 })
  quantity?: number;

  @ApiProperty({ example: 'FILLED SELL quantity exceeds FILLED BUY quantity; position excluded' })
  detail!: string;
}

export class PortfolioResponseDto {
  @ApiProperty({ example: 1 })
  userId!: number;

  @ApiProperty({ example: '10001' })
  accountNumber!: string;

  @ApiProperty({ example: CURRENCY })
  currency!: typeof CURRENCY;

  @ApiProperty({
    type: String,
    nullable: true,
    example: '2023-07-14',
    description: 'Latest market data date used',
  })
  asOf!: string | null;

  @ApiProperty({ example: '904784.00', description: 'cash.total + sum(position marketValue)' })
  totalValue!: string;

  @ApiProperty({ type: CashSummaryDto })
  cash!: CashSummaryDto;

  @ApiProperty({ type: [PositionDto] })
  positions!: PositionDto[];

  @ApiPropertyOptional({
    type: [PortfolioWarningDto],
    description: 'Data anomalies detected while computing the portfolio (absent when none)',
  })
  warnings?: PortfolioWarningDto[];
}

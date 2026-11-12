import { ApiProperty } from '@nestjs/swagger';
import { InstrumentType } from '../../../common/domain/enums';
import { PageMetaDto } from '../../../common/dto/pagination.dto';

export class InstrumentResponseDto {
  @ApiProperty({ example: 47 })
  id!: number;

  @ApiProperty({ example: 'PAMP' })
  ticker!: string;

  @ApiProperty({ example: 'Pampa Holding S.A.' })
  name!: string;

  @ApiProperty({ enum: InstrumentType, example: InstrumentType.ACCIONES })
  type!: InstrumentType;

  @ApiProperty({
    type: String,
    nullable: true,
    example: '925.85',
    description: 'Last price in ARS (latest close). Null when no market data exists.',
  })
  lastPrice!: string | null;

  @ApiProperty({ type: String, nullable: true, example: '921.80' })
  previousClose!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: '0.44',
    description: 'Daily return in percent: (close - previousClose) / previousClose * 100',
  })
  dailyReturnPct!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: '2023-07-14',
    description: 'Trading day of lastPrice',
  })
  priceDate!: string | null;
}

export class InstrumentListResponseDto {
  @ApiProperty({ type: [InstrumentResponseDto] })
  data!: InstrumentResponseDto[];

  @ApiProperty({ type: PageMetaDto })
  meta!: PageMetaDto;
}

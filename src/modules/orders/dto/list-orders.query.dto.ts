import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsPositive, IsString, Length, Max, Min } from 'class-validator';
import { OrderSide, OrderStatus } from '../../../common/domain/enums';
import {
  DEFAULT_PAGE_SIZE,
  MAX_CURSOR_LENGTH,
  MAX_PAGE_SIZE,
} from '../../../common/domain/constants';
import { PG_INT_MAX } from '../../../common/validation/limits';

export class ListOrdersQueryDto {
  @ApiPropertyOptional({ enum: OrderStatus })
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @ApiPropertyOptional({ enum: OrderSide })
  @IsOptional()
  @IsEnum(OrderSide)
  side?: OrderSide;

  @ApiPropertyOptional({ example: 47 })
  @IsOptional()
  @Type(() => Number)
  @Max(PG_INT_MAX)
  @IsPositive()
  @IsInt()
  instrumentId?: number;

  @ApiPropertyOptional({ default: DEFAULT_PAGE_SIZE, minimum: 1, maximum: MAX_PAGE_SIZE })
  @IsOptional()
  @Type(() => Number)
  @Max(MAX_PAGE_SIZE)
  @Min(1)
  @IsInt()
  limit: number = DEFAULT_PAGE_SIZE;

  @ApiPropertyOptional({ description: 'Opaque cursor from the previous page (`meta.nextCursor`)' })
  @IsOptional()
  @IsString()
  @Length(1, MAX_CURSOR_LENGTH)
  cursor?: string;
}

import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsPositive, IsString, Length, Max, Min } from 'class-validator';
import { OrderSide, OrderStatus } from '../../../common/domain/enums';

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
  @IsPositive()
  @IsInt()
  instrumentId?: number;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @Max(100)
  @Min(1)
  @IsInt()
  limit: number = 20;

  @ApiPropertyOptional({ description: 'Opaque cursor from the previous page (`meta.nextCursor`)' })
  @IsOptional()
  @IsString()
  @Length(1, 200)
  cursor?: string;
}

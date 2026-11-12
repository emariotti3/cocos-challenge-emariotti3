import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';

import { trim } from '../../../common/validation/transforms';

export class SearchInstrumentsQueryDto {
  @ApiPropertyOptional({
    description: 'Free text matched against ticker and name (case-insensitive, partial)',
    example: 'pamp',
    minLength: 1,
    maxLength: 50,
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 50)
  q?: string;

  @ApiPropertyOptional({ description: 'Partial ticker match', example: 'GGAL', maxLength: 10 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 10)
  ticker?: string;

  @ApiPropertyOptional({ description: 'Partial name match', example: 'banco', maxLength: 50 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 50)
  name?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @Min(1)
  @IsInt()
  page: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @Max(100)
  @Min(1)
  @IsInt()
  limit: number = 20;
}

import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';

import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  MAX_SEARCH_TERM_LENGTH,
  MAX_TICKER_LENGTH,
} from '../../../common/domain/constants';
import { trim } from '../../../common/validation/transforms';

export class SearchInstrumentsQueryDto {
  @ApiPropertyOptional({
    description: 'Free text matched against ticker and name (case-insensitive, partial)',
    example: 'pamp',
    minLength: 1,
    maxLength: MAX_SEARCH_TERM_LENGTH,
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, MAX_SEARCH_TERM_LENGTH)
  q?: string;

  @ApiPropertyOptional({
    description: 'Partial ticker match',
    example: 'GGAL',
    maxLength: MAX_TICKER_LENGTH,
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, MAX_TICKER_LENGTH)
  ticker?: string;

  @ApiPropertyOptional({
    description: 'Partial name match',
    example: 'banco',
    maxLength: MAX_SEARCH_TERM_LENGTH,
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, MAX_SEARCH_TERM_LENGTH)
  name?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @Min(1)
  @IsInt()
  page: number = 1;

  @ApiPropertyOptional({ default: DEFAULT_PAGE_SIZE, minimum: 1, maximum: MAX_PAGE_SIZE })
  @IsOptional()
  @Type(() => Number)
  @Max(MAX_PAGE_SIZE)
  @Min(1)
  @IsInt()
  limit: number = DEFAULT_PAGE_SIZE;
}

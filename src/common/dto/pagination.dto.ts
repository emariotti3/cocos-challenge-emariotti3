import { ApiProperty } from '@nestjs/swagger';
import { DEFAULT_PAGE_SIZE } from '../domain/constants';

export class PageMetaDto {
  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: DEFAULT_PAGE_SIZE })
  limit!: number;

  @ApiProperty({ example: 65, description: 'Total matching items across all pages' })
  total!: number;
}

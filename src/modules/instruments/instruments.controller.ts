import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ParsePositiveIntPipe } from '../../common/pipes/parse-positive-int.pipe';
import { InstrumentListResponseDto, InstrumentResponseDto } from './dto/instrument.response.dto';
import { SearchInstrumentsQueryDto } from './dto/search-instruments.query.dto';
import { InstrumentsService } from './instruments.service';

@ApiTags('instruments')
@Controller('instruments')
export class InstrumentsController {
  constructor(private readonly instruments: InstrumentsService) {}

  @Get()
  @ApiOperation({
    summary: 'Search instruments',
    description:
      'Case-insensitive partial match on ticker and/or name with latest price and daily return. Without filters returns the full paginated list. Cash (MONEDA) is never returned.',
  })
  @ApiOkResponse({ type: InstrumentListResponseDto })
  search(@Query() query: SearchInstrumentsQueryDto): Promise<InstrumentListResponseDto> {
    return this.instruments.search(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one instrument with its latest price' })
  @ApiOkResponse({ type: InstrumentResponseDto })
  @ApiNotFoundResponse({ description: 'INSTRUMENT_NOT_FOUND' })
  getById(@Param('id', new ParsePositiveIntPipe('id')) id: number): Promise<InstrumentResponseDto> {
    return this.instruments.getById(id);
  }
}

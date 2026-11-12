import { Injectable } from '@nestjs/common';
import { NotFoundError } from '../../common/errors/app.error';
import { MarketdataService, type PriceSnapshot } from '../marketdata/marketdata.service';
import type {
  InstrumentListResponseDto,
  InstrumentResponseDto,
} from './dto/instrument.response.dto';
import {
  type InstrumentRecord,
  type InstrumentSearch,
  InstrumentsRepository,
} from './instruments.repository';

@Injectable()
export class InstrumentsService {
  constructor(
    private readonly instruments: InstrumentsRepository,
    private readonly marketdata: MarketdataService,
  ) {}

  async search(params: InstrumentSearch): Promise<InstrumentListResponseDto> {
    const { rows, total } = await this.instruments.search(params);
    const prices = await this.marketdata.getLatestPrices(rows.map((row) => row.id));
    return {
      data: rows.map((row) => toResponse(row, prices.get(row.id) ?? null)),
      meta: { page: params.page, limit: params.limit, total },
    };
  }

  async getById(id: number): Promise<InstrumentResponseDto> {
    const instrument = await this.instruments.findById(id);
    if (!instrument) {
      throw new NotFoundError('INSTRUMENT_NOT_FOUND', `Instrument ${id} does not exist`, {
        instrumentId: id,
      });
    }
    const price = await this.marketdata.getLatestPrice(id);
    return toResponse(instrument, price);
  }
}

export function toResponse(
  instrument: InstrumentRecord,
  price: PriceSnapshot | null,
): InstrumentResponseDto {
  return {
    id: instrument.id,
    ticker: instrument.ticker,
    name: instrument.name,
    type: instrument.type,
    lastPrice: price?.close ?? null,
    previousClose: price?.previousClose ?? null,
    dailyReturnPct: price?.dailyReturnPct ?? null,
    priceDate: price?.date ?? null,
  };
}

import { Injectable } from '@nestjs/common';
import type { Transaction } from 'sequelize';
import { percentChange } from '../../common/money/money';
import { type LatestPrice, MarketdataRepository } from './marketdata.repository';

export interface PriceSnapshot extends LatestPrice {
  /** `(close - previousClose) / previousClose * 100`, 2 decimals; null if not computable. */
  dailyReturnPct: string | null;
}

@Injectable()
export class MarketdataService {
  constructor(private readonly repository: MarketdataRepository) {}

  async getLatestPrices(
    instrumentIds: readonly number[],
    transaction?: Transaction,
  ): Promise<Map<number, PriceSnapshot>> {
    const latest = await this.repository.findLatestByInstrumentIds(instrumentIds, transaction);
    return new Map([...latest].map(([id, price]) => [id, toSnapshot(price)]));
  }

  async getLatestPrice(
    instrumentId: number,
    transaction?: Transaction,
  ): Promise<PriceSnapshot | null> {
    const price = await this.repository.findLatestByInstrumentId(instrumentId, transaction);
    return price ? toSnapshot(price) : null;
  }
}

export function toSnapshot(price: LatestPrice): PriceSnapshot {
  return { ...price, dailyReturnPct: percentChange(price.close, price.previousClose) };
}

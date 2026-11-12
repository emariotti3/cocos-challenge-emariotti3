import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/sequelize';
import { QueryTypes, type Sequelize, type Transaction } from 'sequelize';

export interface LatestPrice {
  instrumentId: number;
  /** Last traded price (decimal string). */
  close: string;
  /** Previous session close (decimal string). */
  previousClose: string;
  /** Trading day of `close`, yyyy-mm-dd. */
  date: string;
}

const LATEST_PRICES_SQL = `
  SELECT DISTINCT ON (instrumentid)
         instrumentid    AS "instrumentId",
         close::text     AS "close",
         previousclose::text AS "previousClose",
         date::text      AS "date"
    FROM marketdata
   WHERE instrumentid = ANY($ids::int[])
   ORDER BY instrumentid, date DESC, id DESC`;

@Injectable()
export class MarketdataRepository {
  constructor(@InjectConnection() private readonly sequelize: Sequelize) {}

  /** Latest row per instrument (by trading date). Missing instruments are absent from the map. */
  async findLatestByInstrumentIds(
    instrumentIds: readonly number[],
    transaction?: Transaction,
  ): Promise<Map<number, LatestPrice>> {
    const ids = [...new Set(instrumentIds)];
    if (ids.length === 0) return new Map();
    const rows = await this.sequelize.query<LatestPrice>(LATEST_PRICES_SQL, {
      bind: { ids },
      type: QueryTypes.SELECT,
      transaction,
    });
    return new Map(rows.map((row) => [row.instrumentId, row]));
  }

  async findLatestByInstrumentId(
    instrumentId: number,
    transaction?: Transaction,
  ): Promise<LatestPrice | null> {
    const prices = await this.findLatestByInstrumentIds([instrumentId], transaction);
    return prices.get(instrumentId) ?? null;
  }
}

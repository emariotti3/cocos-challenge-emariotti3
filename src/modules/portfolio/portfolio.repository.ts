import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/sequelize';
import { QueryTypes, type Sequelize, type Transaction } from 'sequelize';
import { Money } from '../../common/money/money';

export interface CashSummary {
  /** Net of all FILLED cash movements (CASH_IN/OUT, BUY/SELL). */
  total: Money;
  /** Cash committed by NEW (pending) LIMIT BUY orders. */
  reserved: Money;
  /** total - reserved: what the user can spend on new orders. */
  available: Money;
}

export interface FilledTradeRow {
  id: number;
  instrumentId: number;
  side: 'BUY' | 'SELL';
  size: number;
  price: string;
  datetime: Date;
}

const CASH_SUMMARY_SQL = `
  SELECT COALESCE(SUM(CASE
           WHEN status = 'FILLED' AND side IN ('CASH_IN', 'SELL') THEN size * price
           WHEN status = 'FILLED' AND side IN ('CASH_OUT', 'BUY') THEN -(size * price)
           ELSE 0 END), 0)::text AS total,
         COALESCE(SUM(CASE
           WHEN status = 'NEW' AND side = 'BUY' THEN size * price
           ELSE 0 END), 0)::text AS reserved
    FROM orders
   WHERE userid = $userId`;

const FILLED_TRADES_SQL = `
  SELECT id, instrumentid AS "instrumentId", side, size, price::text AS price, datetime
    FROM orders
   WHERE userid = $userId AND status = 'FILLED' AND side IN ('BUY', 'SELL')
   ORDER BY datetime ASC, id ASC`;

const RESERVED_SELL_SIZES_SQL = `
  SELECT instrumentid AS "instrumentId", SUM(size)::int AS size
    FROM orders
   WHERE userid = $userId AND status = 'NEW' AND side = 'SELL'
   GROUP BY instrumentid`;

const AVAILABLE_SHARES_SQL = `
  SELECT COALESCE(SUM(CASE
           WHEN status = 'FILLED' AND side = 'BUY' THEN size
           WHEN status = 'FILLED' AND side = 'SELL' THEN -size
           WHEN status = 'NEW' AND side = 'SELL' THEN -size
           ELSE 0 END), 0)::int AS available
    FROM orders
   WHERE userid = $userId AND instrumentid = $instrumentId`;

/**
 * Ledger-style aggregates over the `orders` table. Balances are never stored;
 * they are derived from FILLED movements (and NEW reservations) on demand,
 * as the challenge requires. All queries accept a transaction so the order
 * flow can read them under the per-user lock.
 */
@Injectable()
export class PortfolioRepository {
  constructor(@InjectConnection() private readonly sequelize: Sequelize) {}

  async getCashSummary(userId: number, transaction?: Transaction): Promise<CashSummary> {
    const [row] = await this.sequelize.query<{ total: string; reserved: string }>(
      CASH_SUMMARY_SQL,
      {
        bind: { userId },
        type: QueryTypes.SELECT,
        transaction,
      },
    );
    const total = Money.of(row?.total ?? '0');
    const reserved = Money.of(row?.reserved ?? '0');
    return { total, reserved, available: total.minus(reserved) };
  }

  /** FILLED BUY/SELL trades in execution order (needed for average cost). */
  async getFilledTrades(userId: number, transaction?: Transaction): Promise<FilledTradeRow[]> {
    return this.sequelize.query<FilledTradeRow>(FILLED_TRADES_SQL, {
      bind: { userId },
      type: QueryTypes.SELECT,
      transaction,
    });
  }

  /** Shares committed by NEW (pending) LIMIT SELL orders, per instrument. */
  async getReservedSellSizes(
    userId: number,
    transaction?: Transaction,
  ): Promise<Map<number, number>> {
    const rows = await this.sequelize.query<{ instrumentId: number; size: number }>(
      RESERVED_SELL_SIZES_SQL,
      {
        bind: { userId },
        type: QueryTypes.SELECT,
        transaction,
      },
    );
    return new Map(rows.map((row) => [row.instrumentId, row.size]));
  }

  /** Net FILLED position minus pending SELL reservations for one instrument. */
  async getAvailableShares(
    userId: number,
    instrumentId: number,
    transaction?: Transaction,
  ): Promise<number> {
    const [row] = await this.sequelize.query<{ available: number }>(AVAILABLE_SHARES_SQL, {
      bind: { userId, instrumentId },
      type: QueryTypes.SELECT,
      transaction,
    });
    return row?.available ?? 0;
  }
}

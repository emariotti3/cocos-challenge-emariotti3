import { Injectable, Logger } from '@nestjs/common';
import { InjectConnection } from '@nestjs/sequelize';
import { type Sequelize, Transaction } from 'sequelize';
import { CURRENCY } from '../../common/domain/constants';
import { Money, percentChange } from '../../common/money/money';
import {
  type InstrumentRecord,
  InstrumentsRepository,
} from '../instruments/instruments.repository';
import { MarketdataService, type PriceSnapshot } from '../marketdata/marketdata.service';
import type { UserRecord } from '../users/users.repository';
import {
  type ComputedPosition,
  computePositions,
  type PositionWarning,
  PositionWarningCode,
} from './domain/position-calculator';
import type { PortfolioResponseDto, PositionDto } from './dto/portfolio.response.dto';
import { PortfolioRepository } from './portfolio.repository';

@Injectable()
export class PortfolioService {
  private readonly logger = new Logger(PortfolioService.name);

  constructor(
    @InjectConnection() private readonly sequelize: Sequelize,
    private readonly ledger: PortfolioRepository,
    private readonly instruments: InstrumentsRepository,
    private readonly marketdata: MarketdataService,
  ) {}

  async getPortfolio(user: UserRecord): Promise<PortfolioResponseDto> {
    // One REPEATABLE READ snapshot for the three ledger reads: an order that
    // commits while the portfolio is being assembled is either fully visible
    // (cash and position) or not at all, never half of each.
    const [cash, trades, reservedSells] = await this.sequelize.transaction(
      { isolationLevel: Transaction.ISOLATION_LEVELS.REPEATABLE_READ, readOnly: true },
      (transaction) =>
        Promise.all([
          this.ledger.getCashSummary(user.id, transaction),
          this.ledger.getFilledTrades(user.id, transaction),
          this.ledger.getReservedSellSizes(user.id, transaction),
        ]),
    );

    const { positions, warnings } = computePositions(trades);
    const instrumentIds = positions.map((position) => position.instrumentId);
    const [prices, instruments] = await Promise.all([
      this.marketdata.getLatestPrices(instrumentIds),
      this.instruments.findByIds(instrumentIds),
    ]);

    const positionDtos = positions.map((position) => {
      const valued = valuePosition(
        position,
        instruments.get(position.instrumentId),
        prices.get(position.instrumentId) ?? null,
        reservedSells.get(position.instrumentId) ?? 0,
      );
      if (valued.warning) warnings.push(valued.warning);
      return valued.dto;
    });
    positionDtos.sort((a, b) => a.ticker.localeCompare(b.ticker));

    const positionsValue = Money.sum(positionDtos.map((position) => position.marketValue));
    const asOf = latestDate([...prices.values()]);

    if (warnings.length > 0) {
      this.logger.warn({ userId: user.id, warnings }, 'Portfolio computed with data anomalies');
    }

    return {
      userId: user.id,
      accountNumber: user.accountNumber,
      currency: CURRENCY,
      asOf,
      totalValue: cash.total.plus(positionsValue).toFixed(),
      cash: {
        total: cash.total.toFixed(),
        reserved: cash.reserved.toFixed(),
        available: cash.available.toFixed(),
      },
      positions: positionDtos,
      ...(warnings.length > 0 ? { warnings } : {}),
    };
  }
}

export interface ValuedPosition {
  dto: PositionDto;
  warning?: PositionWarning;
}

/** Pure: prices one position; a missing price is reported back, not pushed into shared state. */
export function valuePosition(
  position: ComputedPosition,
  instrument: InstrumentRecord | undefined,
  price: PriceSnapshot | null,
  reservedQuantity: number,
): ValuedPosition {
  const marketValue = price ? Money.of(price.close).times(position.quantity) : Money.zero();
  const warning: PositionWarning | undefined = price
    ? undefined
    : {
        code: PositionWarningCode.NO_MARKET_PRICE,
        instrumentId: position.instrumentId,
        quantity: position.quantity,
        detail: 'No market data for this instrument; market value reported as 0.00',
      };
  const dto: PositionDto = {
    instrumentId: position.instrumentId,
    ticker: instrument?.ticker ?? 'UNKNOWN',
    name: instrument?.name ?? 'Unknown instrument',
    quantity: position.quantity,
    reservedQuantity,
    availableQuantity: position.quantity - reservedQuantity,
    lastPrice: price?.close ?? null,
    marketValue: marketValue.toFixed(),
    averageCost: position.averageCost.toFixed(),
    costBasis: position.costBasis.toFixed(),
    unrealizedPnl: price ? marketValue.minus(position.costBasis).toFixed() : null,
    totalReturnPct: price ? percentChange(marketValue, position.costBasis) : null,
    dailyReturnPct: price?.dailyReturnPct ?? null,
  };
  return warning ? { dto, warning } : { dto };
}

function latestDate(prices: readonly PriceSnapshot[]): string | null {
  return prices.reduce<string | null>(
    (max, price) => (max === null || price.date > max ? price.date : max),
    null,
  );
}

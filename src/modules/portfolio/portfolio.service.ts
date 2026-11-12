import { Injectable, Logger } from '@nestjs/common';
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
} from './domain/position-calculator';
import type { PortfolioResponseDto, PositionDto } from './dto/portfolio.response.dto';
import { PortfolioRepository } from './portfolio.repository';

@Injectable()
export class PortfolioService {
  private readonly logger = new Logger(PortfolioService.name);

  constructor(
    private readonly ledger: PortfolioRepository,
    private readonly instruments: InstrumentsRepository,
    private readonly marketdata: MarketdataService,
  ) {}

  async getPortfolio(user: UserRecord): Promise<PortfolioResponseDto> {
    const [cash, trades, reservedSells] = await Promise.all([
      this.ledger.getCashSummary(user.id),
      this.ledger.getFilledTrades(user.id),
      this.ledger.getReservedSellSizes(user.id),
    ]);

    const { positions, warnings } = computePositions(trades);
    const instrumentIds = positions.map((position) => position.instrumentId);
    const [prices, instruments] = await Promise.all([
      this.marketdata.getLatestPrices(instrumentIds),
      this.instruments.findByIds(instrumentIds),
    ]);

    const positionDtos = positions.map((position) =>
      valuePosition(
        position,
        instruments.get(position.instrumentId),
        prices.get(position.instrumentId) ?? null,
        reservedSells.get(position.instrumentId) ?? 0,
        warnings,
      ),
    );
    positionDtos.sort((a, b) => a.ticker.localeCompare(b.ticker));

    const positionsValue = Money.sum(positionDtos.map((position) => position.marketValue));
    const asOf = latestDate([...prices.values()]);

    if (warnings.length > 0) {
      this.logger.warn({ userId: user.id, warnings }, 'Portfolio computed with data anomalies');
    }

    return {
      userId: user.id,
      accountNumber: user.accountNumber,
      currency: 'ARS',
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

export function valuePosition(
  position: ComputedPosition,
  instrument: InstrumentRecord | undefined,
  price: PriceSnapshot | null,
  reservedQuantity: number,
  warnings: PositionWarning[],
): PositionDto {
  const marketValue = price ? Money.of(price.close).times(position.quantity) : Money.zero();
  if (!price) {
    warnings.push({
      code: 'NO_MARKET_PRICE',
      instrumentId: position.instrumentId,
      quantity: position.quantity,
      detail: 'No market data for this instrument; market value reported as 0.00',
    });
  }
  return {
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
}

function latestDate(prices: readonly PriceSnapshot[]): string | null {
  return prices.reduce<string | null>(
    (max, price) => (max === null || price.date > max ? price.date : max),
    null,
  );
}

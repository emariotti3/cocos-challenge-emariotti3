import { Money } from '../../../common/money/money';

export interface TradeInput {
  instrumentId: number;
  side: 'BUY' | 'SELL';
  size: number;
  price: string;
}

export interface ComputedPosition {
  instrumentId: number;
  /** Net FILLED quantity (always > 0 for returned positions). */
  quantity: number;
  /** Remaining cost of the open quantity (weighted average method). */
  costBasis: Money;
  /** costBasis / quantity. */
  averageCost: Money;
}

/** Data anomalies surfaced in `portfolio.warnings[]` instead of failing the request. */
export const PositionWarningCode = {
  NEGATIVE_POSITION: 'NEGATIVE_POSITION',
  OVERSOLD_POSITION: 'OVERSOLD_POSITION',
  NO_MARKET_PRICE: 'NO_MARKET_PRICE',
} as const;
export type PositionWarningCode = (typeof PositionWarningCode)[keyof typeof PositionWarningCode];

export interface PositionWarning {
  code: PositionWarningCode;
  instrumentId: number;
  quantity?: number;
  detail: string;
}

export interface PositionsResult {
  positions: ComputedPosition[];
  warnings: PositionWarning[];
}

interface Running {
  quantity: number;
  costBasis: Money;
  oversold: boolean;
}

/**
 * Pure replay of FILLED trades (in execution order) into open positions.
 *
 * Cost method: weighted average. A BUY adds `size * price` to the cost basis;
 * a SELL removes the sold share of the basis at the current average, so the
 * average cost of what remains is unchanged (realized P&L is not tracked here).
 *
 * Defensive handling for inconsistent data (the seed sells 30 BMA after buying
 * 20): a SELL larger than the open quantity drives the quantity negative, the
 * basis resets to zero and a warning is emitted; non-positive positions are
 * never returned as holdings.
 */
export function computePositions(trades: readonly TradeInput[]): PositionsResult {
  const running = new Map<number, Running>();

  for (const trade of trades) {
    const state = running.get(trade.instrumentId) ?? {
      quantity: 0,
      costBasis: Money.zero(),
      oversold: false,
    };
    if (trade.side === 'BUY') {
      state.quantity += trade.size;
      state.costBasis = state.costBasis.plus(Money.of(trade.price).times(trade.size));
    } else {
      const sellable = Math.max(Math.min(trade.size, state.quantity), 0);
      if (sellable < trade.size) state.oversold = true;
      if (sellable > 0 && state.quantity > 0) {
        // Remove the sold fraction of the basis; the average cost stays constant.
        const remainingFraction = Money.of(state.quantity - sellable).dividedBy(state.quantity);
        state.costBasis = state.costBasis.times(remainingFraction);
      }
      state.quantity -= trade.size;
      if (state.quantity <= 0) state.costBasis = Money.zero();
    }
    running.set(trade.instrumentId, state);
  }

  const positions: ComputedPosition[] = [];
  const warnings: PositionWarning[] = [];

  for (const [instrumentId, state] of running) {
    if (state.quantity > 0) {
      positions.push({
        instrumentId,
        quantity: state.quantity,
        costBasis: state.costBasis,
        averageCost: state.costBasis.dividedBy(state.quantity),
      });
      if (state.oversold) {
        warnings.push({
          code: PositionWarningCode.OVERSOLD_POSITION,
          instrumentId,
          quantity: state.quantity,
          detail: 'A FILLED SELL exceeded the open quantity at the time; cost basis was reset',
        });
      }
    } else if (state.quantity < 0) {
      warnings.push({
        code: PositionWarningCode.NEGATIVE_POSITION,
        instrumentId,
        quantity: state.quantity,
        detail: 'FILLED SELL quantity exceeds FILLED BUY quantity; position excluded',
      });
    }
  }

  positions.sort((a, b) => a.instrumentId - b.instrumentId);
  return { positions, warnings };
}

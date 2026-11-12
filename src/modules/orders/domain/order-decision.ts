import { OrderSide, OrderStatus, OrderType, RejectionReason } from '../../../common/domain/enums';
import type { Money } from '../../../common/money/money';

export interface OrderDecisionInput {
  side: OrderSide.BUY | OrderSide.SELL;
  type: OrderType;
  size: number;
  /** size * execution price. */
  notional: Money;
  /** Cash available to the user (total minus pending BUY reservations). */
  availableCash: Money;
  /** Shares of the instrument available (net FILLED minus pending SELL reservations). */
  availableShares: number;
}

export type OrderDecision =
  | { status: OrderStatus.FILLED | OrderStatus.NEW; rejectionReason: null }
  | { status: OrderStatus.REJECTED; rejectionReason: RejectionReason };

/**
 * Market acceptance rule. Pure so it can be unit-tested exhaustively:
 * - BUY needs `notional <= availableCash`, SELL needs `size <= availableShares`;
 *   otherwise the order is REJECTED (and still persisted by the caller).
 * - Accepted MARKET orders execute immediately (FILLED); LIMIT orders rest as NEW.
 */
export function decideOrder(input: OrderDecisionInput): OrderDecision {
  if (input.side === OrderSide.BUY && input.notional.gt(input.availableCash)) {
    return { status: OrderStatus.REJECTED, rejectionReason: RejectionReason.INSUFFICIENT_FUNDS };
  }
  if (input.side === OrderSide.SELL && input.size > input.availableShares) {
    return { status: OrderStatus.REJECTED, rejectionReason: RejectionReason.INSUFFICIENT_SHARES };
  }
  return {
    status: input.type === OrderType.MARKET ? OrderStatus.FILLED : OrderStatus.NEW,
    rejectionReason: null,
  };
}

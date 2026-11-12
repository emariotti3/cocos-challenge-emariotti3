import { OrderSide, OrderStatus, RejectionReason } from '../../../common/domain/enums';
import type { Money } from '../../../common/money/money';

export type CashSide = OrderSide.CASH_IN | OrderSide.CASH_OUT;

export interface CashDecisionInput {
  side: CashSide;
  amount: Money;
  /** Cash available to the user (total minus pending BUY reservations). */
  availableCash: Money;
}

export type CashDecision =
  | { status: OrderStatus.FILLED; rejectionReason: null }
  | { status: OrderStatus.REJECTED; rejectionReason: RejectionReason };

/**
 * Acceptance rule for cash movements. Deposits always settle. Withdrawals
 * are checked against *available* cash (not total): money reserved by
 * resting LIMIT buys is already committed and cannot leave the account.
 * Like market rejections, a refused withdrawal is persisted as REJECTED.
 */
export function decideCashMovement(input: CashDecisionInput): CashDecision {
  if (input.side === OrderSide.CASH_OUT && input.amount.gt(input.availableCash)) {
    return { status: OrderStatus.REJECTED, rejectionReason: RejectionReason.INSUFFICIENT_FUNDS };
  }
  return { status: OrderStatus.FILLED, rejectionReason: null };
}

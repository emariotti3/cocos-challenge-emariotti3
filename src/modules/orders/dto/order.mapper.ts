import { Money } from '../../../common/money/money';
import type { OrderRecord } from '../orders.repository';
import type { OrderResponseDto } from './order.response.dto';

/** Wire representation of a ledger row: money as 2-decimal strings, UTC ISO datetime. */
export function toOrderResponse(order: OrderRecord): OrderResponseDto {
  return {
    id: order.id,
    userId: order.userId,
    instrumentId: order.instrumentId,
    ticker: order.ticker,
    side: order.side,
    type: order.type,
    status: order.status,
    size: order.size,
    price: Money.of(order.price).toFixed(),
    notional: Money.of(order.price).times(order.size).toFixed(),
    rejectionReason: order.rejectionReason,
    datetime: order.datetime.toISOString(),
  };
}

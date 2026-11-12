import { OrderSide, OrderStatus, OrderType, RejectionReason } from '../../../common/domain/enums';
import { Money } from '../../../common/money/money';
import { decideOrder } from './order-decision';

describe('decideOrder', () => {
  const base = { availableCash: Money.of('627500'), availableShares: 40 };

  it('fills a MARKET BUY that fits the available cash', () => {
    expect(
      decideOrder({
        ...base,
        side: OrderSide.BUY,
        type: OrderType.MARKET,
        size: 100,
        notional: Money.of('92585'),
      }),
    ).toEqual({ status: OrderStatus.FILLED, rejectionReason: null });
  });

  it('accepts a LIMIT BUY as NEW', () => {
    expect(
      decideOrder({
        ...base,
        side: OrderSide.BUY,
        type: OrderType.LIMIT,
        size: 10,
        notional: Money.of('9000'),
      }),
    ).toEqual({ status: OrderStatus.NEW, rejectionReason: null });
  });

  it('allows spending exactly the available cash', () => {
    expect(
      decideOrder({
        ...base,
        side: OrderSide.BUY,
        type: OrderType.MARKET,
        size: 1,
        notional: Money.of('627500.00'),
      }).status,
    ).toBe(OrderStatus.FILLED);
  });

  it('rejects a BUY above the available cash even if total cash would cover it', () => {
    expect(
      decideOrder({
        ...base,
        side: OrderSide.BUY,
        type: OrderType.MARKET,
        size: 700,
        notional: Money.of('648095'),
      }),
    ).toEqual({
      status: OrderStatus.REJECTED,
      rejectionReason: RejectionReason.INSUFFICIENT_FUNDS,
    });
  });

  it('fills a SELL within the available shares and rejects above', () => {
    const sell = (size: number) =>
      decideOrder({
        ...base,
        side: OrderSide.SELL,
        type: OrderType.MARKET,
        size,
        notional: Money.of('1'),
      });
    expect(sell(40).status).toBe(OrderStatus.FILLED);
    expect(sell(41)).toEqual({
      status: OrderStatus.REJECTED,
      rejectionReason: RejectionReason.INSUFFICIENT_SHARES,
    });
  });

  it('rejects a SELL on a negative (inconsistent) position', () => {
    expect(
      decideOrder({
        ...base,
        availableShares: -10,
        side: OrderSide.SELL,
        type: OrderType.LIMIT,
        size: 1,
        notional: Money.of('1'),
      }).rejectionReason,
    ).toBe(RejectionReason.INSUFFICIENT_SHARES);
  });
});

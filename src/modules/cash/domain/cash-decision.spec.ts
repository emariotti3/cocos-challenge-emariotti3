import { OrderSide, OrderStatus, RejectionReason } from '../../../common/domain/enums';
import { Money } from '../../../common/money/money';
import { decideCashMovement } from './cash-decision';

describe('decideCashMovement', () => {
  const available = Money.of('627500');

  it('always fills a deposit, even with zero or negative available cash', () => {
    expect(
      decideCashMovement({
        side: OrderSide.CASH_IN,
        amount: Money.of('1000000'),
        availableCash: Money.of('-5'),
      }),
    ).toEqual({ status: OrderStatus.FILLED, rejectionReason: null });
  });

  it('fills a withdrawal up to and including the available cash', () => {
    expect(
      decideCashMovement({ side: OrderSide.CASH_OUT, amount: available, availableCash: available }),
    ).toEqual({ status: OrderStatus.FILLED, rejectionReason: null });
  });

  it('rejects a withdrawal above the available cash with INSUFFICIENT_FUNDS', () => {
    expect(
      decideCashMovement({
        side: OrderSide.CASH_OUT,
        amount: available.plus(Money.of('0.01')),
        availableCash: available,
      }),
    ).toEqual({
      status: OrderStatus.REJECTED,
      rejectionReason: RejectionReason.INSUFFICIENT_FUNDS,
    });
  });
});

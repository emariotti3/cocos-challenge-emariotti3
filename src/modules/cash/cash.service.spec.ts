import type { Transaction } from 'sequelize';
import {
  InstrumentType,
  OrderSide,
  OrderStatus,
  OrderType,
  RejectionReason,
} from '../../common/domain/enums';
import { Money } from '../../common/money/money';
import type { MetricsService } from '../../observability/metrics/metrics.service';
import type { InstrumentsRepository } from '../instruments/instruments.repository';
import type { NewOrder, OrderRecord, OrdersRepository } from '../orders/orders.repository';
import type { PortfolioRepository } from '../portfolio/portfolio.repository';
import type { UsersRepository } from '../users/users.repository';
import { CashService } from './cash.service';

describe('CashService', () => {
  const transaction = { id: 'tx' } as unknown as Transaction;
  const orders = { create: jest.fn() } as unknown as jest.Mocked<OrdersRepository>;
  const users = {
    withLock: jest.fn((_userId: number, work: (t: Transaction) => Promise<unknown>) =>
      work(transaction),
    ),
  } as unknown as jest.Mocked<UsersRepository>;
  const instruments = { findByTicker: jest.fn() } as unknown as jest.Mocked<InstrumentsRepository>;
  const ledger = { getCashSummary: jest.fn() } as unknown as jest.Mocked<PortfolioRepository>;
  const metrics = { recordOrder: jest.fn() } as unknown as jest.Mocked<MetricsService>;
  const user = { id: 1, email: 'emiliano@test.com', accountNumber: '10001' };
  const ars = { id: 66, ticker: 'ARS', name: 'PESOS', type: InstrumentType.MONEDA };

  let service: CashService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new CashService(orders, users, instruments, ledger, metrics);
    instruments.findByTicker.mockResolvedValue(ars);
    const total = Money.of('753000');
    const reserved = Money.of('125500');
    ledger.getCashSummary.mockResolvedValue({ total, reserved, available: total.minus(reserved) });
    orders.create.mockImplementation((input: NewOrder) =>
      Promise.resolve({
        id: 12,
        userId: input.userId,
        instrumentId: input.instrumentId,
        ticker: input.ticker,
        side: input.side,
        type: input.type,
        status: input.status,
        size: input.size,
        price: input.price,
        datetime: new Date('2023-07-14T12:00:00.000Z'),
        rejectionReason: input.rejectionReason,
      } satisfies OrderRecord),
    );
  });

  it('records a deposit as a FILLED CASH_IN order on ARS at price 1, under the user lock', async () => {
    const result = await service.deposit(user, { amount: 100000 });

    expect(users.withLock).toHaveBeenCalledWith(1, expect.any(Function));
    expect(ledger.getCashSummary).toHaveBeenCalledWith(1, transaction);
    expect(orders.create).toHaveBeenCalledWith(
      {
        userId: 1,
        instrumentId: 66,
        ticker: 'ARS',
        side: OrderSide.CASH_IN,
        type: OrderType.MARKET,
        status: OrderStatus.FILLED,
        size: 100000,
        price: '1.00',
        rejectionReason: null,
      },
      transaction,
    );
    expect(result).toMatchObject({ side: 'CASH_IN', status: 'FILLED', notional: '100000.00' });
    expect(metrics.recordOrder).toHaveBeenCalledWith(expect.objectContaining({ side: 'CASH_IN' }));
  });

  it('fills a withdrawal within the available cash', async () => {
    const result = await service.withdraw(user, { amount: 627500 });
    expect(result).toMatchObject({ side: 'CASH_OUT', status: 'FILLED', notional: '627500.00' });
  });

  it('persists a REJECTED withdrawal when the amount exceeds the available (not total) cash', async () => {
    const result = await service.withdraw(user, { amount: 627501 });
    expect(orders.create).toHaveBeenCalledWith(
      expect.objectContaining({
        side: OrderSide.CASH_OUT,
        status: OrderStatus.REJECTED,
        rejectionReason: RejectionReason.INSUFFICIENT_FUNDS,
      }),
      transaction,
    );
    expect(result.status).toBe('REJECTED');
  });

  it('resolves the ARS instrument once and reuses it', async () => {
    await service.deposit(user, { amount: 1 });
    await service.withdraw(user, { amount: 1 });
    expect(instruments.findByTicker).toHaveBeenCalledTimes(1);
  });

  it('fails loudly (and retries the lookup next time) if the cash instrument is missing', async () => {
    instruments.findByTicker.mockResolvedValueOnce(null);
    await expect(service.deposit(user, { amount: 1 })).rejects.toThrow(/ARS is missing/);
    expect(users.withLock).not.toHaveBeenCalled();
    await expect(service.deposit(user, { amount: 1 })).resolves.toMatchObject({ status: 'FILLED' });
  });
});

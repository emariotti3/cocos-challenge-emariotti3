import type { Sequelize, Transaction } from 'sequelize';
import {
  InstrumentType,
  OrderSide,
  OrderStatus,
  OrderType,
  RejectionReason,
} from '../../common/domain/enums';
import { Money } from '../../common/money/money';
import { encodeCursor } from '../../common/pagination/cursor';
import type { InstrumentsRepository } from '../instruments/instruments.repository';
import type { MarketdataService } from '../marketdata/marketdata.service';
import type { PortfolioRepository } from '../portfolio/portfolio.repository';
import type { UsersRepository } from '../users/users.repository';
import type { PlaceOrderDto } from './dto/place-order.dto';
import type { NewOrder, OrderRecord, OrdersRepository } from './orders.repository';
import { OrdersService } from './orders.service';

describe('OrdersService', () => {
  const transaction = { id: 'tx' } as unknown as Transaction;
  const sequelize = {
    transaction: jest.fn((callback: (t: Transaction) => Promise<unknown>) => callback(transaction)),
  } as unknown as jest.Mocked<Sequelize>;
  const orders = {
    create: jest.fn(),
    findByIdForUser: jest.fn(),
    transitionStatus: jest.fn(),
    listByUser: jest.fn(),
  } as unknown as jest.Mocked<OrdersRepository>;
  const users = {
    lockForUpdate: jest.fn().mockResolvedValue(true),
  } as unknown as jest.Mocked<UsersRepository>;
  const instruments = { findById: jest.fn() } as unknown as jest.Mocked<InstrumentsRepository>;
  const marketdata = { getLatestPrice: jest.fn() } as unknown as jest.Mocked<MarketdataService>;
  const ledger = {
    getCashSummary: jest.fn(),
    getAvailableShares: jest.fn(),
  } as unknown as jest.Mocked<PortfolioRepository>;

  const service = new OrdersService(
    sequelize,
    orders,
    users,
    instruments,
    marketdata,
    ledger,
  );
  const user = { id: 1, email: 'emiliano@test.com', accountNumber: '10001' };
  const pamp = {
    id: 47,
    ticker: 'PAMP',
    name: 'Pampa Holding S.A.',
    type: InstrumentType.ACCIONES,
  };
  const ars = { id: 66, ticker: 'ARS', name: 'PESOS', type: InstrumentType.MONEDA };

  const record = (overrides: Partial<OrderRecord> = {}): OrderRecord => ({
    id: 12,
    userId: 1,
    instrumentId: 47,
    ticker: 'PAMP',
    side: OrderSide.BUY,
    type: OrderType.MARKET,
    status: OrderStatus.FILLED,
    size: 10,
    price: '925.85',
    datetime: new Date('2023-07-14T12:00:00.000Z'),
    rejectionReason: null,
    ...overrides,
  });

  beforeEach(() => {
    instruments.findById.mockResolvedValue(pamp);
    marketdata.getLatestPrice.mockResolvedValue({
      instrumentId: 47,
      close: '925.85',
      previousClose: '921.80',
      date: '2023-07-14',
      dailyReturnPct: '0.44',
    });
    const total = Money.of('753000');
    const reserved = Money.of('125500');
    ledger.getCashSummary.mockResolvedValue({ total, reserved, available: total.minus(reserved) });
    ledger.getAvailableShares.mockResolvedValue(40);
    orders.create.mockImplementation((input: NewOrder) =>
      Promise.resolve(
        record({
          side: input.side,
          type: input.type,
          status: input.status,
          size: input.size,
          price: input.price,
          rejectionReason: input.rejectionReason,
        }),
      ),
    );
  });

  const place = (dto: Partial<PlaceOrderDto>) =>
    service.placeOrder(user, {
      instrumentId: 47,
      side: OrderSide.BUY,
      type: OrderType.MARKET,
      size: 10,
      ...dto,
    });

  describe('placeOrder', () => {
    it('fills a MARKET BUY at the last close inside a locked transaction', async () => {
      const result = await place({ size: 10 });

      expect(users.lockForUpdate).toHaveBeenCalledWith(1, transaction);
      expect(ledger.getCashSummary).toHaveBeenCalledWith(1, transaction);
      expect(orders.create).toHaveBeenCalledWith(
        expect.objectContaining({
          status: OrderStatus.FILLED,
          size: 10,
          price: '925.85',
          rejectionReason: null,
        }),
        transaction,
      );
      expect(result).toMatchObject({
        status: 'FILLED',
        price: '925.85',
        notional: '9258.50',
        datetime: '2023-07-14T12:00:00.000Z',
      });
    });

    it('converts an amount into whole shares (floor)', async () => {
      await place({ size: undefined, amount: '100000' });
      expect(orders.create).toHaveBeenCalledWith(
        expect.objectContaining({ size: 108 }),
        transaction,
      );
    });

    it('uses the limit price for sizing and stores a LIMIT order as NEW', async () => {
      await place({ type: OrderType.LIMIT, price: '1000', size: undefined, amount: 2500 });
      expect(marketdata.getLatestPrice).not.toHaveBeenCalled();
      expect(orders.create).toHaveBeenCalledWith(
        expect.objectContaining({ status: OrderStatus.NEW, size: 2, price: '1000.00' }),
        transaction,
      );
    });

    it('persists a REJECTED order when the budget exceeds available cash', async () => {
      const result = await place({ size: 700 });
      expect(orders.create).toHaveBeenCalledWith(
        expect.objectContaining({
          status: OrderStatus.REJECTED,
          rejectionReason: RejectionReason.INSUFFICIENT_FUNDS,
        }),
        transaction,
      );
      expect(result.status).toBe('REJECTED');
    });

    it('persists a REJECTED SELL when shares are insufficient', async () => {
      await place({ side: OrderSide.SELL, size: 41 });
      expect(ledger.getAvailableShares).toHaveBeenCalledWith(1, 47, transaction);
      expect(orders.create).toHaveBeenCalledWith(
        expect.objectContaining({
          status: OrderStatus.REJECTED,
          rejectionReason: RejectionReason.INSUFFICIENT_SHARES,
        }),
        transaction,
      );
    });

    it('does not query share availability for BUY orders', async () => {
      await place({ side: OrderSide.BUY, size: 1 });
      expect(ledger.getAvailableShares).not.toHaveBeenCalled();
    });

    it('rejects unknown instruments with 404 before touching the ledger', async () => {
      instruments.findById.mockResolvedValue(null);
      await expect(place({ instrumentId: 999 })).rejects.toMatchObject({
        code: 'INSTRUMENT_NOT_FOUND',
        status: 404,
      });
      expect(sequelize.transaction).not.toHaveBeenCalled();
    });

    it('rejects the cash instrument with 422 NOT_TRADABLE', async () => {
      instruments.findById.mockResolvedValue(ars);
      await expect(place({ instrumentId: 66 })).rejects.toMatchObject({
        code: 'NOT_TRADABLE',
        status: 422,
      });
    });

    it('rejects MARKET orders without market data with 422 NO_MARKET_PRICE', async () => {
      marketdata.getLatestPrice.mockResolvedValue(null);
      await expect(place({})).rejects.toMatchObject({ code: 'NO_MARKET_PRICE', status: 422 });
      expect(orders.create).not.toHaveBeenCalled();
    });

    it('rejects a budget below one share with 422 AMOUNT_TOO_SMALL', async () => {
      await expect(place({ size: undefined, amount: '900' })).rejects.toMatchObject({
        code: 'AMOUNT_TOO_SMALL',
        status: 422,
      });
      expect(orders.create).not.toHaveBeenCalled();
    });
  });

  describe('cancelOrder', () => {
    it('cancels a NEW order', async () => {
      orders.transitionStatus.mockResolvedValue(1);
      orders.findByIdForUser.mockResolvedValue(
        record({ id: 5, status: OrderStatus.CANCELLED, type: OrderType.LIMIT }),
      );
      await expect(service.cancelOrder(user, 5)).resolves.toMatchObject({
        id: 5,
        status: 'CANCELLED',
      });
      expect(orders.transitionStatus).toHaveBeenCalledWith(
        1,
        5,
        OrderStatus.NEW,
        OrderStatus.CANCELLED,
        transaction,
      );
    });

    it('returns 409 when the order is not NEW', async () => {
      orders.transitionStatus.mockResolvedValue(0);
      orders.findByIdForUser.mockResolvedValue(record({ id: 2, status: OrderStatus.FILLED }));
      await expect(service.cancelOrder(user, 2)).rejects.toMatchObject({
        code: 'ORDER_NOT_CANCELLABLE',
        status: 409,
        details: { orderId: 2, orderStatus: 'FILLED' },
      });
    });

    it('returns 404 when the order does not belong to the user', async () => {
      orders.transitionStatus.mockResolvedValue(0);
      orders.findByIdForUser.mockResolvedValue(null);
      await expect(service.cancelOrder(user, 999)).rejects.toMatchObject({
        code: 'ORDER_NOT_FOUND',
        status: 404,
      });
    });
  });

  describe('listOrders', () => {
    it('pages with a keyset cursor', async () => {
      const rows = [record({ id: 3 }), record({ id: 2 }), record({ id: 1 })];
      orders.listByUser.mockResolvedValue(rows);
      const page = await service.listOrders(user, { limit: 2 });
      expect(page.data.map((o) => o.id)).toEqual([3, 2]);
      expect(page.meta.nextCursor).toBe(
        encodeCursor({ datetime: '2023-07-14T12:00:00.000Z', id: 2 }),
      );

      orders.listByUser.mockResolvedValue([record({ id: 1 })]);
      const last = await service.listOrders(user, {
        limit: 2,
        cursor: page.meta.nextCursor ?? undefined,
      });
      expect(orders.listByUser).toHaveBeenLastCalledWith(
        1,
        { status: undefined, side: undefined, instrumentId: undefined },
        2,
        {
          datetime: '2023-07-14T12:00:00.000Z',
          id: 2,
        },
      );
      expect(last.meta.nextCursor).toBeNull();
    });
  });
});

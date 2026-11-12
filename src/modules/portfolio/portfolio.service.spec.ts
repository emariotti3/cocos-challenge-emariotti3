import type { Sequelize, Transaction } from 'sequelize';
import { InstrumentType } from '../../common/domain/enums';
import { Money } from '../../common/money/money';
import type { InstrumentsRepository } from '../instruments/instruments.repository';
import type { MarketdataService } from '../marketdata/marketdata.service';
import type { PortfolioRepository } from './portfolio.repository';
import { PortfolioService } from './portfolio.service';

describe('PortfolioService', () => {
  const ledger = {
    getCashSummary: jest.fn(),
    getFilledTrades: jest.fn(),
    getReservedSellSizes: jest.fn(),
  } as unknown as jest.Mocked<PortfolioRepository>;
  const instruments = { findByIds: jest.fn() } as unknown as jest.Mocked<InstrumentsRepository>;
  const marketdata = { getLatestPrices: jest.fn() } as unknown as jest.Mocked<MarketdataService>;
  const transaction = { id: 'snapshot' } as unknown as Transaction;
  const sequelize = {
    transaction: jest.fn((_options: unknown, callback: (t: Transaction) => Promise<unknown>) =>
      callback(transaction),
    ),
  } as unknown as jest.Mocked<Sequelize>;
  const service = new PortfolioService(sequelize, ledger, instruments, marketdata);
  const user = { id: 1, email: 'emiliano@test.com', accountNumber: '10001' };

  const seedLedger = () => {
    const total = Money.of('753000');
    const reserved = Money.of('125500');
    ledger.getCashSummary.mockResolvedValue({ total, reserved, available: total.minus(reserved) });
    ledger.getFilledTrades.mockResolvedValue([
      { id: 2, instrumentId: 47, side: 'BUY', size: 50, price: '930.00', datetime: new Date() },
      { id: 4, instrumentId: 47, side: 'SELL', size: 10, price: '940.00', datetime: new Date() },
      { id: 9, instrumentId: 31, side: 'BUY', size: 20, price: '1540.00', datetime: new Date() },
      { id: 10, instrumentId: 54, side: 'BUY', size: 500, price: '250.00', datetime: new Date() },
      { id: 11, instrumentId: 31, side: 'SELL', size: 30, price: '1530.00', datetime: new Date() },
    ]);
    ledger.getReservedSellSizes.mockResolvedValue(new Map());
    instruments.findByIds.mockResolvedValue(
      new Map([
        [47, { id: 47, ticker: 'PAMP', name: 'Pampa Holding S.A.', type: InstrumentType.ACCIONES }],
        [54, { id: 54, ticker: 'METR', name: 'MetroGAS S.A.', type: InstrumentType.ACCIONES }],
      ]),
    );
    marketdata.getLatestPrices.mockResolvedValue(
      new Map([
        [
          47,
          {
            instrumentId: 47,
            close: '925.85',
            previousClose: '921.80',
            date: '2023-07-14',
            dailyReturnPct: '0.44',
          },
        ],
        [
          54,
          {
            instrumentId: 54,
            close: '229.50',
            previousClose: '232.00',
            date: '2023-07-14',
            dailyReturnPct: '-1.08',
          },
        ],
      ]),
    );
  };

  it('reproduces the seed portfolio for user 1', async () => {
    seedLedger();
    const portfolio = await service.getPortfolio(user);

    expect(portfolio).toMatchObject({
      userId: 1,
      accountNumber: '10001',
      currency: 'ARS',
      asOf: '2023-07-14',
      totalValue: '904784.00',
      cash: { total: '753000.00', reserved: '125500.00', available: '627500.00' },
    });
    expect(portfolio.positions).toEqual([
      {
        instrumentId: 54,
        ticker: 'METR',
        name: 'MetroGAS S.A.',
        quantity: 500,
        reservedQuantity: 0,
        availableQuantity: 500,
        lastPrice: '229.50',
        marketValue: '114750.00',
        averageCost: '250.00',
        costBasis: '125000.00',
        unrealizedPnl: '-10250.00',
        totalReturnPct: '-8.20',
        dailyReturnPct: '-1.08',
      },
      {
        instrumentId: 47,
        ticker: 'PAMP',
        name: 'Pampa Holding S.A.',
        quantity: 40,
        reservedQuantity: 0,
        availableQuantity: 40,
        lastPrice: '925.85',
        marketValue: '37034.00',
        averageCost: '930.00',
        costBasis: '37200.00',
        unrealizedPnl: '-166.00',
        totalReturnPct: '-0.45',
        dailyReturnPct: '0.44',
      },
    ]);
    expect(portfolio.warnings).toEqual([
      expect.objectContaining({ code: 'NEGATIVE_POSITION', instrumentId: 31 }),
    ]);
    expect(marketdata.getLatestPrices).toHaveBeenCalledWith([31, 47, 54].filter((id) => id !== 31));
  });

  it('reports reserved shares and values unpriced positions at zero', async () => {
    seedLedger();
    ledger.getReservedSellSizes.mockResolvedValue(new Map([[47, 15]]));
    marketdata.getLatestPrices.mockResolvedValue(new Map());

    const portfolio = await service.getPortfolio(user);
    const pamp = portfolio.positions.find((p) => p.ticker === 'PAMP');

    expect(pamp).toMatchObject({
      reservedQuantity: 15,
      availableQuantity: 25,
      lastPrice: null,
      marketValue: '0.00',
      unrealizedPnl: null,
      totalReturnPct: null,
    });
    expect(portfolio.totalValue).toBe('753000.00');
    expect(portfolio.asOf).toBeNull();
    expect(portfolio.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'NO_MARKET_PRICE', instrumentId: 47 }),
      ]),
    );
  });

  it('returns an empty portfolio without a warnings key', async () => {
    ledger.getCashSummary.mockResolvedValue({
      total: Money.zero(),
      reserved: Money.zero(),
      available: Money.zero(),
    });
    ledger.getFilledTrades.mockResolvedValue([]);
    ledger.getReservedSellSizes.mockResolvedValue(new Map());
    instruments.findByIds.mockResolvedValue(new Map());
    marketdata.getLatestPrices.mockResolvedValue(new Map());

    const portfolio = await service.getPortfolio({
      id: 2,
      email: 'jose@test.com',
      accountNumber: '10002',
    });
    expect(portfolio).toEqual({
      userId: 2,
      accountNumber: '10002',
      currency: 'ARS',
      asOf: null,
      totalValue: '0.00',
      cash: { total: '0.00', reserved: '0.00', available: '0.00' },
      positions: [],
    });
  });
});

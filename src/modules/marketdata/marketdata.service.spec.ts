import { type MarketdataRepository } from './marketdata.repository';
import { MarketdataService, toSnapshot } from './marketdata.service';

describe('MarketdataService', () => {
  const repository = {
    findLatestByInstrumentIds: jest.fn(),
    findLatestByInstrumentId: jest.fn(),
  } as unknown as jest.Mocked<MarketdataRepository>;
  const service = new MarketdataService(repository);

  it('adds the daily return to each latest price', async () => {
    repository.findLatestByInstrumentIds.mockResolvedValue(
      new Map([
        [47, { instrumentId: 47, close: '925.85', previousClose: '921.80', date: '2023-07-14' }],
        [12, { instrumentId: 12, close: '20.50', previousClose: '0', date: '2023-07-14' }],
      ]),
    );
    const prices = await service.getLatestPrices([47, 12]);
    expect(prices.get(47)?.dailyReturnPct).toBe('0.44');
    expect(prices.get(12)?.dailyReturnPct).toBeNull();
  });

  it('returns null when an instrument has no market data', async () => {
    repository.findLatestByInstrumentId.mockResolvedValue(null);
    await expect(service.getLatestPrice(3)).resolves.toBeNull();
  });

  it('toSnapshot keeps the original fields', () => {
    const snapshot = toSnapshot({
      instrumentId: 54,
      close: '229.50',
      previousClose: '232.00',
      date: '2023-07-14',
    });
    expect(snapshot).toEqual({
      instrumentId: 54,
      close: '229.50',
      previousClose: '232.00',
      date: '2023-07-14',
      dailyReturnPct: '-1.08',
    });
  });
});

import { InstrumentType } from '../../common/domain/enums';
import { type NotFoundError } from '../../common/errors/app.error';
import type { MarketdataService } from '../marketdata/marketdata.service';
import type { InstrumentsRepository } from './instruments.repository';
import { InstrumentsService } from './instruments.service';

describe('InstrumentsService', () => {
  const repository = {
    search: jest.fn(),
    findById: jest.fn(),
  } as unknown as jest.Mocked<InstrumentsRepository>;
  const marketdata = {
    getLatestPrices: jest.fn(),
    getLatestPrice: jest.fn(),
  } as unknown as jest.Mocked<MarketdataService>;
  const service = new InstrumentsService(repository, marketdata);

  const pamp = {
    id: 47,
    ticker: 'PAMP',
    name: 'Pampa Holding S.A.',
    type: InstrumentType.ACCIONES,
  };
  const pgr = {
    id: 3,
    ticker: 'PGR',
    name: 'Phoenix Global Resources',
    type: InstrumentType.ACCIONES,
  };
  const pampPrice = {
    instrumentId: 47,
    close: '925.85',
    previousClose: '921.80',
    date: '2023-07-14',
    dailyReturnPct: '0.44',
  };

  it('merges search rows with latest prices and reports pagination meta', async () => {
    repository.search.mockResolvedValue({ rows: [pamp, pgr], total: 2 });
    marketdata.getLatestPrices.mockResolvedValue(new Map([[47, pampPrice]]));

    const result = await service.search({ q: 'p', page: 1, limit: 20 });

    expect(marketdata.getLatestPrices).toHaveBeenCalledWith([47, 3]);
    expect(result.meta).toEqual({ page: 1, limit: 20, total: 2 });
    expect(result.data[0]).toEqual({
      ...pamp,
      lastPrice: '925.85',
      previousClose: '921.80',
      dailyReturnPct: '0.44',
      priceDate: '2023-07-14',
    });
    expect(result.data[1]).toEqual({
      ...pgr,
      lastPrice: null,
      previousClose: null,
      dailyReturnPct: null,
      priceDate: null,
    });
  });

  it('returns one instrument by id', async () => {
    repository.findById.mockResolvedValue(pamp);
    marketdata.getLatestPrice.mockResolvedValue(pampPrice);
    await expect(service.getById(47)).resolves.toMatchObject({
      ticker: 'PAMP',
      lastPrice: '925.85',
    });
  });

  it('throws INSTRUMENT_NOT_FOUND for unknown ids', async () => {
    repository.findById.mockResolvedValue(null);
    await expect(service.getById(999)).rejects.toMatchObject(
      expect.objectContaining({ code: 'INSTRUMENT_NOT_FOUND', status: 404 }) as NotFoundError,
    );
  });
});

import { computePositions, type TradeInput } from './position-calculator';

const trade = (
  instrumentId: number,
  side: 'BUY' | 'SELL',
  size: number,
  price: string,
): TradeInput => ({
  instrumentId,
  side,
  size,
  price,
});

describe('computePositions', () => {
  it('reproduces the seed portfolio of user 1', () => {
    const { positions, warnings } = computePositions([
      trade(47, 'BUY', 50, '930'),
      trade(47, 'SELL', 10, '940'),
      trade(31, 'BUY', 20, '1540'),
      trade(54, 'BUY', 500, '250'),
      trade(31, 'SELL', 30, '1530'),
    ]);

    expect(
      positions.map((p) => [
        p.instrumentId,
        p.quantity,
        p.costBasis.toFixed(),
        p.averageCost.toFixed(),
      ]),
    ).toEqual([
      [47, 40, '37200.00', '930.00'],
      [54, 500, '125000.00', '250.00'],
    ]);
    expect(warnings).toEqual([
      expect.objectContaining({ code: 'NEGATIVE_POSITION', instrumentId: 31, quantity: -10 }),
    ]);
  });

  it('weights the average cost across buys at different prices', () => {
    const { positions } = computePositions([
      trade(1, 'BUY', 10, '100'),
      trade(1, 'BUY', 30, '200'),
    ]);
    expect(positions[0]?.averageCost.toFixed()).toBe('175.00');
    expect(positions[0]?.costBasis.toFixed()).toBe('7000.00');
  });

  it('keeps the average cost unchanged after a partial sell', () => {
    const { positions } = computePositions([
      trade(1, 'BUY', 10, '100'),
      trade(1, 'BUY', 10, '300'),
      trade(1, 'SELL', 5, '1000'),
    ]);
    expect(positions[0]).toMatchObject({ quantity: 15 });
    expect(positions[0]?.averageCost.toFixed()).toBe('200.00');
    expect(positions[0]?.costBasis.toFixed()).toBe('3000.00');
  });

  it('drops fully exited positions and restarts the basis on re-entry', () => {
    const exited = computePositions([trade(1, 'BUY', 10, '100'), trade(1, 'SELL', 10, '150')]);
    expect(exited.positions).toEqual([]);
    expect(exited.warnings).toEqual([]);

    const reentered = computePositions([
      trade(1, 'BUY', 10, '100'),
      trade(1, 'SELL', 10, '150'),
      trade(1, 'BUY', 4, '500'),
    ]);
    expect(reentered.positions[0]).toMatchObject({ quantity: 4 });
    expect(reentered.positions[0]?.averageCost.toFixed()).toBe('500.00');
  });

  it('flags an oversell that is later covered', () => {
    const { positions, warnings } = computePositions([
      trade(1, 'BUY', 5, '100'),
      trade(1, 'SELL', 8, '100'),
      trade(1, 'BUY', 10, '200'),
    ]);
    expect(positions[0]).toMatchObject({ quantity: 7 });
    expect(positions[0]?.costBasis.toFixed()).toBe('2000.00');
    expect(warnings).toEqual([
      expect.objectContaining({ code: 'OVERSOLD_POSITION', instrumentId: 1 }),
    ]);
  });

  it('returns nothing for an empty ledger', () => {
    expect(computePositions([])).toEqual({ positions: [], warnings: [] });
  });
});

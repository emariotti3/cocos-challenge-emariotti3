import { isPgInt, parsePgIntParam, PG_INT_MAX } from './limits';

describe('int4 parameter parsing', () => {
  it.each([
    ['47', 47],
    [47, 47],
    [String(PG_INT_MAX), PG_INT_MAX],
    [PG_INT_MAX, PG_INT_MAX],
  ])('accepts %p as %p', (raw, expected) => {
    expect(parsePgIntParam(raw)).toBe(expected);
  });

  it.each([
    '0',
    '-1',
    '1.5',
    'abc',
    '',
    ' 7',
    '007',
    String(PG_INT_MAX + 1),
    0,
    1.5,
    PG_INT_MAX + 1,
    null,
    undefined,
    {},
  ])('rejects %p', (raw) => {
    expect(parsePgIntParam(raw)).toBeNull();
  });

  it('isPgInt only accepts positive integers up to int4', () => {
    expect(isPgInt(1)).toBe(true);
    expect(isPgInt(PG_INT_MAX)).toBe(true);
    expect(isPgInt(PG_INT_MAX + 1)).toBe(false);
    expect(isPgInt(0)).toBe(false);
    expect(isPgInt('1')).toBe(false);
  });
});

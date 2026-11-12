import { BadRequestException } from '@nestjs/common';
import { decodeCursor, encodeCursor } from './cursor';

describe('cursor', () => {
  it('normalizes the datetime to millisecond ISO UTC', () => {
    const raw = Buffer.from('{"d":"2023-07-13T15:13:20Z","i":11}').toString('base64url');
    expect(decodeCursor(raw)).toEqual({ datetime: '2023-07-13T15:13:20.000Z', id: 11 });
  });

  it('round-trips', () => {
    const cursor = { datetime: '2023-07-13T15:13:20.000Z', id: 11 };
    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
  });

  it.each([
    '',
    'not-base64!',
    Buffer.from('{"d":1,"i":"x"}').toString('base64url'),
    Buffer.from('[]').toString('base64url'),
    // lenient date formats Date.parse would accept but Postgres ::timestamp may not
    Buffer.from('{"d":"2024","i":1}').toString('base64url'),
    Buffer.from('{"d":"12/31/2024","i":1}').toString('base64url'),
    Buffer.from('{"d":"2023-07-13T15:13:20.000Z","i":0}').toString('base64url'),
    // id above int4: would be an "out of range" database error, not a 400
    Buffer.from('{"d":"2023-07-13T15:13:20.000Z","i":2147483648}').toString('base64url'),
  ])('rejects malformed cursor %p', (raw) => {
    expect(() => decodeCursor(raw)).toThrow(BadRequestException);
  });
});

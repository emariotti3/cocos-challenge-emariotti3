import { BadRequestException } from '@nestjs/common';
import { decodeCursor, encodeCursor } from './cursor';

describe('cursor', () => {
  it('round-trips', () => {
    const cursor = { datetime: '2023-07-13T15:13:20.000Z', id: 11 };
    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
  });

  it.each([
    '',
    'not-base64!',
    Buffer.from('{"d":1,"i":"x"}').toString('base64url'),
    Buffer.from('[]').toString('base64url'),
  ])('rejects malformed cursor %p', (raw) => {
    expect(() => decodeCursor(raw)).toThrow(BadRequestException);
  });
});

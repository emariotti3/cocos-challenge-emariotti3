import { BadRequestException } from '@nestjs/common';

export interface OrderCursor {
  datetime: string;
  id: number;
}

/** Opaque keyset cursor: base64url(JSON) of the last row's (datetime, id). */
export function encodeCursor(cursor: OrderCursor): string {
  return Buffer.from(JSON.stringify({ d: cursor.datetime, i: cursor.id }), 'utf8').toString(
    'base64url',
  );
}

export function decodeCursor(raw: string): OrderCursor {
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as {
      d?: unknown;
      i?: unknown;
    };
    if (typeof parsed.d !== 'string' || Number.isNaN(Date.parse(parsed.d)))
      throw new Error('bad datetime');
    if (typeof parsed.i !== 'number' || !Number.isInteger(parsed.i) || parsed.i < 1)
      throw new Error('bad id');
    return { datetime: parsed.d, id: parsed.i };
  } catch {
    throw new BadRequestException({
      code: 'VALIDATION_ERROR',
      message: 'Request validation failed',
      errors: [{ path: 'cursor', message: 'malformed pagination cursor' }],
    });
  }
}

import { validationProblem } from '../errors/validation.problem';
import { isPgInt } from '../validation/limits';

export interface OrderCursor {
  /** ISO-8601 UTC instant, millisecond precision. */
  datetime: string;
  id: number;
}

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

/** Opaque keyset cursor: base64url(JSON) of the last row's (datetime, id). */
export function encodeCursor(cursor: OrderCursor): string {
  return Buffer.from(JSON.stringify({ d: cursor.datetime, i: cursor.id }), 'utf8').toString(
    'base64url',
  );
}

/**
 * Decodes and normalizes a cursor. Only strict ISO UTC datetimes and int4 ids
 * are accepted, so the values can be bound to `::timestamp` / `::int` without
 * the database ever seeing something it rejects (which would surface as 500).
 */
export function decodeCursor(raw: string): OrderCursor {
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as {
      d?: unknown;
      i?: unknown;
    };
    if (typeof parsed.d !== 'string' || !ISO_UTC.test(parsed.d)) throw new Error('bad datetime');
    const instant = new Date(parsed.d);
    if (Number.isNaN(instant.getTime())) throw new Error('bad datetime');
    if (!isPgInt(parsed.i)) throw new Error('bad id');
    return { datetime: instant.toISOString(), id: parsed.i };
  } catch {
    throw validationProblem([{ path: 'cursor', message: 'malformed pagination cursor' }]);
  }
}

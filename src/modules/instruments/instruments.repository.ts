import { Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/sequelize';
import { QueryTypes, type Sequelize, type Transaction } from 'sequelize';
import { type InstrumentType } from '../../common/domain/enums';
import { InstrumentModel } from '../../database/models';

export interface InstrumentRecord {
  id: number;
  ticker: string;
  name: string;
  type: InstrumentType;
}

export interface InstrumentSearch {
  q?: string;
  ticker?: string;
  name?: string;
  page: number;
  limit: number;
}

export interface InstrumentSearchResult {
  rows: InstrumentRecord[];
  total: number;
}

const LIKE_ESCAPE = '!';

/** Escapes LIKE metacharacters so user input is matched literally. */
export function toLikePattern(term: string): string {
  const escaped = term.replace(/[!%_]/g, (char) => `${LIKE_ESCAPE}${char}`);
  return `%${escaped}%`;
}

/**
 * Tradable instruments only (cash is an instrument of type MONEDA but not a
 * search result). Ranking uses pg_trgm similarity when a free-text query is
 * given, then ticker for a stable order. `count(*) OVER ()` returns the total
 * in the same round trip.
 */
const SEARCH_WHERE = `
   WHERE type <> 'MONEDA'
     AND ($q::text IS NULL OR ticker ILIKE $qLike::text ESCAPE '${LIKE_ESCAPE}' OR name ILIKE $qLike::text ESCAPE '${LIKE_ESCAPE}')
     AND ($ticker::text IS NULL OR ticker ILIKE $tickerLike::text ESCAPE '${LIKE_ESCAPE}')
     AND ($name::text IS NULL OR name ILIKE $nameLike::text ESCAPE '${LIKE_ESCAPE}')`;

const SEARCH_SQL = `
  SELECT id, ticker, name, type, count(*) OVER () AS total
    FROM instruments
   ${SEARCH_WHERE}
   ORDER BY
     CASE WHEN $q::text IS NULL THEN 0
          ELSE GREATEST(similarity(ticker, $q::text), similarity(name, $q::text)) END DESC,
     ticker ASC
   LIMIT $limit::int OFFSET $offset::int`;

type SearchRow = InstrumentRecord & { total: string | number };

@Injectable()
export class InstrumentsRepository {
  constructor(
    @InjectModel(InstrumentModel) private readonly instruments: typeof InstrumentModel,
    @InjectConnection() private readonly sequelize: Sequelize,
  ) {}

  async search(params: InstrumentSearch): Promise<InstrumentSearchResult> {
    const filters = {
      q: params.q ?? null,
      qLike: params.q ? toLikePattern(params.q) : null,
      ticker: params.ticker ?? null,
      tickerLike: params.ticker ? toLikePattern(params.ticker) : null,
      name: params.name ?? null,
      nameLike: params.name ? toLikePattern(params.name) : null,
    };
    const offset = (params.page - 1) * params.limit;
    const rows = await this.sequelize.query<SearchRow>(SEARCH_SQL, {
      type: QueryTypes.SELECT,
      bind: { ...filters, limit: params.limit, offset },
    });
    // The window count only travels with returned rows; past the last page ask for it explicitly.
    const total =
      rows.length > 0 ? Number(rows[0]?.total ?? 0) : offset > 0 ? await this.count(filters) : 0;
    return {
      rows: rows.map(({ id, ticker, name, type }) => ({ id, ticker, name, type })),
      total,
    };
  }

  private async count(filters: Record<string, string | null>): Promise<number> {
    const [row] = await this.sequelize.query<{ total: string | number }>(
      `SELECT count(*) AS total FROM instruments ${SEARCH_WHERE}`,
      { type: QueryTypes.SELECT, bind: filters },
    );
    return Number(row?.total ?? 0);
  }

  async findById(id: number, transaction?: Transaction): Promise<InstrumentRecord | null> {
    const instrument = await this.instruments.findByPk(id, { transaction, raw: true });
    return instrument
      ? {
          id: instrument.id,
          ticker: instrument.ticker,
          name: instrument.name,
          type: instrument.type,
        }
      : null;
  }

  async findByIds(
    ids: readonly number[],
    transaction?: Transaction,
  ): Promise<Map<number, InstrumentRecord>> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return new Map();
    const rows = await this.instruments.findAll({ where: { id: unique }, transaction, raw: true });
    return new Map(
      rows.map((row) => [
        row.id,
        { id: row.id, ticker: row.ticker, name: row.name, type: row.type },
      ]),
    );
  }

  async findByTicker(ticker: string, transaction?: Transaction): Promise<InstrumentRecord | null> {
    const instrument = await this.instruments.findOne({
      where: { ticker },
      transaction,
      raw: true,
    });
    return instrument
      ? {
          id: instrument.id,
          ticker: instrument.ticker,
          name: instrument.name,
          type: instrument.type,
        }
      : null;
  }
}

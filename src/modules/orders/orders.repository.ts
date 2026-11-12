import { Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/sequelize';
import { QueryTypes, type Sequelize, type Transaction } from 'sequelize';
import {
  type OrderSide,
  type OrderStatus,
  type OrderType,
  type RejectionReason,
} from '../../common/domain/enums';
import type { OrderCursor } from '../../common/pagination/cursor';
import { OrderModel } from '../../database/models';

export interface OrderRecord {
  id: number;
  userId: number;
  instrumentId: number;
  ticker: string;
  side: OrderSide;
  type: OrderType;
  status: OrderStatus;
  size: number;
  price: string;
  datetime: Date;
  rejectionReason: RejectionReason | null;
}

export interface NewOrder {
  userId: number;
  instrumentId: number;
  ticker: string;
  side: OrderSide;
  type: OrderType;
  status: OrderStatus;
  size: number;
  /** Decimal string with 2 places. */
  price: string;
  rejectionReason: RejectionReason | null;
}

export interface OrderListFilters {
  status?: OrderStatus;
  side?: OrderSide;
  instrumentId?: number;
}

const SELECT_ORDER = `
  SELECT o.id, o.userid AS "userId", o.instrumentid AS "instrumentId", i.ticker,
         o.side, o.type, o.status, o.size, o.price::text AS price, o.datetime,
         o.rejection_reason AS "rejectionReason"
    FROM orders o
    JOIN instruments i ON i.id = o.instrumentid`;

@Injectable()
export class OrdersRepository {
  constructor(
    @InjectModel(OrderModel) private readonly orders: typeof OrderModel,
    @InjectConnection() private readonly sequelize: Sequelize,
  ) {}

  async create(order: NewOrder, transaction: Transaction): Promise<OrderRecord> {
    const created = await this.orders.create(
      {
        userId: order.userId,
        instrumentId: order.instrumentId,
        side: order.side,
        type: order.type,
        status: order.status,
        size: order.size,
        price: order.price,
        rejectionReason: order.rejectionReason,
        datetime: new Date(),
      },
      { transaction },
    );
    const plain = created.get({ plain: true });
    return {
      id: plain.id,
      userId: plain.userId,
      instrumentId: plain.instrumentId,
      ticker: order.ticker,
      side: plain.side,
      type: plain.type,
      status: plain.status,
      size: plain.size,
      price: plain.price,
      datetime: plain.datetime,
      rejectionReason: plain.rejectionReason ?? null,
    };
  }

  async findByIdForUser(
    userId: number,
    orderId: number,
    transaction?: Transaction,
  ): Promise<OrderRecord | null> {
    const [row] = await this.sequelize.query<OrderRecord>(
      `${SELECT_ORDER} WHERE o.id = $orderId AND o.userid = $userId`,
      {
        bind: { orderId, userId },
        type: QueryTypes.SELECT,
        transaction,
      },
    );
    return row ?? null;
  }

  /** Conditional transition; returns the number of rows changed (0 or 1). */
  async transitionStatus(
    userId: number,
    orderId: number,
    from: OrderStatus,
    to: OrderStatus,
    transaction: Transaction,
  ): Promise<number> {
    const [affected] = await this.orders.update(
      { status: to },
      { where: { id: orderId, userId, status: from }, transaction },
    );
    return affected;
  }

  /**
   * Newest first with keyset pagination on (datetime, id). Returns up to
   * `limit + 1` rows so the caller can tell whether a next page exists.
   */
  async listByUser(
    userId: number,
    filters: OrderListFilters,
    limit: number,
    cursor: OrderCursor | null,
  ): Promise<OrderRecord[]> {
    const conditions = ['o.userid = $userId'];
    const bind: Record<string, unknown> = { userId, limit: limit + 1 };
    if (filters.status) {
      conditions.push('o.status = $status');
      bind['status'] = filters.status;
    }
    if (filters.side) {
      conditions.push('o.side = $side');
      bind['side'] = filters.side;
    }
    if (filters.instrumentId) {
      conditions.push('o.instrumentid = $instrumentId');
      bind['instrumentId'] = filters.instrumentId;
    }
    if (cursor) {
      conditions.push('(o.datetime, o.id) < ($cursorDatetime::timestamp, $cursorId::int)');
      bind['cursorDatetime'] = cursor.datetime;
      bind['cursorId'] = cursor.id;
    }
    return this.sequelize.query<OrderRecord>(
      `${SELECT_ORDER} WHERE ${conditions.join(' AND ')} ORDER BY o.datetime DESC, o.id DESC LIMIT $limit`,
      { bind, type: QueryTypes.SELECT },
    );
  }
}

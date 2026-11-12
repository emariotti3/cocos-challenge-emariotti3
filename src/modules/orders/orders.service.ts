import { Injectable, Logger } from '@nestjs/common';
import { InjectConnection } from '@nestjs/sequelize';
import type { Sequelize } from 'sequelize';
import { InstrumentType, OrderSide, OrderStatus, OrderType } from '../../common/domain/enums';
import { ConflictError, NotFoundError, UnprocessableError } from '../../common/errors/app.error';
import { Money } from '../../common/money/money';
import { decodeCursor, encodeCursor } from '../../common/pagination/cursor';
import {
  type InstrumentRecord,
  InstrumentsRepository,
} from '../instruments/instruments.repository';
import { MarketdataService } from '../marketdata/marketdata.service';
import { PortfolioRepository } from '../portfolio/portfolio.repository';
import { MetricsService } from '../../observability/metrics/metrics.service';
import { type UserRecord, UsersRepository } from '../users/users.repository';
import { decideOrder } from './domain/order-decision';
import type { ListOrdersQueryDto } from './dto/list-orders.query.dto';
import type { OrderListResponseDto, OrderResponseDto } from './dto/order.response.dto';
import { MAX_ORDER_SIZE, type PlaceOrderDto } from './dto/place-order.dto';
import { type OrderRecord, OrdersRepository } from './orders.repository';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @InjectConnection() private readonly sequelize: Sequelize,
    private readonly orders: OrdersRepository,
    private readonly users: UsersRepository,
    private readonly instruments: InstrumentsRepository,
    private readonly marketdata: MarketdataService,
    private readonly ledger: PortfolioRepository,
    private readonly metrics: MetricsService,
  ) {}

  /**
   * Places an order. Validation that cannot be expressed on the DTO happens
   * here (unknown/non-tradable instrument, missing market price, budget too
   * small). The acceptance decision and the insert run in one transaction
   * under a per-user row lock, so two concurrent orders cannot both spend the
   * same cash or shares. Rejected orders are persisted (status REJECTED) and
   * returned with 201, as the challenge requires.
   */
  async placeOrder(user: UserRecord, dto: PlaceOrderDto): Promise<OrderResponseDto> {
    const instrument = await this.loadTradableInstrument(dto.instrumentId);
    const price = await this.resolveExecutionPrice(dto, instrument);
    const size = this.resolveSize(dto, price);
    const notional = price.times(size);

    const record = await this.sequelize.transaction(async (transaction) => {
      await this.users.lockForUpdate(user.id, transaction);
      const cash = await this.ledger.getCashSummary(user.id, transaction);
      const availableShares =
        dto.side === OrderSide.SELL
          ? await this.ledger.getAvailableShares(user.id, instrument.id, transaction)
          : 0;
      const decision = decideOrder({
        side: dto.side,
        type: dto.type,
        size,
        notional,
        availableCash: cash.available,
        availableShares,
      });
      return this.orders.create(
        {
          userId: user.id,
          instrumentId: instrument.id,
          ticker: instrument.ticker,
          side: dto.side,
          type: dto.type,
          status: decision.status,
          size,
          price: price.toFixed(2),
          rejectionReason: decision.rejectionReason,
        },
        transaction,
      );
    });

    this.metrics.recordOrder(record);
    this.logger.log(
      {
        userId: user.id,
        orderId: record.id,
        instrumentId: record.instrumentId,
        side: record.side,
        type: record.type,
        status: record.status,
        rejectionReason: record.rejectionReason,
        size: record.size,
        price: record.price,
      },
      'Order processed',
    );
    return toOrderResponse(record);
  }

  /** Only NEW orders can be cancelled; anything else is a 409. */
  async cancelOrder(user: UserRecord, orderId: number): Promise<OrderResponseDto> {
    const record = await this.sequelize.transaction(async (transaction) => {
      await this.users.lockForUpdate(user.id, transaction);
      const changed = await this.orders.transitionStatus(
        user.id,
        orderId,
        OrderStatus.NEW,
        OrderStatus.CANCELLED,
        transaction,
      );
      const order = await this.orders.findByIdForUser(user.id, orderId, transaction);
      if (!order) {
        throw new NotFoundError(
          'ORDER_NOT_FOUND',
          `Order ${orderId} does not exist for this user`,
          { orderId },
        );
      }
      if (changed === 0) {
        throw new ConflictError(
          'ORDER_NOT_CANCELLABLE',
          `Order ${orderId} is ${order.status}; only NEW orders can be cancelled`,
          { orderId, orderStatus: order.status },
        );
      }
      return order;
    });
    this.metrics.recordCancellation();
    this.logger.log({ userId: user.id, orderId }, 'Order cancelled');
    return toOrderResponse(record);
  }

  async getOrder(user: UserRecord, orderId: number): Promise<OrderResponseDto> {
    const order = await this.orders.findByIdForUser(user.id, orderId);
    if (!order) {
      throw new NotFoundError('ORDER_NOT_FOUND', `Order ${orderId} does not exist for this user`, {
        orderId,
      });
    }
    return toOrderResponse(order);
  }

  async listOrders(user: UserRecord, query: ListOrdersQueryDto): Promise<OrderListResponseDto> {
    const cursor = query.cursor ? decodeCursor(query.cursor) : null;
    const rows = await this.orders.listByUser(
      user.id,
      { status: query.status, side: query.side, instrumentId: query.instrumentId },
      query.limit,
      cursor,
    );
    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const last = page.at(-1);
    return {
      data: page.map(toOrderResponse),
      meta: {
        nextCursor:
          hasMore && last
            ? encodeCursor({ datetime: last.datetime.toISOString(), id: last.id })
            : null,
      },
    };
  }

  private async loadTradableInstrument(instrumentId: number): Promise<InstrumentRecord> {
    const instrument = await this.instruments.findById(instrumentId);
    if (!instrument) {
      throw new NotFoundError('INSTRUMENT_NOT_FOUND', `Instrument ${instrumentId} does not exist`, {
        instrumentId,
      });
    }
    if (instrument.type === InstrumentType.MONEDA) {
      throw new UnprocessableError(
        'NOT_TRADABLE',
        `${instrument.ticker} is a currency and cannot be traded`,
        {
          instrumentId,
        },
      );
    }
    return instrument;
  }

  private async resolveExecutionPrice(
    dto: PlaceOrderDto,
    instrument: InstrumentRecord,
  ): Promise<Money> {
    if (dto.type === OrderType.LIMIT) {
      if (dto.price === undefined) throw new Error('LIMIT order without price passed validation');
      return Money.of(String(dto.price));
    }
    const snapshot = await this.marketdata.getLatestPrice(instrument.id);
    if (!snapshot) {
      throw new UnprocessableError(
        'NO_MARKET_PRICE',
        `No market price available for ${instrument.ticker}; a MARKET order cannot be executed`,
        { instrumentId: instrument.id },
      );
    }
    return Money.of(snapshot.close);
  }

  private resolveSize(dto: PlaceOrderDto, price: Money): number {
    if (dto.size !== undefined) return dto.size;
    if (dto.amount === undefined) throw new Error('Order without size or amount passed validation');
    const amount = Money.of(String(dto.amount));
    const size = amount.floorDiv(price);
    if (size < 1) {
      throw new UnprocessableError(
        'AMOUNT_TOO_SMALL',
        `Amount ${amount.toFixed()} does not cover one share at ${price.toFixed()}`,
        { amount: amount.toFixed(), price: price.toFixed() },
      );
    }
    if (size > MAX_ORDER_SIZE) {
      throw new UnprocessableError(
        'ORDER_TOO_LARGE',
        `Resulting size ${size} exceeds the maximum of ${MAX_ORDER_SIZE}`,
        {
          size,
        },
      );
    }
    return size;
  }
}

export function toOrderResponse(order: OrderRecord): OrderResponseDto {
  return {
    id: order.id,
    userId: order.userId,
    instrumentId: order.instrumentId,
    ticker: order.ticker,
    side: order.side,
    type: order.type,
    status: order.status,
    size: order.size,
    price: Money.of(order.price).toFixed(),
    notional: Money.of(order.price).times(order.size).toFixed(),
    rejectionReason: order.rejectionReason,
    datetime: order.datetime.toISOString(),
  };
}

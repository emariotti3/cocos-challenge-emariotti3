import { Injectable, Logger } from '@nestjs/common';
import { CASH_TICKER, OrderSide, OrderStatus, OrderType } from '../../common/domain/enums';
import { logOperationFailure } from '../../common/logging/operation-log';
import { Money } from '../../common/money/money';
import { MetricsService } from '../../observability/metrics/metrics.service';
import {
  type InstrumentRecord,
  InstrumentsRepository,
} from '../instruments/instruments.repository';
import type { OrderResponseDto } from '../orders/dto/order.response.dto';
import { type OrderRecord, OrdersRepository } from '../orders/orders.repository';
import { toOrderResponse } from '../orders/orders.service';
import { PortfolioRepository } from '../portfolio/portfolio.repository';
import { type UserRecord, UsersRepository } from '../users/users.repository';
import { type CashSide, decideCashMovement } from './domain/cash-decision';
import type { CashMovementDto } from './dto/cash-movement.dto';

/** Cash movements are priced at 1 ARS per unit, as in the provided dataset. */
const CASH_UNIT_PRICE = '1.00';

/**
 * Deposits (CASH_IN) and withdrawals (CASH_OUT), modelled as orders on the
 * ARS instrument exactly like the seed rows, so the portfolio's cash summary
 * needs no special case. They take the same per-user lock as order placement:
 * a withdrawal and a MARKET BUY racing for the same pesos are serialized and
 * only one of them can win.
 */
@Injectable()
export class CashService {
  private readonly logger = new Logger(CashService.name);
  private cashInstrument?: Promise<InstrumentRecord>;

  constructor(
    private readonly orders: OrdersRepository,
    private readonly users: UsersRepository,
    private readonly instruments: InstrumentsRepository,
    private readonly ledger: PortfolioRepository,
    private readonly metrics: MetricsService,
  ) {}

  deposit(user: UserRecord, dto: CashMovementDto): Promise<OrderResponseDto> {
    return this.move(user, OrderSide.CASH_IN, dto.amount);
  }

  withdraw(user: UserRecord, dto: CashMovementDto): Promise<OrderResponseDto> {
    return this.move(user, OrderSide.CASH_OUT, dto.amount);
  }

  private async move(user: UserRecord, side: CashSide, amount: number): Promise<OrderResponseDto> {
    const context = { operation: 'cashMovement', userId: user.id, side, amount };
    this.logger.debug(context, 'Cash movement received');

    let record: OrderRecord;
    try {
      const instrument = await this.resolveCashInstrument();
      record = await this.users.withLock(user.id, async (transaction) => {
        const cash = await this.ledger.getCashSummary(user.id, transaction);
        const decision = decideCashMovement({
          side,
          amount: Money.of(String(amount)),
          availableCash: cash.available,
        });
        this.logger.debug(
          {
            ...context,
            totalCash: cash.total.toFixed(),
            reservedCash: cash.reserved.toFixed(),
            availableCash: cash.available.toFixed(),
            decision: decision.status,
            rejectionReason: decision.rejectionReason,
          },
          'Cash movement decided under user lock',
        );
        return this.orders.create(
          {
            userId: user.id,
            instrumentId: instrument.id,
            ticker: instrument.ticker,
            side,
            type: OrderType.MARKET,
            status: decision.status,
            size: amount,
            price: CASH_UNIT_PRICE,
            rejectionReason: decision.rejectionReason,
          },
          transaction,
        );
      });
    } catch (error) {
      logOperationFailure(this.logger, 'Cash movement', context, error);
      throw error;
    }

    this.metrics.recordOrder(record);
    const outcome = {
      ...context,
      orderId: record.id,
      status: record.status,
      rejectionReason: record.rejectionReason,
    };
    if (record.status === OrderStatus.REJECTED) {
      this.logger.warn(outcome, 'Cash withdrawal rejected: insufficient available cash');
    } else {
      this.logger.log(outcome, 'Cash movement settled');
    }
    return toOrderResponse(record);
  }

  /** The ARS instrument is static reference data; resolve it once per process. */
  private resolveCashInstrument(): Promise<InstrumentRecord> {
    this.cashInstrument ??= this.instruments.findByTicker(CASH_TICKER).then((instrument) => {
      if (!instrument) {
        this.cashInstrument = undefined;
        throw new Error(`Cash instrument ${CASH_TICKER} is missing from the instruments table`);
      }
      return instrument;
    });
    return this.cashInstrument;
  }
}

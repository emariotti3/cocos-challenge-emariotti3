import { Injectable, Logger } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/sequelize';
import { QueryTypes, type Sequelize, Transaction } from 'sequelize';
import { NotFoundError } from '../../common/errors/app.error';
import { UserModel } from '../../database/models';

export interface UserRecord {
  id: number;
  email: string;
  accountNumber: string;
}

@Injectable()
export class UsersRepository {
  private readonly logger = new Logger(UsersRepository.name);

  constructor(
    @InjectModel(UserModel) private readonly users: typeof UserModel,
    @InjectConnection() private readonly sequelize: Sequelize,
  ) {}

  async findById(id: number, transaction?: Transaction): Promise<UserRecord | null> {
    const user = await this.users.findByPk(id, { raw: true, transaction });
    return user ? { id: user.id, email: user.email, accountNumber: user.accountNumber } : null;
  }

  /**
   * Serializes all balance-changing work for one user: concurrent order
   * placements, cancellations and cash movements for the same user queue on
   * this row lock until the holding transaction commits, so availability
   * checks never race. Different users never contend. Returns false if the
   * user vanished.
   */
  async lockForUpdate(userId: number, transaction: Transaction): Promise<boolean> {
    const rows = await this.sequelize.query<{ id: number }>(
      'SELECT id FROM users WHERE id = $userId FOR UPDATE',
      {
        bind: { userId },
        type: QueryTypes.SELECT,
        transaction,
      },
    );
    return rows.length === 1;
  }

  /**
   * Runs `work` inside a transaction that holds the user's row lock. READ
   * COMMITTED is pinned explicitly: every statement issued after the lock is
   * granted sees the rows committed by the previous lock holder, which is what
   * makes "lock, then read balances, then insert" correct. (Under REPEATABLE
   * READ the balance reads would use a snapshot taken before the lock and the
   * guarantee would silently disappear.) Any error rolls the transaction back.
   */
  async withLock<T>(userId: number, work: (transaction: Transaction) => Promise<T>): Promise<T> {
    return this.sequelize.transaction(
      { isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED },
      async (transaction) => {
        const startedAt = process.hrtime.bigint();
        const locked = await this.lockForUpdate(userId, transaction);
        if (!locked) {
          throw new NotFoundError('USER_NOT_FOUND', `User ${userId} does not exist`, { userId });
        }
        this.logger.debug(
          { userId, lockWaitMs: Number(process.hrtime.bigint() - startedAt) / 1e6 },
          'User ledger lock acquired',
        );
        return work(transaction);
      },
    );
  }
}

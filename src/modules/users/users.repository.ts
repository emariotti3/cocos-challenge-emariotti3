import { Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/sequelize';
import { QueryTypes, type Sequelize, type Transaction } from 'sequelize';
import { UserModel } from '../../database/models';

export interface UserRecord {
  id: number;
  email: string;
  accountNumber: string;
}

@Injectable()
export class UsersRepository {
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
   * placements/cancellations for the same user queue on this row lock until
   * the holding transaction commits, so availability checks never race.
   * Different users never contend. Returns false if the user vanished.
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
}

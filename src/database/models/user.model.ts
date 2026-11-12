import type { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';
import { AutoIncrement, Column, DataType, Model, PrimaryKey, Table } from 'sequelize-typescript';

/**
 * Column names are explicitly mapped: the provided DDL uses unquoted camelCase
 * identifiers, which Postgres folds to lowercase (accountNumber -> accountnumber).
 */
@Table({ tableName: 'users', timestamps: false })
export class UserModel extends Model<
  InferAttributes<UserModel>,
  InferCreationAttributes<UserModel>
> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  override id!: CreationOptional<number>;

  @Column({ type: DataType.STRING(255), allowNull: false })
  email!: string;

  @Column({ type: DataType.STRING(20), allowNull: false, field: 'accountnumber' })
  accountNumber!: string;
}

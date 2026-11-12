import type {
  CreationOptional,
  InferAttributes,
  InferCreationAttributes,
  NonAttribute,
} from 'sequelize';
import {
  AutoIncrement,
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  Model,
  PrimaryKey,
  Table,
} from 'sequelize-typescript';
import { OrderSide, OrderStatus, OrderType, RejectionReason } from '../../common/domain/enums';
import { InstrumentModel } from './instrument.model';
import { UserModel } from './user.model';

@Table({ tableName: 'orders', timestamps: false })
export class OrderModel extends Model<
  InferAttributes<OrderModel>,
  InferCreationAttributes<OrderModel>
> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  override id!: CreationOptional<number>;

  @ForeignKey(() => InstrumentModel)
  @Column({ type: DataType.INTEGER, allowNull: false, field: 'instrumentid' })
  instrumentId!: number;

  @ForeignKey(() => UserModel)
  @Column({ type: DataType.INTEGER, allowNull: false, field: 'userid' })
  userId!: number;

  @Column({ type: DataType.INTEGER, allowNull: false })
  size!: number;

  /** NUMERIC(10,2) is read as a decimal string; never coerce to a JS float. */
  @Column({ type: DataType.DECIMAL(10, 2), allowNull: false })
  price!: string;

  @Column({ type: DataType.STRING(10), allowNull: false })
  type!: OrderType;

  @Column({ type: DataType.STRING(10), allowNull: false })
  side!: OrderSide;

  @Column({ type: DataType.STRING(20), allowNull: false })
  status!: OrderStatus;

  /** TIMESTAMP (no tz) in the DB; always written and read as UTC. */
  @Column({ type: DataType.DATE, allowNull: false })
  datetime!: CreationOptional<Date>;

  @Column({ type: DataType.STRING(40), allowNull: true, field: 'rejection_reason' })
  rejectionReason!: CreationOptional<RejectionReason | null>;

  @BelongsTo(() => InstrumentModel)
  instrument?: NonAttribute<InstrumentModel>;
}

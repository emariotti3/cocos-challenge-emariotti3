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
import { InstrumentModel } from './instrument.model';

/**
 * One row per instrument per trading day. `close` is the last price and
 * `previousClose` the prior day's close. The challenge text calls the day
 * column `datetime`, but the provided DDL names it `date` (DATE type).
 */
@Table({ tableName: 'marketdata', timestamps: false })
export class MarketdataModel extends Model<
  InferAttributes<MarketdataModel>,
  InferCreationAttributes<MarketdataModel>
> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  override id!: CreationOptional<number>;

  @ForeignKey(() => InstrumentModel)
  @Column({ type: DataType.INTEGER, allowNull: false, field: 'instrumentid' })
  instrumentId!: number;

  @Column({ type: DataType.DECIMAL(10, 2), allowNull: true })
  high!: string | null;

  @Column({ type: DataType.DECIMAL(10, 2), allowNull: true })
  low!: string | null;

  @Column({ type: DataType.DECIMAL(10, 2), allowNull: true })
  open!: string | null;

  @Column({ type: DataType.DECIMAL(10, 2), allowNull: false })
  close!: string;

  @Column({ type: DataType.DECIMAL(10, 2), allowNull: false, field: 'previousclose' })
  previousClose!: string;

  @Column({ type: DataType.DATEONLY, allowNull: false })
  date!: string;

  @BelongsTo(() => InstrumentModel)
  instrument?: NonAttribute<InstrumentModel>;
}

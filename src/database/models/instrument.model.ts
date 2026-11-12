import type { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';
import { AutoIncrement, Column, DataType, Model, PrimaryKey, Table } from 'sequelize-typescript';
import { InstrumentType } from '../../common/domain/enums';

@Table({ tableName: 'instruments', timestamps: false })
export class InstrumentModel extends Model<
  InferAttributes<InstrumentModel>,
  InferCreationAttributes<InstrumentModel>
> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  override id!: CreationOptional<number>;

  @Column({ type: DataType.STRING(10), allowNull: false })
  ticker!: string;

  @Column({ type: DataType.STRING(255), allowNull: false })
  name!: string;

  @Column({ type: DataType.STRING(10), allowNull: false })
  type!: InstrumentType;
}

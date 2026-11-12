import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { InstrumentModel } from '../../database/models';
import { MarketdataModule } from '../marketdata/marketdata.module';
import { InstrumentsController } from './instruments.controller';
import { InstrumentsRepository } from './instruments.repository';
import { InstrumentsService } from './instruments.service';

@Module({
  imports: [SequelizeModule.forFeature([InstrumentModel]), MarketdataModule],
  controllers: [InstrumentsController],
  providers: [InstrumentsRepository, InstrumentsService],
  exports: [InstrumentsRepository, InstrumentsService],
})
export class InstrumentsModule {}

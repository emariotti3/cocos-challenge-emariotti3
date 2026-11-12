import { Module } from '@nestjs/common';
import { MarketdataRepository } from './marketdata.repository';
import { MarketdataService } from './marketdata.service';

@Module({
  providers: [MarketdataRepository, MarketdataService],
  exports: [MarketdataService],
})
export class MarketdataModule {}

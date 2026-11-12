import { Module } from '@nestjs/common';
import { InstrumentsModule } from '../instruments/instruments.module';
import { MarketdataModule } from '../marketdata/marketdata.module';
import { UsersModule } from '../users/users.module';
import { PortfolioController } from './portfolio.controller';
import { PortfolioRepository } from './portfolio.repository';
import { PortfolioService } from './portfolio.service';

@Module({
  imports: [UsersModule, InstrumentsModule, MarketdataModule],
  controllers: [PortfolioController],
  providers: [PortfolioRepository, PortfolioService],
  exports: [PortfolioRepository],
})
export class PortfolioModule {}

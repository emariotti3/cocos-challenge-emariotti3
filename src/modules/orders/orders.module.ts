import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { OrderModel } from '../../database/models';
import { InstrumentsModule } from '../instruments/instruments.module';
import { MarketdataModule } from '../marketdata/marketdata.module';
import { PortfolioModule } from '../portfolio/portfolio.module';
import { UsersModule } from '../users/users.module';
import { OrdersController } from './orders.controller';
import { OrdersRepository } from './orders.repository';
import { OrdersService } from './orders.service';

@Module({
  imports: [
    SequelizeModule.forFeature([OrderModel]),
    UsersModule,
    InstrumentsModule,
    MarketdataModule,
    PortfolioModule,
  ],
  controllers: [OrdersController],
  providers: [OrdersRepository, OrdersService],
})
export class OrdersModule {}

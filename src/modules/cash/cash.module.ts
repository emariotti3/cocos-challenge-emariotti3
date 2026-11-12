import { Module } from '@nestjs/common';
import { InstrumentsModule } from '../instruments/instruments.module';
import { OrdersModule } from '../orders/orders.module';
import { PortfolioModule } from '../portfolio/portfolio.module';
import { UsersModule } from '../users/users.module';
import { CashController } from './cash.controller';
import { CashService } from './cash.service';

@Module({
  imports: [UsersModule, InstrumentsModule, PortfolioModule, OrdersModule],
  controllers: [CashController],
  providers: [CashService],
})
export class CashModule {}

import { Module } from '@nestjs/common';
import { ThrottlingModule } from './common/throttling/throttling.module';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { InstrumentsModule } from './modules/instruments/instruments.module';
import { OrdersModule } from './modules/orders/orders.module';
import { PortfolioModule } from './modules/portfolio/portfolio.module';
import { UsersModule } from './modules/users/users.module';
import { LoggingModule } from './observability/logging/logging.module';

@Module({
  imports: [
    ConfigModule,
    LoggingModule,
    DatabaseModule,
    ThrottlingModule,
    HealthModule,
    UsersModule,
    InstrumentsModule,
    PortfolioModule,
    OrdersModule,
  ],
})
export class AppModule {}

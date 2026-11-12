import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { InstrumentsModule } from './modules/instruments/instruments.module';
import { LoggingModule } from './observability/logging/logging.module';

@Module({
  imports: [
    ConfigModule,
    LoggingModule,
    DatabaseModule,
    HealthModule,
    InstrumentsModule,
  ],
})
export class AppModule {}

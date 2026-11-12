import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { LoggingModule } from './observability/logging/logging.module';

@Module({
  imports: [
    ConfigModule,
    LoggingModule,
    DatabaseModule,
    HealthModule,
  ],
})
export class AppModule {}

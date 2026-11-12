import { Logger, Module } from '@nestjs/common';
import { SequelizeModule, type SequelizeModuleOptions } from '@nestjs/sequelize';
import { AppConfig } from '../config/app.config';
import { MODELS } from './models';
import { configurePgTypeParsers } from './pg-types';

@Module({
  imports: [
    SequelizeModule.forRootAsync({
      inject: [AppConfig],
      useFactory: (config: AppConfig): SequelizeModuleOptions => {
        configurePgTypeParsers();
        const sqlLogger = new Logger('Sequelize');
        const verbose = config.env.LOG_LEVEL === 'debug' || config.env.LOG_LEVEL === 'trace';
        return {
          dialect: 'postgres',
          uri: config.env.DATABASE_URL,
          models: MODELS,
          autoLoadModels: false,
          synchronize: false,
          timezone: '+00:00',
          logging: verbose ? (sql: string) => sqlLogger.debug(sql) : false,
          benchmark: verbose,
          pool: { max: config.env.DB_POOL_MAX, min: 0, acquire: 30_000, idle: 10_000 },
          define: { timestamps: false, freezeTableName: true },
        };
      },
    }),
  ],
  exports: [SequelizeModule],
})
export class DatabaseModule {}

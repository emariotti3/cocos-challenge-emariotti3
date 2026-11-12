import { Injectable } from '@nestjs/common';
import { type Env, loadDotEnv, parseEnv } from './env.schema';

/**
 * Typed, validated application configuration. Built once at startup; any
 * invalid or missing variable aborts boot with a descriptive error.
 */
@Injectable()
export class AppConfig {
  constructor(readonly env: Env) {}

  static fromProcessEnv(): AppConfig {
    loadDotEnv();
    return new AppConfig(parseEnv());
  }

  get isProduction(): boolean {
    return this.env.NODE_ENV === 'production';
  }

  get isTest(): boolean {
    return this.env.NODE_ENV === 'test';
  }

  /** `true` allows any origin (dev default); otherwise an explicit allow-list. */
  get corsOrigins(): true | string[] {
    if (this.env.CORS_ORIGINS.trim() === '*') return true;
    return this.env.CORS_ORIGINS.split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0);
  }
}

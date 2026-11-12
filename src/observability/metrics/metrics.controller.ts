import { Controller, Get, Header, NotFoundException, Res, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { AppConfig } from '../../config/app.config';
import { MetricsService } from './metrics.service';

@ApiExcludeController()
@SkipThrottle()
@Controller({ path: 'metrics', version: VERSION_NEUTRAL })
export class MetricsController {
  constructor(
    private readonly metrics: MetricsService,
    private readonly config: AppConfig,
  ) {}

  /**
   * Prometheus text exposition. The content type must be the registry's
   * (`text/plain; version=0.0.4`), not Nest's default `text/html`, or
   * Prometheus 3 rejects the scrape. Disabled (404) when METRICS_ENABLED=false.
   */
  @Get()
  @Header('Cache-Control', 'no-store')
  async scrape(@Res({ passthrough: true }) response: Response): Promise<string> {
    if (!this.config.env.METRICS_ENABLED) throw new NotFoundException('Metrics are disabled');
    response.setHeader('Content-Type', this.metrics.contentType);
    return this.metrics.scrape();
  }
}

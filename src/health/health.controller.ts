import { Controller, Get } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Controller('health')
export class HealthController {
  constructor(private readonly dataSource: DataSource) {}

  @Get()
  async check() {
    const uptime = process.uptime();

    try {
      await this.dataSource.query('SELECT 1');
      return {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        checks: {
          database: 'connected',
          uptime,
        },
      };
    } catch {
      return {
        status: 'degraded',
        timestamp: new Date().toISOString(),
        checks: {
          database: 'disconnected',
          uptime,
        },
      };
    }
  }
}

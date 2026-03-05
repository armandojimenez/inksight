import { Controller, Get, Res } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Response } from 'express';
import { DataSource } from 'typeorm';
import { HealthResponseSchema } from '@/common/swagger/health-response.schema';
import { ErrorResponseSchema } from '@/common/swagger/error-response.schema';

@ApiTags('Health')
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(private readonly dataSource: DataSource) {}

  @Get()
  @ApiOperation({
    summary: 'Check application health',
    description:
      'Performs an active database connectivity check via `SELECT 1` and returns system status with uptime. ' +
      'Exempt from rate limiting.',
  })
  @ApiResponse({
    status: 200,
    description: 'System is healthy — database connected',
    type: HealthResponseSchema,
  })
  @ApiResponse({
    status: 503,
    description: 'System is degraded — database disconnected',
    type: HealthResponseSchema,
  })
  async check(@Res() res: Response) {
    const uptime = process.uptime();

    try {
      await this.dataSource.query('SELECT 1');
      res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        checks: {
          database: 'connected',
          uptime,
        },
      });
    } catch {
      res.status(503).json({
        status: 'degraded',
        timestamp: new Date().toISOString(),
        checks: {
          database: 'disconnected',
          uptime,
        },
      });
    }
  }
}

import { ApiProperty } from '@nestjs/swagger';

class HealthChecksSchema {
  @ApiProperty({
    description: 'Database connectivity status',
    enum: ['connected', 'disconnected'],
    example: 'connected',
  })
  database!: string;

  @ApiProperty({
    description: 'Process uptime in seconds',
    example: 1234.56,
  })
  uptime!: number;
}

export class HealthResponseSchema {
  @ApiProperty({
    description: 'Overall system status',
    enum: ['healthy', 'degraded'],
    example: 'healthy',
  })
  status!: string;

  @ApiProperty({
    description: 'ISO 8601 timestamp',
    example: '2026-03-04T10:30:00.000Z',
  })
  timestamp!: string;

  @ApiProperty({ type: HealthChecksSchema })
  checks!: HealthChecksSchema;
}

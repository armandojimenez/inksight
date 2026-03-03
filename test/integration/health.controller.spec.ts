import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { HealthController } from '@/health/health.controller';
import { HttpExceptionFilter } from '@/common/filters/http-exception.filter';
import { LoggingInterceptor } from '@/common/interceptors/logging.interceptor';

describe('HealthController (integration)', () => {
  let app: INestApplication;
  let mockDataSource: { query: jest.Mock };

  beforeEach(async () => {
    mockDataSource = {
      query: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: DataSource, useValue: mockDataSource }],
    }).compile();

    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalInterceptors(new LoggingInterceptor());
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET /api/health should return 200 with healthy status', async () => {
    const res = await request(app.getHttpServer()).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'healthy');
    expect(res.body).toHaveProperty('timestamp');
    expect(new Date(res.body.timestamp).toISOString()).toBe(
      res.body.timestamp,
    );
    expect(res.body.checks).toHaveProperty('database', 'connected');
    expect(res.body.checks).toHaveProperty('uptime');
    expect(typeof res.body.checks.uptime).toBe('number');
  });

  it('should include X-Request-Id header in UUID format', async () => {
    const res = await request(app.getHttpServer()).get('/api/health');

    const requestId = res.headers['x-request-id'];
    expect(requestId).toBeDefined();
    expect(requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it('should return degraded status when database probe fails', async () => {
    mockDataSource.query.mockRejectedValue(new Error('connection refused'));

    const res = await request(app.getHttpServer()).get('/api/health');

    expect(res.status).toBe(503);
    expect(res.body).toHaveProperty('status', 'degraded');
    expect(res.body.checks).toHaveProperty('database', 'disconnected');
    expect(res.body.checks).toHaveProperty('uptime');
  });
});

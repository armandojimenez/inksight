import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, Controller, Get } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, SkipThrottle, Throttle } from '@nestjs/throttler';
import * as request from 'supertest';
import { setupTestApp } from '../helpers/setup-test-app';
import { CustomThrottlerGuard } from '@/common/guards/custom-throttler.guard';

// Minimal test controller with rate limit routes
@Controller('rate-test')
class RateLimitTestController {
  @Get('default')
  getDefault() {
    return { ok: true };
  }

  @Throttle({ default: { limit: 2, ttl: 60000 } })
  @Get('strict')
  getStrict() {
    return { ok: true };
  }

  @SkipThrottle()
  @Get('skipped')
  getSkipped() {
    return { ok: true };
  }
}

describe('Rate Limiting (integration)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        ThrottlerModule.forRoot({
          throttlers: [{ name: 'default', ttl: 60000, limit: 3 }],
        }),
      ],
      controllers: [RateLimitTestController],
      providers: [
        { provide: APP_GUARD, useClass: CustomThrottlerGuard },
      ],
    }).compile();

    app = module.createNestApplication();
    setupTestApp(app);
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('should allow requests within the default limit', async () => {
    const res = await request(app.getHttpServer()).get('/api/rate-test/default');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('should return 429 after exceeding the default limit', async () => {
    const server = app.getHttpServer();
    for (let i = 0; i < 3; i++) {
      await request(server).get('/api/rate-test/default');
    }
    const res = await request(server).get('/api/rate-test/default');
    expect(res.status).toBe(429);
    expect(res.body).toHaveProperty('code', 'RATE_LIMIT_EXCEEDED');
  });

  it('should use per-route @Throttle() override', async () => {
    const server = app.getHttpServer();
    // Strict limit is 2
    await request(server).get('/api/rate-test/strict');
    await request(server).get('/api/rate-test/strict');

    const res = await request(server).get('/api/rate-test/strict');
    expect(res.status).toBe(429);
  });

  it('should not rate-limit routes with @SkipThrottle()', async () => {
    const server = app.getHttpServer();
    for (let i = 0; i < 10; i++) {
      const res = await request(server).get('/api/rate-test/skipped');
      expect(res.status).toBe(200);
    }
  });

  it('should return consistent error shape on 429', async () => {
    const server = app.getHttpServer();
    for (let i = 0; i < 3; i++) {
      await request(server).get('/api/rate-test/default');
    }
    const res = await request(server).get('/api/rate-test/default');

    expect(res.status).toBe(429);
    expect(res.body).toHaveProperty('statusCode', 429);
    expect(res.body).toHaveProperty('error');
    expect(res.body).toHaveProperty('code', 'RATE_LIMIT_EXCEEDED');
    expect(res.body).toHaveProperty('message');
    expect(res.body).toHaveProperty('timestamp');
    expect(res.body).toHaveProperty('path');
    expect(res.body).toHaveProperty('requestId');
  });

  it('should include Retry-After header on 429', async () => {
    const server = app.getHttpServer();
    for (let i = 0; i < 3; i++) {
      await request(server).get('/api/rate-test/default');
    }
    const res = await request(server).get('/api/rate-test/default');
    expect(res.status).toBe(429);
    // ThrottlerGuard sets retry-after header
    expect(res.headers['retry-after']).toBeDefined();
  });

  it('should track different endpoints independently', async () => {
    const server = app.getHttpServer();
    // Hit default 3 times (exhaust)
    for (let i = 0; i < 3; i++) {
      await request(server).get('/api/rate-test/default');
    }

    // Strict should still have its own counter
    const res = await request(server).get('/api/rate-test/strict');
    expect(res.status).toBe(200);
  });

  it('should include requestId in 429 error body', async () => {
    const server = app.getHttpServer();
    for (let i = 0; i < 3; i++) {
      await request(server).get('/api/rate-test/default');
    }
    const res = await request(server).get('/api/rate-test/default');
    expect(res.status).toBe(429);
    expect(res.body).toHaveProperty('requestId');
  });
});

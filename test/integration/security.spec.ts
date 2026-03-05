import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DataSource } from 'typeorm';
import * as request from 'supertest';
import { HealthController } from '@/health/health.controller';
import { setupTestApp } from '../helpers/setup-test-app';

describe('Security hardening (integration)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true })],
      controllers: [HealthController],
      providers: [
        { provide: DataSource, useValue: { query: jest.fn().mockResolvedValue([]) } },
      ],
    }).compile();

    app = module.createNestApplication();
    setupTestApp(app);
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('helmet headers', () => {
    it('should set X-Content-Type-Options: nosniff', async () => {
      const res = await request(app.getHttpServer()).get('/api/health');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
    });

    it('should set X-Frame-Options', async () => {
      const res = await request(app.getHttpServer()).get('/api/health');
      expect(res.headers['x-frame-options']).toBeDefined();
    });

    it('should remove X-Powered-By header', async () => {
      const res = await request(app.getHttpServer()).get('/api/health');
      expect(res.headers['x-powered-by']).toBeUndefined();
    });

    it('should set Content-Security-Policy header', async () => {
      const res = await request(app.getHttpServer()).get('/api/health');
      expect(res.headers['content-security-policy']).toBeDefined();
    });
  });

  describe('error responses', () => {
    it('should not expose stack traces on 404', async () => {
      const res = await request(app.getHttpServer()).get('/api/nonexistent');
      expect(res.status).toBe(404);
      expect(res.body).not.toHaveProperty('stack');
      expect(JSON.stringify(res.body)).not.toContain('.ts:');
      expect(JSON.stringify(res.body)).not.toContain('.js:');
    });

    it('should return consistent 404 error shape', async () => {
      const res = await request(app.getHttpServer()).get('/api/nonexistent');
      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('statusCode', 404);
      expect(res.body).toHaveProperty('error');
      expect(res.body).toHaveProperty('code');
      expect(res.body).toHaveProperty('message');
      expect(res.body).toHaveProperty('timestamp');
      expect(res.body).toHaveProperty('path');
      expect(res.body).toHaveProperty('requestId');
    });
  });

  describe('request tracking', () => {
    it('should include X-Request-Id on all responses', async () => {
      const res = await request(app.getHttpServer()).get('/api/health');
      expect(res.headers['x-request-id']).toBeDefined();
      expect(res.headers['x-request-id']).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    });

    it('should echo back a valid X-Request-Id', async () => {
      const customId = 'my-test-request-id';
      const res = await request(app.getHttpServer())
        .get('/api/health')
        .set('X-Request-Id', customId);
      expect(res.headers['x-request-id']).toBe(customId);
    });

    it('should include requestId in error response body', async () => {
      const res = await request(app.getHttpServer()).get('/api/nonexistent');
      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('requestId');
    });
  });

  describe('CORS', () => {
    it('should allow CORS in development mode', async () => {
      const res = await request(app.getHttpServer())
        .options('/api/health')
        .set('Origin', 'http://localhost:5173')
        .set('Access-Control-Request-Method', 'GET');
      // In dev mode, CORS is open (origin: true)
      expect(res.headers['access-control-allow-origin']).toBeDefined();
    });
  });
});

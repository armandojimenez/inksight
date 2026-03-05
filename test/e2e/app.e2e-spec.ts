import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_FILTER, APP_INTERCEPTOR, APP_GUARD } from '@nestjs/core';
import * as request from 'supertest';
import * as http from 'http';
import * as fs from 'fs/promises';
import * as path from 'path';
import { DataSource } from 'typeorm';

import { HealthModule } from '@/health/health.module';
import { UploadModule } from '@/upload/upload.module';
import { ChatModule } from '@/chat/chat.module';
import { AiModule } from '@/ai/ai.module';
import { HistoryModule } from '@/history/history.module';
import { CacheModule } from '@/cache/cache.module';
import { DatabaseModule } from '@/database/database.module';
import { ImageEntity } from '@/upload/entities/image.entity';
import { ChatMessageEntity } from '@/history/entities/chat-message.entity';
import { HttpExceptionFilter } from '@/common/filters/http-exception.filter';
import { LoggingInterceptor } from '@/common/interceptors/logging.interceptor';
import { CustomThrottlerGuard } from '@/common/guards/custom-throttler.guard';
import { migrations } from '@/database/migrations';
import { setupApp } from '@/common/setup-app';
import { createMinimalPng, createMinimalJpeg } from '../fixtures/image-buffers';
import { OpenAiStreamChunk } from '@/ai/interfaces/openai-stream-chunk.interface';

const E2E_UPLOAD_DIR = 'test-uploads-e2e';
const E2E_DB_URL = process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/inksight_test';

/**
 * Build the full AppModule equivalent for E2E tests.
 *
 * We reconstruct the module manually (instead of importing AppModule) so we can:
 * 1. Use a test-specific upload directory
 * 2. Skip ServeStaticModule (no client build needed)
 * 3. Disable cleanup scheduler
 * 4. Use high rate limits to avoid interfering with tests (except rate-limit test)
 */
async function createE2eApp(overrides?: {
  rateLimitMax?: number;
  rateLimitTtl?: number;
  enableThrottler?: boolean;
}): Promise<INestApplication> {
  const rateLimitMax = overrides?.rateLimitMax ?? 10000;
  const rateLimitTtl = overrides?.rateLimitTtl ?? 60000;
  const enableThrottler = overrides?.enableThrottler ?? false;

  const module: TestingModule = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        load: [
          () => ({
            PORT: 0,
            NODE_ENV: 'test',
            DATABASE_URL: E2E_DB_URL,
            UPLOAD_DIR: E2E_UPLOAD_DIR,
            MAX_FILE_SIZE: 16 * 1024 * 1024,
            RATE_LIMIT_TTL: rateLimitTtl,
            RATE_LIMIT_MAX: rateLimitMax,
            ALLOWED_ORIGIN: undefined,
            MAX_SSE_PER_IP: 10,
            CLEANUP_ENABLED: false,
            CLEANUP_IMAGE_TTL_MS: 86400000,
            CLEANUP_TEMP_TTL_MS: 3600000,
            STREAM_CHUNK_DELAY_MS: '0',
          }),
        ],
      }),
      ThrottlerModule.forRootAsync({
        inject: [ConfigService],
        useFactory: (config: ConfigService) => ({
          throttlers: [
            {
              name: 'default',
              ttl: config.get<number>('RATE_LIMIT_TTL', rateLimitTtl),
              limit: config.get<number>('RATE_LIMIT_MAX', rateLimitMax),
            },
          ],
        }),
      }),
      ScheduleModule.forRoot(),
      TypeOrmModule.forRoot({
        type: 'postgres',
        url: E2E_DB_URL,
        entities: [ImageEntity, ChatMessageEntity],
        synchronize: false,
        migrations,
        migrationsRun: true,
        retryAttempts: 3,
        retryDelay: 1000,
      }),
      HealthModule,
      UploadModule,
      ChatModule,
      AiModule,
      HistoryModule,
      CacheModule,
      DatabaseModule,
    ],
    providers: [
      { provide: APP_FILTER, useClass: HttpExceptionFilter },
      { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
      ...(enableThrottler
        ? [{ provide: APP_GUARD, useClass: CustomThrottlerGuard }]
        : []),
    ],
  }).compile();

  const app = module.createNestApplication();
  setupApp(app);
  await app.init();
  return app;
}

/**
 * Clean all rows from images and chat_messages tables.
 */
async function cleanDatabase(app: INestApplication): Promise<void> {
  const dataSource = app.get(DataSource);
  await dataSource.query('DELETE FROM chat_messages');
  await dataSource.query('DELETE FROM images');
}

/**
 * Clean the e2e upload directory.
 */
async function cleanUploads(): Promise<void> {
  await fs.rm(E2E_UPLOAD_DIR, { recursive: true, force: true }).catch(() => {});
}

/**
 * Upload a PNG image and return the response body.
 */
async function uploadImage(
  server: http.Server,
  filename = 'test.png',
): Promise<{ id: string; filename: string; mimeType: string; size: number; analysis: unknown }> {
  const res = await request(server)
    .post('/api/upload')
    .attach('image', createMinimalPng(), filename);
  expect(res.status).toBe(201);
  return res.body;
}

/**
 * Parse SSE events from raw response body.
 */
function parseSSE(raw: string): string[] {
  return raw
    .split('\n\n')
    .flatMap((block) => {
      const lines = block.split('\n').filter((l) => l.startsWith('data: '));
      return lines.map((l) => l.slice('data: '.length));
    })
    .filter(Boolean);
}

/**
 * Make a raw HTTP request for SSE and collect the full response body.
 */
async function sseRequest(
  server: http.Server,
  urlPath: string,
  body: Record<string, unknown>,
): Promise<{ status: number; headers: Record<string, string>; body: string }> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const addr = server.address() as { port: number };

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: addr.port,
        path: urlPath,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': String(Buffer.byteLength(payload)),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          const respHeaders: Record<string, string> = {};
          for (const [key, val] of Object.entries(res.headers)) {
            if (typeof val === 'string') respHeaders[key] = val;
          }
          resolve({
            status: res.statusCode ?? 0,
            headers: respHeaders,
            body: Buffer.concat(chunks).toString(),
          });
        });
      },
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// ─── E2E Test Suite ──────────────────────────────────────────────────────────

describe('Inksight E2E', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.STREAM_CHUNK_DELAY_MS = '0';
    app = await createE2eApp();
    await app.listen(0);
    await cleanDatabase(app);
    await cleanUploads();
  }, 30000);

  afterAll(async () => {
    await cleanDatabase(app);
    await cleanUploads();
    await app.close();
    delete process.env.STREAM_CHUNK_DELAY_MS;
  }, 15000);

  afterEach(async () => {
    await cleanDatabase(app);
    await cleanUploads();
  });

  // ─── Scenario 1: Full upload → chat → history journey ───────────────────

  it('should complete the full upload → chat → history flow', async () => {
    const server = app.getHttpServer();

    // Step 1: Upload
    const uploaded = await uploadImage(server, 'journey.png');
    expect(uploaded.id).toBeDefined();
    expect(uploaded.analysis).toBeDefined();

    // Step 2: Chat
    const chatRes = await request(server)
      .post(`/api/chat/${uploaded.id}`)
      .send({ message: 'What objects do you see?' });

    expect(chatRes.status).toBe(200);
    expect(chatRes.body).toHaveProperty('object', 'chat.completion');
    expect(chatRes.body.choices[0].message.role).toBe('assistant');
    expect(chatRes.body.choices[0].message.content.length).toBeGreaterThan(0);

    // Step 3: Verify history has both user + assistant messages
    const historyRes = await request(server)
      .get(`/api/chat/${uploaded.id}/history`);

    expect(historyRes.status).toBe(200);
    expect(historyRes.body.totalMessages).toBe(2);
    expect(historyRes.body.messages[0].role).toBe('user');
    expect(historyRes.body.messages[0].content).toBe('What objects do you see?');
    expect(historyRes.body.messages[1].role).toBe('assistant');
    expect(historyRes.body.messages[1].content.length).toBeGreaterThan(0);
  });

  // ─── Scenario 2: Upload → stream → verify response from chunks ─────────

  it('should stream a response and produce coherent text from chunks', async () => {
    const server = app.getHttpServer();

    const uploaded = await uploadImage(server, 'stream.png');

    const res = await sseRequest(server, `/api/chat-stream/${uploaded.id}`, {
      message: 'Describe this image',
    });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('text/event-stream');

    const events = parseSSE(res.body);
    expect(events).toContain('[DONE]');

    // Reconstruct full response from chunks
    const fullText = events
      .filter((e) => e !== '[DONE]')
      .map((e) => JSON.parse(e))
      .map((c: OpenAiStreamChunk) => c.choices[0]?.delta.content ?? '')
      .join('');

    expect(fullText.length).toBeGreaterThan(0);

    // Verify first chunk has role
    const firstChunk = JSON.parse(events[0]!);
    expect(firstChunk.choices[0].delta.role).toBe('assistant');

    // Verify last JSON chunk has finish_reason = 'stop'
    const jsonEvents = events.filter((e) => e !== '[DONE]');
    const lastChunk = JSON.parse(jsonEvents[jsonEvents.length - 1]!);
    expect(lastChunk.choices[0].finish_reason).toBe('stop');
  });

  // ─── Scenario 3: Multiple chats → history grows + pagination ────────────

  it('should grow history with multiple chats and support pagination', async () => {
    const server = app.getHttpServer();

    const uploaded = await uploadImage(server, 'multi-chat.png');

    // Send 3 chat messages
    for (let i = 1; i <= 3; i++) {
      const res = await request(server)
        .post(`/api/chat/${uploaded.id}`)
        .send({ message: `Question ${i}` });
      expect(res.status).toBe(200);
    }

    // History should have 6 messages (3 user + 3 assistant)
    const historyRes = await request(server)
      .get(`/api/chat/${uploaded.id}/history`);

    expect(historyRes.status).toBe(200);
    expect(historyRes.body.totalMessages).toBe(6);

    // Verify pagination with limit=2
    const page1 = await request(server)
      .get(`/api/chat/${uploaded.id}/history?page=1&limit=2`);

    expect(page1.status).toBe(200);
    expect(page1.body.messages).toHaveLength(2);
    expect(page1.body.totalMessages).toBe(6);
    expect(page1.body.totalPages).toBe(3);
    expect(page1.body.page).toBe(1);
  });

  // ─── Scenario 4: Independent image histories ───────────────────────────

  it('should maintain independent histories for different images', async () => {
    const server = app.getHttpServer();

    const img1 = await uploadImage(server, 'image1.png');
    const img2 = await uploadImage(server, 'image2.png');

    // Chat on image 1
    await request(server)
      .post(`/api/chat/${img1.id}`)
      .send({ message: 'Describe image 1' });

    // Chat on image 2 twice
    await request(server)
      .post(`/api/chat/${img2.id}`)
      .send({ message: 'Describe image 2' });
    await request(server)
      .post(`/api/chat/${img2.id}`)
      .send({ message: 'Tell me more about image 2' });

    // Image 1: 2 messages (1 user + 1 assistant)
    const history1 = await request(server)
      .get(`/api/chat/${img1.id}/history`);
    expect(history1.body.totalMessages).toBe(2);

    // Image 2: 4 messages (2 user + 2 assistant)
    const history2 = await request(server)
      .get(`/api/chat/${img2.id}/history`);
    expect(history2.body.totalMessages).toBe(4);
  });

  // ─── Scenario 5: Delete image → cascade cleanup ────────────────────────

  it('should cascade delete: 404 on history, chat, and file removed', async () => {
    const server = app.getHttpServer();

    const uploaded = await uploadImage(server, 'delete-me.png');

    // Chat to create history
    await request(server)
      .post(`/api/chat/${uploaded.id}`)
      .send({ message: 'Before delete' });

    // Verify file exists on disk
    const files = await fs.readdir(E2E_UPLOAD_DIR);
    expect(files.filter((f) => !f.startsWith('.')).length).toBe(1);

    // Delete
    const deleteRes = await request(server)
      .delete(`/api/images/${uploaded.id}`);
    expect(deleteRes.status).toBe(204);

    // History → 404
    const historyRes = await request(server)
      .get(`/api/chat/${uploaded.id}/history`);
    expect(historyRes.status).toBe(404);
    expect(historyRes.body.code).toBe('IMAGE_NOT_FOUND');

    // Chat → 404
    const chatRes = await request(server)
      .post(`/api/chat/${uploaded.id}`)
      .send({ message: 'After delete' });
    expect(chatRes.status).toBe(404);

    // File removed from disk
    const remainingFiles = await fs.readdir(E2E_UPLOAD_DIR).catch(() => []);
    const imageFiles = (remainingFiles as string[]).filter((f) => !f.startsWith('.'));
    expect(imageFiles.length).toBe(0);
  });

  // ─── Scenario 6: Invalid file upload ───────────────────────────────────

  it('should reject invalid file uploads with proper error response', async () => {
    const server = app.getHttpServer();

    // Text file → 415
    const txtRes = await request(server)
      .post('/api/upload')
      .attach('image', Buffer.from('not an image'), 'readme.txt');
    expect(txtRes.status).toBe(415);
    expect(txtRes.body.code).toBe('INVALID_FILE_TYPE');
    expect(txtRes.body).toHaveProperty('requestId');

    // No file → 400
    const noFileRes = await request(server).post('/api/upload');
    expect(noFileRes.status).toBe(400);
    expect(noFileRes.body.code).toBe('MISSING_FILE');
  });

  // ─── Scenario 7: Chat on nonexistent image → 404 ──────────────────────

  it('should return 404 when chatting on a nonexistent image', async () => {
    const server = app.getHttpServer();
    const fakeId = '00000000-0000-4000-8000-000000000000';

    const res = await request(server)
      .post(`/api/chat/${fakeId}`)
      .send({ message: 'Hello' });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('IMAGE_NOT_FOUND');
    expect(res.body).toHaveProperty('statusCode', 404);
    expect(res.body).toHaveProperty('error');
    expect(res.body).toHaveProperty('message');
    expect(res.body).toHaveProperty('timestamp');
    expect(res.body).toHaveProperty('path');
    expect(res.body).toHaveProperty('requestId');
  });

  // ─── Scenario 8: Whitespace-only message → 400 ─────────────────────────

  it('should reject whitespace-only messages with 400', async () => {
    const server = app.getHttpServer();
    const uploaded = await uploadImage(server, 'ws-test.png');

    const res = await request(server)
      .post(`/api/chat/${uploaded.id}`)
      .send({ message: '   \t\n  ' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_MESSAGE');
  });

  // ─── Scenario 9: Non-UUID imageId → 400 ────────────────────────────────

  it('should reject non-UUID imageId with 400', async () => {
    const server = app.getHttpServer();

    const chatRes = await request(server)
      .post('/api/chat/not-a-uuid')
      .send({ message: 'Hello' });
    expect(chatRes.status).toBe(400);
    expect(chatRes.body.code).toBe('INVALID_UUID');

    const streamRes = await request(server)
      .post('/api/chat-stream/not-a-uuid')
      .send({ message: 'Hello' });
    expect(streamRes.status).toBe(400);
    expect(streamRes.body.code).toBe('INVALID_UUID');

    const historyRes = await request(server)
      .get('/api/chat/not-a-uuid/history');
    expect(historyRes.status).toBe(400);
    expect(historyRes.body.code).toBe('INVALID_UUID');
  });

  // ─── Scenario 10: Health check ──────────────────────────────────────────

  it('should report database status in health check', async () => {
    const server = app.getHttpServer();

    const res = await request(server).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'healthy');
    expect(res.body).toHaveProperty('timestamp');
    expect(res.body.checks).toHaveProperty('database', 'connected');
    expect(res.body.checks).toHaveProperty('uptime');
    expect(res.body.checks.uptime).toBeGreaterThan(0);
  });

  // ─── Scenario 11: Concurrent streams ───────────────────────────────────

  it('should complete concurrent streams on different images independently', async () => {
    const server = app.getHttpServer();

    const img1 = await uploadImage(server, 'concurrent1.png');
    const img2 = await uploadImage(server, 'concurrent2.png');

    const [res1, res2] = await Promise.all([
      sseRequest(server, `/api/chat-stream/${img1.id}`, {
        message: 'Describe image 1',
      }),
      sseRequest(server, `/api/chat-stream/${img2.id}`, {
        message: 'Describe image 2',
      }),
    ]);

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);

    const events1 = parseSSE(res1.body);
    const events2 = parseSSE(res2.body);

    expect(events1).toContain('[DONE]');
    expect(events2).toContain('[DONE]');

    // Both should produce non-empty content
    const text1 = events1
      .filter((e) => e !== '[DONE]')
      .map((e) => JSON.parse(e))
      .map((c: OpenAiStreamChunk) => c.choices[0]?.delta.content ?? '')
      .join('');
    const text2 = events2
      .filter((e) => e !== '[DONE]')
      .map((e) => JSON.parse(e))
      .map((c: OpenAiStreamChunk) => c.choices[0]?.delta.content ?? '')
      .join('');

    expect(text1.length).toBeGreaterThan(0);
    expect(text2.length).toBeGreaterThan(0);
  });

  // ─── Scenario 12: Gallery + image metadata ─────────────────────────────

  it('should list uploaded images in gallery and show correct metadata', async () => {
    const server = app.getHttpServer();

    // Upload two images
    const img1 = await uploadImage(server, 'gallery1.png');
    const img2Res = await request(server)
      .post('/api/upload')
      .attach('image', createMinimalJpeg(), 'gallery2.jpg');
    expect(img2Res.status).toBe(201);

    // Chat on img1 to create messages
    await request(server)
      .post(`/api/chat/${img1.id}`)
      .send({ message: 'Gallery test' });

    const galleryRes = await request(server).get('/api/images');

    expect(galleryRes.status).toBe(200);
    expect(galleryRes.body.total).toBe(2);
    expect(galleryRes.body.images).toHaveLength(2);

    // Verify each image has expected fields
    for (const img of galleryRes.body.images) {
      expect(img).toHaveProperty('id');
      expect(img).toHaveProperty('originalFilename');
      expect(img).toHaveProperty('mimeType');
      expect(img).toHaveProperty('size');
      expect(img).toHaveProperty('createdAt');
      expect(img).toHaveProperty('messageCount');
      // Internal paths must not be exposed
      expect(img).not.toHaveProperty('uploadPath');
      expect(img).not.toHaveProperty('storedFilename');
    }

    // img1 should have 2 messages (user + assistant)
    const img1Gallery = galleryRes.body.images.find(
      (i: { id: string }) => i.id === img1.id,
    );
    expect(img1Gallery.messageCount).toBe(2);
  });
});

// ─── Rate Limit E2E (separate app instance with low limit) ──────────────

describe('Inksight E2E — Rate Limiting', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.STREAM_CHUNK_DELAY_MS = '0';
    app = await createE2eApp({ rateLimitMax: 3, enableThrottler: true });
    await app.listen(0);
    await cleanDatabase(app);
    await cleanUploads();
  }, 30000);

  afterAll(async () => {
    await cleanDatabase(app);
    await cleanUploads();
    await app.close();
    delete process.env.STREAM_CHUNK_DELAY_MS;
  }, 15000);

  it('should return 429 after exceeding rate limit', async () => {
    const server = app.getHttpServer();

    // Exhaust default limit (3 requests)
    for (let i = 0; i < 3; i++) {
      await request(server).get('/api/images');
    }

    // 4th request → 429
    const res = await request(server).get('/api/images');

    expect(res.status).toBe(429);
    expect(res.body.code).toBe('RATE_LIMIT_EXCEEDED');
    expect(res.body).toHaveProperty('statusCode', 429);
    expect(res.body).toHaveProperty('error');
    expect(res.body).toHaveProperty('message');
    expect(res.body).toHaveProperty('timestamp');
    expect(res.body).toHaveProperty('path');
    expect(res.body).toHaveProperty('requestId');
  });
});

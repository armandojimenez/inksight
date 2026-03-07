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
import * as Joi from 'joi';
import { DataSource } from 'typeorm';

import { HealthModule } from '@/health/health.module';
import { UploadModule } from '@/upload/upload.module';
import { ChatModule } from '@/chat/chat.module';
import { AiModule } from '@/ai/ai.module';
import { HistoryModule } from '@/history/history.module';
import { CacheModule } from '@/cache/cache.module';
import { CleanupModule } from '@/cleanup/cleanup.module';
import { DatabaseModule } from '@/database/database.module';
import { HttpExceptionFilter } from '@/common/filters/http-exception.filter';
import { LoggingInterceptor } from '@/common/interceptors/logging.interceptor';
import { CustomThrottlerGuard } from '@/common/guards/custom-throttler.guard';
import { ThrottlerStorage } from '@nestjs/throttler';
import { migrations } from '@/database/migrations';
import { setupApp } from '@/common/setup-app';
import {
  createMinimalPng,
  createMinimalJpeg,
  createMinimalGif,
  createFakeImageBuffer,
} from '../fixtures/image-buffers';
import { OpenAiStreamChunk } from '@/ai/interfaces/openai-stream-chunk.interface';

// P3-2: Absolute path to avoid CWD-dependent resolution
const E2E_UPLOAD_DIR = path.resolve(process.cwd(), 'test-uploads-e2e');
const E2E_UPLOAD_DIR_RATE = path.resolve(process.cwd(), 'test-uploads-e2e-rate');
const E2E_DB_URL = process.env.DATABASE_URL || 'postgres://inksight:inksight_dev@localhost:5432/inksight';

/**
 * Build the full AppModule equivalent for E2E tests.
 *
 * Reconstructed manually (instead of importing AppModule) so we can:
 * 1. Use a test-specific upload directory
 * 2. Skip ServeStaticModule (no client build needed)
 * 3. Use configurable rate limits per describe block
 */
async function createE2eApp(overrides?: {
  rateLimitMax?: number;
  rateLimitTtl?: number;
  uploadDir?: string;
}): Promise<INestApplication> {
  const rateLimitMax = overrides?.rateLimitMax ?? 10000;
  const rateLimitTtl = overrides?.rateLimitTtl ?? 1000;
  const uploadDir = overrides?.uploadDir ?? E2E_UPLOAD_DIR;

  // Multer's diskStorage reads process.env.UPLOAD_DIR at module load (before DI).
  // Must match the ConfigService value so temp files land in the same directory.
  process.env.UPLOAD_DIR = uploadDir;

  const module: TestingModule = await Test.createTestingModule({
    imports: [
      // P2-10: Include Joi validationSchema to match production
      ConfigModule.forRoot({
        isGlobal: true,
        envFilePath: [], // Don't load .env files in E2E
        validationSchema: Joi.object({
          PORT: Joi.number().min(1).max(65535).default(3000),
          NODE_ENV: Joi.string()
            .valid('development', 'production', 'test')
            .default('development'),
          DATABASE_URL: Joi.string().required(),
          UPLOAD_DIR: Joi.string()
            .pattern(/^[a-zA-Z0-9._/\-]+$/)
            .default('uploads'),
          MAX_FILE_SIZE: Joi.number().min(1).default(16777216),
          RATE_LIMIT_TTL: Joi.number().min(1000).default(60000),
          RATE_LIMIT_MAX: Joi.number().min(1).default(100),
          ALLOWED_ORIGIN: Joi.string().optional(),
          MAX_SSE_PER_IP: Joi.number().min(1).default(5),
          CLEANUP_ENABLED: Joi.boolean().default(true),
          CLEANUP_IMAGE_TTL_MS: Joi.number().min(60000).default(86400000),
          CLEANUP_TEMP_TTL_MS: Joi.number().min(10000).default(3600000),
        }),
        load: [
          () => ({
            PORT: 0,
            NODE_ENV: 'test',
            DATABASE_URL: E2E_DB_URL,
            UPLOAD_DIR: uploadDir,
            MAX_FILE_SIZE: 16 * 1024 * 1024,
            RATE_LIMIT_TTL: rateLimitTtl,
            RATE_LIMIT_MAX: rateLimitMax,
            ALLOWED_ORIGIN: undefined,
            MAX_SSE_PER_IP: 10,
            CLEANUP_ENABLED: false,
            CLEANUP_IMAGE_TTL_MS: 86400000,
            CLEANUP_TEMP_TTL_MS: 3600000,
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
        // P1-2: Match production — autoLoadEntities instead of hardcoded list
        autoLoadEntities: true,
        synchronize: false,
        migrations,
        migrationsRun: true,
        // Lower retries for fast-fail in tests (production: 10/3000)
        retryAttempts: 3,
        retryDelay: 1000,
        // P1-3: Match production pool/timeout config
        extra: {
          max: 5,
          idleTimeoutMillis: 10000,
          connectionTimeoutMillis: 5000,
          statement_timeout: 10000,
        },
      }),
      HealthModule,
      UploadModule,
      ChatModule,
      AiModule,
      HistoryModule,
      CacheModule,
      // P1-1: Include CleanupModule — CLEANUP_ENABLED=false prevents cron execution
      CleanupModule,
      DatabaseModule,
    ],
    providers: [
      { provide: APP_FILTER, useClass: HttpExceptionFilter },
      { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
      // P1-6: Always register throttler guard (matching production).
      // Use high rateLimitMax for main suite to avoid interfering with tests.
      { provide: APP_GUARD, useClass: CustomThrottlerGuard },
    ],
  }).compile();

  const app = module.createNestApplication();
  setupApp(app);
  await app.init();
  return app;
}

/**
 * Clean all rows from images and chat_messages tables.
 * P2-9: TRUNCATE CASCADE handles FK ordering automatically.
 */
async function cleanDatabase(app: INestApplication): Promise<void> {
  const dataSource = app.get(DataSource);
  await dataSource.query('TRUNCATE TABLE images, chat_messages CASCADE');
}

/**
 * Clean the e2e upload directory.
 */
async function cleanUploadDir(dir: string): Promise<void> {
  await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  await fs.mkdir(dir, { recursive: true });
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
 * Assumes single-line data fields per event — valid for mock AI output.
 * Does not handle multi-line SSE data (consecutive data: lines within one block).
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
 * Extract concatenated text from parsed SSE events.
 */
function extractStreamText(events: string[]): string {
  return events
    .filter((e) => e !== '[DONE]')
    .map((e) => JSON.parse(e))
    .map((c: OpenAiStreamChunk) => c.choices[0]?.delta.content ?? '')
    .join('');
}

/**
 * Make a raw HTTP request for SSE and collect the full response body.
 * P2-12: Includes a 10s socket timeout to prevent hanging on stuck streams.
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
          clearTimeout(timeout);
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

    const timeout = setTimeout(() => {
      req.destroy();
      reject(new Error(`sseRequest timed out after 10s for ${urlPath}`));
    }, 10000);

    req.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
    req.write(payload);
    req.end();
  });
}

// ─── E2E Test Suite ──────────────────────────────────────────────────────────

describe('Inksight E2E', () => {
  let app: INestApplication;

  beforeAll(async () => {
    // MockAiService reads STREAM_CHUNK_DELAY_MS from process.env directly
    // (not ConfigService), so we must set it here.
    process.env.STREAM_CHUNK_DELAY_MS = '0';
    app = await createE2eApp();
    await app.listen(0);
    await cleanDatabase(app);
    await cleanUploadDir(E2E_UPLOAD_DIR);
  }, 30000);

  afterAll(async () => {
    await cleanDatabase(app);
    await cleanUploadDir(E2E_UPLOAD_DIR);
    await app.close();
    delete process.env.STREAM_CHUNK_DELAY_MS;
  }, 15000);

  afterEach(async () => {
    await cleanDatabase(app);
    await cleanUploadDir(E2E_UPLOAD_DIR);
    // Reset throttler counters between tests so per-route @Throttle limits don't accumulate
    const throttlerStorage = app.get<ThrottlerStorage>(ThrottlerStorage);
    (throttlerStorage as unknown as { storage: Map<string, unknown> }).storage.clear();
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

    // Step 3: Verify history — full PRD response shape (P2-1)
    // Upload persists initial analysis as first assistant message (+1)
    const historyRes = await request(server)
      .get(`/api/chat/${uploaded.id}/history`);

    expect(historyRes.status).toBe(200);
    expect(historyRes.body).toHaveProperty('imageId', uploaded.id);
    expect(historyRes.body).toHaveProperty('totalMessages', 3);
    expect(historyRes.body).toHaveProperty('page', 1);
    expect(historyRes.body).toHaveProperty('pageSize', 20);
    expect(historyRes.body).toHaveProperty('totalPages', 1);
    expect(historyRes.body.messages[0].role).toBe('assistant');
    expect(historyRes.body.messages[0].content.length).toBeGreaterThan(0);
    expect(historyRes.body.messages[1].role).toBe('user');
    expect(historyRes.body.messages[1].content).toBe('What objects do you see?');
    expect(historyRes.body.messages[2].role).toBe('assistant');
    expect(historyRes.body.messages[2].content.length).toBeGreaterThan(0);
  });

  // ─── Scenario 2: Upload → stream → verify response from chunks ─────────

  it('should stream a response and produce coherent text from chunks', async () => {
    const server = app.getHttpServer();

    const uploaded = await uploadImage(server, 'stream.png');

    const res = await sseRequest(server, `/api/chat-stream/${uploaded.id}`, {
      message: 'Describe this image',
    });

    expect(res.status).toBe(200);
    // P1-1 fix: use toContain to handle optional charset suffix
    expect(res.headers['content-type']).toContain('text/event-stream');
    // P2-2: Assert all SSE-critical headers
    expect(res.headers['cache-control']).toBe('no-cache');
    expect(res.headers['connection']).toBe('keep-alive');
    expect(res.headers['x-accel-buffering']).toBe('no');

    const events = parseSSE(res.body);
    expect(events).toContain('[DONE]');

    // Reconstruct full response from chunks
    const fullText = extractStreamText(events);
    expect(fullText.length).toBeGreaterThan(0);

    // Verify first chunk has role
    const firstChunk = JSON.parse(events[0]!);
    expect(firstChunk.choices[0].delta.role).toBe('assistant');

    // Verify last JSON chunk has finish_reason = 'stop'
    const jsonEvents = events.filter((e) => e !== '[DONE]');
    const lastChunk = JSON.parse(jsonEvents[jsonEvents.length - 1]!);
    expect(lastChunk.choices[0].finish_reason).toBe('stop');

    // P2-8 / P3-7: Verify streaming also persists assistant message to history (ST-6)
    // Upload persists initial analysis as first assistant message (+1)
    const historyRes = await request(server)
      .get(`/api/chat/${uploaded.id}/history`);
    expect(historyRes.status).toBe(200);
    expect(historyRes.body.totalMessages).toBe(3);
    expect(historyRes.body.messages[2].role).toBe('assistant');
    expect(historyRes.body.messages[2].content).toBe(fullText);
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

    // History should have 7 messages (1 initial analysis + 3 user + 3 assistant)
    const historyRes = await request(server)
      .get(`/api/chat/${uploaded.id}/history`);

    expect(historyRes.status).toBe(200);
    expect(historyRes.body.totalMessages).toBe(7);

    // P2-4: Verify pagination across multiple pages
    const page1 = await request(server)
      .get(`/api/chat/${uploaded.id}/history?page=1&limit=2`);

    expect(page1.status).toBe(200);
    expect(page1.body.messages).toHaveLength(2);
    expect(page1.body.totalMessages).toBe(7);
    expect(page1.body.totalPages).toBe(4);
    expect(page1.body.page).toBe(1);

    // Fetch page 2 and verify different messages + correct offset
    const page2 = await request(server)
      .get(`/api/chat/${uploaded.id}/history?page=2&limit=2`);

    expect(page2.status).toBe(200);
    expect(page2.body.messages).toHaveLength(2);
    expect(page2.body.page).toBe(2);
    // Page 2 messages must be different from page 1
    const page1Ids = page1.body.messages.map((m: { id: string }) => m.id);
    const page2Ids = page2.body.messages.map((m: { id: string }) => m.id);
    expect(page1Ids).not.toEqual(page2Ids);
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

    // P3-3: Assert status before accessing body
    const history1 = await request(server)
      .get(`/api/chat/${img1.id}/history`);
    // +1 each for initial analysis persisted during upload
    expect(history1.status).toBe(200);
    expect(history1.body.totalMessages).toBe(3);

    const history2 = await request(server)
      .get(`/api/chat/${img2.id}/history`);
    expect(history2.status).toBe(200);
    expect(history2.body.totalMessages).toBe(5);
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

    // P2-3: Verify message count before delete (+1 for initial analysis)
    const preHistory = await request(server)
      .get(`/api/chat/${uploaded.id}/history`);
    expect(preHistory.body.totalMessages).toBe(3);

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

    // P2-3: Verify cascade removed message rows at DB level
    const dataSource = app.get(DataSource);
    const [{ count }] = await dataSource.query(
      'SELECT COUNT(*) FROM chat_messages WHERE "imageId" = $1',
      [uploaded.id],
    );
    expect(Number(count)).toBe(0);
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

    // P2-5: Magic-byte mismatch — valid extension but fake content
    const fakeRes = await request(server)
      .post('/api/upload')
      .attach('image', createFakeImageBuffer(), 'fake.png');
    expect(fakeRes.status).toBe(400);
    expect(fakeRes.body.code).toBe('FILE_CONTENT_MISMATCH');
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

    expect(extractStreamText(events1).length).toBeGreaterThan(0);
    expect(extractStreamText(events2).length).toBeGreaterThan(0);
  });

  // ─── Scenario 12: Gallery + image metadata ─────────────────────────────

  it('should list uploaded images in gallery and show correct metadata', async () => {
    const server = app.getHttpServer();

    // Upload PNG, JPEG, and GIF (P2-13)
    const img1 = await uploadImage(server, 'gallery1.png');
    const img2Res = await request(server)
      .post('/api/upload')
      .attach('image', createMinimalJpeg(), 'gallery2.jpg');
    expect(img2Res.status).toBe(201);
    const img3Res = await request(server)
      .post('/api/upload')
      .attach('image', createMinimalGif(), 'gallery3.gif');
    expect(img3Res.status).toBe(201);

    // Chat on img1 to create messages
    await request(server)
      .post(`/api/chat/${img1.id}`)
      .send({ message: 'Gallery test' });

    const galleryRes = await request(server).get('/api/images');

    expect(galleryRes.status).toBe(200);
    expect(galleryRes.body.total).toBe(3);
    expect(galleryRes.body.images).toHaveLength(3);
    // P2-8: Verify full PRD gallery response shape
    expect(galleryRes.body).toHaveProperty('page', 1);
    expect(galleryRes.body).toHaveProperty('pageSize', 20);
    expect(galleryRes.body).toHaveProperty('totalPages', 1);

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

    // P3-6: Verify ordering — newest first (DESC by createdAt)
    expect(galleryRes.body.images[0].id).toBe(img3Res.body.id);

    // img1 should have 3 messages (1 initial analysis + user + assistant)
    const img1Gallery = galleryRes.body.images.find(
      (i: { id: string }) => i.id === img1.id,
    );
    expect(img1Gallery.messageCount).toBe(3);

    // P3-5: Verify per-image mimeType correctness
    const jpegImage = galleryRes.body.images.find(
      (i: { id: string }) => i.id === img2Res.body.id,
    );
    expect(jpegImage.mimeType).toBe('image/jpeg');
    const gifImage = galleryRes.body.images.find(
      (i: { id: string }) => i.id === img3Res.body.id,
    );
    expect(gifImage.mimeType).toBe('image/gif');
  });

  // ─── Scenario 13: Image file serving ──────────────────────────────────

  it('should serve uploaded image file with correct headers', async () => {
    const server = app.getHttpServer();

    const uploaded = await uploadImage(server, 'serve-test.png');

    // Fetch the file
    const fileRes = await request(server)
      .get(`/api/images/${uploaded.id}/file`);

    expect(fileRes.status).toBe(200);
    expect(fileRes.headers['content-type']).toContain('image/png');
    expect(fileRes.headers['content-disposition']).toContain('serve-test.png');
    expect(fileRes.headers['cache-control']).toContain('immutable');
    expect(fileRes.body.length).toBeGreaterThan(0);

    // 404 after deletion
    await request(server).delete(`/api/images/${uploaded.id}`);
    const deletedFileRes = await request(server)
      .get(`/api/images/${uploaded.id}/file`);
    expect(deletedFileRes.status).toBe(404);
  });

  // ─── Scenario 14: Malformed JSON body ──────────────────────────────────

  it('should return INVALID_JSON for malformed request body', async () => {
    const server = app.getHttpServer();
    const uploaded = await uploadImage(server, 'json-test.png');

    const res = await request(server)
      .post(`/api/chat/${uploaded.id}`)
      .set('Content-Type', 'application/json')
      .send('not valid json');

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_JSON');
  });
});

// ─── Rate Limit E2E (separate app instance with low limit) ──────────────

describe('Inksight E2E — Rate Limiting', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.STREAM_CHUNK_DELAY_MS = '0';
    // P1-4: Use separate upload dir to avoid filesystem interference
    app = await createE2eApp({
      rateLimitMax: 3,
      rateLimitTtl: 60000,
      uploadDir: E2E_UPLOAD_DIR_RATE,
    });
    await app.listen(0);
    await cleanDatabase(app);
    await cleanUploadDir(E2E_UPLOAD_DIR_RATE);
  }, 30000);

  afterAll(async () => {
    await cleanDatabase(app);
    await cleanUploadDir(E2E_UPLOAD_DIR_RATE);
    await app.close();
    delete process.env.STREAM_CHUNK_DELAY_MS;
  }, 15000);

  it('should return 429 with Retry-After header after exceeding rate limit', async () => {
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
    // P2-6: Assert Retry-After header
    expect(res.headers['retry-after']).toBeDefined();
  });
});

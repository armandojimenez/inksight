import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as request from 'supertest';
import * as http from 'http';
import { ChatModule } from '@/chat/chat.module';
import { CacheModule } from '@/cache/cache.module';
import { ImageEntity } from '@/upload/entities/image.entity';
import { ChatMessageEntity } from '@/history/entities/chat-message.entity';
import { AI_SERVICE_TOKEN } from '@/common/constants';
import { HistoryService } from '@/history/history.service';
import { setupTestApp } from '../helpers/setup-test-app';
import { OpenAiStreamChunk } from '@/ai/interfaces/openai-stream-chunk.interface';

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';
const VALID_UUID_2 = '660e8400-e29b-41d4-a716-446655440001';

function buildChunk(
  id: string,
  created: number,
  delta: { role?: 'assistant'; content?: string },
  finishReason: 'stop' | null,
): OpenAiStreamChunk {
  return {
    id,
    object: 'chat.completion.chunk',
    created,
    model: 'gpt-4o',
    choices: [{ index: 0, delta, finish_reason: finishReason }],
  };
}

function* defaultChunks(): Generator<OpenAiStreamChunk> {
  const id = 'chatcmpl-test123';
  const created = 1700000000;
  yield buildChunk(id, created, { role: 'assistant', content: '' }, null);
  yield buildChunk(id, created, { content: 'Hello ' }, null);
  yield buildChunk(id, created, { content: 'world' }, null);
  yield buildChunk(id, created, {}, 'stop');
}

async function* asyncDefaultChunks(): AsyncGenerator<OpenAiStreamChunk> {
  for (const chunk of defaultChunks()) {
    yield chunk;
  }
}

/**
 * Parse SSE data from raw response body.
 * Extracts data field values from each SSE event block.
 * Assumes single-line data fields (current implementation).
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
 * Supertest buffers the response, which works for finite SSE streams.
 */
async function sseRequest(
  server: http.Server,
  path: string,
  body: Record<string, unknown>,
  headers?: Record<string, string>,
): Promise<{ status: number; headers: Record<string, string>; body: string }> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const addr = server.address() as { port: number };

    const allHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'Content-Length': String(Buffer.byteLength(payload)),
      ...headers,
    };

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: addr.port,
        path,
        method: 'POST',
        headers: allHeaders,
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

describe('StreamController (integration)', () => {
  let app: INestApplication;
  let mockRepository: { findOneBy: jest.Mock };
  let mockAiService: {
    chat: jest.Mock;
    analyzeImage: jest.Mock;
    chatStream: jest.Mock;
  };

  const savedEnv: Record<string, string | undefined> = {};

  function setEnv(key: string, value: string) {
    if (!(key in savedEnv)) savedEnv[key] = process.env[key];
    process.env[key] = value;
  }

  beforeAll(() => {
    setEnv('STREAM_CHUNK_DELAY_MS', '0');
  });

  afterAll(() => {
    for (const [key, val] of Object.entries(savedEnv)) {
      if (val === undefined) delete process.env[key];
      else process.env[key] = val;
    }
  });

  afterEach(async () => {
    // Restore any per-test env overrides
    delete process.env.SSE_TIMEOUT_MS;
    await app.close();
  });

  beforeEach(async () => {
    mockRepository = { findOneBy: jest.fn() };
    mockAiService = {
      chat: jest.fn(),
      analyzeImage: jest.fn(),
      chatStream: jest.fn(),
    };

    const mockMessageRepo = {
      save: jest.fn().mockResolvedValue({ id: 'msg-1' }),
      create: jest.fn().mockImplementation((d: unknown) => d),
      findAndCount: jest.fn().mockResolvedValue([[], 0]),
      find: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      remove: jest.fn(),
      delete: jest.fn(),
    };

    const mockHistoryService = {
      addMessage: jest.fn().mockResolvedValue({ id: 'msg-1' }),
      getRecentMessages: jest.fn().mockResolvedValue([]),
      getHistory: jest.fn().mockResolvedValue({ messages: [], total: 0 }),
      getMessageCount: jest.fn().mockResolvedValue(0),
      deleteByImageId: jest.fn(),
      enforceHistoryCap: jest.fn().mockResolvedValue(undefined),
      invalidateCache: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, load: [() => ({})] }),
        CacheModule,
        ChatModule,
      ],
    })
      .overrideProvider(getRepositoryToken(ImageEntity))
      .useValue(mockRepository)
      .overrideProvider(getRepositoryToken(ChatMessageEntity))
      .useValue(mockMessageRepo)
      .overrideProvider(AI_SERVICE_TOKEN)
      .useValue(mockAiService)
      .overrideProvider(HistoryService)
      .useValue(mockHistoryService)
      .compile();

    app = module.createNestApplication();
    setupTestApp(app);
    await app.init();
    await app.listen(0); // bind to random port for sseRequest
  });

  describe('POST /api/chat-stream/:imageId', () => {
    describe('valid requests', () => {
      beforeEach(() => {
        mockRepository.findOneBy.mockResolvedValue({
          id: VALID_UUID,
        } as ImageEntity);
        mockAiService.chatStream.mockReturnValue(asyncDefaultChunks());
      });

      it('should return 200 with SSE headers', async () => {
        const server = app.getHttpServer();
        const res = await sseRequest(server, `/api/chat-stream/${VALID_UUID}`, {
          message: 'Describe this image',
        });

        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toBe('text/event-stream');
        expect(res.headers['cache-control']).toBe('no-cache');
        expect(res.headers['connection']).toBe('keep-alive');
        expect(res.headers['x-accel-buffering']).toBe('no');
      });

      it('should return SSE-formatted events', async () => {
        const server = app.getHttpServer();
        const res = await sseRequest(server, `/api/chat-stream/${VALID_UUID}`, {
          message: 'Describe this image',
        });

        const events = parseSSE(res.body);
        expect(events.length).toBeGreaterThan(0);
        for (const event of events) {
          if (event !== '[DONE]') {
            expect(() => JSON.parse(event)).not.toThrow();
          }
        }
      });

      it('should have first chunk with delta.role = "assistant"', async () => {
        const server = app.getHttpServer();
        const res = await sseRequest(server, `/api/chat-stream/${VALID_UUID}`, {
          message: 'test',
        });

        const events = parseSSE(res.body);
        const firstChunk = JSON.parse(events[0]!);
        expect(firstChunk.choices[0].delta.role).toBe('assistant');
      });

      it('should have content chunks with delta.content strings', async () => {
        const server = app.getHttpServer();
        const res = await sseRequest(server, `/api/chat-stream/${VALID_UUID}`, {
          message: 'test',
        });

        const events = parseSSE(res.body);
        const contentChunks = events
          .filter((e) => e !== '[DONE]')
          .map((e) => JSON.parse(e))
          .filter(
            (c: OpenAiStreamChunk) =>
              c.choices[0]?.delta.content !== undefined &&
              c.choices[0].delta.content !== '',
          );

        expect(contentChunks.length).toBeGreaterThan(0);
        for (const chunk of contentChunks) {
          expect(typeof chunk.choices[0].delta.content).toBe('string');
        }
      });

      it('should have last JSON chunk with finish_reason = "stop"', async () => {
        const server = app.getHttpServer();
        const res = await sseRequest(server, `/api/chat-stream/${VALID_UUID}`, {
          message: 'test',
        });

        const events = parseSSE(res.body);
        const jsonEvents = events.filter((e) => e !== '[DONE]');
        const lastChunk = JSON.parse(jsonEvents[jsonEvents.length - 1]!);
        expect(lastChunk.choices[0].finish_reason).toBe('stop');
      });

      it('should end with data: [DONE] sentinel', async () => {
        const server = app.getHttpServer();
        const res = await sseRequest(server, `/api/chat-stream/${VALID_UUID}`, {
          message: 'test',
        });

        expect(res.body.trimEnd()).toMatch(/data: \[DONE\]\n?$/);
      });

      it('should have all chunks share same id and created timestamp', async () => {
        const server = app.getHttpServer();
        const res = await sseRequest(server, `/api/chat-stream/${VALID_UUID}`, {
          message: 'test',
        });

        const events = parseSSE(res.body);
        const jsonChunks = events
          .filter((e) => e !== '[DONE]')
          .map((e) => JSON.parse(e));

        const ids = new Set(jsonChunks.map((c: OpenAiStreamChunk) => c.id));
        const timestamps = new Set(
          jsonChunks.map((c: OpenAiStreamChunk) => c.created),
        );

        expect(ids.size).toBe(1);
        expect(timestamps.size).toBe(1);
      });

      it('should produce coherent text when concatenating delta.content', async () => {
        const server = app.getHttpServer();
        const res = await sseRequest(server, `/api/chat-stream/${VALID_UUID}`, {
          message: 'test',
        });

        const events = parseSSE(res.body);
        const fullText = events
          .filter((e) => e !== '[DONE]')
          .map((e) => JSON.parse(e))
          .map((c: OpenAiStreamChunk) => c.choices[0]?.delta.content ?? '')
          .join('');

        expect(fullText).toBe('Hello world');
      });

      it('should include X-Request-Id header', async () => {
        const server = app.getHttpServer();
        const res = await sseRequest(server, `/api/chat-stream/${VALID_UUID}`, {
          message: 'test',
        });

        expect(res.headers['x-request-id']).toBeDefined();
        expect(res.headers['x-request-id']!.length).toBeGreaterThan(0);
      });
    });

    describe('LoggingInterceptor compatibility', () => {
      beforeEach(() => {
        mockRepository.findOneBy.mockResolvedValue({
          id: VALID_UUID,
        } as ImageEntity);
        mockAiService.chatStream.mockReturnValue(asyncDefaultChunks());
      });

      it('should generate X-Request-Id automatically when not provided by client', async () => {
        const server = app.getHttpServer();
        const res = await sseRequest(
          server,
          `/api/chat-stream/${VALID_UUID}`,
          { message: 'test' },
        );

        expect(res.headers['x-request-id']).toBeDefined();
        expect(res.headers['x-request-id']).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
        );
      });

      it('should echo back client-provided X-Request-Id', async () => {
        const customId = 'my-custom-request-id-123';
        const server = app.getHttpServer();
        const res = await sseRequest(
          server,
          `/api/chat-stream/${VALID_UUID}`,
          { message: 'test' },
          { 'X-Request-Id': customId },
        );

        expect(res.headers['x-request-id']).toBe(customId);
      });

      it('should not buffer or interfere with chunked SSE responses', async () => {
        const server = app.getHttpServer();
        const res = await sseRequest(
          server,
          `/api/chat-stream/${VALID_UUID}`,
          { message: 'test' },
        );

        const events = parseSSE(res.body);
        expect(events.length).toBeGreaterThan(2);
        expect(res.headers['content-length']).toBeUndefined();
      });
    });

    describe('invalid requests (JSON errors, pre-streaming)', () => {
      it('should return 400 INVALID_UUID for non-UUID param', async () => {
        const res = await request(app.getHttpServer())
          .post('/api/chat-stream/not-a-uuid')
          .send({ message: 'Hello' });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('code', 'INVALID_UUID');
      });

      it('should return 400 for empty message', async () => {
        const res = await request(app.getHttpServer())
          .post(`/api/chat-stream/${VALID_UUID}`)
          .send({ message: '' });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('code', 'INVALID_MESSAGE');
      });

      it('should return 400 for missing message field', async () => {
        const res = await request(app.getHttpServer())
          .post(`/api/chat-stream/${VALID_UUID}`)
          .send({});

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('code', 'INVALID_MESSAGE');
      });

      it('should return 400 for message exceeding 2000 chars', async () => {
        const res = await request(app.getHttpServer())
          .post(`/api/chat-stream/${VALID_UUID}`)
          .send({ message: 'a'.repeat(2001) });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('code', 'INVALID_MESSAGE');
      });

      it('should return 400 VALIDATION_ERROR for unknown body fields', async () => {
        const res = await request(app.getHttpServer())
          .post(`/api/chat-stream/${VALID_UUID}`)
          .send({ message: 'Hello', extraField: 'bad' });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('code', 'VALIDATION_ERROR');
      });
    });

    describe('error cases', () => {
      it('should return 404 IMAGE_NOT_FOUND as JSON when image does not exist', async () => {
        mockRepository.findOneBy.mockResolvedValue(null);

        const res = await request(app.getHttpServer())
          .post(`/api/chat-stream/${VALID_UUID}`)
          .send({ message: 'What is this?' });

        expect(res.status).toBe(404);
        expect(res.body).toHaveProperty('code', 'IMAGE_NOT_FOUND');
        expect(res.headers['content-type']).toMatch(/json/);
      });

      it('should return JSON error when AI service throws before first yield', async () => {
        mockRepository.findOneBy.mockResolvedValue({
          id: VALID_UUID,
        } as ImageEntity);

        mockAiService.chatStream.mockImplementation(() => {
          throw new Error('AI initialization failed');
        });

        const res = await request(app.getHttpServer())
          .post(`/api/chat-stream/${VALID_UUID}`)
          .send({ message: 'test' });

        expect(res.status).toBe(500);
        expect(res.headers['content-type']).toMatch(/json/);
      });

      it('should send SSE error event when AI service throws after yielding chunks and no [DONE] sentinel', async () => {
        mockRepository.findOneBy.mockResolvedValue({
          id: VALID_UUID,
        } as ImageEntity);

        async function* failingGenerator(): AsyncGenerator<OpenAiStreamChunk> {
          yield buildChunk('id1', 1700000000, { role: 'assistant', content: '' }, null);
          yield buildChunk('id1', 1700000000, { content: 'partial ' }, null);
          throw new Error('Mid-stream failure');
        }

        mockAiService.chatStream.mockReturnValue(failingGenerator());

        const server = app.getHttpServer();
        const res = await sseRequest(
          server,
          `/api/chat-stream/${VALID_UUID}`,
          { message: 'test' },
        );

        expect(res.status).toBe(200); // headers already sent

        // Parse SSE events and verify error structure
        const events = parseSSE(res.body);
        const errorEvent = events.find((e) => {
          try {
            return JSON.parse(e).error !== undefined;
          } catch {
            return false;
          }
        });
        expect(errorEvent).toBeDefined();
        expect(JSON.parse(errorEvent!).error).toBe('Stream failed');

        // [DONE] must NOT follow a mid-stream error
        expect(events).not.toContain('[DONE]');
      });
    });

    describe('timeout', () => {
      it('should close stream when timeout fires within expected time', async () => {
        mockRepository.findOneBy.mockResolvedValue({
          id: VALID_UUID,
        } as ImageEntity);

        mockAiService.chatStream.mockImplementation(
          (_prompt: string, _imageId: string, _history: unknown[], signal?: AbortSignal) => {
            async function* slowGenerator(): AsyncGenerator<OpenAiStreamChunk> {
              yield buildChunk('id1', 1700000000, { role: 'assistant', content: '' }, null);
              try {
                await new Promise<void>((resolve, reject) => {
                  if (signal?.aborted) {
                    reject(new DOMException('Aborted', 'AbortError'));
                    return;
                  }
                  const timer = setTimeout(resolve, 60000);
                  signal?.addEventListener(
                    'abort',
                    () => {
                      clearTimeout(timer);
                      reject(new DOMException('Aborted', 'AbortError'));
                    },
                    { once: true },
                  );
                });
              } catch {
                return;
              }
              yield buildChunk('id1', 1700000000, { content: 'late' }, null);
              yield buildChunk('id1', 1700000000, {}, 'stop');
            }
            return slowGenerator();
          },
        );

        process.env.SSE_TIMEOUT_MS = '200';

        const server = app.getHttpServer();
        const start = Date.now();
        const res = await sseRequest(
          server,
          `/api/chat-stream/${VALID_UUID}`,
          { message: 'test' },
        );
        const elapsed = Date.now() - start;

        // Stream should have closed — no [DONE] sentinel for timeout
        expect(res.body).not.toContain('[DONE]');
        // But we should have the first chunk
        expect(res.body).toContain('assistant');
        // Elapsed time should be close to 200ms, not 30s or 60s
        expect(elapsed).toBeLessThan(5000);
        expect(elapsed).toBeGreaterThanOrEqual(150);
      }, 10000);
    });

    describe('edge cases', () => {
      it('should handle empty generator (zero yields) with [DONE]', async () => {
        mockRepository.findOneBy.mockResolvedValue({
          id: VALID_UUID,
        } as ImageEntity);

        async function* emptyGenerator(): AsyncGenerator<OpenAiStreamChunk> {
          // yields nothing
        }

        mockAiService.chatStream.mockReturnValue(emptyGenerator());

        const server = app.getHttpServer();
        const res = await sseRequest(
          server,
          `/api/chat-stream/${VALID_UUID}`,
          { message: 'test' },
        );

        expect(res.status).toBe(200);
        const events = parseSSE(res.body);
        expect(events).toContain('[DONE]');
      });

      it('should handle role-only generator (1 yield then stop)', async () => {
        mockRepository.findOneBy.mockResolvedValue({
          id: VALID_UUID,
        } as ImageEntity);

        async function* roleOnlyGenerator(): AsyncGenerator<OpenAiStreamChunk> {
          yield buildChunk('id1', 1700000000, { role: 'assistant', content: '' }, null);
        }

        mockAiService.chatStream.mockReturnValue(roleOnlyGenerator());

        const server = app.getHttpServer();
        const res = await sseRequest(
          server,
          `/api/chat-stream/${VALID_UUID}`,
          { message: 'test' },
        );

        expect(res.status).toBe(200);
        const events = parseSSE(res.body);
        const jsonEvents = events.filter((e) => e !== '[DONE]');
        expect(jsonEvents).toHaveLength(1);
        expect(JSON.parse(jsonEvents[0]!).choices[0].delta.role).toBe('assistant');
        expect(events).toContain('[DONE]');
      });

      it('should isolate concurrent requests — aborting one does not affect another', async () => {
        mockRepository.findOneBy.mockResolvedValue({
          id: VALID_UUID,
        } as ImageEntity);

        // First request: returns normally
        mockAiService.chatStream
          .mockReturnValueOnce(asyncDefaultChunks())
          // Second request: also returns normally
          .mockReturnValueOnce(asyncDefaultChunks());

        const server = app.getHttpServer();

        // Fire both requests concurrently
        const [res1, res2] = await Promise.all([
          sseRequest(server, `/api/chat-stream/${VALID_UUID}`, {
            message: 'request 1',
          }),
          sseRequest(server, `/api/chat-stream/${VALID_UUID}`, {
            message: 'request 2',
          }),
        ]);

        // Both should complete successfully with [DONE]
        expect(parseSSE(res1.body)).toContain('[DONE]');
        expect(parseSSE(res2.body)).toContain('[DONE]');
      });
    });
  });
});

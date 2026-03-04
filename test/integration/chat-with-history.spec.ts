import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as request from 'supertest';
import * as http from 'http';
import { ChatModule } from '@/chat/chat.module';
import { CacheModule } from '@/cache/cache.module';
import { HistoryModule } from '@/history/history.module';
import { ImageEntity } from '@/upload/entities/image.entity';
import { ChatMessageEntity } from '@/history/entities/chat-message.entity';
import { AI_SERVICE_TOKEN } from '@/common/constants';
import { HistoryService } from '@/history/history.service';
import { setupApp } from '@/common/setup-app';
import { OpenAiChatCompletion } from '@/ai/interfaces/openai-chat-completion.interface';
import { OpenAiStreamChunk } from '@/ai/interfaces/openai-stream-chunk.interface';
import { ConversationMessage } from '@/ai/interfaces/conversation-message.interface';

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';

function buildCompletion(content: string): OpenAiChatCompletion {
  return {
    id: 'chatcmpl-test',
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: 'gpt-4o',
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content },
        finish_reason: 'stop',
      },
    ],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  };
}

function buildStreamChunk(
  delta: { role?: 'assistant'; content?: string },
  finishReason: 'stop' | null,
): OpenAiStreamChunk {
  return {
    id: 'chatcmpl-stream',
    object: 'chat.completion.chunk',
    created: 1700000000,
    model: 'gpt-4o',
    choices: [{ index: 0, delta, finish_reason: finishReason }],
  };
}

async function sseRequest(
  server: http.Server,
  path: string,
  body: Record<string, unknown>,
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const addr = server.address() as { port: number };
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: addr.port,
        path,
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
          resolve({
            status: res.statusCode ?? 0,
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

describe('Chat with History (integration)', () => {
  let app: INestApplication;
  let mockImageRepo: { findOneBy: jest.Mock };
  let mockAiService: {
    chat: jest.Mock;
    analyzeImage: jest.Mock;
    chatStream: jest.Mock;
  };
  let historyService: HistoryService;
  let mockMessageRepo: {
    save: jest.Mock;
    create: jest.Mock;
    findAndCount: jest.Mock;
    find: jest.Mock;
    count: jest.Mock;
    remove: jest.Mock;
    delete: jest.Mock;
  };

  // In-memory message store for realistic behavior
  let messageStore: ChatMessageEntity[];

  beforeEach(async () => {
    messageStore = [];
    let msgCounter = 0;
    let timeBase = Date.now();

    mockImageRepo = { findOneBy: jest.fn() };
    mockMessageRepo = {
      save: jest.fn().mockImplementation((entity: ChatMessageEntity) => {
        const saved = {
          ...entity,
          id: `msg-${++msgCounter}`,
          createdAt: new Date(timeBase + msgCounter),
          updatedAt: new Date(timeBase + msgCounter),
        };
        messageStore.push(saved);
        return Promise.resolve(saved);
      }),
      create: jest.fn().mockImplementation((data: Partial<ChatMessageEntity>) => ({
        ...data,
        tokenCount: data.tokenCount ?? null,
      })),
      findAndCount: jest.fn().mockImplementation((options: { where: { imageId: string }; skip: number; take: number }) => {
        const filtered = messageStore.filter(
          (m) => m.imageId === options.where.imageId,
        );
        return Promise.resolve([
          filtered.slice(options.skip, options.skip + options.take),
          filtered.length,
        ]);
      }),
      find: jest.fn().mockImplementation((options: { where: { imageId: string }; order?: { createdAt?: 'ASC' | 'DESC' }; take?: number }) => {
        const filtered = messageStore.filter(
          (m) => m.imageId === options.where.imageId,
        );
        const sorted = [...filtered];
        if (options.order?.createdAt === 'DESC') {
          sorted.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        } else {
          sorted.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
        }
        return Promise.resolve(sorted.slice(0, options.take ?? sorted.length));
      }),
      count: jest.fn().mockImplementation((options: { where: { imageId: string } }) =>
        Promise.resolve(
          messageStore.filter((m) => m.imageId === options.where.imageId).length,
        ),
      ),
      remove: jest.fn().mockImplementation((entities: ChatMessageEntity[]) => {
        const ids = new Set(entities.map((e) => e.id));
        messageStore = messageStore.filter((m) => !ids.has(m.id));
        return Promise.resolve(entities);
      }),
      delete: jest.fn().mockResolvedValue({ affected: 0, raw: [] }),
    };

    mockAiService = {
      chat: jest.fn().mockResolvedValue(buildCompletion('AI response')),
      analyzeImage: jest.fn(),
      chatStream: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, load: [() => ({})] }),
        CacheModule,
        ChatModule,
      ],
    })
      .overrideProvider(getRepositoryToken(ImageEntity))
      .useValue(mockImageRepo)
      .overrideProvider(getRepositoryToken(ChatMessageEntity))
      .useValue(mockMessageRepo)
      .overrideProvider(AI_SERVICE_TOKEN)
      .useValue(mockAiService)
      .compile();

    app = module.createNestApplication();
    setupApp(app);
    await app.init();
    await app.listen(0);

    historyService = module.get<HistoryService>(HistoryService);
  });

  afterEach(async () => {
    await app.close();
  });

  it('should pass empty history on first chat', async () => {
    mockImageRepo.findOneBy.mockResolvedValue({ id: VALID_UUID });

    await request(app.getHttpServer())
      .post(`/api/chat/${VALID_UUID}`)
      .send({ message: 'What is this?' });

    // First call — AI receives history that includes the user message just added
    const aiCallHistory = mockAiService.chat.mock.calls[0]![2] as ConversationMessage[];
    // The user message was just added, so AI should see it
    expect(aiCallHistory.length).toBe(1);
    expect(aiCallHistory[0]).toEqual({ role: 'user', content: 'What is this?' });
  });

  it('should persist user and assistant messages after first chat', async () => {
    mockImageRepo.findOneBy.mockResolvedValue({ id: VALID_UUID });

    await request(app.getHttpServer())
      .post(`/api/chat/${VALID_UUID}`)
      .send({ message: 'Hello' });

    expect(messageStore).toHaveLength(2);
    expect(messageStore[0]!.role).toBe('user');
    expect(messageStore[0]!.content).toBe('Hello');
    expect(messageStore[1]!.role).toBe('assistant');
    expect(messageStore[1]!.content).toBe('AI response');
  });

  it('should pass previous exchange as history on second chat', async () => {
    mockImageRepo.findOneBy.mockResolvedValue({ id: VALID_UUID });

    await request(app.getHttpServer())
      .post(`/api/chat/${VALID_UUID}`)
      .send({ message: 'First question' });

    mockAiService.chat.mockResolvedValue(buildCompletion('Second answer'));

    await request(app.getHttpServer())
      .post(`/api/chat/${VALID_UUID}`)
      .send({ message: 'Follow up' });

    const secondCallHistory = mockAiService.chat.mock.calls[1]![2] as ConversationMessage[];
    // Should have: user "First question", assistant "AI response", user "Follow up"
    expect(secondCallHistory.length).toBe(3);
    expect(secondCallHistory[0]).toEqual({
      role: 'user',
      content: 'First question',
    });
    expect(secondCallHistory[1]).toEqual({
      role: 'assistant',
      content: 'AI response',
    });
    expect(secondCallHistory[2]).toEqual({
      role: 'user',
      content: 'Follow up',
    });
  });

  it('should persist user message before stream starts', async () => {
    mockImageRepo.findOneBy.mockResolvedValue({ id: VALID_UUID });

    let userMessagePersistedBeforeStream = false;

    mockAiService.chatStream.mockImplementation(() => {
      // At the point chatStream is called, user message should already be persisted
      userMessagePersistedBeforeStream = messageStore.some(
        (m) => m.role === 'user' && m.content === 'Stream test',
      );

      async function* gen(): AsyncGenerator<OpenAiStreamChunk> {
        yield buildStreamChunk({ role: 'assistant', content: '' }, null);
        yield buildStreamChunk({ content: 'Streamed' }, null);
        yield buildStreamChunk({}, 'stop');
      }
      return gen();
    });

    const server = app.getHttpServer();
    await sseRequest(server, `/api/chat-stream/${VALID_UUID}`, {
      message: 'Stream test',
    });

    expect(userMessagePersistedBeforeStream).toBe(true);
  });

  it('should persist assistant message after streaming completes', async () => {
    mockImageRepo.findOneBy.mockResolvedValue({ id: VALID_UUID });

    mockAiService.chatStream.mockImplementation(() => {
      async function* gen(): AsyncGenerator<OpenAiStreamChunk> {
        yield buildStreamChunk({ role: 'assistant', content: '' }, null);
        yield buildStreamChunk({ content: 'Hello ' }, null);
        yield buildStreamChunk({ content: 'World' }, null);
        yield buildStreamChunk({}, 'stop');
      }
      return gen();
    });

    const server = app.getHttpServer();
    await sseRequest(server, `/api/chat-stream/${VALID_UUID}`, {
      message: 'Stream test',
    });

    // After streaming, both messages should be persisted
    expect(messageStore).toHaveLength(2);
    expect(messageStore[1]!.role).toBe('assistant');
    expect(messageStore[1]!.content).toBe('Hello World');
  });

  it('should have history queryable after streaming', async () => {
    mockImageRepo.findOneBy.mockResolvedValue({ id: VALID_UUID });

    mockAiService.chatStream.mockImplementation(() => {
      async function* gen(): AsyncGenerator<OpenAiStreamChunk> {
        yield buildStreamChunk({ role: 'assistant', content: '' }, null);
        yield buildStreamChunk({ content: 'Streamed response' }, null);
        yield buildStreamChunk({}, 'stop');
      }
      return gen();
    });

    const server = app.getHttpServer();
    await sseRequest(server, `/api/chat-stream/${VALID_UUID}`, {
      message: 'Stream query',
    });

    // Verify messages are in the store
    expect(messageStore.length).toBe(2);
    expect(messageStore[0]!.content).toBe('Stream query');
    expect(messageStore[1]!.content).toBe('Streamed response');
  });

  it('should accumulate history from mixed chat and stream', async () => {
    mockImageRepo.findOneBy.mockResolvedValue({ id: VALID_UUID });

    // 1. Regular chat
    await request(app.getHttpServer())
      .post(`/api/chat/${VALID_UUID}`)
      .send({ message: 'Chat message' });

    // 2. Streaming chat
    mockAiService.chatStream.mockImplementation(() => {
      async function* gen(): AsyncGenerator<OpenAiStreamChunk> {
        yield buildStreamChunk({ role: 'assistant', content: '' }, null);
        yield buildStreamChunk({ content: 'Streamed' }, null);
        yield buildStreamChunk({}, 'stop');
      }
      return gen();
    });

    const server = app.getHttpServer();
    await sseRequest(server, `/api/chat-stream/${VALID_UUID}`, {
      message: 'Stream message',
    });

    // Should have 4 messages total
    expect(messageStore).toHaveLength(4);
    expect(messageStore[0]!.role).toBe('user');
    expect(messageStore[0]!.content).toBe('Chat message');
    expect(messageStore[1]!.role).toBe('assistant');
    expect(messageStore[1]!.content).toBe('AI response');
    expect(messageStore[2]!.role).toBe('user');
    expect(messageStore[2]!.content).toBe('Stream message');
    expect(messageStore[3]!.role).toBe('assistant');
    expect(messageStore[3]!.content).toBe('Streamed');
  });
});

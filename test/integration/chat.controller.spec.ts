import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as request from 'supertest';
import { ChatModule } from '@/chat/chat.module';
import { CacheModule } from '@/cache/cache.module';
import { ImageEntity } from '@/upload/entities/image.entity';
import { ChatMessageEntity } from '@/history/entities/chat-message.entity';
import { AI_SERVICE_TOKEN } from '@/common/constants';
import { HistoryService } from '@/history/history.service';
import { setupTestApp } from '../helpers/setup-test-app';
import { OpenAiChatCompletion } from '@/ai/interfaces/openai-chat-completion.interface';

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';

const mockCompletion: OpenAiChatCompletion = {
  id: 'chatcmpl-testABCDE',
  object: 'chat.completion',
  created: Math.floor(Date.now() / 1000),
  model: 'gpt-5.2',
  choices: [
    {
      index: 0,
      message: { role: 'assistant', content: 'Mock AI response' },
      finish_reason: 'stop',
    },
  ],
  usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
};

describe('ChatController (integration)', () => {
  let app: INestApplication;
  let mockRepository: {
    findOneBy: jest.Mock;
  };
  let mockAiService: {
    chat: jest.Mock;
    analyzeImage: jest.Mock;
    chatStream: jest.Mock;
  };

  beforeEach(async () => {
    mockRepository = {
      findOneBy: jest.fn(),
    };

    mockAiService = {
      chat: jest.fn().mockResolvedValue(mockCompletion),
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
        ConfigModule.forRoot({
          isGlobal: true,
          load: [() => ({})],
        }),
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
  });

  afterEach(async () => {
    await app.close();
  });

  describe('POST /api/chat/:imageId', () => {
    describe('valid requests', () => {
      it('should return 200 with OpenAI chat completion format', async () => {
        mockRepository.findOneBy.mockResolvedValue({
          id: VALID_UUID,
        } as ImageEntity);

        const res = await request(app.getHttpServer())
          .post(`/api/chat/${VALID_UUID}`)
          .send({ message: 'What is in this image?' });

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('id');
        expect(res.body).toHaveProperty('object', 'chat.completion');
        expect(res.body).toHaveProperty('model');
        expect(res.body).toHaveProperty('choices');
        expect(res.body.choices).toHaveLength(1);
        expect(res.body.choices[0].message).toHaveProperty(
          'role',
          'assistant',
        );
        expect(res.body.choices[0].message).toHaveProperty('content');
        expect(res.body).toHaveProperty('usage');
      });

      it('should pass the message to the AI service', async () => {
        mockRepository.findOneBy.mockResolvedValue({
          id: VALID_UUID,
        } as ImageEntity);

        await request(app.getHttpServer())
          .post(`/api/chat/${VALID_UUID}`)
          .send({ message: 'Describe the colors' });

        expect(mockAiService.chat).toHaveBeenCalledWith(
          'Describe the colors',
          VALID_UUID,
          [],
        );
      });

      it('should trim whitespace from messages', async () => {
        mockRepository.findOneBy.mockResolvedValue({
          id: VALID_UUID,
        } as ImageEntity);

        await request(app.getHttpServer())
          .post(`/api/chat/${VALID_UUID}`)
          .send({ message: '  What is this?  ' });

        expect(mockAiService.chat).toHaveBeenCalledWith(
          'What is this?',
          VALID_UUID,
          [],
        );
      });
    });

    describe('invalid UUID', () => {
      it('should return 400 with INVALID_UUID for non-UUID param', async () => {
        const res = await request(app.getHttpServer())
          .post('/api/chat/not-a-uuid')
          .send({ message: 'Hello' });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('code', 'INVALID_UUID');
        expect(res.body).toHaveProperty('statusCode', 400);
        expect(res.body).toHaveProperty('error');
        expect(res.body).toHaveProperty('message');
        expect(res.body).toHaveProperty('timestamp');
        expect(res.body).toHaveProperty('path');
        expect(res.body).toHaveProperty('requestId');
      });

      it('should return 400 with INVALID_UUID for UUID v1', async () => {
        const uuidV1 = '550e8400-e29b-11d4-a716-446655440000';
        const res = await request(app.getHttpServer())
          .post(`/api/chat/${uuidV1}`)
          .send({ message: 'Hello' });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('code', 'INVALID_UUID');
      });
    });

    describe('invalid message', () => {
      it('should return 400 with INVALID_MESSAGE for empty message', async () => {
        const res = await request(app.getHttpServer())
          .post(`/api/chat/${VALID_UUID}`)
          .send({ message: '' });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('code', 'INVALID_MESSAGE');
      });

      it('should return 400 with INVALID_MESSAGE for whitespace-only message', async () => {
        const res = await request(app.getHttpServer())
          .post(`/api/chat/${VALID_UUID}`)
          .send({ message: '   ' });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('code', 'INVALID_MESSAGE');
      });

      it('should return 400 with INVALID_MESSAGE for missing message field', async () => {
        const res = await request(app.getHttpServer())
          .post(`/api/chat/${VALID_UUID}`)
          .send({});

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('code', 'INVALID_MESSAGE');
      });

      it('should return 400 with INVALID_MESSAGE for message exceeding 2000 chars', async () => {
        const res = await request(app.getHttpServer())
          .post(`/api/chat/${VALID_UUID}`)
          .send({ message: 'a'.repeat(2001) });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('code', 'INVALID_MESSAGE');
      });

      it('should accept message at exactly 2000 characters', async () => {
        mockRepository.findOneBy.mockResolvedValue({
          id: VALID_UUID,
        } as ImageEntity);

        const res = await request(app.getHttpServer())
          .post(`/api/chat/${VALID_UUID}`)
          .send({ message: 'a'.repeat(2000) });

        expect(res.status).toBe(200);
      });
    });

    describe('unknown properties', () => {
      it('should return 400 with VALIDATION_ERROR for unknown body fields', async () => {
        const res = await request(app.getHttpServer())
          .post(`/api/chat/${VALID_UUID}`)
          .send({ message: 'Hello', extraField: 'bad' });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('code', 'VALIDATION_ERROR');
      });
    });

    describe('image not found', () => {
      it('should return 404 with IMAGE_NOT_FOUND when image does not exist', async () => {
        mockRepository.findOneBy.mockResolvedValue(null);

        const res = await request(app.getHttpServer())
          .post(`/api/chat/${VALID_UUID}`)
          .send({ message: 'What is this?' });

        expect(res.status).toBe(404);
        expect(res.body).toHaveProperty('code', 'IMAGE_NOT_FOUND');
        expect(res.body).toHaveProperty('statusCode', 404);
      });
    });

    describe('AI service failure', () => {
      it('should return 500 with consistent error shape when AI service throws', async () => {
        mockRepository.findOneBy.mockResolvedValue({
          id: VALID_UUID,
        } as ImageEntity);
        mockAiService.chat.mockRejectedValue(new Error('AI service down'));

        const res = await request(app.getHttpServer())
          .post(`/api/chat/${VALID_UUID}`)
          .send({ message: 'What is this?' });

        expect(res.status).toBe(500);
        expect(res.body).toHaveProperty('statusCode', 500);
        expect(res.body).toHaveProperty('code', 'INTERNAL_ERROR');
        expect(res.body).toHaveProperty('error');
        expect(res.body).toHaveProperty('message');
        expect(res.body).toHaveProperty('timestamp');
        expect(res.body).toHaveProperty('path');
        expect(res.body).toHaveProperty('requestId');
      });
    });

    describe('non-string message type', () => {
      it('should return 400 with INVALID_MESSAGE for numeric message', async () => {
        const res = await request(app.getHttpServer())
          .post(`/api/chat/${VALID_UUID}`)
          .send({ message: 123 });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('code', 'INVALID_MESSAGE');
      });
    });

    describe('error shape consistency', () => {
      it('should return consistent error shape with all 7 fields', async () => {
        const res = await request(app.getHttpServer())
          .post('/api/chat/not-a-uuid')
          .send({ message: 'Hello' });

        expect(res.status).toBe(400);
        const body = res.body;
        expect(body).toHaveProperty('statusCode');
        expect(body).toHaveProperty('error');
        expect(body).toHaveProperty('code');
        expect(body).toHaveProperty('message');
        expect(body).toHaveProperty('timestamp');
        expect(body).toHaveProperty('path');
        expect(body).toHaveProperty('requestId');
      });
    });
  });
});

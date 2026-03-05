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

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';

describe('Body parser error handling (integration)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, load: [() => ({})] }),
        CacheModule,
        ChatModule,
      ],
    })
      .overrideProvider(getRepositoryToken(ImageEntity))
      .useValue({ findOneBy: jest.fn() })
      .overrideProvider(getRepositoryToken(ChatMessageEntity))
      .useValue({
        save: jest.fn(),
        create: jest.fn(),
        findAndCount: jest.fn().mockResolvedValue([[], 0]),
        find: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        remove: jest.fn(),
        delete: jest.fn(),
      })
      .overrideProvider(AI_SERVICE_TOKEN)
      .useValue({ analyzeImage: jest.fn(), chat: jest.fn(), chatStream: jest.fn() })
      .overrideProvider(HistoryService)
      .useValue({
        addMessage: jest.fn(),
        getRecentMessages: jest.fn().mockResolvedValue([]),
        getHistory: jest.fn(),
        getMessageCount: jest.fn(),
        deleteByImageId: jest.fn(),
        enforceHistoryCap: jest.fn(),
        invalidateCache: jest.fn(),
      })
      .compile();

    app = module.createNestApplication();
    setupTestApp(app);
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('invalid JSON body', () => {
    it('should return 400 with INVALID_JSON code', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/chat/${VALID_UUID}`)
        .set('Content-Type', 'application/json')
        .send('not-json');

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_JSON');
      expect(res.body).toHaveProperty('statusCode', 400);
      expect(res.body).toHaveProperty('error', 'Bad Request');
      expect(res.body).toHaveProperty('message');
      expect(res.body).toHaveProperty('timestamp');
      expect(res.body).toHaveProperty('path');
      expect(res.body).toHaveProperty('requestId');
    });

    it('should return 400 for truncated JSON', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/chat/${VALID_UUID}`)
        .set('Content-Type', 'application/json')
        .send('{"message":"hel');

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_JSON');
    });

    it('should not affect valid JSON requests', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/chat/${VALID_UUID}`)
        .send({ message: 'hello' });

      // 404 because image doesn't exist — but NOT 400/500 from body parsing
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('IMAGE_NOT_FOUND');
    });
  });

  describe('payload too large', () => {
    it('should return 413 with PAYLOAD_TOO_LARGE code', async () => {
      const largeBody = JSON.stringify({ message: 'x'.repeat(1_100_000) });

      const res = await request(app.getHttpServer())
        .post(`/api/chat/${VALID_UUID}`)
        .set('Content-Type', 'application/json')
        .send(largeBody);

      expect(res.status).toBe(413);
      expect(res.body.code).toBe('PAYLOAD_TOO_LARGE');
      expect(res.body).toHaveProperty('error', 'Payload Too Large');
      expect(res.body).toHaveProperty('timestamp');
      expect(res.body).toHaveProperty('path');
      expect(res.body).toHaveProperty('requestId');
    });
  });
});

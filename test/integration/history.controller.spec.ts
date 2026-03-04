import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as request from 'supertest';
import { HistoryModule } from '@/history/history.module';
import { ChatMessageEntity } from '@/history/entities/chat-message.entity';
import { ImageEntity } from '@/upload/entities/image.entity';
import { setupApp } from '@/common/setup-app';

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';
const NONEXISTENT_UUID = '550e8400-e29b-41d4-a716-446655440099';

function createMockMessage(
  overrides: Partial<ChatMessageEntity> = {},
): ChatMessageEntity {
  return {
    id: 'msg-' + Math.random().toString(36).slice(2, 8),
    imageId: VALID_UUID,
    role: 'user',
    content: 'Hello',
    tokenCount: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    image: {} as ImageEntity,
    ...overrides,
  };
}

describe('HistoryController (integration)', () => {
  let app: INestApplication;
  let mockImageRepo: { findOneBy: jest.Mock };
  let mockMessageRepo: {
    findAndCount: jest.Mock;
    find: jest.Mock;
    count: jest.Mock;
    save: jest.Mock;
    create: jest.Mock;
    remove: jest.Mock;
    delete: jest.Mock;
  };

  beforeEach(async () => {
    mockImageRepo = { findOneBy: jest.fn() };
    mockMessageRepo = {
      findAndCount: jest.fn().mockResolvedValue([[], 0]),
      find: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      save: jest.fn(),
      create: jest.fn(),
      remove: jest.fn(),
      delete: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, load: [() => ({})] }),
        HistoryModule,
      ],
    })
      .overrideProvider(getRepositoryToken(ImageEntity))
      .useValue(mockImageRepo)
      .overrideProvider(getRepositoryToken(ChatMessageEntity))
      .useValue(mockMessageRepo)
      .compile();

    app = module.createNestApplication();
    setupApp(app);
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('GET /api/chat/:imageId/history', () => {
    it('should return PRD response format', async () => {
      mockImageRepo.findOneBy.mockResolvedValue({ id: VALID_UUID });

      const messages = [
        createMockMessage({ role: 'user', content: 'Q1' }),
        createMockMessage({ role: 'assistant', content: 'A1' }),
      ];
      mockMessageRepo.findAndCount.mockResolvedValue([messages, 2]);

      const res = await request(app.getHttpServer())
        .get(`/api/chat/${VALID_UUID}/history`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('imageId', VALID_UUID);
      expect(res.body).toHaveProperty('messages');
      expect(res.body).toHaveProperty('totalMessages', 2);
      expect(res.body).toHaveProperty('page', 1);
      expect(res.body).toHaveProperty('pageSize', 20);
      expect(res.body).toHaveProperty('totalPages', 1);
    });

    it('should have correct message shape with id, role, content, timestamp', async () => {
      mockImageRepo.findOneBy.mockResolvedValue({ id: VALID_UUID });

      const msg = createMockMessage({
        id: 'msg-test-1',
        role: 'user',
        content: 'Test message',
        createdAt: new Date('2024-01-15T10:00:00Z'),
      });
      mockMessageRepo.findAndCount.mockResolvedValue([[msg], 1]);

      const res = await request(app.getHttpServer())
        .get(`/api/chat/${VALID_UUID}/history`);

      expect(res.status).toBe(200);
      const message = res.body.messages[0];
      expect(message).toHaveProperty('id', 'msg-test-1');
      expect(message).toHaveProperty('role', 'user');
      expect(message).toHaveProperty('content', 'Test message');
      expect(message).toHaveProperty('timestamp');
    });

    it('should calculate pagination math correctly', async () => {
      mockImageRepo.findOneBy.mockResolvedValue({ id: VALID_UUID });
      mockMessageRepo.findAndCount.mockResolvedValue([[], 45]);

      const res = await request(app.getHttpServer())
        .get(`/api/chat/${VALID_UUID}/history?page=2&limit=20`);

      expect(res.status).toBe(200);
      expect(res.body.page).toBe(2);
      expect(res.body.pageSize).toBe(20);
      expect(res.body.totalPages).toBe(3);
      expect(res.body.totalMessages).toBe(45);
    });

    it('should return 404 IMAGE_NOT_FOUND for nonexistent image', async () => {
      mockImageRepo.findOneBy.mockResolvedValue(null);

      const res = await request(app.getHttpServer())
        .get(`/api/chat/${NONEXISTENT_UUID}/history`);

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('code', 'IMAGE_NOT_FOUND');
    });

    it('should return 200 with empty messages for image with no messages', async () => {
      mockImageRepo.findOneBy.mockResolvedValue({ id: VALID_UUID });
      mockMessageRepo.findAndCount.mockResolvedValue([[], 0]);

      const res = await request(app.getHttpServer())
        .get(`/api/chat/${VALID_UUID}/history`);

      expect(res.status).toBe(200);
      expect(res.body.messages).toEqual([]);
      expect(res.body.totalMessages).toBe(0);
      expect(res.body.totalPages).toBe(0);
    });

    it('should return 400 for page=0', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/chat/${VALID_UUID}/history?page=0`);

      expect(res.status).toBe(400);
    });

    it('should return 400 for limit exceeding max (>50)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/chat/${VALID_UUID}/history?limit=100`);

      expect(res.status).toBe(400);
    });

    it('should return 400 INVALID_UUID for invalid UUID', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/chat/not-a-uuid/history');

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('code', 'INVALID_UUID');
    });

    it('should return messages in chronological order', async () => {
      mockImageRepo.findOneBy.mockResolvedValue({ id: VALID_UUID });

      const msg1 = createMockMessage({
        id: 'msg-1',
        createdAt: new Date('2024-01-01T10:00:00Z'),
      });
      const msg2 = createMockMessage({
        id: 'msg-2',
        createdAt: new Date('2024-01-01T10:01:00Z'),
      });
      mockMessageRepo.findAndCount.mockResolvedValue([[msg1, msg2], 2]);

      const res = await request(app.getHttpServer())
        .get(`/api/chat/${VALID_UUID}/history`);

      expect(res.status).toBe(200);
      expect(res.body.messages[0].id).toBe('msg-1');
      expect(res.body.messages[1].id).toBe('msg-2');
    });

    it('should have consistent 7-field error shape', async () => {
      mockImageRepo.findOneBy.mockResolvedValue(null);

      const res = await request(app.getHttpServer())
        .get(`/api/chat/${NONEXISTENT_UUID}/history`);

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('statusCode', 404);
      expect(res.body).toHaveProperty('error');
      expect(res.body).toHaveProperty('code');
      expect(res.body).toHaveProperty('message');
      expect(res.body).toHaveProperty('timestamp');
      expect(res.body).toHaveProperty('path');
      expect(res.body).toHaveProperty('requestId');
    });

    it('should default page=1 and limit=20 when not provided', async () => {
      mockImageRepo.findOneBy.mockResolvedValue({ id: VALID_UUID });
      mockMessageRepo.findAndCount.mockResolvedValue([[], 0]);

      const res = await request(app.getHttpServer())
        .get(`/api/chat/${VALID_UUID}/history`);

      expect(res.status).toBe(200);
      expect(res.body.page).toBe(1);
      expect(res.body.pageSize).toBe(20);
    });
  });
});

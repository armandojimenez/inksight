import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as request from 'supertest';
import { UploadModule } from '@/upload/upload.module';
import { ImageEntity } from '@/upload/entities/image.entity';
import { ChatMessageEntity } from '@/history/entities/chat-message.entity';
import { AI_SERVICE_TOKEN } from '@/common/constants';
import { HistoryService } from '@/history/history.service';
import { setupApp } from '@/common/setup-app';

function mockImage(overrides: Partial<ImageEntity> = {}): ImageEntity {
  return {
    id: '550e8400-e29b-41d4-a716-446655440000',
    originalFilename: 'test.png',
    storedFilename: 'abc123.png',
    mimeType: 'image/png',
    size: 1024,
    uploadPath: 'uploads/abc123.png',
    initialAnalysis: null,
    createdAt: new Date('2024-01-15T10:00:00Z'),
    updatedAt: new Date('2024-01-15T10:00:00Z'),
    version: 1,
    messages: [],
    ...overrides,
  };
}

describe('Gallery Controller (integration)', () => {
  let app: INestApplication;
  let mockImageRepo: {
    findAndCount: jest.Mock;
    findOneBy: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    remove: jest.Mock;
  };
  let mockHistoryService: {
    addMessage: jest.Mock;
    getRecentMessages: jest.Mock;
    getHistory: jest.Mock;
    getMessageCount: jest.Mock;
    getMessageCountBatch: jest.Mock;
    deleteByImageId: jest.Mock;
    enforceHistoryCap: jest.Mock;
  };

  beforeEach(async () => {
    mockImageRepo = {
      findAndCount: jest.fn().mockResolvedValue([[], 0]),
      findOneBy: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      remove: jest.fn(),
    };

    mockHistoryService = {
      addMessage: jest.fn().mockResolvedValue({ id: 'msg-1' }),
      getRecentMessages: jest.fn().mockResolvedValue([]),
      getHistory: jest.fn().mockResolvedValue({ messages: [], total: 0 }),
      getMessageCount: jest.fn().mockResolvedValue(0),
      getMessageCountBatch: jest.fn().mockResolvedValue(new Map()),
      deleteByImageId: jest.fn(),
      enforceHistoryCap: jest.fn().mockResolvedValue(undefined),
    };

    const mockMessageRepo = {
      save: jest.fn(),
      create: jest.fn(),
      findAndCount: jest.fn().mockResolvedValue([[], 0]),
      find: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      remove: jest.fn(),
      delete: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, load: [() => ({})] }),
        UploadModule,
      ],
    })
      .overrideProvider(getRepositoryToken(ImageEntity))
      .useValue(mockImageRepo)
      .overrideProvider(getRepositoryToken(ChatMessageEntity))
      .useValue(mockMessageRepo)
      .overrideProvider(AI_SERVICE_TOKEN)
      .useValue({ analyzeImage: jest.fn(), chat: jest.fn(), chatStream: jest.fn() })
      .overrideProvider(HistoryService)
      .useValue(mockHistoryService)
      .compile();

    app = module.createNestApplication();
    setupApp(app);
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('GET /api/images', () => {
    it('should return PRD gallery format', async () => {
      const img = mockImage();
      mockImageRepo.findAndCount.mockResolvedValue([[img], 1]);
      mockHistoryService.getMessageCountBatch.mockResolvedValue(
        new Map([[img.id, 5]]),
      );

      const res = await request(app.getHttpServer()).get('/api/images');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('images');
      expect(res.body).toHaveProperty('total', 1);
      expect(res.body).toHaveProperty('page', 1);
      expect(res.body).toHaveProperty('pageSize', 20);
      expect(res.body).toHaveProperty('totalPages', 1);
    });

    it('should include messageCount in each image', async () => {
      const img = mockImage();
      mockImageRepo.findAndCount.mockResolvedValue([[img], 1]);
      mockHistoryService.getMessageCountBatch.mockResolvedValue(
        new Map([[img.id, 7]]),
      );

      const res = await request(app.getHttpServer()).get('/api/images');

      expect(res.status).toBe(200);
      expect(res.body.images[0]).toHaveProperty('messageCount', 7);
    });

    it('should return images in DESC order', async () => {
      const img1 = mockImage({ id: 'img-1' });
      const img2 = mockImage({ id: 'img-2' });
      mockImageRepo.findAndCount.mockResolvedValue([[img2, img1], 2]);
      mockHistoryService.getMessageCountBatch.mockResolvedValue(
        new Map([['img-1', 0], ['img-2', 0]]),
      );

      const res = await request(app.getHttpServer()).get('/api/images');

      expect(res.status).toBe(200);
      expect(res.body.images[0].id).toBe('img-2');
      expect(res.body.images[1].id).toBe('img-1');
    });

    it('should return empty gallery for empty DB', async () => {
      mockImageRepo.findAndCount.mockResolvedValue([[], 0]);

      const res = await request(app.getHttpServer()).get('/api/images');

      expect(res.status).toBe(200);
      expect(res.body.images).toEqual([]);
      expect(res.body.total).toBe(0);
      expect(res.body.totalPages).toBe(0);
    });

    it('should support pagination', async () => {
      mockImageRepo.findAndCount.mockResolvedValue([[], 45]);

      const res = await request(app.getHttpServer())
        .get('/api/images?page=2&limit=10');

      expect(res.status).toBe(200);
      expect(res.body.page).toBe(2);
      expect(res.body.pageSize).toBe(10);
      expect(res.body.totalPages).toBe(5);
    });

    it('should return 400 for invalid page param', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/images?page=0');

      expect(res.status).toBe(400);
    });

    it('should return 400 for limit exceeding max', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/images?limit=100');

      expect(res.status).toBe(400);
    });

    it('should not expose uploadPath or storedFilename', async () => {
      const img = mockImage();
      mockImageRepo.findAndCount.mockResolvedValue([[img], 1]);
      mockHistoryService.getMessageCountBatch.mockResolvedValue(
        new Map([[img.id, 0]]),
      );

      const res = await request(app.getHttpServer()).get('/api/images');

      expect(res.status).toBe(200);
      const image = res.body.images[0];
      expect(image).not.toHaveProperty('uploadPath');
      expect(image).not.toHaveProperty('storedFilename');
    });

    it('should include image metadata fields', async () => {
      const img = mockImage({
        originalFilename: 'photo.png',
        mimeType: 'image/png',
        size: 2048,
      });
      mockImageRepo.findAndCount.mockResolvedValue([[img], 1]);
      mockHistoryService.getMessageCountBatch.mockResolvedValue(
        new Map([[img.id, 0]]),
      );

      const res = await request(app.getHttpServer()).get('/api/images');

      const image = res.body.images[0];
      expect(image).toHaveProperty('id');
      expect(image).toHaveProperty('originalFilename', 'photo.png');
      expect(image).toHaveProperty('mimeType', 'image/png');
      expect(image).toHaveProperty('size', 2048);
      expect(image).toHaveProperty('createdAt');
    });
  });
});

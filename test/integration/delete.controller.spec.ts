import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as request from 'supertest';
import * as fsPromises from 'fs/promises';
import { UploadModule } from '@/upload/upload.module';
import { ImageEntity } from '@/upload/entities/image.entity';
import { ChatMessageEntity } from '@/history/entities/chat-message.entity';
import { AI_SERVICE_TOKEN } from '@/common/constants';
import { HistoryService } from '@/history/history.service';
import { setupApp } from '@/common/setup-app';

jest.mock('fs/promises');

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';
const NONEXISTENT_UUID = '550e8400-e29b-41d4-a716-446655440099';

function mockImage(): ImageEntity {
  return {
    id: VALID_UUID,
    originalFilename: 'test.png',
    storedFilename: 'abc123.png',
    mimeType: 'image/png',
    size: 1024,
    uploadPath: 'uploads/abc123.png',
    initialAnalysis: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    version: 1,
    messages: [],
  };
}

describe('Delete Controller (integration)', () => {
  let app: INestApplication;
  let mockImageRepo: {
    findAndCount: jest.Mock;
    findOneBy: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    remove: jest.Mock;
  };

  beforeEach(async () => {
    mockImageRepo = {
      findAndCount: jest.fn().mockResolvedValue([[], 0]),
      findOneBy: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      remove: jest.fn().mockResolvedValue(undefined),
    };

    const mockHistoryService = {
      addMessage: jest.fn().mockResolvedValue({ id: 'msg-1' }),
      getRecentMessages: jest.fn().mockResolvedValue([]),
      getHistory: jest.fn().mockResolvedValue({ messages: [], total: 0 }),
      getMessageCount: jest.fn().mockResolvedValue(0),
      deleteByImageId: jest.fn(),
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
    jest.restoreAllMocks();
  });

  describe('DELETE /api/images/:imageId', () => {
    it('should return 204 on successful delete', async () => {
      mockImageRepo.findOneBy.mockResolvedValue(mockImage());
      (fsPromises.unlink as jest.Mock).mockResolvedValue(undefined);

      const res = await request(app.getHttpServer())
        .delete(`/api/images/${VALID_UUID}`);

      expect(res.status).toBe(204);
      expect(res.body).toEqual({});
    });

    it('should return 404 for nonexistent image', async () => {
      mockImageRepo.findOneBy.mockResolvedValue(null);

      const res = await request(app.getHttpServer())
        .delete(`/api/images/${NONEXISTENT_UUID}`);

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('code', 'IMAGE_NOT_FOUND');
    });

    it('should return 400 for invalid UUID', async () => {
      const res = await request(app.getHttpServer())
        .delete('/api/images/not-a-uuid');

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('code', 'INVALID_UUID');
    });

    it('should return 404 on second delete of same image', async () => {
      mockImageRepo.findOneBy
        .mockResolvedValueOnce(mockImage())
        .mockResolvedValueOnce(null);
      (fsPromises.unlink as jest.Mock).mockResolvedValue(undefined);

      const res1 = await request(app.getHttpServer())
        .delete(`/api/images/${VALID_UUID}`);
      expect(res1.status).toBe(204);

      const res2 = await request(app.getHttpServer())
        .delete(`/api/images/${VALID_UUID}`);
      expect(res2.status).toBe(404);
    });

    it('should still delete DB record when file is missing on disk', async () => {
      mockImageRepo.findOneBy.mockResolvedValue(mockImage());
      (fsPromises.unlink as jest.Mock).mockRejectedValue(
        Object.assign(new Error('ENOENT'), { code: 'ENOENT' }),
      );

      const res = await request(app.getHttpServer())
        .delete(`/api/images/${VALID_UUID}`);

      expect(res.status).toBe(204);
      expect(mockImageRepo.remove).toHaveBeenCalled();
    });

    it('should return 7-field error shape on 404', async () => {
      mockImageRepo.findOneBy.mockResolvedValue(null);

      const res = await request(app.getHttpServer())
        .delete(`/api/images/${NONEXISTENT_UUID}`);

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
});

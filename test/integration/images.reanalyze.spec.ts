import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as request from 'supertest';
import * as fsPromises from 'fs/promises';
import { UploadModule } from '@/upload/upload.module';
import { CacheModule } from '@/cache/cache.module';
import { ImageEntity } from '@/upload/entities/image.entity';
import { ChatMessageEntity } from '@/history/entities/chat-message.entity';
import { AI_SERVICE_TOKEN } from '@/common/constants';
import { HistoryService } from '@/history/history.service';
import { setupTestApp } from '../helpers/setup-test-app';
import { OptimisticLockVersionMismatchError } from 'typeorm';
import { OpenAiChatCompletion } from '@/ai/interfaces/openai-chat-completion.interface';

jest.mock('fs/promises');

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';
const NONEXISTENT_UUID = '550e8400-e29b-41d4-a716-446655440099';

function mockImage(overrides: Partial<ImageEntity> = {}): ImageEntity {
  return {
    id: VALID_UUID,
    originalFilename: 'test.png',
    storedFilename: 'abc123.png',
    mimeType: 'image/png',
    size: 1024,
    uploadPath: 'test-uploads/abc123.png',
    initialAnalysis: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    version: 1,
    messages: [],
    ...overrides,
  };
}

function buildCompletion(): OpenAiChatCompletion {
  return {
    id: 'chatcmpl-reanalyze',
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: 'gpt-5.2',
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content: 'Reanalyzed.' },
        finish_reason: 'stop',
      },
    ],
    usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
  };
}

describe('Reanalyze Controller (integration)', () => {
  let app: INestApplication;
  let mockImageRepo: {
    findAndCount: jest.Mock;
    findOneBy: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    remove: jest.Mock;
  };
  let mockAiService: {
    analyzeImage: jest.Mock;
    chat: jest.Mock;
    chatStream: jest.Mock;
  };

  beforeEach(async () => {
    mockImageRepo = {
      findAndCount: jest.fn().mockResolvedValue([[], 0]),
      findOneBy: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      remove: jest.fn().mockResolvedValue(undefined),
    };

    mockAiService = {
      analyzeImage: jest.fn(),
      chat: jest.fn(),
      chatStream: jest.fn(),
    };

    const mockHistoryService = {
      addMessage: jest.fn().mockResolvedValue({ id: 'msg-1' }),
      getRecentMessages: jest.fn().mockResolvedValue([]),
      getHistory: jest.fn().mockResolvedValue({ messages: [], total: 0 }),
      getMessageCount: jest.fn().mockResolvedValue(0),
      getMessageCountBatch: jest.fn().mockResolvedValue(new Map()),
      deleteByImageId: jest.fn(),
      enforceHistoryCap: jest.fn().mockResolvedValue(undefined),
      invalidateCache: jest.fn().mockResolvedValue(undefined),
    };

    const mockMessageRepo = {
      save: jest.fn(),
      create: jest.fn(),
      findAndCount: jest.fn().mockResolvedValue([[], 0]),
      find: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      remove: jest.fn(),
      delete: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        delete: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 0 }),
        getRawMany: jest.fn().mockResolvedValue([]),
        getMany: jest.fn().mockResolvedValue([]),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, load: [() => ({})] }),
        CacheModule,
        UploadModule,
      ],
    })
      .overrideProvider(getRepositoryToken(ImageEntity))
      .useValue(mockImageRepo)
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
    jest.restoreAllMocks();
  });

  describe('PATCH /api/images/:imageId/reanalyze', () => {
    it('should return 200 with updated analysis', async () => {
      const image = mockImage();
      const completion = buildCompletion();
      mockImageRepo.findOneBy.mockResolvedValue(image);
      (fsPromises.access as jest.Mock).mockResolvedValue(undefined);
      mockAiService.analyzeImage.mockResolvedValue(completion);
      mockImageRepo.save.mockResolvedValue({
        ...image,
        initialAnalysis: completion as unknown as Record<string, unknown>,
        version: 2,
      });

      const res = await request(app.getHttpServer())
        .patch(`/api/images/${VALID_UUID}/reanalyze`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('id', VALID_UUID);
      expect(res.body).toHaveProperty('version', 2);
      expect(res.body).toHaveProperty('analysis');
    });

    it('should return 404 for nonexistent image', async () => {
      mockImageRepo.findOneBy.mockResolvedValue(null);

      const res = await request(app.getHttpServer())
        .patch(`/api/images/${NONEXISTENT_UUID}/reanalyze`);

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('code', 'IMAGE_NOT_FOUND');
    });

    it('should return 404 when file is missing on disk', async () => {
      mockImageRepo.findOneBy.mockResolvedValue(mockImage());
      (fsPromises.access as jest.Mock).mockRejectedValue(
        Object.assign(new Error('ENOENT'), { code: 'ENOENT' }),
      );

      const res = await request(app.getHttpServer())
        .patch(`/api/images/${VALID_UUID}/reanalyze`);

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('code', 'IMAGE_FILE_NOT_FOUND');
      expect(mockAiService.analyzeImage).not.toHaveBeenCalled();
    });

    it('should return 409 on version conflict', async () => {
      const image = mockImage();
      const completion = buildCompletion();
      mockImageRepo.findOneBy.mockResolvedValue(image);
      (fsPromises.access as jest.Mock).mockResolvedValue(undefined);
      mockAiService.analyzeImage.mockResolvedValue(completion);
      mockImageRepo.save.mockRejectedValue(
        new OptimisticLockVersionMismatchError('ImageEntity', 1, 2),
      );

      const res = await request(app.getHttpServer())
        .patch(`/api/images/${VALID_UUID}/reanalyze`);

      expect(res.status).toBe(409);
      expect(res.body).toHaveProperty('code', 'VERSION_CONFLICT');
    });

    it('should return 400 for invalid UUID', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/images/not-a-uuid/reanalyze');

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('code', 'INVALID_UUID');
    });

    it('should return 7-field error shape on 404', async () => {
      mockImageRepo.findOneBy.mockResolvedValue(null);

      const res = await request(app.getHttpServer())
        .patch(`/api/images/${NONEXISTENT_UUID}/reanalyze`);

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

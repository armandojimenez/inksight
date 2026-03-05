import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as request from 'supertest';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import { Readable } from 'stream';
import { UploadModule } from '@/upload/upload.module';
import { CacheModule } from '@/cache/cache.module';
import { ImageEntity } from '@/upload/entities/image.entity';
import { ChatMessageEntity } from '@/history/entities/chat-message.entity';
import { AI_SERVICE_TOKEN } from '@/common/constants';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { HistoryService } from '@/history/history.service';
import { setupApp } from '@/common/setup-app';

jest.mock('fs');
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

function createMockReadStream(data: Buffer): fs.ReadStream {
  const readable = new Readable({
    read() {
      this.push(data);
      this.push(null);
    },
  });
  return readable as unknown as fs.ReadStream;
}

describe('Image File Controller (integration)', () => {
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
      remove: jest.fn(),
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
        CacheModule,
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
    const cache = app.get<Cache>(CACHE_MANAGER);
    await cache.clear();
    await app.close();
    jest.restoreAllMocks();
  });

  describe('GET /api/images/:imageId/file', () => {
    it('should return 200 with correct Content-Type from DB mimeType', async () => {
      const image = mockImage({ mimeType: 'image/jpeg' });
      mockImageRepo.findOneBy.mockResolvedValue(image);
      (fsPromises.access as jest.Mock).mockResolvedValue(undefined);
      const mockStream = createMockReadStream(Buffer.from('fake-image-data'));
      (fs.createReadStream as jest.Mock).mockReturnValue(mockStream);

      const res = await request(app.getHttpServer())
        .get(`/api/images/${VALID_UUID}/file`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/image\/jpeg/);
    });

    it('should include Content-Disposition with filename', async () => {
      const image = mockImage();
      mockImageRepo.findOneBy.mockResolvedValue(image);
      (fsPromises.access as jest.Mock).mockResolvedValue(undefined);
      const mockStream = createMockReadStream(Buffer.from('fake'));
      (fs.createReadStream as jest.Mock).mockReturnValue(mockStream);

      const res = await request(app.getHttpServer())
        .get(`/api/images/${VALID_UUID}/file`);

      expect(res.status).toBe(200);
      expect(res.headers['content-disposition']).toContain('inline');
      expect(res.headers['content-disposition']).toContain('test.png');
    });

    it('should include immutable Cache-Control header', async () => {
      const image = mockImage();
      mockImageRepo.findOneBy.mockResolvedValue(image);
      (fsPromises.access as jest.Mock).mockResolvedValue(undefined);
      const mockStream = createMockReadStream(Buffer.from('fake'));
      (fs.createReadStream as jest.Mock).mockReturnValue(mockStream);

      const res = await request(app.getHttpServer())
        .get(`/api/images/${VALID_UUID}/file`);

      expect(res.status).toBe(200);
      expect(res.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    });

    it('should return binary data', async () => {
      const image = mockImage();
      mockImageRepo.findOneBy.mockResolvedValue(image);
      (fsPromises.access as jest.Mock).mockResolvedValue(undefined);
      const data = Buffer.from('binary-image-content');
      const mockStream = createMockReadStream(data);
      (fs.createReadStream as jest.Mock).mockReturnValue(mockStream);

      const res = await request(app.getHttpServer())
        .get(`/api/images/${VALID_UUID}/file`)
        .buffer(true)
        .parse((res, callback) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => callback(null, Buffer.concat(chunks)));
        });

      expect(res.status).toBe(200);
      expect(Buffer.isBuffer(res.body)).toBe(true);
      expect(res.body.toString()).toBe('binary-image-content');
    });

    it('should return 404 for nonexistent image', async () => {
      mockImageRepo.findOneBy.mockResolvedValue(null);

      const res = await request(app.getHttpServer())
        .get(`/api/images/${NONEXISTENT_UUID}/file`);

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('code', 'IMAGE_NOT_FOUND');
    });

    it('should return 400 for invalid UUID', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/images/not-a-uuid/file');

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('code', 'INVALID_UUID');
    });

    it('should serve image/gif with correct Content-Type', async () => {
      const image = mockImage({ mimeType: 'image/gif', uploadPath: 'test-uploads/abc123.gif' });
      mockImageRepo.findOneBy.mockResolvedValue(image);
      (fsPromises.access as jest.Mock).mockResolvedValue(undefined);
      const mockStream = createMockReadStream(Buffer.from('fake-gif'));
      (fs.createReadStream as jest.Mock).mockReturnValue(mockStream);

      const res = await request(app.getHttpServer())
        .get(`/api/images/${VALID_UUID}/file`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/image\/gif/);
    });

    it('should return 404 when file is missing on disk', async () => {
      const image = mockImage();
      mockImageRepo.findOneBy.mockResolvedValue(image);
      (fsPromises.access as jest.Mock).mockRejectedValue(
        Object.assign(new Error('ENOENT'), { code: 'ENOENT' }),
      );

      const res = await request(app.getHttpServer())
        .get(`/api/images/${VALID_UUID}/file`);

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('code', 'IMAGE_FILE_NOT_FOUND');
    });
  });
});

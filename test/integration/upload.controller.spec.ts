import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as request from 'supertest';
import * as fs from 'fs/promises';
import { UploadModule } from '@/upload/upload.module';
import { ImageEntity } from '@/upload/entities/image.entity';
import { AI_SERVICE_TOKEN } from '@/common/constants';
import { setupApp } from '@/common/setup-app';
import { OpenAiChatCompletion } from '@/ai/interfaces/openai-chat-completion.interface';
import {
  createMinimalPng,
  createMinimalJpeg,
  createMinimalGif,
  createFakeImageBuffer,
  createPngOfSize,
} from '../fixtures/image-buffers';

const UPLOAD_DIR = 'test-uploads';

const mockAnalysisCompletion: OpenAiChatCompletion = {
  id: 'chatcmpl-integration-test',
  object: 'chat.completion',
  created: 1234567890,
  model: 'gpt-4o',
  choices: [
    {
      index: 0,
      message: { role: 'assistant', content: 'Test analysis of uploaded image.' },
      finish_reason: 'stop',
    },
  ],
  usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
};

describe('UploadController (integration)', () => {
  let app: INestApplication;
  let mockRepository: {
    create: jest.Mock;
    save: jest.Mock;
  };
  let mockAiService: {
    analyzeImage: jest.Mock;
    chat: jest.Mock;
    chatStream: jest.Mock;
  };

  beforeEach(async () => {
    mockRepository = {
      create: jest.fn((data) => ({
        id: 'test-uuid-1234',
        ...data,
        createdAt: new Date(),
        updatedAt: new Date(),
        version: 1,
      })),
      save: jest.fn((entity) =>
        Promise.resolve({ ...entity, id: 'test-uuid-1234' }),
      ),
    };

    mockAiService = {
      analyzeImage: jest.fn().mockResolvedValue(mockAnalysisCompletion),
      chat: jest.fn(),
      chatStream: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [
            () => ({
              UPLOAD_DIR,
              MAX_FILE_SIZE: 16 * 1024 * 1024,
            }),
          ],
        }),
        UploadModule,
      ],
    })
      .overrideProvider(getRepositoryToken(ImageEntity))
      .useValue(mockRepository)
      .overrideProvider(AI_SERVICE_TOKEN)
      .useValue(mockAiService)
      .compile();

    app = module.createNestApplication();
    setupApp(app);
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    // Clean up test-uploads directory
    await fs.rm(UPLOAD_DIR, { recursive: true, force: true }).catch(() => {});
  });

  describe('valid uploads', () => {
    it('should upload a valid PNG and return 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/upload')
        .attach('image', createMinimalPng(), 'photo.png');

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body).toHaveProperty('filename', 'photo.png');
      expect(res.body).toHaveProperty('mimeType', 'image/png');
      expect(res.body).toHaveProperty('size');
      expect(res.body.size).toBeGreaterThan(0);
      expect(res.body).toHaveProperty('analysis');
      expect(res.body.analysis).toEqual(mockAnalysisCompletion);
    });

    it('should upload a valid JPEG and return 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/upload')
        .attach('image', createMinimalJpeg(), 'photo.jpg');

      expect(res.status).toBe(201);
      expect(res.body.mimeType).toBe('image/jpeg');
    });

    it('should upload a valid GIF and return 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/upload')
        .attach('image', createMinimalGif(), 'animation.gif');

      expect(res.status).toBe(201);
      expect(res.body.mimeType).toBe('image/gif');
    });
  });

  describe('missing file', () => {
    it('should return 400 with MISSING_FILE when no file is sent', async () => {
      const res = await request(app.getHttpServer()).post('/api/upload');

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('code', 'MISSING_FILE');
      expect(res.body).toHaveProperty('statusCode', 400);
      expect(res.body).toHaveProperty('error');
      expect(res.body).toHaveProperty('message');
      expect(res.body).toHaveProperty('timestamp');
      expect(res.body).toHaveProperty('path');
      expect(res.body).toHaveProperty('requestId');
    });

    it('should return 400 with MISSING_FILE when wrong field name is used', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/upload')
        .attach('file', createMinimalPng(), 'photo.png');

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('code', 'MISSING_FILE');
    });
  });

  describe('invalid file type', () => {
    it('should return 415 with INVALID_FILE_TYPE for .txt file', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/upload')
        .attach('image', Buffer.from('hello world'), 'readme.txt');

      expect(res.status).toBe(415);
      expect(res.body).toHaveProperty('code', 'INVALID_FILE_TYPE');
    });
  });

  describe('magic byte mismatch', () => {
    it('should return 400 with FILE_CONTENT_MISMATCH for mismatched content', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/upload')
        .attach('image', createFakeImageBuffer(), 'fake.png');

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('code', 'FILE_CONTENT_MISMATCH');
    });
  });

  describe('oversized file', () => {
    it('should return 413 with FILE_TOO_LARGE for oversized file', async () => {
      const oversized = createPngOfSize(16 * 1024 * 1024 + 1);
      const res = await request(app.getHttpServer())
        .post('/api/upload')
        .attach('image', oversized, 'huge.png');

      expect(res.status).toBe(413);
      expect(res.body).toHaveProperty('code', 'FILE_TOO_LARGE');
    });
  });

  describe('filename sanitization', () => {
    it('should sanitize path traversal in filename', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/upload')
        .attach('image', createMinimalPng(), '../../etc/passwd.png');

      expect(res.status).toBe(201);
      expect(res.body.filename).not.toContain('..');
      expect(res.body.filename).not.toContain('/');
    });
  });

  describe('response headers', () => {
    it('should include X-Request-Id header', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/upload')
        .attach('image', createMinimalPng(), 'photo.png');

      expect(res.headers['x-request-id']).toBeDefined();
    });
  });

  describe('error shape consistency', () => {
    it('should return consistent error shape with all 7 fields', async () => {
      const res = await request(app.getHttpServer()).post('/api/upload');

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

  describe('file on disk', () => {
    it('should write the uploaded file to the upload directory', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/upload')
        .attach('image', createMinimalPng(), 'disk-test.png');

      expect(res.status).toBe(201);

      // Verify file exists on disk
      const files = await fs.readdir(UPLOAD_DIR);
      const uploadedFiles = files.filter(
        (f) => !f.startsWith('.') && f.endsWith('.png'),
      );
      expect(uploadedFiles.length).toBeGreaterThan(0);
    });
  });

  describe('database persistence', () => {
    it('should persist the image entity to the database', async () => {
      await request(app.getHttpServer())
        .post('/api/upload')
        .attach('image', createMinimalPng(), 'persist-test.png');

      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          originalFilename: 'persist-test.png',
          mimeType: 'image/png',
        }),
      );
      expect(mockRepository.save).toHaveBeenCalled();

      const savedEntity = mockRepository.save.mock.calls[0][0];
      expect(savedEntity).toHaveProperty(
        'originalFilename',
        'persist-test.png',
      );
      expect(savedEntity).toHaveProperty('mimeType', 'image/png');
      expect(savedEntity).toHaveProperty('size');
      expect(savedEntity.storedFilename).toMatch(/^[0-9a-f-]+\.png$/);
      expect(savedEntity.uploadPath).toContain(UPLOAD_DIR);
    });
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import * as fs from 'fs/promises';
import * as uuid from 'uuid';
import { UploadService } from '@/upload/upload.service';
import { ImageEntity } from '@/upload/entities/image.entity';
import { AI_SERVICE_TOKEN } from '@/common/constants';
import { IAiService } from '@/ai/interfaces/ai-service.interface';
import { OpenAiChatCompletion } from '@/ai/interfaces/openai-chat-completion.interface';
import { HistoryService } from '@/history/history.service';

jest.mock('fs/promises');
jest.mock('uuid');

const mockedFs = jest.mocked(fs);
const mockedUuid = jest.mocked(uuid);

const mockAnalysisCompletion: OpenAiChatCompletion = {
  id: 'chatcmpl-test',
  object: 'chat.completion',
  created: 1234567890,
  model: 'gpt-5.2',
  choices: [
    {
      index: 0,
      message: { role: 'assistant', content: 'A test image analysis.' },
      finish_reason: 'stop',
    },
  ],
  usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
};

describe('UploadService', () => {
  let service: UploadService;
  let repository: jest.Mocked<
    Pick<Repository<ImageEntity>, 'create' | 'save'>
  >;
  let aiService: jest.Mocked<Pick<IAiService, 'analyzeImage'>>;

  const UPLOAD_DIR = 'test-uploads';
  const TEST_UUID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

  /** Create a mock file as diskStorage would produce (file.path set, no buffer) */
  function createDiskFile(
    overrides: Partial<Express.Multer.File> = {},
  ): Express.Multer.File {
    return {
      fieldname: 'image',
      originalname: 'photo.png',
      encoding: '7bit',
      mimetype: 'image/png',
      buffer: undefined as unknown as Buffer,
      size: 1024,
      destination: UPLOAD_DIR,
      filename: `.tmp-multer-uuid.png`,
      path: `${UPLOAD_DIR}/.tmp-multer-uuid.png`,
      stream: null as never,
      ...overrides,
    };
  }

  beforeEach(async () => {
    repository = {
      create: jest.fn(),
      save: jest.fn(),
    };

    aiService = {
      analyzeImage: jest.fn().mockResolvedValue(mockAnalysisCompletion),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UploadService,
        {
          provide: getRepositoryToken(ImageEntity),
          useValue: repository,
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'UPLOAD_DIR') return UPLOAD_DIR;
              return undefined;
            }),
          },
        },
        {
          provide: AI_SERVICE_TOKEN,
          useValue: aiService,
        },
        {
          provide: HistoryService,
          useValue: {
            addMessage: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get<UploadService>(UploadService);

    (mockedUuid.v4 as jest.Mock).mockReturnValue(TEST_UUID);
    mockedFs.mkdir.mockResolvedValue(undefined);
    mockedFs.rename.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should create the upload directory on module init', async () => {
    await service.onModuleInit();

    expect(mockedFs.mkdir).toHaveBeenCalledWith(UPLOAD_DIR, {
      recursive: true,
    });
  });

  it('should rename disk file from Multer temp path to final UUID path', async () => {
    const file = createDiskFile();

    const savedEntity = {
      id: TEST_UUID,
      originalFilename: 'photo.png',
      storedFilename: `${TEST_UUID}.png`,
      mimeType: 'image/png',
      size: file.size,
      uploadPath: `${UPLOAD_DIR}/${TEST_UUID}.png`,
      initialAnalysis: mockAnalysisCompletion as unknown as Record<
        string,
        unknown
      >,
    } as ImageEntity;

    repository.create.mockReturnValue(savedEntity);
    repository.save.mockResolvedValue(savedEntity);

    await service.handleUpload(file);

    const finalPath = `${UPLOAD_DIR}/${TEST_UUID}.png`;
    expect(mockedFs.rename).toHaveBeenCalledWith(file.path, finalPath);
  });

  it('should generate a UUID-based stored filename', async () => {
    const file = createDiskFile({ originalname: 'my-photo.png' });

    const savedEntity = {
      id: TEST_UUID,
      originalFilename: 'my-photo.png',
      storedFilename: `${TEST_UUID}.png`,
      mimeType: 'image/png',
      size: file.size,
      uploadPath: `${UPLOAD_DIR}/${TEST_UUID}.png`,
      initialAnalysis: mockAnalysisCompletion as unknown as Record<
        string,
        unknown
      >,
    } as ImageEntity;

    repository.create.mockReturnValue(savedEntity);
    repository.save.mockResolvedValue(savedEntity);

    await service.handleUpload(file);

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        storedFilename: `${TEST_UUID}.png`,
        uploadPath: `${UPLOAD_DIR}/${TEST_UUID}.png`,
      }),
    );
  });

  it('should persist the image entity to the database with AI analysis', async () => {
    const file = createDiskFile();

    const savedEntity = {
      id: TEST_UUID,
      originalFilename: 'photo.png',
      storedFilename: `${TEST_UUID}.png`,
      mimeType: 'image/png',
      size: file.size,
      uploadPath: `${UPLOAD_DIR}/${TEST_UUID}.png`,
      initialAnalysis: mockAnalysisCompletion as unknown as Record<
        string,
        unknown
      >,
    } as ImageEntity;

    repository.create.mockReturnValue(savedEntity);
    repository.save.mockResolvedValue(savedEntity);

    await service.handleUpload(file);

    expect(repository.create).toHaveBeenCalledWith({
      originalFilename: 'photo.png',
      storedFilename: `${TEST_UUID}.png`,
      mimeType: 'image/png',
      size: file.size,
      uploadPath: `${UPLOAD_DIR}/${TEST_UUID}.png`,
      initialAnalysis: mockAnalysisCompletion,
    });
    expect(repository.save).toHaveBeenCalledWith(savedEntity);
  });

  it('should call AI analyzeImage with the upload path', async () => {
    const file = createDiskFile();

    const savedEntity = {
      id: TEST_UUID,
      originalFilename: 'photo.png',
      storedFilename: `${TEST_UUID}.png`,
      mimeType: 'image/png',
      size: file.size,
      uploadPath: `${UPLOAD_DIR}/${TEST_UUID}.png`,
      initialAnalysis: mockAnalysisCompletion as unknown as Record<
        string,
        unknown
      >,
    } as ImageEntity;

    repository.create.mockReturnValue(savedEntity);
    repository.save.mockResolvedValue(savedEntity);

    await service.handleUpload(file);

    expect(aiService.analyzeImage).toHaveBeenCalledWith(
      `${UPLOAD_DIR}/${TEST_UUID}.png`,
    );
  });

  it('should return the upload response with analysis from AI', async () => {
    const file = createDiskFile();

    const savedEntity = {
      id: TEST_UUID,
      originalFilename: 'photo.png',
      storedFilename: `${TEST_UUID}.png`,
      mimeType: 'image/png',
      size: file.size,
      uploadPath: `${UPLOAD_DIR}/${TEST_UUID}.png`,
      initialAnalysis: mockAnalysisCompletion as unknown as Record<
        string,
        unknown
      >,
    } as ImageEntity;

    repository.create.mockReturnValue(savedEntity);
    repository.save.mockResolvedValue(savedEntity);

    const result = await service.handleUpload(file);

    expect(result).toEqual({
      id: TEST_UUID,
      filename: 'photo.png',
      mimeType: 'image/png',
      size: file.size,
      analysis: mockAnalysisCompletion,
    });
  });

  it('should gracefully handle AI analysis failure and return analysis: null', async () => {
    aiService.analyzeImage.mockRejectedValue(new Error('AI service down'));

    const file = createDiskFile();

    const savedEntity = {
      id: TEST_UUID,
      originalFilename: 'photo.png',
      storedFilename: `${TEST_UUID}.png`,
      mimeType: 'image/png',
      size: file.size,
      uploadPath: `${UPLOAD_DIR}/${TEST_UUID}.png`,
      initialAnalysis: null,
    } as ImageEntity;

    repository.create.mockReturnValue(savedEntity);
    repository.save.mockResolvedValue(savedEntity);

    const result = await service.handleUpload(file);

    expect(result.analysis).toBeNull();
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ initialAnalysis: null }),
    );
  });

  it('should extract the correct extension from the original filename', async () => {
    const file = createDiskFile({ originalname: 'my.complex.name.png' });

    const savedEntity = {
      id: TEST_UUID,
      originalFilename: 'my.complex.name.png',
      storedFilename: `${TEST_UUID}.png`,
      mimeType: 'image/png',
      size: file.size,
      uploadPath: `${UPLOAD_DIR}/${TEST_UUID}.png`,
      initialAnalysis: mockAnalysisCompletion as unknown as Record<
        string,
        unknown
      >,
    } as ImageEntity;

    repository.create.mockReturnValue(savedEntity);
    repository.save.mockResolvedValue(savedEntity);

    await service.handleUpload(file);

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        storedFilename: `${TEST_UUID}.png`,
      }),
    );
  });

  it('should clean up both temp and final paths if database save fails', async () => {
    jest.useFakeTimers();
    try {
      const file = createDiskFile();

      const entity = { id: TEST_UUID } as ImageEntity;
      repository.create.mockReturnValue(entity);
      repository.save.mockRejectedValue(new Error('DB connection lost'));
      mockedFs.unlink = jest.fn().mockResolvedValue(undefined);

      const promise = service.handleUpload(file);
      const expectation = expect(promise).rejects.toThrow('DB connection lost');

      // Advance past withRetry delays (500ms + 1000ms)
      await jest.advanceTimersByTimeAsync(500);
      await jest.advanceTimersByTimeAsync(1000);

      await expectation;

      const finalPath = `${UPLOAD_DIR}/${TEST_UUID}.png`;
      expect(mockedFs.unlink).toHaveBeenCalledWith(file.path);
      expect(mockedFs.unlink).toHaveBeenCalledWith(finalPath);
      // withRetry retries 3 times before giving up
      expect(repository.save).toHaveBeenCalledTimes(3);
    } finally {
      jest.useRealTimers();
    }
  });

  it('should propagate DB error even when unlink also fails', async () => {
    jest.useFakeTimers();
    try {
      const file = createDiskFile();

      const entity = { id: TEST_UUID } as ImageEntity;
      repository.create.mockReturnValue(entity);
      repository.save.mockRejectedValue(new Error('DB connection lost'));
      mockedFs.unlink = jest.fn().mockRejectedValue(new Error('ENOENT'));

      const promise = service.handleUpload(file);
      const expectation = expect(promise).rejects.toThrow('DB connection lost');

      await jest.advanceTimersByTimeAsync(500);
      await jest.advanceTimersByTimeAsync(1000);

      await expectation;
    } finally {
      jest.useRealTimers();
    }
  });

  it('should clean up temp file if rename fails', async () => {
    const file = createDiskFile();

    mockedFs.rename.mockRejectedValue(new Error('EXDEV: cross-device rename'));
    mockedFs.unlink = jest.fn().mockResolvedValue(undefined);

    await expect(service.handleUpload(file)).rejects.toThrow('EXDEV');

    expect(mockedFs.unlink).toHaveBeenCalledWith(file.path);
  });
});

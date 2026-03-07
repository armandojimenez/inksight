import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { ConfigService } from '@nestjs/config';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Repository, OptimisticLockVersionMismatchError } from 'typeorm';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import { ImagesService } from '@/upload/images.service';
import { ImageEntity } from '@/upload/entities/image.entity';
import { HistoryService } from '@/history/history.service';
import { AI_SERVICE_TOKEN } from '@/common/constants';
import { IAiService } from '@/ai/interfaces/ai-service.interface';
import { OpenAiChatCompletion } from '@/ai/interfaces/openai-chat-completion.interface';

jest.mock('fs');
jest.mock('fs/promises');

describe('ImagesService', () => {
  let service: ImagesService;
  let imageRepo: jest.Mocked<
    Pick<Repository<ImageEntity>, 'findAndCount' | 'findOneBy' | 'remove' | 'save'>
  >;
  let historyService: jest.Mocked<
    Pick<HistoryService, 'getMessageCount' | 'getMessageCountBatch' | 'deleteByImageId'>
  > & { invalidateCache: jest.Mock };
  let mockCache: {
    get: jest.Mock;
    set: jest.Mock;
    del: jest.Mock;
    clear: jest.Mock;
  };
  let aiService: jest.Mocked<Pick<IAiService, 'analyzeImage'>>;

  const IMAGE_ID = '550e8400-e29b-41d4-a716-446655440000';

  function mockImage(overrides: Partial<ImageEntity> = {}): ImageEntity {
    return {
      id: IMAGE_ID,
      originalFilename: 'test.png',
      storedFilename: 'abc123.png',
      mimeType: 'image/png',
      size: 1024,
      uploadPath: 'uploads/abc123.png',
      initialAnalysis: null,
      createdAt: new Date('2024-01-15'),
      updatedAt: new Date('2024-01-15'),
      version: 1,
      messages: [],
      ...overrides,
    };
  }

  beforeEach(async () => {
    imageRepo = {
      findAndCount: jest.fn(),
      findOneBy: jest.fn(),
      remove: jest.fn(),
      save: jest.fn(),
    };

    aiService = {
      analyzeImage: jest.fn(),
    };

    historyService = {
      getMessageCount: jest.fn().mockResolvedValue(0),
      getMessageCountBatch: jest.fn().mockResolvedValue(new Map()),
      deleteByImageId: jest.fn().mockResolvedValue(undefined),
      invalidateCache: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ImagesService,
        {
          provide: getRepositoryToken(ImageEntity),
          useValue: imageRepo,
        },
        {
          provide: HistoryService,
          useValue: historyService,
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('uploads'),
          },
        },
        {
          provide: AI_SERVICE_TOKEN,
          useValue: aiService,
        },
        {
          provide: CACHE_MANAGER,
          useValue: mockCache = {
            get: jest.fn().mockResolvedValue(undefined),
            set: jest.fn().mockResolvedValue(undefined),
            del: jest.fn().mockResolvedValue(undefined),
            clear: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get<ImagesService>(ImagesService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  describe('listImages', () => {
    it('should return paginated images with message counts ordered DESC', async () => {
      const img1 = mockImage({ id: 'img-1' });
      const img2 = mockImage({ id: 'img-2' });
      imageRepo.findAndCount.mockResolvedValue([[img1, img2], 2]);
      historyService.getMessageCountBatch.mockResolvedValue(
        new Map([['img-1', 5], ['img-2', 3]]),
      );

      const result = await service.listImages(1, 20);

      expect(imageRepo.findAndCount).toHaveBeenCalledWith({
        order: { createdAt: 'DESC' },
        skip: 0,
        take: 20,
      });
      expect(historyService.getMessageCountBatch).toHaveBeenCalledWith([
        'img-1',
        'img-2',
      ]);
      expect(result.images).toHaveLength(2);
      expect(result.images[0]!.messageCount).toBe(5);
      expect(result.images[1]!.messageCount).toBe(3);
      expect(result.total).toBe(2);
    });

    it('should calculate correct skip/take for pagination', async () => {
      imageRepo.findAndCount.mockResolvedValue([[], 0]);

      await service.listImages(3, 10);

      expect(imageRepo.findAndCount).toHaveBeenCalledWith({
        order: { createdAt: 'DESC' },
        skip: 20,
        take: 10,
      });
    });

    it('should return empty result for empty DB', async () => {
      imageRepo.findAndCount.mockResolvedValue([[], 0]);

      const result = await service.listImages();

      expect(result).toEqual({ images: [], total: 0 });
    });

    it('should not expose uploadPath or storedFilename', async () => {
      const img = mockImage();
      imageRepo.findAndCount.mockResolvedValue([[img], 1]);
      historyService.getMessageCount.mockResolvedValue(0);

      const result = await service.listImages();

      const gallery = result.images[0]!;
      expect(gallery).not.toHaveProperty('uploadPath');
      expect(gallery).not.toHaveProperty('storedFilename');
    });
  });

  describe('deleteImage', () => {
    it('should remove file from disk and delete DB record', async () => {
      const image = mockImage();
      imageRepo.findOneBy.mockResolvedValue(image);
      (fsPromises.unlink as jest.Mock).mockResolvedValue(undefined);
      imageRepo.remove.mockResolvedValue(image);

      await service.deleteImage(IMAGE_ID);

      expect(fsPromises.unlink).toHaveBeenCalledWith('uploads/abc123.png');
      expect(imageRepo.remove).toHaveBeenCalledWith(image);
    });

    it('should throw 404 for nonexistent image', async () => {
      imageRepo.findOneBy.mockResolvedValue(null);

      await expect(service.deleteImage(IMAGE_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should handle missing file (ENOENT) gracefully', async () => {
      const image = mockImage();
      imageRepo.findOneBy.mockResolvedValue(image);
      (fsPromises.unlink as jest.Mock).mockRejectedValue(
        Object.assign(new Error('ENOENT'), { code: 'ENOENT' }),
      );
      imageRepo.remove.mockResolvedValue(image);

      // Should not throw — file missing is acceptable
      await expect(service.deleteImage(IMAGE_ID)).resolves.not.toThrow();
      expect(imageRepo.remove).toHaveBeenCalledWith(image);
    });

    it('should rethrow non-ENOENT errors during unlink', async () => {
      const image = mockImage();
      imageRepo.findOneBy.mockResolvedValue(image);
      (fsPromises.unlink as jest.Mock).mockRejectedValue(
        Object.assign(new Error('EPERM'), { code: 'EPERM' }),
      );

      await expect(service.deleteImage(IMAGE_ID)).rejects.toThrow('EPERM');
      expect(imageRepo.remove).not.toHaveBeenCalled();
    });

    it('should reject path traversal in uploadPath', async () => {
      const image = mockImage({ uploadPath: '../../../etc/passwd' });
      imageRepo.findOneBy.mockResolvedValue(image);

      await expect(service.deleteImage(IMAGE_ID)).rejects.toThrow(
        NotFoundException,
      );
      expect(fsPromises.unlink).not.toHaveBeenCalled();
    });
  });

  describe('getImageForServing', () => {
    it('should return stream and metadata for existing image', async () => {
      const image = mockImage();
      imageRepo.findOneBy.mockResolvedValue(image);
      (fsPromises.access as jest.Mock).mockResolvedValue(undefined);
      const mockStream = { pipe: jest.fn() };
      (fs.createReadStream as jest.Mock).mockReturnValue(mockStream);

      const result = await service.getImageForServing(IMAGE_ID);

      expect(result.image).toBe(image);
      expect(result.stream).toBe(mockStream);
      expect(fs.createReadStream).toHaveBeenCalledWith('uploads/abc123.png');
    });

    it('should throw 404 for nonexistent image', async () => {
      imageRepo.findOneBy.mockResolvedValue(null);

      await expect(service.getImageForServing(IMAGE_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw 404 when file is missing on disk', async () => {
      const image = mockImage();
      imageRepo.findOneBy.mockResolvedValue(image);
      (fsPromises.access as jest.Mock).mockRejectedValue(
        Object.assign(new Error('ENOENT'), { code: 'ENOENT' }),
      );

      await expect(service.getImageForServing(IMAGE_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should reject disallowed MIME type', async () => {
      const image = mockImage({ mimeType: 'application/pdf' });
      imageRepo.findOneBy.mockResolvedValue(image);

      await expect(service.getImageForServing(IMAGE_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should accept image/jpeg MIME type', async () => {
      const image = mockImage({ mimeType: 'image/jpeg' });
      imageRepo.findOneBy.mockResolvedValue(image);
      (fsPromises.access as jest.Mock).mockResolvedValue(undefined);
      const mockStream = { pipe: jest.fn() };
      (fs.createReadStream as jest.Mock).mockReturnValue(mockStream);

      const result = await service.getImageForServing(IMAGE_ID);

      expect(result.image.mimeType).toBe('image/jpeg');
    });

    it('should reject path traversal in uploadPath', async () => {
      const image = mockImage({ uploadPath: '../../../etc/passwd' });
      imageRepo.findOneBy.mockResolvedValue(image);

      await expect(service.getImageForServing(IMAGE_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('cache behavior', () => {
    it('getImageForServing should call cache get/set', async () => {
      const image = mockImage();
      imageRepo.findOneBy.mockResolvedValue(image);
      (fsPromises.access as jest.Mock).mockResolvedValue(undefined);
      (fs.createReadStream as jest.Mock).mockReturnValue({ pipe: jest.fn() });

      await service.getImageForServing(IMAGE_ID);

      expect(mockCache.get).toHaveBeenCalledWith(`image:${IMAGE_ID}`);
      expect(mockCache.set).toHaveBeenCalledWith(
        `image:${IMAGE_ID}`,
        image,
        600_000,
      );
    });

    it('getImageForServing should skip DB on cache hit', async () => {
      const image = mockImage();
      mockCache.get.mockResolvedValue(image);
      (fsPromises.access as jest.Mock).mockResolvedValue(undefined);
      (fs.createReadStream as jest.Mock).mockReturnValue({ pipe: jest.fn() });

      const result = await service.getImageForServing(IMAGE_ID);

      expect(result.image).toEqual(image);
      expect(imageRepo.findOneBy).not.toHaveBeenCalled();
    });

    it('deleteImage should invalidate image cache and history cache', async () => {
      const image = mockImage();
      imageRepo.findOneBy.mockResolvedValue(image);
      (fsPromises.unlink as jest.Mock).mockResolvedValue(undefined);
      imageRepo.remove.mockResolvedValue(image);

      await service.deleteImage(IMAGE_ID);

      expect(mockCache.del).toHaveBeenCalledWith(`image:${IMAGE_ID}`);
      expect(historyService.invalidateCache).toHaveBeenCalledWith(IMAGE_ID);
    });
  });

  describe('reanalyzeImage', () => {
    const mockCompletion: OpenAiChatCompletion = {
      id: 'chatcmpl-reanalyze',
      object: 'chat.completion',
      created: 1234567890,
      model: 'gpt-5.2',
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: 'Updated analysis.' },
          finish_reason: 'stop',
        },
      ],
      usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
    };

    it('should re-run AI analysis and return updated entity', async () => {
      const image = mockImage();
      imageRepo.findOneBy.mockResolvedValue(image);
      (fsPromises.access as jest.Mock).mockResolvedValue(undefined);
      aiService.analyzeImage.mockResolvedValue(mockCompletion);
      imageRepo.save.mockResolvedValue({
        ...image,
        initialAnalysis: mockCompletion as unknown as Record<string, unknown>,
        version: 2,
      });

      const result = await service.reanalyzeImage(IMAGE_ID);

      expect(aiService.analyzeImage).toHaveBeenCalledWith('uploads/abc123.png');
      expect(imageRepo.save).toHaveBeenCalled();
      expect(result.id).toBe(IMAGE_ID);
      expect(result.analysis).toEqual(mockCompletion);
      expect(result.version).toBe(2);
    });

    it('should throw 404 for nonexistent image', async () => {
      imageRepo.findOneBy.mockResolvedValue(null);

      await expect(service.reanalyzeImage(IMAGE_ID)).rejects.toThrow(
        NotFoundException,
      );
      expect(aiService.analyzeImage).not.toHaveBeenCalled();
    });

    it('should throw 409 on OptimisticLockVersionMismatchError', async () => {
      const image = mockImage();
      imageRepo.findOneBy.mockResolvedValue(image);
      (fsPromises.access as jest.Mock).mockResolvedValue(undefined);
      aiService.analyzeImage.mockResolvedValue(mockCompletion);
      imageRepo.save.mockRejectedValue(
        new OptimisticLockVersionMismatchError('ImageEntity', 1, 2),
      );

      await expect(service.reanalyzeImage(IMAGE_ID)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should propagate AI service errors', async () => {
      const image = mockImage();
      imageRepo.findOneBy.mockResolvedValue(image);
      (fsPromises.access as jest.Mock).mockResolvedValue(undefined);
      aiService.analyzeImage.mockRejectedValue(new Error('AI timeout'));

      await expect(service.reanalyzeImage(IMAGE_ID)).rejects.toThrow('AI timeout');
    });

    it('should throw 404 when image file is missing on disk', async () => {
      const image = mockImage();
      imageRepo.findOneBy.mockResolvedValue(image);
      (fsPromises.access as jest.Mock).mockRejectedValue(
        Object.assign(new Error('ENOENT'), { code: 'ENOENT' }),
      );

      await expect(service.reanalyzeImage(IMAGE_ID)).rejects.toThrow(
        NotFoundException,
      );
      expect(aiService.analyzeImage).not.toHaveBeenCalled();
    });

    it('should reject path traversal in uploadPath', async () => {
      const image = mockImage({ uploadPath: '../../../etc/passwd' });
      imageRepo.findOneBy.mockResolvedValue(image);

      await expect(service.reanalyzeImage(IMAGE_ID)).rejects.toThrow(
        NotFoundException,
      );
      expect(aiService.analyzeImage).not.toHaveBeenCalled();
    });

    it('should invalidate image cache after successful reanalysis', async () => {
      const image = mockImage();
      imageRepo.findOneBy.mockResolvedValue(image);
      (fsPromises.access as jest.Mock).mockResolvedValue(undefined);
      aiService.analyzeImage.mockResolvedValue(mockCompletion);
      imageRepo.save.mockResolvedValue({
        ...image,
        initialAnalysis: mockCompletion as unknown as Record<string, unknown>,
        version: 2,
      });

      await service.reanalyzeImage(IMAGE_ID);

      expect(mockCache.del).toHaveBeenCalledWith(`image:${IMAGE_ID}`);
    });
  });
});

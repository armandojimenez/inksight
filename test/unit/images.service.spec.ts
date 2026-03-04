import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import { ImagesService } from '@/upload/images.service';
import { ImageEntity } from '@/upload/entities/image.entity';
import { HistoryService } from '@/history/history.service';

jest.mock('fs');
jest.mock('fs/promises');

describe('ImagesService', () => {
  let service: ImagesService;
  let imageRepo: jest.Mocked<
    Pick<Repository<ImageEntity>, 'findAndCount' | 'findOneBy' | 'remove'>
  >;
  let historyService: jest.Mocked<
    Pick<HistoryService, 'getMessageCount' | 'deleteByImageId'>
  >;

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
    };

    historyService = {
      getMessageCount: jest.fn().mockResolvedValue(0),
      deleteByImageId: jest.fn().mockResolvedValue(undefined),
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
      ],
    }).compile();

    service = module.get<ImagesService>(ImagesService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('listImages', () => {
    it('should return paginated images with message counts ordered DESC', async () => {
      const img1 = mockImage({ id: 'img-1' });
      const img2 = mockImage({ id: 'img-2' });
      imageRepo.findAndCount.mockResolvedValue([[img1, img2], 2]);
      historyService.getMessageCount
        .mockResolvedValueOnce(5)
        .mockResolvedValueOnce(3);

      const result = await service.listImages(1, 20);

      expect(imageRepo.findAndCount).toHaveBeenCalledWith({
        order: { createdAt: 'DESC' },
        skip: 0,
        take: 20,
      });
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

    it('should handle missing file gracefully', async () => {
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
  });
});

import { ConfigService } from '@nestjs/config';
import { Cache } from 'cache-manager';
import { Repository } from 'typeorm';
import { CleanupService } from '@/cleanup/cleanup.service';
import { ImageEntity } from '@/upload/entities/image.entity';
import { ChatMessageEntity } from '@/history/entities/chat-message.entity';
import { HistoryService } from '@/history/history.service';
import * as fs from 'fs/promises';

jest.mock('fs/promises');

const mockFs = fs as jest.Mocked<typeof fs>;

function mockImage(overrides: Partial<ImageEntity> = {}): ImageEntity {
  return {
    id: 'img-1',
    originalFilename: 'test.png',
    storedFilename: 'abc.png',
    mimeType: 'image/png',
    size: 1024,
    uploadPath: 'uploads/abc.png',
    initialAnalysis: null,
    createdAt: new Date('2020-01-01'),
    updatedAt: new Date('2020-01-01'),
    version: 1,
    messages: [],
    ...overrides,
  } as ImageEntity;
}

describe('CleanupService', () => {
  let service: CleanupService;
  let imageRepo: Record<string, jest.Mock>;
  let messageRepo: Record<string, jest.Mock>;
  let historyService: Record<string, jest.Mock>;
  let cacheManager: Record<string, jest.Mock>;
  let configService: Partial<ConfigService>;
  let configMap: Record<string, unknown>;

  beforeEach(() => {
    jest.clearAllMocks();

    const imageQueryBuilder = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };
    imageRepo = {
      find: jest.fn().mockResolvedValue([]),
      remove: jest.fn().mockResolvedValue(undefined),
      createQueryBuilder: jest.fn().mockReturnValue(imageQueryBuilder),
    };

    const queryBuilder = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([]),
    };
    messageRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    };

    historyService = {
      invalidateCache: jest.fn().mockResolvedValue(undefined),
    };

    cacheManager = {
      del: jest.fn().mockResolvedValue(undefined),
    };

    configMap = {
      CLEANUP_ENABLED: true,
      CLEANUP_IMAGE_TTL_MS: 86400000,
      CLEANUP_TEMP_TTL_MS: 3600000,
      UPLOAD_DIR: 'uploads',
    };

    configService = {
      get: jest.fn((key: string, defaultVal?: unknown) => {
        return configMap[key] ?? defaultVal;
      }),
    };

    service = new CleanupService(
      imageRepo as unknown as Repository<ImageEntity>,
      messageRepo as unknown as Repository<ChatMessageEntity>,
      historyService as unknown as HistoryService,
      configService as ConfigService,
      cacheManager as unknown as Cache,
    );
  });

  describe('handleCleanup', () => {
    it('should skip when CLEANUP_ENABLED is false', async () => {
      configMap['CLEANUP_ENABLED'] = false;
      await service.handleCleanup();
      expect(imageRepo.find).not.toHaveBeenCalled();
    });

    it('should run cleanup when enabled', async () => {
      await service.handleCleanup();
      expect(imageRepo.find).toHaveBeenCalled();
    });

    it('should guard against re-entrant calls', async () => {
      // Simulate a slow cleanup
      imageRepo.find!.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve([]), 100)),
      );

      const first = service.handleCleanup();
      const second = service.handleCleanup();

      await Promise.all([first, second]);

      // find should only be called once (the second call was skipped)
      expect(imageRepo.find).toHaveBeenCalledTimes(1);
    });

    it('should not throw on cleanup failure', async () => {
      imageRepo.find!.mockRejectedValue(new Error('DB error'));
      await expect(service.handleCleanup()).resolves.not.toThrow();
    });

    it('should loop cleanup batches until a partial batch is returned', async () => {
      // First call returns 100 images (full batch), second returns 50 (partial → stop)
      const fullBatch = Array.from({ length: 100 }, (_, i) =>
        mockImage({ id: `img-${i}`, uploadPath: `uploads/${i}.png` }),
      );
      const partialBatch = Array.from({ length: 50 }, (_, i) =>
        mockImage({ id: `img-${100 + i}`, uploadPath: `uploads/${100 + i}.png` }),
      );

      imageRepo.find!
        .mockResolvedValueOnce(fullBatch)
        .mockResolvedValueOnce(partialBatch);
      mockFs.unlink.mockResolvedValue(undefined);

      await service.handleCleanup();

      // Should have called find twice (full batch → loop, partial → stop)
      expect(imageRepo.find).toHaveBeenCalledTimes(2);
    });

    it('should reset isRunning after failure so next cycle runs', async () => {
      imageRepo.find!.mockRejectedValueOnce(new Error('DB error'));
      await service.handleCleanup(); // first call fails internally

      imageRepo.find!.mockResolvedValue([]);
      await service.handleCleanup(); // second call should run, not skip

      expect(imageRepo.find).toHaveBeenCalledTimes(2);
    });
  });

  describe('cleanupExpiredImages', () => {
    it('should return 0 when no expired images', async () => {
      const result = await service.cleanupExpiredImages();
      expect(result).toBe(0);
    });

    it('should delete expired images with no recent activity', async () => {
      const img = mockImage();
      imageRepo.find!.mockResolvedValue([img]);
      mockFs.unlink.mockResolvedValue(undefined);

      const result = await service.cleanupExpiredImages();

      expect(result).toBe(1);
      expect(historyService.invalidateCache).toHaveBeenCalledWith('img-1');
      expect(imageRepo.remove).toHaveBeenCalledWith(img);
      expect(mockFs.unlink).toHaveBeenCalledWith('uploads/abc.png');
    });

    it('should skip images with recent chat activity', async () => {
      const img = mockImage();
      imageRepo.find!.mockResolvedValue([img]);

      const qb = messageRepo.createQueryBuilder!('msg') as any;
      qb.getRawMany.mockResolvedValue([{ imageId: 'img-1' }]);

      const result = await service.cleanupExpiredImages();
      expect(result).toBe(0);
      expect(imageRepo.remove).not.toHaveBeenCalled();
    });

    it('should tolerate ENOENT when deleting files', async () => {
      const img = mockImage();
      imageRepo.find!.mockResolvedValue([img]);
      const enoent = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      mockFs.unlink.mockRejectedValue(enoent);

      const result = await service.cleanupExpiredImages();
      expect(result).toBe(1);
    });

    it('should continue on individual image deletion failure', async () => {
      const img1 = mockImage({ id: 'img-1' });
      const img2 = mockImage({ id: 'img-2', uploadPath: 'uploads/def.png' });
      imageRepo.find!.mockResolvedValue([img1, img2]);
      imageRepo.remove!
        .mockRejectedValueOnce(new Error('DB error'))
        .mockResolvedValueOnce(undefined);
      mockFs.unlink.mockResolvedValue(undefined);

      const result = await service.cleanupExpiredImages();
      // Only img2 succeeds
      expect(result).toBe(1);
    });

    it('should block path traversal in cleanup and not delete file', async () => {
      const img = mockImage({
        uploadPath: '/etc/passwd',
      });
      imageRepo.find!.mockResolvedValue([img]);
      mockFs.unlink.mockResolvedValue(undefined);

      const result = await service.cleanupExpiredImages();

      // Image DB record is still removed, but fs.unlink should NOT be called
      // because path traversal is blocked
      expect(result).toBe(1);
      expect(imageRepo.remove).toHaveBeenCalledWith(img);
      expect(mockFs.unlink).not.toHaveBeenCalled();
    });

    it('should invalidate image cache entry on deletion', async () => {
      const img = mockImage();
      imageRepo.find!.mockResolvedValue([img]);
      mockFs.unlink.mockResolvedValue(undefined);

      await service.cleanupExpiredImages();

      expect(cacheManager.del).toHaveBeenCalledWith('image:img-1');
    });

    it('should query with BATCH_SIZE limit', async () => {
      await service.cleanupExpiredImages();
      expect(imageRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ take: 100 }),
      );
    });

    it('should use configurable TTL', async () => {
      configMap['CLEANUP_IMAGE_TTL_MS'] = 1000;
      await service.cleanupExpiredImages();
      expect(imageRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: expect.anything(),
          }),
        }),
      );
    });
  });

  describe('cleanupOrphanedTempFiles', () => {
    it('should return 0 when upload dir does not exist', async () => {
      const enoent = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      mockFs.readdir.mockRejectedValue(enoent);

      const result = await service.cleanupOrphanedTempFiles();
      expect(result).toBe(0);
    });

    it('should return 0 when no temp files exist', async () => {
      mockFs.readdir.mockResolvedValue(['abc.png', 'def.jpg'] as any);

      const result = await service.cleanupOrphanedTempFiles();
      expect(result).toBe(0);
    });

    it('should delete old temp files', async () => {
      mockFs.readdir.mockResolvedValue(['.tmp-abc'] as any);
      mockFs.stat.mockResolvedValue({ mtimeMs: 0 } as any);
      mockFs.unlink.mockResolvedValue(undefined);

      const result = await service.cleanupOrphanedTempFiles();
      expect(result).toBe(1);
      expect(mockFs.unlink).toHaveBeenCalled();
    });

    it('should skip recently modified temp files', async () => {
      mockFs.readdir.mockResolvedValue(['.tmp-abc'] as any);
      mockFs.stat.mockResolvedValue({ mtimeMs: Date.now() } as any);

      const result = await service.cleanupOrphanedTempFiles();
      expect(result).toBe(0);
    });

    it('should skip non-temp files', async () => {
      mockFs.readdir.mockResolvedValue(['normal.png', '.tmp-old'] as any);
      mockFs.stat.mockResolvedValue({ mtimeMs: 0 } as any);
      mockFs.unlink.mockResolvedValue(undefined);

      const result = await service.cleanupOrphanedTempFiles();
      // Only .tmp-old is deleted
      expect(result).toBe(1);
    });

    it('should tolerate ENOENT on individual temp files', async () => {
      mockFs.readdir.mockResolvedValue(['.tmp-abc'] as any);
      mockFs.stat.mockResolvedValue({ mtimeMs: 0 } as any);
      const enoent = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      mockFs.unlink.mockRejectedValue(enoent);

      const result = await service.cleanupOrphanedTempFiles();
      expect(result).toBe(0);
    });

    it('should rethrow non-ENOENT readdir errors', async () => {
      const permError = Object.assign(new Error('EPERM'), { code: 'EPERM' });
      mockFs.readdir.mockRejectedValue(permError);

      await expect(service.cleanupOrphanedTempFiles()).rejects.toThrow('EPERM');
    });

    it('should warn on non-ENOENT error during temp file cleanup', async () => {
      mockFs.readdir.mockResolvedValue(['.tmp-abc'] as any);
      mockFs.stat.mockResolvedValue({ mtimeMs: 0 } as any);
      const permError = Object.assign(new Error('EPERM'), { code: 'EPERM' });
      mockFs.unlink.mockRejectedValue(permError);

      const result = await service.cleanupOrphanedTempFiles();
      // Non-ENOENT errors are warned but not rethrown; file not counted as deleted
      expect(result).toBe(0);
    });

    it('should use configurable temp TTL', async () => {
      configMap['CLEANUP_TEMP_TTL_MS'] = 1;
      mockFs.readdir.mockResolvedValue(['.tmp-abc'] as any);
      mockFs.stat.mockResolvedValue({ mtimeMs: Date.now() - 10 } as any);
      mockFs.unlink.mockResolvedValue(undefined);

      const result = await service.cleanupOrphanedTempFiles();
      expect(result).toBe(1);
    });
  });

  describe('cleanupOrphanedFiles', () => {
    it('should return 0 when upload dir does not exist', async () => {
      const enoent = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      mockFs.readdir.mockRejectedValue(enoent);

      const result = await service.cleanupOrphanedFiles();
      expect(result).toBe(0);
    });

    it('should return 0 when no UUID-named files exist', async () => {
      mockFs.readdir.mockResolvedValue(['.tmp-abc', 'readme.txt'] as any);

      const result = await service.cleanupOrphanedFiles();
      expect(result).toBe(0);
    });

    it('should delete files with no matching DB record', async () => {
      const orphanFile = '550e8400-e29b-41d4-a716-446655440000.png';
      mockFs.readdir.mockResolvedValue([orphanFile] as any);

      const qb = imageRepo.createQueryBuilder!('img') as any;
      qb.getMany.mockResolvedValue([]); // no DB records match

      mockFs.unlink.mockResolvedValue(undefined);

      const result = await service.cleanupOrphanedFiles();
      expect(result).toBe(1);
      expect(mockFs.unlink).toHaveBeenCalled();
    });

    it('should keep files that have a matching DB record', async () => {
      const knownFile = '550e8400-e29b-41d4-a716-446655440000.png';
      mockFs.readdir.mockResolvedValue([knownFile] as any);

      const qb = imageRepo.createQueryBuilder!('img') as any;
      qb.getMany.mockResolvedValue([{ storedFilename: knownFile }]);

      const result = await service.cleanupOrphanedFiles();
      expect(result).toBe(0);
      expect(mockFs.unlink).not.toHaveBeenCalled();
    });

    it('should tolerate ENOENT when deleting orphan files', async () => {
      const orphanFile = '550e8400-e29b-41d4-a716-446655440000.jpg';
      mockFs.readdir.mockResolvedValue([orphanFile] as any);

      const qb = imageRepo.createQueryBuilder!('img') as any;
      qb.getMany.mockResolvedValue([]);

      const enoent = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      mockFs.unlink.mockRejectedValue(enoent);

      const result = await service.cleanupOrphanedFiles();
      expect(result).toBe(0);
    });

    it('should ignore non-UUID files like .gitkeep or random names', async () => {
      mockFs.readdir.mockResolvedValue(['.gitkeep', 'random.png', '.tmp-abc'] as any);

      const result = await service.cleanupOrphanedFiles();
      expect(result).toBe(0);
      expect(imageRepo.createQueryBuilder).not.toHaveBeenCalled();
    });
  });
});

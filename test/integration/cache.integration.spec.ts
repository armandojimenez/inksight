import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { CacheModule as NestCacheModule } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import { Keyv } from 'keyv';
import { KeyvCacheableMemory } from 'cacheable';
import { HistoryService } from '@/history/history.service';
import { ImagesService } from '@/upload/images.service';
import { ChatMessageEntity } from '@/history/entities/chat-message.entity';
import { ImageEntity } from '@/upload/entities/image.entity';

jest.mock('fs');
jest.mock('fs/promises');

const IMAGE_ID_A = '550e8400-e29b-41d4-a716-446655440000';
const IMAGE_ID_B = '660e8400-e29b-41d4-a716-446655440001';

function mockImage(id = IMAGE_ID_A): ImageEntity {
  return {
    id,
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
  };
}

describe('Cache Integration', () => {
  let historyService: HistoryService;
  let imagesService: ImagesService;
  let cacheManager: Cache;
  let mockMessageRepo: jest.Mocked<
    Pick<
      Repository<ChatMessageEntity>,
      'save' | 'create' | 'findAndCount' | 'find' | 'count' | 'delete' | 'createQueryBuilder'
    >
  >;
  let mockImageRepo: jest.Mocked<Pick<Repository<ImageEntity>, 'findOneBy' | 'findAndCount' | 'remove'>>;
  let mockQueryBuilder: {
    delete: jest.Mock;
    where: jest.Mock;
    execute: jest.Mock;
  };

  beforeEach(async () => {
    mockQueryBuilder = {
      delete: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 0 }),
    };

    mockMessageRepo = {
      save: jest.fn().mockImplementation((entity) =>
        Promise.resolve({ ...entity, id: `msg-${Date.now()}` }),
      ),
      create: jest.fn().mockImplementation((data) => ({ ...data })),
      findAndCount: jest.fn().mockResolvedValue([[], 0]),
      find: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      delete: jest.fn().mockResolvedValue({ affected: 0, raw: [] }),
      createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder) as jest.Mock,
    };

    mockImageRepo = {
      findOneBy: jest.fn(),
      findAndCount: jest.fn().mockResolvedValue([[], 0]),
      remove: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      imports: [
        NestCacheModule.register({
          isGlobal: true,
          ttl: 300_000,
          stores: [
            new Keyv({
              store: new KeyvCacheableMemory({ lruSize: 100, useClone: true }),
            }),
          ],
        }),
      ],
      providers: [
        HistoryService,
        ImagesService,
        {
          provide: getRepositoryToken(ChatMessageEntity),
          useValue: mockMessageRepo,
        },
        {
          provide: getRepositoryToken(ImageEntity),
          useValue: mockImageRepo,
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('uploads') },
        },
      ],
    }).compile();

    historyService = module.get<HistoryService>(HistoryService);
    imagesService = module.get<ImagesService>(ImagesService);
    cacheManager = module.get<Cache>(CACHE_MANAGER);
  });

  afterEach(async () => {
    await cacheManager.clear();
    jest.clearAllMocks();
  });

  describe('HistoryService.getHistory cache', () => {
    it('should miss cache on first call and hit DB', async () => {
      const messages = [{ id: 'm1' }] as ChatMessageEntity[];
      mockMessageRepo.findAndCount.mockResolvedValue([messages, 1]);

      const result = await historyService.getHistory(IMAGE_ID_A);

      expect(mockMessageRepo.findAndCount).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ messages, total: 1 });
    });

    it('should hit cache on second call and skip DB', async () => {
      const messages = [{ id: 'm1' }] as ChatMessageEntity[];
      mockMessageRepo.findAndCount.mockResolvedValue([messages, 1]);

      await historyService.getHistory(IMAGE_ID_A);
      mockMessageRepo.findAndCount.mockClear();

      const result = await historyService.getHistory(IMAGE_ID_A);

      expect(mockMessageRepo.findAndCount).not.toHaveBeenCalled();
      expect(result).toEqual({ messages, total: 1 });
    });

    it('should not cache non-default pagination (page 2)', async () => {
      mockMessageRepo.findAndCount.mockResolvedValue([[], 0]);

      await historyService.getHistory(IMAGE_ID_A, 2, 20);
      mockMessageRepo.findAndCount.mockClear();

      await historyService.getHistory(IMAGE_ID_A, 2, 20);

      expect(mockMessageRepo.findAndCount).toHaveBeenCalledTimes(1);
    });

    it('should not cache non-default limit', async () => {
      mockMessageRepo.findAndCount.mockResolvedValue([[], 0]);

      await historyService.getHistory(IMAGE_ID_A, 1, 10);
      mockMessageRepo.findAndCount.mockClear();

      await historyService.getHistory(IMAGE_ID_A, 1, 10);

      expect(mockMessageRepo.findAndCount).toHaveBeenCalledTimes(1);
    });

    it('should invalidate cache after addMessage', async () => {
      mockMessageRepo.findAndCount.mockResolvedValue([[], 0]);
      await historyService.getHistory(IMAGE_ID_A);

      mockMessageRepo.findAndCount.mockClear();
      await historyService.addMessage(IMAGE_ID_A, 'user', 'Hello');

      // Cache invalidated — next call should hit DB
      const newMessages = [{ id: 'm2' }] as ChatMessageEntity[];
      mockMessageRepo.findAndCount.mockResolvedValue([newMessages, 1]);
      const result = await historyService.getHistory(IMAGE_ID_A);

      expect(mockMessageRepo.findAndCount).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ messages: newMessages, total: 1 });
    });
  });

  describe('HistoryService.getRecentMessages cache', () => {
    it('should miss cache then hit cache on second call (default count)', async () => {
      const dbMessages = [
        { role: 'user', content: 'Hi' },
      ] as ChatMessageEntity[];
      mockMessageRepo.find.mockResolvedValue(dbMessages);

      await historyService.getRecentMessages(IMAGE_ID_A);
      mockMessageRepo.find.mockClear();

      const result = await historyService.getRecentMessages(IMAGE_ID_A);

      expect(mockMessageRepo.find).not.toHaveBeenCalled();
      expect(result).toEqual([{ role: 'user', content: 'Hi' }]);
    });

    it('should not cache non-default count', async () => {
      mockMessageRepo.find.mockResolvedValue([]);

      await historyService.getRecentMessages(IMAGE_ID_A, 10);
      mockMessageRepo.find.mockClear();

      await historyService.getRecentMessages(IMAGE_ID_A, 10);

      expect(mockMessageRepo.find).toHaveBeenCalledTimes(1);
    });
  });

  describe('ImagesService.getImageForServing cache', () => {
    it('should cache image entity on first call', async () => {
      const image = mockImage();
      mockImageRepo.findOneBy.mockResolvedValue(image);
      (fsPromises.access as jest.Mock).mockResolvedValue(undefined);
      (fs.createReadStream as jest.Mock).mockReturnValue({ pipe: jest.fn() });

      await imagesService.getImageForServing(IMAGE_ID_A);

      expect(mockImageRepo.findOneBy).toHaveBeenCalledTimes(1);
    });

    it('should skip DB on cache hit for image entity', async () => {
      const image = mockImage();
      mockImageRepo.findOneBy.mockResolvedValue(image);
      (fsPromises.access as jest.Mock).mockResolvedValue(undefined);
      (fs.createReadStream as jest.Mock).mockReturnValue({ pipe: jest.fn() });

      await imagesService.getImageForServing(IMAGE_ID_A);
      mockImageRepo.findOneBy.mockClear();

      await imagesService.getImageForServing(IMAGE_ID_A);

      expect(mockImageRepo.findOneBy).not.toHaveBeenCalled();
    });

    it('should create ReadStream fresh each time even on cache hit', async () => {
      const image = mockImage();
      mockImageRepo.findOneBy.mockResolvedValue(image);
      (fsPromises.access as jest.Mock).mockResolvedValue(undefined);
      const stream1 = { pipe: jest.fn() };
      const stream2 = { pipe: jest.fn() };
      (fs.createReadStream as jest.Mock)
        .mockReturnValueOnce(stream1)
        .mockReturnValueOnce(stream2);

      const result1 = await imagesService.getImageForServing(IMAGE_ID_A);
      const result2 = await imagesService.getImageForServing(IMAGE_ID_A);

      expect(result1.stream).toBe(stream1);
      expect(result2.stream).toBe(stream2);
      expect(fs.createReadStream).toHaveBeenCalledTimes(2);
    });
  });

  describe('deleteImage invalidation', () => {
    it('should invalidate image, history, and recent cache keys', async () => {
      const image = mockImage();
      mockImageRepo.findOneBy.mockResolvedValue(image);
      (fsPromises.unlink as jest.Mock).mockResolvedValue(undefined);
      (fsPromises.access as jest.Mock).mockResolvedValue(undefined);
      (fs.createReadStream as jest.Mock).mockReturnValue({ pipe: jest.fn() });

      // Populate caches
      await imagesService.getImageForServing(IMAGE_ID_A);
      mockMessageRepo.findAndCount.mockResolvedValue([[], 0]);
      await historyService.getHistory(IMAGE_ID_A);
      mockMessageRepo.find.mockResolvedValue([]);
      await historyService.getRecentMessages(IMAGE_ID_A);

      // Delete — should invalidate all 3 keys
      await imagesService.deleteImage(IMAGE_ID_A);

      // Verify caches are empty by checking DB is queried again
      mockImageRepo.findOneBy.mockClear();
      mockMessageRepo.findAndCount.mockClear();
      mockMessageRepo.find.mockClear();

      mockImageRepo.findOneBy.mockResolvedValue(image);
      mockMessageRepo.findAndCount.mockResolvedValue([[], 0]);
      mockMessageRepo.find.mockResolvedValue([]);

      await imagesService.getImageForServing(IMAGE_ID_A);
      await historyService.getHistory(IMAGE_ID_A);
      await historyService.getRecentMessages(IMAGE_ID_A);

      expect(mockImageRepo.findOneBy).toHaveBeenCalledTimes(1);
      expect(mockMessageRepo.findAndCount).toHaveBeenCalledTimes(1);
      expect(mockMessageRepo.find).toHaveBeenCalledTimes(1);
    });
  });

  describe('enforceHistoryCap invalidation', () => {
    it('should invalidate cache when messages are actually deleted', async () => {
      mockMessageRepo.findAndCount.mockResolvedValue([[], 0]);
      await historyService.getHistory(IMAGE_ID_A);

      mockMessageRepo.count.mockResolvedValue(53);
      await historyService.enforceHistoryCap(IMAGE_ID_A);

      // Cache should be invalidated
      mockMessageRepo.findAndCount.mockClear();
      mockMessageRepo.findAndCount.mockResolvedValue([[], 0]);

      await historyService.getHistory(IMAGE_ID_A);

      expect(mockMessageRepo.findAndCount).toHaveBeenCalledTimes(1);
    });

    it('should NOT invalidate cache when count is within cap', async () => {
      mockMessageRepo.findAndCount.mockResolvedValue([[], 0]);
      await historyService.getHistory(IMAGE_ID_A);

      mockMessageRepo.count.mockResolvedValue(50);
      await historyService.enforceHistoryCap(IMAGE_ID_A);

      // Cache should still be valid
      mockMessageRepo.findAndCount.mockClear();

      await historyService.getHistory(IMAGE_ID_A);

      expect(mockMessageRepo.findAndCount).not.toHaveBeenCalled();
    });
  });

  describe('deleteByImageId invalidation', () => {
    it('should invalidate history and recent cache', async () => {
      mockMessageRepo.findAndCount.mockResolvedValue([[], 0]);
      mockMessageRepo.find.mockResolvedValue([]);
      await historyService.getHistory(IMAGE_ID_A);
      await historyService.getRecentMessages(IMAGE_ID_A);

      await historyService.deleteByImageId(IMAGE_ID_A);

      mockMessageRepo.findAndCount.mockClear();
      mockMessageRepo.find.mockClear();
      mockMessageRepo.findAndCount.mockResolvedValue([[], 0]);
      mockMessageRepo.find.mockResolvedValue([]);

      await historyService.getHistory(IMAGE_ID_A);
      await historyService.getRecentMessages(IMAGE_ID_A);

      expect(mockMessageRepo.findAndCount).toHaveBeenCalledTimes(1);
      expect(mockMessageRepo.find).toHaveBeenCalledTimes(1);
    });
  });

  describe('cross-contamination', () => {
    it('should not share history cache between different imageIds', async () => {
      const messagesA = [{ id: 'mA' }] as ChatMessageEntity[];
      const messagesB = [{ id: 'mB' }] as ChatMessageEntity[];

      mockMessageRepo.findAndCount.mockResolvedValueOnce([messagesA, 1]);
      await historyService.getHistory(IMAGE_ID_A);

      mockMessageRepo.findAndCount.mockResolvedValueOnce([messagesB, 1]);
      await historyService.getHistory(IMAGE_ID_B);

      // Both should be cached independently
      mockMessageRepo.findAndCount.mockClear();

      const resultA = await historyService.getHistory(IMAGE_ID_A);
      const resultB = await historyService.getHistory(IMAGE_ID_B);

      expect(mockMessageRepo.findAndCount).not.toHaveBeenCalled();
      expect(resultA.messages[0]!.id).toBe('mA');
      expect(resultB.messages[0]!.id).toBe('mB');
    });

    it('addMessage for imageId A should not invalidate imageId B history cache', async () => {
      mockMessageRepo.findAndCount.mockResolvedValue([[], 0]);
      await historyService.getHistory(IMAGE_ID_B);

      await historyService.addMessage(IMAGE_ID_A, 'user', 'Hello');

      // B's cache should still be valid
      mockMessageRepo.findAndCount.mockClear();
      await historyService.getHistory(IMAGE_ID_B);

      expect(mockMessageRepo.findAndCount).not.toHaveBeenCalled();
    });

    it('addMessage for imageId A should not invalidate imageId B recent cache', async () => {
      const dbMessages = [{ role: 'user', content: 'Hi' }] as ChatMessageEntity[];
      mockMessageRepo.find.mockResolvedValue(dbMessages);
      await historyService.getRecentMessages(IMAGE_ID_B);

      await historyService.addMessage(IMAGE_ID_A, 'user', 'Hello');

      // B's recent cache should still be valid
      mockMessageRepo.find.mockClear();
      const result = await historyService.getRecentMessages(IMAGE_ID_B);

      expect(mockMessageRepo.find).not.toHaveBeenCalled();
      expect(result).toEqual([{ role: 'user', content: 'Hi' }]);
    });
  });

  describe('error resilience', () => {
    it('getHistory should fall through to DB when cache get throws', async () => {
      const messages = [{ id: 'm1' }] as ChatMessageEntity[];
      mockMessageRepo.findAndCount.mockResolvedValue([messages, 1]);

      const spy = jest.spyOn(cacheManager, 'get').mockRejectedValue(new Error('cache failure'));

      const result = await historyService.getHistory(IMAGE_ID_A);

      expect(result).toEqual({ messages, total: 1 });
      expect(mockMessageRepo.findAndCount).toHaveBeenCalledTimes(1);

      spy.mockRestore();
    });

    it('getHistory should still return DB result when cache set throws', async () => {
      const messages = [{ id: 'm1' }] as ChatMessageEntity[];
      mockMessageRepo.findAndCount.mockResolvedValue([messages, 1]);

      const spy = jest.spyOn(cacheManager, 'set').mockRejectedValue(new Error('cache failure'));

      const result = await historyService.getHistory(IMAGE_ID_A);

      expect(result).toEqual({ messages, total: 1 });

      spy.mockRestore();
    });

    it('getRecentMessages should fall through to DB when cache get throws', async () => {
      const dbMessages = [{ role: 'user', content: 'Hi' }] as ChatMessageEntity[];
      mockMessageRepo.find.mockResolvedValue(dbMessages);

      const spy = jest.spyOn(cacheManager, 'get').mockRejectedValue(new Error('cache failure'));

      const result = await historyService.getRecentMessages(IMAGE_ID_A);

      expect(result).toEqual([{ role: 'user', content: 'Hi' }]);
      expect(mockMessageRepo.find).toHaveBeenCalledTimes(1);

      spy.mockRestore();
    });

    it('getRecentMessages should return DB result when cache set throws', async () => {
      const dbMessages = [{ role: 'user', content: 'Hi' }] as ChatMessageEntity[];
      mockMessageRepo.find.mockResolvedValue(dbMessages);

      const spy = jest.spyOn(cacheManager, 'set').mockRejectedValue(new Error('cache failure'));

      const result = await historyService.getRecentMessages(IMAGE_ID_A);

      expect(result).toEqual([{ role: 'user', content: 'Hi' }]);

      spy.mockRestore();
    });

    it('getImageForServing should fall through to DB when cache get throws', async () => {
      const image = mockImage();
      mockImageRepo.findOneBy.mockResolvedValue(image);
      (fsPromises.access as jest.Mock).mockResolvedValue(undefined);
      (fs.createReadStream as jest.Mock).mockReturnValue({ pipe: jest.fn() });

      const spy = jest.spyOn(cacheManager, 'get').mockRejectedValue(new Error('cache failure'));

      const result = await imagesService.getImageForServing(IMAGE_ID_A);

      expect(result.image).toEqual(image);
      expect(mockImageRepo.findOneBy).toHaveBeenCalledTimes(1);

      spy.mockRestore();
    });

    it('getImageForServing should return result when cache set throws', async () => {
      const image = mockImage();
      mockImageRepo.findOneBy.mockResolvedValue(image);
      (fsPromises.access as jest.Mock).mockResolvedValue(undefined);
      (fs.createReadStream as jest.Mock).mockReturnValue({ pipe: jest.fn() });

      const spy = jest.spyOn(cacheManager, 'set').mockRejectedValue(new Error('cache failure'));

      const result = await imagesService.getImageForServing(IMAGE_ID_A);

      expect(result.image).toEqual(image);

      spy.mockRestore();
    });

    it('deleteImage should not throw when cache del fails', async () => {
      const image = mockImage();
      mockImageRepo.findOneBy.mockResolvedValue(image);
      (fsPromises.unlink as jest.Mock).mockResolvedValue(undefined);

      const spy = jest.spyOn(cacheManager, 'del').mockRejectedValue(new Error('cache failure'));

      await expect(imagesService.deleteImage(IMAGE_ID_A)).resolves.not.toThrow();

      spy.mockRestore();
    });

    it('invalidateCache should not throw when cache del fails', async () => {
      const spy = jest.spyOn(cacheManager, 'del').mockRejectedValue(new Error('cache failure'));

      await expect(historyService.invalidateCache(IMAGE_ID_A)).resolves.not.toThrow();

      spy.mockRestore();
    });
  });

  describe('TTL expiry', () => {
    let shortTtlModule: TestingModule;
    let shortTtlHistory: HistoryService;
    let shortTtlCache: Cache;

    beforeEach(async () => {
      shortTtlModule = await Test.createTestingModule({
        imports: [
          NestCacheModule.register({
            isGlobal: true,
            ttl: 50, // 50ms TTL
            stores: [
              new Keyv({
                store: new KeyvCacheableMemory({ lruSize: 100, useClone: true }),
              }),
            ],
          }),
        ],
        providers: [
          HistoryService,
          {
            provide: getRepositoryToken(ChatMessageEntity),
            useValue: mockMessageRepo,
          },
        ],
      }).compile();

      shortTtlHistory = shortTtlModule.get<HistoryService>(HistoryService);
      shortTtlCache = shortTtlModule.get<Cache>(CACHE_MANAGER);
    });

    afterEach(async () => {
      await shortTtlModule.close();
      await shortTtlCache.clear();
    });

    it('should expire cached data after TTL', async () => {
      mockMessageRepo.findAndCount.mockResolvedValue([[{ id: 'm1' }] as ChatMessageEntity[], 1]);

      await shortTtlHistory.getHistory(IMAGE_ID_A);
      mockMessageRepo.findAndCount.mockClear();

      // Wait for TTL to expire (10x margin for CI)
      await new Promise((r) => setTimeout(r, 500));

      mockMessageRepo.findAndCount.mockResolvedValue([[{ id: 'm2' }] as ChatMessageEntity[], 1]);
      const result = await shortTtlHistory.getHistory(IMAGE_ID_A);

      expect(mockMessageRepo.findAndCount).toHaveBeenCalledTimes(1);
      expect(result.messages[0]!.id).toBe('m2');
    });
  });

  describe('LRU eviction', () => {
    it('should evict oldest entries when cache max is exceeded', async () => {
      // Fill 150 entries — LRU limit is 100
      for (let i = 0; i < 150; i++) {
        await cacheManager.set(`lru-test:${i}`, { data: i });
      }

      // Earliest entry should be evicted
      const evicted = await cacheManager.get<{ data: number }>('lru-test:0');
      expect(evicted).toBeUndefined();

      // Latest entry should be retained
      const retained = await cacheManager.get<{ data: number }>('lru-test:149');
      expect(retained).toEqual({ data: 149 });
    });
  });

  describe('mutation safety', () => {
    it('should not corrupt cache when returned object is mutated', async () => {
      const messages = [{ id: 'm1', content: 'original' }] as ChatMessageEntity[];
      mockMessageRepo.findAndCount.mockResolvedValue([messages, 1]);

      // Populate cache
      const result1 = await historyService.getHistory(IMAGE_ID_A);

      // Mutate the returned object
      result1.messages[0]!.content = 'MUTATED';

      // Read from cache again — should get original value
      mockMessageRepo.findAndCount.mockClear();
      const result2 = await historyService.getHistory(IMAGE_ID_A);

      expect(mockMessageRepo.findAndCount).not.toHaveBeenCalled();
      expect(result2.messages[0]!.content).toBe('original');
    });
  });
});

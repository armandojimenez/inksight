import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Repository } from 'typeorm';
import { HistoryService } from '@/history/history.service';
import { ChatMessageEntity } from '@/history/entities/chat-message.entity';

describe('HistoryService', () => {
  let service: HistoryService;
  let repo: jest.Mocked<
    Pick<
      Repository<ChatMessageEntity>,
      'save' | 'create' | 'findAndCount' | 'find' | 'count' | 'remove' | 'delete' | 'createQueryBuilder'
    >
  >;
  let mockCache: {
    get: jest.Mock;
    set: jest.Mock;
    del: jest.Mock;
    clear: jest.Mock;
  };
  let mockQueryBuilder: {
    delete: jest.Mock;
    select: jest.Mock;
    addSelect: jest.Mock;
    where: jest.Mock;
    groupBy: jest.Mock;
    execute: jest.Mock;
    getRawMany: jest.Mock;
  };

  const IMAGE_ID_A = '550e8400-e29b-41d4-a716-446655440000';
  const IMAGE_ID_B = '660e8400-e29b-41d4-a716-446655440001';

  beforeEach(async () => {
    mockQueryBuilder = {
      delete: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 0 }),
      getRawMany: jest.fn().mockResolvedValue([]),
    };

    repo = {
      save: jest.fn(),
      create: jest.fn(),
      findAndCount: jest.fn(),
      find: jest.fn(),
      count: jest.fn(),
      remove: jest.fn(),
      delete: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder) as jest.Mock,
    };

    mockCache = {
      get: jest.fn().mockResolvedValue(undefined),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
      clear: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HistoryService,
        {
          provide: getRepositoryToken(ChatMessageEntity),
          useValue: repo,
        },
        {
          provide: CACHE_MANAGER,
          useValue: mockCache,
        },
      ],
    }).compile();

    service = module.get<HistoryService>(HistoryService);
  });

  describe('addMessage', () => {
    it('should persist a user message', async () => {
      const entity = {
        id: 'msg-1',
        imageId: IMAGE_ID_A,
        role: 'user',
        content: 'Hello',
        tokenCount: null,
      } as ChatMessageEntity;
      repo.create.mockReturnValue(entity);
      repo.save.mockResolvedValue(entity);

      await service.addMessage(IMAGE_ID_A, 'user', 'Hello');

      expect(repo.create).toHaveBeenCalledWith({
        imageId: IMAGE_ID_A,
        role: 'user',
        content: 'Hello',
        tokenCount: null,
      });
      expect(repo.save).toHaveBeenCalledWith(entity);
    });

    it('should persist an assistant message', async () => {
      const entity = {
        id: 'msg-2',
        imageId: IMAGE_ID_A,
        role: 'assistant',
        content: 'I see an image',
        tokenCount: null,
      } as ChatMessageEntity;
      repo.create.mockReturnValue(entity);
      repo.save.mockResolvedValue(entity);

      await service.addMessage(IMAGE_ID_A, 'assistant', 'I see an image');

      expect(repo.create).toHaveBeenCalledWith({
        imageId: IMAGE_ID_A,
        role: 'assistant',
        content: 'I see an image',
        tokenCount: null,
      });
    });

    it('should return the saved entity', async () => {
      const entity = {
        id: 'msg-3',
        imageId: IMAGE_ID_A,
        role: 'user',
        content: 'Test',
        tokenCount: null,
      } as ChatMessageEntity;
      repo.create.mockReturnValue(entity);
      repo.save.mockResolvedValue(entity);

      const result = await service.addMessage(IMAGE_ID_A, 'user', 'Test');

      expect(result).toBe(entity);
    });

    it('should accept optional tokenCount', async () => {
      const entity = {
        id: 'msg-4',
        imageId: IMAGE_ID_A,
        role: 'assistant',
        content: 'Response',
        tokenCount: 42,
      } as ChatMessageEntity;
      repo.create.mockReturnValue(entity);
      repo.save.mockResolvedValue(entity);

      await service.addMessage(IMAGE_ID_A, 'assistant', 'Response', 42);

      expect(repo.create).toHaveBeenCalledWith({
        imageId: IMAGE_ID_A,
        role: 'assistant',
        content: 'Response',
        tokenCount: 42,
      });
    });

    it('should not call enforceHistoryCap internally', async () => {
      const entity = { id: 'msg-5' } as ChatMessageEntity;
      repo.create.mockReturnValue(entity);
      repo.save.mockResolvedValue(entity);

      await service.addMessage(IMAGE_ID_A, 'user', 'Test');

      // enforceHistoryCap uses count + find + remove — none should be called
      expect(repo.count).not.toHaveBeenCalled();
    });

    it('should reject invalid role', async () => {
      await expect(
        service.addMessage(IMAGE_ID_A, 'system' as 'user', 'Hello'),
      ).rejects.toThrow('Invalid message role');
    });
  });

  describe('getHistory', () => {
    it('should return messages in chronological order', async () => {
      const messages = [
        { id: 'm1', createdAt: new Date('2024-01-01') },
        { id: 'm2', createdAt: new Date('2024-01-02') },
      ] as ChatMessageEntity[];
      repo.findAndCount.mockResolvedValue([messages, 2]);

      const result = await service.getHistory(IMAGE_ID_A, 1, 20);

      expect(repo.findAndCount).toHaveBeenCalledWith({
        where: { imageId: IMAGE_ID_A },
        order: { createdAt: 'ASC' },
        skip: 0,
        take: 20,
      });
      expect(result.messages).toEqual(messages);
    });

    it('should paginate with correct skip/take', async () => {
      repo.findAndCount.mockResolvedValue([[], 0]);

      await service.getHistory(IMAGE_ID_A, 3, 10);

      expect(repo.findAndCount).toHaveBeenCalledWith({
        where: { imageId: IMAGE_ID_A },
        order: { createdAt: 'ASC' },
        skip: 20,
        take: 10,
      });
    });

    it('should return messages and total count', async () => {
      const messages = [{ id: 'm1' }] as ChatMessageEntity[];
      repo.findAndCount.mockResolvedValue([messages, 5]);

      const result = await service.getHistory(IMAGE_ID_A, 1, 20);

      expect(result).toEqual({ messages, total: 5 });
    });

    it('should default to page=1 and limit=20', async () => {
      repo.findAndCount.mockResolvedValue([[], 0]);

      await service.getHistory(IMAGE_ID_A);

      expect(repo.findAndCount).toHaveBeenCalledWith({
        where: { imageId: IMAGE_ID_A },
        order: { createdAt: 'ASC' },
        skip: 0,
        take: 20,
      });
    });

    it('should scope queries to imageId', async () => {
      repo.findAndCount.mockResolvedValue([[], 0]);

      await service.getHistory(IMAGE_ID_A);

      expect(repo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { imageId: IMAGE_ID_A },
        }),
      );
    });
  });

  describe('getRecentMessages', () => {
    it('should return ConversationMessage array in chronological order', async () => {
      // Repo returns DESC order (newest first)
      const messages = [
        { role: 'assistant', content: 'Hi' },
        { role: 'user', content: 'Hello' },
      ] as ChatMessageEntity[];
      repo.find.mockResolvedValue(messages);

      const result = await service.getRecentMessages(IMAGE_ID_A);

      // Service reverses to chronological order
      expect(result).toEqual([
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi' },
      ]);
    });

    it('should return empty array when no messages', async () => {
      repo.find.mockResolvedValue([]);

      const result = await service.getRecentMessages(IMAGE_ID_A);

      expect(result).toEqual([]);
    });

    it('should query with DESC order and cap at 50 by default', async () => {
      repo.find.mockResolvedValue([]);

      await service.getRecentMessages(IMAGE_ID_A);

      expect(repo.find).toHaveBeenCalledWith({
        where: { imageId: IMAGE_ID_A },
        order: { createdAt: 'DESC' },
        take: 50,
      });
    });

    it('should respect custom maxMessages parameter', async () => {
      repo.find.mockResolvedValue([]);

      await service.getRecentMessages(IMAGE_ID_A, 10);

      expect(repo.find).toHaveBeenCalledWith({
        where: { imageId: IMAGE_ID_A },
        order: { createdAt: 'DESC' },
        take: 10,
      });
    });
  });

  describe('enforceHistoryCap', () => {
    it('should delete oldest messages via single query when count exceeds 50', async () => {
      repo.count.mockResolvedValue(53);

      await service.enforceHistoryCap(IMAGE_ID_A);

      expect(repo.createQueryBuilder).toHaveBeenCalled();
      expect(mockQueryBuilder.delete).toHaveBeenCalled();
      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        expect.stringContaining('imageId'),
        expect.objectContaining({ imageId: IMAGE_ID_A, excess: 3 }),
      );
      expect(mockQueryBuilder.execute).toHaveBeenCalled();
    });

    it('should not delete when count is at or below 50', async () => {
      repo.count.mockResolvedValue(50);

      await service.enforceHistoryCap(IMAGE_ID_A);

      expect(repo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('should delete exactly 1 message when count is 51', async () => {
      repo.count.mockResolvedValue(51);

      await service.enforceHistoryCap(IMAGE_ID_A);

      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT'),
        expect.objectContaining({ excess: 1 }),
      );
    });
  });

  describe('scoping', () => {
    it('should scope getHistory to the given imageId', async () => {
      repo.findAndCount.mockResolvedValue([[], 0]);

      await service.getHistory(IMAGE_ID_A);

      const call = repo.findAndCount.mock.calls[0]![0]!;
      expect((call as { where: { imageId: string } }).where.imageId).toBe(IMAGE_ID_A);
    });

    it('should scope getRecentMessages to the given imageId', async () => {
      repo.find.mockResolvedValue([]);

      await service.getRecentMessages(IMAGE_ID_B);

      const call = repo.find.mock.calls[0]![0]!;
      expect((call as { where: { imageId: string } }).where.imageId).toBe(IMAGE_ID_B);
    });
  });

  describe('getMessageCount', () => {
    it('should return count for imageId', async () => {
      repo.count.mockResolvedValue(7);

      const result = await service.getMessageCount(IMAGE_ID_A);

      expect(result).toBe(7);
      expect(repo.count).toHaveBeenCalledWith({
        where: { imageId: IMAGE_ID_A },
      });
    });
  });

  describe('getMessageCountBatch', () => {
    it('should return counts for multiple imageIds in one query', async () => {
      mockQueryBuilder.getRawMany.mockResolvedValue([
        { imageId: IMAGE_ID_A, count: '5' },
        { imageId: IMAGE_ID_B, count: '3' },
      ]);

      const result = await service.getMessageCountBatch([
        IMAGE_ID_A,
        IMAGE_ID_B,
      ]);

      expect(result.get(IMAGE_ID_A)).toBe(5);
      expect(result.get(IMAGE_ID_B)).toBe(3);
      expect(repo.createQueryBuilder).toHaveBeenCalledWith('msg');
    });

    it('should return 0 for imageIds with no messages', async () => {
      mockQueryBuilder.getRawMany.mockResolvedValue([
        { imageId: IMAGE_ID_A, count: '2' },
      ]);

      const result = await service.getMessageCountBatch([
        IMAGE_ID_A,
        IMAGE_ID_B,
      ]);

      expect(result.get(IMAGE_ID_A)).toBe(2);
      expect(result.get(IMAGE_ID_B)).toBe(0);
    });

    it('should return empty map for empty input', async () => {
      const result = await service.getMessageCountBatch([]);

      expect(result.size).toBe(0);
      expect(repo.createQueryBuilder).not.toHaveBeenCalled();
    });
  });

  describe('deleteByImageId', () => {
    it('should delete all messages for imageId', async () => {
      repo.delete.mockResolvedValue({ affected: 5, raw: [] });

      await service.deleteByImageId(IMAGE_ID_A);

      expect(repo.delete).toHaveBeenCalledWith({ imageId: IMAGE_ID_A });
    });

    it('should invalidate cache after deleting', async () => {
      repo.delete.mockResolvedValue({ affected: 5, raw: [] });

      await service.deleteByImageId(IMAGE_ID_A);

      expect(mockCache.del).toHaveBeenCalledWith(`history:${IMAGE_ID_A}`);
      expect(mockCache.del).toHaveBeenCalledWith(`recent:${IMAGE_ID_A}`);
    });
  });

  describe('cache behavior', () => {
    it('addMessage should invalidate cache after DB write', async () => {
      const entity = { id: 'msg-1' } as ChatMessageEntity;
      repo.create.mockReturnValue(entity);
      repo.save.mockResolvedValue(entity);

      await service.addMessage(IMAGE_ID_A, 'user', 'Hello');

      expect(mockCache.del).toHaveBeenCalledWith(`history:${IMAGE_ID_A}`);
      expect(mockCache.del).toHaveBeenCalledWith(`recent:${IMAGE_ID_A}`);
    });

    it('getHistory should call cache get/set for default params', async () => {
      repo.findAndCount.mockResolvedValue([[], 0]);

      const result = await service.getHistory(IMAGE_ID_A);

      expect(result).toEqual({ messages: [], total: 0 });
      expect(mockCache.get).toHaveBeenCalledWith(`history:${IMAGE_ID_A}`);
      expect(mockCache.set).toHaveBeenCalledWith(
        `history:${IMAGE_ID_A}`,
        { messages: [], total: 0 },
      );
    });

    it('getHistory should return cached data on cache HIT without DB call', async () => {
      const cached = { messages: [{ id: 'cached-m1' }], total: 1 };
      mockCache.get.mockResolvedValue(cached);

      const result = await service.getHistory(IMAGE_ID_A);

      expect(result).toEqual(cached);
      expect(repo.findAndCount).not.toHaveBeenCalled();
    });

    it('getHistory should NOT cache non-default pagination', async () => {
      repo.findAndCount.mockResolvedValue([[], 0]);

      await service.getHistory(IMAGE_ID_A, 2, 20);

      expect(mockCache.get).not.toHaveBeenCalled();
      expect(mockCache.set).not.toHaveBeenCalled();
    });

    it('getRecentMessages should call cache get/set for default count', async () => {
      repo.find.mockResolvedValue([]);

      const result = await service.getRecentMessages(IMAGE_ID_A);

      expect(result).toEqual([]);
      expect(mockCache.get).toHaveBeenCalledWith(`recent:${IMAGE_ID_A}`);
      expect(mockCache.set).toHaveBeenCalledWith(
        `recent:${IMAGE_ID_A}`,
        [],
      );
    });

    it('getRecentMessages should NOT cache non-default count', async () => {
      repo.find.mockResolvedValue([]);

      await service.getRecentMessages(IMAGE_ID_A, 10);

      expect(mockCache.get).not.toHaveBeenCalled();
      expect(mockCache.set).not.toHaveBeenCalled();
    });

    it('enforceHistoryCap should invalidate cache when deleting messages', async () => {
      repo.count.mockResolvedValue(53);

      await service.enforceHistoryCap(IMAGE_ID_A);

      expect(mockCache.del).toHaveBeenCalledWith(`history:${IMAGE_ID_A}`);
      expect(mockCache.del).toHaveBeenCalledWith(`recent:${IMAGE_ID_A}`);
    });

    it('enforceHistoryCap should NOT invalidate when count is within cap', async () => {
      repo.count.mockResolvedValue(50);

      await service.enforceHistoryCap(IMAGE_ID_A);

      expect(mockCache.del).not.toHaveBeenCalled();
    });
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HistoryService } from '@/history/history.service';
import { ChatMessageEntity } from '@/history/entities/chat-message.entity';

describe('HistoryService', () => {
  let service: HistoryService;
  let repo: jest.Mocked<
    Pick<
      Repository<ChatMessageEntity>,
      'save' | 'create' | 'findAndCount' | 'find' | 'count' | 'remove' | 'delete'
    >
  >;

  const IMAGE_ID_A = '550e8400-e29b-41d4-a716-446655440000';
  const IMAGE_ID_B = '660e8400-e29b-41d4-a716-446655440001';

  beforeEach(async () => {
    repo = {
      save: jest.fn(),
      create: jest.fn(),
      findAndCount: jest.fn(),
      find: jest.fn(),
      count: jest.fn(),
      remove: jest.fn(),
      delete: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HistoryService,
        {
          provide: getRepositoryToken(ChatMessageEntity),
          useValue: repo,
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
      repo.count.mockResolvedValue(1);

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
      repo.count.mockResolvedValue(1);

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
      repo.count.mockResolvedValue(1);

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
      repo.count.mockResolvedValue(1);

      await service.addMessage(IMAGE_ID_A, 'assistant', 'Response', 42);

      expect(repo.create).toHaveBeenCalledWith({
        imageId: IMAGE_ID_A,
        role: 'assistant',
        content: 'Response',
        tokenCount: 42,
      });
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
    it('should remove oldest messages when count exceeds 50', async () => {
      repo.count.mockResolvedValue(53);
      const excessMessages = [
        { id: 'old1' },
        { id: 'old2' },
        { id: 'old3' },
      ] as ChatMessageEntity[];
      repo.find.mockResolvedValue(excessMessages);
      (repo.remove as jest.Mock).mockResolvedValue(excessMessages);

      // addMessage triggers enforceHistoryCap internally
      const entity = { id: 'new' } as ChatMessageEntity;
      repo.create.mockReturnValue(entity);
      repo.save.mockResolvedValue(entity);

      await service.addMessage(IMAGE_ID_A, 'user', 'trigger cap');

      expect(repo.find).toHaveBeenCalledWith({
        where: { imageId: IMAGE_ID_A },
        order: { createdAt: 'ASC' },
        take: 3,
      });
      expect(repo.remove).toHaveBeenCalledWith(excessMessages);
    });

    it('should not remove messages when count is at or below 50', async () => {
      repo.count.mockResolvedValue(50);

      const entity = { id: 'new' } as ChatMessageEntity;
      repo.create.mockReturnValue(entity);
      repo.save.mockResolvedValue(entity);

      await service.addMessage(IMAGE_ID_A, 'user', 'within cap');

      expect(repo.find).not.toHaveBeenCalled();
      expect(repo.remove).not.toHaveBeenCalled();
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

  describe('deleteByImageId', () => {
    it('should delete all messages for imageId', async () => {
      repo.delete.mockResolvedValue({ affected: 5, raw: [] });

      await service.deleteByImageId(IMAGE_ID_A);

      expect(repo.delete).toHaveBeenCalledWith({ imageId: IMAGE_ID_A });
    });
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { ChatService } from '@/chat/chat.service';
import { ImageEntity } from '@/upload/entities/image.entity';
import { IAiService } from '@/ai/interfaces/ai-service.interface';
import { AI_SERVICE_TOKEN } from '@/common/constants';
import { HistoryService } from '@/history/history.service';
import { OpenAiChatCompletion } from '@/ai/interfaces/openai-chat-completion.interface';
import { OpenAiStreamChunk } from '@/ai/interfaces/openai-stream-chunk.interface';

describe('ChatService', () => {
  let service: ChatService;
  let imageRepository: jest.Mocked<Pick<Repository<ImageEntity>, 'findOneBy'>>;
  let aiService: jest.Mocked<Pick<IAiService, 'chat' | 'chatStream'>>;
  let historyService: jest.Mocked<
    Pick<HistoryService, 'addMessage' | 'getRecentMessages' | 'enforceHistoryCap'>
  > & { invalidateCache: jest.Mock };

  const TEST_IMAGE_ID = '550e8400-e29b-41d4-a716-446655440000';

  const mockCompletion: OpenAiChatCompletion = {
    id: 'chatcmpl-test123',
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: 'gpt-5.2',
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content: 'Test response' },
        finish_reason: 'stop',
      },
    ],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  };

  beforeEach(async () => {
    imageRepository = {
      findOneBy: jest.fn(),
    };

    aiService = {
      chat: jest.fn(),
      chatStream: jest.fn(),
    };

    historyService = {
      addMessage: jest.fn().mockResolvedValue({ id: 'msg-1' }),
      getRecentMessages: jest.fn().mockResolvedValue([]),
      enforceHistoryCap: jest.fn().mockResolvedValue(undefined),
      invalidateCache: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatService,
        {
          provide: getRepositoryToken(ImageEntity),
          useValue: imageRepository,
        },
        {
          provide: AI_SERVICE_TOKEN,
          useValue: aiService,
        },
        {
          provide: HistoryService,
          useValue: historyService,
        },
      ],
    }).compile();

    service = module.get<ChatService>(ChatService);
  });

  describe('chat', () => {
    it('should validate image exists and call AI service', async () => {
      const image = { id: TEST_IMAGE_ID } as ImageEntity;
      imageRepository.findOneBy.mockResolvedValue(image);
      aiService.chat.mockResolvedValue(mockCompletion);

      const result = await service.chat(TEST_IMAGE_ID, 'What is this?');

      expect(imageRepository.findOneBy).toHaveBeenCalledWith({
        id: TEST_IMAGE_ID,
      });
      expect(aiService.chat).toHaveBeenCalledWith(
        'What is this?',
        TEST_IMAGE_ID,
        [],
      );
      expect(result).toBe(mockCompletion);
    });

    it('should throw NotFoundException with IMAGE_NOT_FOUND when image does not exist', async () => {
      imageRepository.findOneBy.mockResolvedValue(null);

      await expect(
        service.chat(TEST_IMAGE_ID, 'What is this?'),
      ).rejects.toThrow(NotFoundException);

      expect(aiService.chat).not.toHaveBeenCalled();

      // Verify error code
      const error = await service
        .chat(TEST_IMAGE_ID, 'What is this?')
        .catch((e) => e);
      const response = (error as NotFoundException).getResponse() as Record<
        string,
        unknown
      >;
      expect(response.code).toBe('IMAGE_NOT_FOUND');
      expect(response.message).toBe('Image not found');
    });

    it('should propagate AI service errors', async () => {
      const image = { id: TEST_IMAGE_ID } as ImageEntity;
      imageRepository.findOneBy.mockResolvedValue(image);
      aiService.chat.mockRejectedValue(new Error('AI service unavailable'));

      await expect(
        service.chat(TEST_IMAGE_ID, 'Hello'),
      ).rejects.toThrow('AI service unavailable');
    });

    it('should call addMessage for user message before AI call', async () => {
      const image = { id: TEST_IMAGE_ID } as ImageEntity;
      imageRepository.findOneBy.mockResolvedValue(image);
      aiService.chat.mockResolvedValue(mockCompletion);

      await service.chat(TEST_IMAGE_ID, 'Hello');

      expect(historyService.addMessage).toHaveBeenCalledWith(
        TEST_IMAGE_ID,
        'user',
        'Hello',
      );
    });

    it('should call addMessage for assistant message after AI call', async () => {
      const image = { id: TEST_IMAGE_ID } as ImageEntity;
      imageRepository.findOneBy.mockResolvedValue(image);
      aiService.chat.mockResolvedValue(mockCompletion);

      await service.chat(TEST_IMAGE_ID, 'Hello');

      expect(historyService.addMessage).toHaveBeenCalledWith(
        TEST_IMAGE_ID,
        'assistant',
        'Test response',
        5, // completion_tokens from usage
      );
    });

    it('should call getRecentMessages before AI call', async () => {
      const image = { id: TEST_IMAGE_ID } as ImageEntity;
      imageRepository.findOneBy.mockResolvedValue(image);
      aiService.chat.mockResolvedValue(mockCompletion);

      await service.chat(TEST_IMAGE_ID, 'Hello');

      expect(historyService.getRecentMessages).toHaveBeenCalledWith(
        TEST_IMAGE_ID,
      );
    });

    it('should fire-and-forget enforceHistoryCap after both messages', async () => {
      const image = { id: TEST_IMAGE_ID } as ImageEntity;
      imageRepository.findOneBy.mockResolvedValue(image);
      aiService.chat.mockResolvedValue(mockCompletion);

      await service.chat(TEST_IMAGE_ID, 'Hello');
      // Flush microtasks so fire-and-forget promise resolves
      await new Promise(process.nextTick);

      expect(historyService.enforceHistoryCap).toHaveBeenCalledTimes(1);
      expect(historyService.enforceHistoryCap).toHaveBeenCalledWith(
        TEST_IMAGE_ID,
      );
    });

    it('should return completion even when enforceHistoryCap throws', async () => {
      const image = { id: TEST_IMAGE_ID } as ImageEntity;
      imageRepository.findOneBy.mockResolvedValue(image);
      aiService.chat.mockResolvedValue(mockCompletion);
      historyService.enforceHistoryCap.mockRejectedValue(
        new Error('DB transient failure'),
      );

      const result = await service.chat(TEST_IMAGE_ID, 'Hello');
      // Flush microtasks so fire-and-forget .catch() runs
      await new Promise(process.nextTick);

      expect(result).toBe(mockCompletion);
      expect(historyService.enforceHistoryCap).toHaveBeenCalledWith(
        TEST_IMAGE_ID,
      );
    });

    it('should default assistant content to empty string when choices array is empty', async () => {
      const image = { id: TEST_IMAGE_ID } as ImageEntity;
      imageRepository.findOneBy.mockResolvedValue(image);

      const emptyChoicesCompletion: OpenAiChatCompletion = {
        ...mockCompletion,
        choices: [] as unknown as OpenAiChatCompletion['choices'],
        usage: undefined as unknown as OpenAiChatCompletion['usage'],
      };
      aiService.chat.mockResolvedValue(emptyChoicesCompletion);

      const result = await service.chat(TEST_IMAGE_ID, 'Hello');

      expect(result).toBe(emptyChoicesCompletion);
      // Assistant message should be persisted with empty string content and null tokens
      expect(historyService.addMessage).toHaveBeenCalledWith(
        TEST_IMAGE_ID,
        'assistant',
        '',
        null,
      );
    });

    it('should forward non-empty history to AI service', async () => {
      const image = { id: TEST_IMAGE_ID } as ImageEntity;
      imageRepository.findOneBy.mockResolvedValue(image);
      aiService.chat.mockResolvedValue(mockCompletion);
      historyService.getRecentMessages.mockResolvedValue([
        { role: 'user', content: 'Previous Q' },
        { role: 'assistant', content: 'Previous A' },
        { role: 'user', content: 'Hello' },
      ]);

      await service.chat(TEST_IMAGE_ID, 'Hello');

      expect(aiService.chat).toHaveBeenCalledWith(
        'Hello',
        TEST_IMAGE_ID,
        [
          { role: 'user', content: 'Previous Q' },
          { role: 'assistant', content: 'Previous A' },
          { role: 'user', content: 'Hello' },
        ],
      );
    });
  });

  describe('chatStream', () => {
    const mockChunk: OpenAiStreamChunk = {
      id: 'chatcmpl-test123',
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model: 'gpt-5.2',
      choices: [{ index: 0, delta: { content: 'test' }, finish_reason: null }],
    };

    async function* mockGenerator(): AsyncGenerator<OpenAiStreamChunk> {
      yield mockChunk;
    }

    it('should validate image exists and return async generator', async () => {
      const image = { id: TEST_IMAGE_ID } as ImageEntity;
      imageRepository.findOneBy.mockResolvedValue(image);
      aiService.chatStream.mockReturnValue(mockGenerator());

      const result = await service.chatStream(TEST_IMAGE_ID, 'What is this?');

      expect(imageRepository.findOneBy).toHaveBeenCalledWith({
        id: TEST_IMAGE_ID,
      });

      // Should be an async generator
      const chunks = [];
      for await (const chunk of result) {
        chunks.push(chunk);
      }
      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toBe(mockChunk);
    });

    it('should throw NotFoundException with IMAGE_NOT_FOUND when image does not exist', async () => {
      imageRepository.findOneBy.mockResolvedValue(null);

      await expect(
        service.chatStream(TEST_IMAGE_ID, 'What is this?'),
      ).rejects.toThrow(NotFoundException);

      expect(aiService.chatStream).not.toHaveBeenCalled();

      const error = await service
        .chatStream(TEST_IMAGE_ID, 'What is this?')
        .catch((e) => e);
      const response = (error as NotFoundException).getResponse() as Record<
        string,
        unknown
      >;
      expect(response.code).toBe('IMAGE_NOT_FOUND');
    });

    it('should persist user message before streaming', async () => {
      const image = { id: TEST_IMAGE_ID } as ImageEntity;
      imageRepository.findOneBy.mockResolvedValue(image);
      aiService.chatStream.mockReturnValue(mockGenerator());

      await service.chatStream(TEST_IMAGE_ID, 'Hello');

      expect(historyService.addMessage).toHaveBeenCalledWith(
        TEST_IMAGE_ID,
        'user',
        'Hello',
      );
    });

    it('should load history before streaming', async () => {
      const image = { id: TEST_IMAGE_ID } as ImageEntity;
      imageRepository.findOneBy.mockResolvedValue(image);
      aiService.chatStream.mockReturnValue(mockGenerator());

      await service.chatStream(TEST_IMAGE_ID, 'Hello');

      expect(historyService.getRecentMessages).toHaveBeenCalledWith(
        TEST_IMAGE_ID,
      );
    });

    it('should forward AbortSignal to AI service', async () => {
      const image = { id: TEST_IMAGE_ID } as ImageEntity;
      imageRepository.findOneBy.mockResolvedValue(image);
      aiService.chatStream.mockReturnValue(mockGenerator());

      const ac = new AbortController();
      await service.chatStream(TEST_IMAGE_ID, 'Hello', ac.signal);

      expect(aiService.chatStream).toHaveBeenCalledWith(
        'Hello',
        TEST_IMAGE_ID,
        [],
        ac.signal,
      );
    });

    it('should persist assistant message after stream completes', async () => {
      const image = { id: TEST_IMAGE_ID } as ImageEntity;
      imageRepository.findOneBy.mockResolvedValue(image);

      const contentChunk: OpenAiStreamChunk = {
        id: 'chatcmpl-test',
        object: 'chat.completion.chunk',
        created: 1700000000,
        model: 'gpt-5.2',
        choices: [
          { index: 0, delta: { content: 'Hello World' }, finish_reason: null },
        ],
      };

      async function* gen(): AsyncGenerator<OpenAiStreamChunk> {
        yield contentChunk;
      }

      aiService.chatStream.mockReturnValue(gen());

      const generator = await service.chatStream(TEST_IMAGE_ID, 'Test');

      // Consume the generator
      for await (const _chunk of generator) {
        // drain
      }

      expect(historyService.addMessage).toHaveBeenCalledWith(
        TEST_IMAGE_ID,
        'assistant',
        'Hello World',
      );
    });

    it('should not persist assistant message when stream has no content', async () => {
      const image = { id: TEST_IMAGE_ID } as ImageEntity;
      imageRepository.findOneBy.mockResolvedValue(image);

      const emptyChunk: OpenAiStreamChunk = {
        id: 'chatcmpl-test',
        object: 'chat.completion.chunk',
        created: 1700000000,
        model: 'gpt-5.2',
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
      };

      async function* gen(): AsyncGenerator<OpenAiStreamChunk> {
        yield emptyChunk;
      }

      aiService.chatStream.mockReturnValue(gen());

      const generator = await service.chatStream(TEST_IMAGE_ID, 'Test');
      for await (const _chunk of generator) {
        // drain
      }

      // Only user message, no assistant message
      expect(historyService.addMessage).toHaveBeenCalledTimes(1);
      expect(historyService.addMessage).toHaveBeenCalledWith(
        TEST_IMAGE_ID,
        'user',
        'Test',
      );
    });

    it('should call enforceHistoryCap after stream persistence', async () => {
      const image = { id: TEST_IMAGE_ID } as ImageEntity;
      imageRepository.findOneBy.mockResolvedValue(image);

      async function* gen(): AsyncGenerator<OpenAiStreamChunk> {
        yield {
          id: 'chatcmpl-test',
          object: 'chat.completion.chunk',
          created: 1700000000,
          model: 'gpt-5.2',
          choices: [
            { index: 0, delta: { content: 'response' }, finish_reason: null },
          ],
        };
      }

      aiService.chatStream.mockReturnValue(gen());

      const generator = await service.chatStream(TEST_IMAGE_ID, 'Test');
      for await (const _chunk of generator) {
        // drain
      }

      expect(historyService.enforceHistoryCap).toHaveBeenCalledTimes(1);
      expect(historyService.enforceHistoryCap).toHaveBeenCalledWith(
        TEST_IMAGE_ID,
      );
    });

    it('should still yield all chunks when enforceHistoryCap throws', async () => {
      const image = { id: TEST_IMAGE_ID } as ImageEntity;
      imageRepository.findOneBy.mockResolvedValue(image);
      historyService.enforceHistoryCap.mockRejectedValue(
        new Error('DB transient failure'),
      );

      async function* gen(): AsyncGenerator<OpenAiStreamChunk> {
        yield {
          id: 'chatcmpl-test',
          object: 'chat.completion.chunk',
          created: 1700000000,
          model: 'gpt-5.2',
          choices: [
            { index: 0, delta: { content: 'streamed' }, finish_reason: null },
          ],
        };
      }

      aiService.chatStream.mockReturnValue(gen());

      const generator = await service.chatStream(TEST_IMAGE_ID, 'Test');
      const chunks: OpenAiStreamChunk[] = [];
      for await (const chunk of generator) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(1);
      expect(chunks[0]!.choices[0]!.delta.content).toBe('streamed');
      expect(historyService.enforceHistoryCap).toHaveBeenCalledWith(
        TEST_IMAGE_ID,
      );
    });

    it('should truncate persisted content at 50,000 characters', async () => {
      const image = { id: TEST_IMAGE_ID } as ImageEntity;
      imageRepository.findOneBy.mockResolvedValue(image);

      const longContent = 'x'.repeat(60_000);
      async function* gen(): AsyncGenerator<OpenAiStreamChunk> {
        yield {
          id: 'chatcmpl-test',
          object: 'chat.completion.chunk',
          created: 1700000000,
          model: 'gpt-5.2',
          choices: [
            { index: 0, delta: { content: longContent }, finish_reason: null },
          ],
        };
      }

      aiService.chatStream.mockReturnValue(gen());

      const generator = await service.chatStream(TEST_IMAGE_ID, 'Test');
      for await (const _chunk of generator) {
        // drain
      }

      const savedContent = historyService.addMessage.mock.calls.find(
        (call) => call[1] === 'assistant',
      )![2];
      expect(savedContent.length).toBe(50_000);
    });

    it('should persist partial content on abort', async () => {
      const image = { id: TEST_IMAGE_ID } as ImageEntity;
      imageRepository.findOneBy.mockResolvedValue(image);

      async function* gen(): AsyncGenerator<OpenAiStreamChunk> {
        yield {
          id: 'chatcmpl-test',
          object: 'chat.completion.chunk',
          created: 1700000000,
          model: 'gpt-5.2',
          choices: [
            { index: 0, delta: { content: 'partial' }, finish_reason: null },
          ],
        };
        throw new Error('Aborted');
      }

      aiService.chatStream.mockReturnValue(gen());

      const generator = await service.chatStream(TEST_IMAGE_ID, 'Test');
      try {
        for await (const _chunk of generator) {
          // drain
        }
      } catch {
        // expected abort error
      }

      // Partial content should still be persisted in finally block
      expect(historyService.addMessage).toHaveBeenCalledWith(
        TEST_IMAGE_ID,
        'assistant',
        'partial',
      );
    });
  });
});

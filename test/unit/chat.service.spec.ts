import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { ChatService } from '@/chat/chat.service';
import { ImageEntity } from '@/upload/entities/image.entity';
import { IAiService } from '@/ai/interfaces/ai-service.interface';
import { AI_SERVICE_TOKEN } from '@/common/constants';
import { OpenAiChatCompletion } from '@/ai/interfaces/openai-chat-completion.interface';
import { OpenAiStreamChunk } from '@/ai/interfaces/openai-stream-chunk.interface';

describe('ChatService', () => {
  let service: ChatService;
  let imageRepository: jest.Mocked<Pick<Repository<ImageEntity>, 'findOneBy'>>;
  let aiService: jest.Mocked<Pick<IAiService, 'chat' | 'chatStream'>>;

  const TEST_IMAGE_ID = '550e8400-e29b-41d4-a716-446655440000';

  const mockCompletion: OpenAiChatCompletion = {
    id: 'chatcmpl-test123',
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: 'gpt-4o',
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
      ],
    }).compile();

    service = module.get<ChatService>(ChatService);
  });

  describe('chat', () => {
    it('should validate image exists and call AI service', async () => {
      const image = { id: TEST_IMAGE_ID } as ImageEntity;
      imageRepository.findOneBy.mockResolvedValue(image);
      aiService.chat.mockResolvedValue(mockCompletion);

      const result = await service.chat(TEST_IMAGE_ID, 'What is this?', []);

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

    it('should pass conversation history to AI service', async () => {
      const image = { id: TEST_IMAGE_ID } as ImageEntity;
      imageRepository.findOneBy.mockResolvedValue(image);
      aiService.chat.mockResolvedValue(mockCompletion);

      const history = [
        { role: 'user' as const, content: 'Previous question' },
        { role: 'assistant' as const, content: 'Previous answer' },
      ];

      await service.chat(TEST_IMAGE_ID, 'Follow up', history);

      expect(aiService.chat).toHaveBeenCalledWith(
        'Follow up',
        TEST_IMAGE_ID,
        history,
      );
    });

    it('should throw NotFoundException with IMAGE_NOT_FOUND when image does not exist', async () => {
      imageRepository.findOneBy.mockResolvedValue(null);

      await expect(
        service.chat(TEST_IMAGE_ID, 'What is this?', []),
      ).rejects.toThrow(NotFoundException);

      expect(aiService.chat).not.toHaveBeenCalled();

      // Verify error code
      const error = await service
        .chat(TEST_IMAGE_ID, 'What is this?', [])
        .catch((e) => e);
      const response = (error as NotFoundException).getResponse() as Record<
        string,
        unknown
      >;
      expect(response.code).toBe('IMAGE_NOT_FOUND');
      expect(response.message).toBe('Image not found');
    });

    it('should default history to empty array when not provided', async () => {
      const image = { id: TEST_IMAGE_ID } as ImageEntity;
      imageRepository.findOneBy.mockResolvedValue(image);
      aiService.chat.mockResolvedValue(mockCompletion);

      await service.chat(TEST_IMAGE_ID, 'Hello');

      expect(aiService.chat).toHaveBeenCalledWith(
        'Hello',
        TEST_IMAGE_ID,
        [],
      );
    });

    it('should propagate AI service errors', async () => {
      const image = { id: TEST_IMAGE_ID } as ImageEntity;
      imageRepository.findOneBy.mockResolvedValue(image);
      aiService.chat.mockRejectedValue(new Error('AI service unavailable'));

      await expect(
        service.chat(TEST_IMAGE_ID, 'Hello', []),
      ).rejects.toThrow('AI service unavailable');
    });
  });

  describe('chatStream', () => {
    const mockChunk: OpenAiStreamChunk = {
      id: 'chatcmpl-test123',
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model: 'gpt-4o',
      choices: [{ index: 0, delta: { content: 'test' }, finish_reason: null }],
    };

    async function* mockGenerator(): AsyncGenerator<OpenAiStreamChunk> {
      yield mockChunk;
    }

    it('should validate image exists and return async generator from AI service', async () => {
      const image = { id: TEST_IMAGE_ID } as ImageEntity;
      imageRepository.findOneBy.mockResolvedValue(image);
      aiService.chatStream.mockReturnValue(mockGenerator());

      const result = await service.chatStream(TEST_IMAGE_ID, 'What is this?');

      expect(imageRepository.findOneBy).toHaveBeenCalledWith({
        id: TEST_IMAGE_ID,
      });
      expect(aiService.chatStream).toHaveBeenCalledWith(
        'What is this?',
        TEST_IMAGE_ID,
        [],
        undefined,
      );

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

    it('should pass empty history array (Phase 5 placeholder)', async () => {
      const image = { id: TEST_IMAGE_ID } as ImageEntity;
      imageRepository.findOneBy.mockResolvedValue(image);
      aiService.chatStream.mockReturnValue(mockGenerator());

      await service.chatStream(TEST_IMAGE_ID, 'Hello');

      expect(aiService.chatStream).toHaveBeenCalledWith(
        'Hello',
        TEST_IMAGE_ID,
        [],
        undefined,
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
  });
});

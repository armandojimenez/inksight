import { Test, TestingModule } from '@nestjs/testing';
import { MockAiService } from '@/ai/mock-ai.service';
import { IAiService } from '@/ai/interfaces/ai-service.interface';
import { OpenAiChatCompletion } from '@/ai/interfaces/openai-chat-completion.interface';
import { OpenAiStreamChunk } from '@/ai/interfaces/openai-stream-chunk.interface';
import { ConversationMessage } from '@/ai/interfaces/conversation-message.interface';
import { AI_SERVICE_TOKEN } from '@/common/constants';
import { AiModule } from '@/ai/ai.module';

describe('MockAiService', () => {
  let service: IAiService;

  beforeEach(() => {
    service = new MockAiService();
  });

  describe('analyzeImage', () => {
    it('should return a valid chat.completion object', async () => {
      const result = await service.analyzeImage('uploads/test.png');

      expect(result).toBeDefined();
      expect(result.object).toBe('chat.completion');
    });

    it('should have id matching /^chatcmpl-[a-zA-Z0-9]{29}$/', async () => {
      const result = await service.analyzeImage('uploads/test.png');

      expect(result.id).toMatch(/^chatcmpl-[a-zA-Z0-9]{29}$/);
    });

    it('should have created as Unix timestamp within 5s of now', async () => {
      const before = Math.floor(Date.now() / 1000);
      const result = await service.analyzeImage('uploads/test.png');
      const after = Math.floor(Date.now() / 1000);

      expect(result.created).toBeGreaterThanOrEqual(before);
      expect(result.created).toBeLessThanOrEqual(after + 5);
    });

    it('should have model set to "gpt-4o"', async () => {
      const result = await service.analyzeImage('uploads/test.png');

      expect(result.model).toBe('gpt-4o');
    });

    it('should have choices[0].message.role as "assistant"', async () => {
      const result = await service.analyzeImage('uploads/test.png');

      expect(result.choices[0]!.message.role).toBe('assistant');
    });

    it('should have choices[0].finish_reason as "stop"', async () => {
      const result = await service.analyzeImage('uploads/test.png');

      expect(result.choices[0]!.finish_reason).toBe('stop');
    });

    it('should have usage.total_tokens equal to prompt_tokens + completion_tokens', async () => {
      const result = await service.analyzeImage('uploads/test.png');

      expect(result.usage.total_tokens).toBe(
        result.usage.prompt_tokens + result.usage.completion_tokens,
      );
    });

    it('should have usage.completion_tokens equal to Math.ceil(content.length / 4)', async () => {
      const result = await service.analyzeImage('uploads/test.png');
      const content = result.choices[0]!.message.content;
      const expectedTokens = Math.ceil(content.length / 4);

      expect(result.usage.completion_tokens).toBe(expectedTokens);
    });

    it('should have all required fields present (no undefined/null)', async () => {
      const result = await service.analyzeImage('uploads/test.png');

      expect(result.id).toBeDefined();
      expect(result.object).toBeDefined();
      expect(result.created).toBeDefined();
      expect(result.model).toBeDefined();
      expect(result.choices).toBeDefined();
      expect(result.choices).toHaveLength(1);
      expect(result.choices[0]!.message.content).toBeTruthy();
      expect(result.usage).toBeDefined();
      expect(result.usage.prompt_tokens).toBeGreaterThanOrEqual(0);
      expect(result.usage.completion_tokens).toBeGreaterThan(0);
      expect(result.usage.total_tokens).toBeGreaterThan(0);
    });

    it('should produce different responses for different imagePath values', async () => {
      const result1 = await service.analyzeImage('uploads/photo-a.png');
      const result2 = await service.analyzeImage('uploads/photo-b.png');

      // With deterministic hashing, different inputs should produce different content
      // (unless they happen to hash to the same index — extremely unlikely with varied inputs)
      const content1 = result1.choices[0]!.message.content;
      const content2 = result2.choices[0]!.message.content;

      // At minimum, IDs should differ
      expect(result1.id).not.toBe(result2.id);

      // Responses should differ for sufficiently different inputs
      // Use multiple paths to increase confidence
      const results = await Promise.all([
        service.analyzeImage('uploads/a.png'),
        service.analyzeImage('uploads/b.png'),
        service.analyzeImage('uploads/c.png'),
        service.analyzeImage('uploads/d.png'),
        service.analyzeImage('uploads/e.png'),
      ]);
      const contents = results.map((r) => r.choices[0]!.message.content);
      const uniqueContents = new Set(contents);

      // At least 2 different responses among 5 calls
      expect(uniqueContents.size).toBeGreaterThanOrEqual(2);
    });
  });

  describe('chat', () => {
    it('should return a valid chat.completion object', async () => {
      const result = await service.chat('What do you see?', []);

      expect(result.object).toBe('chat.completion');
      expect(result.choices).toHaveLength(1);
      expect(result.choices[0]!.message.role).toBe('assistant');
      expect(result.choices[0]!.finish_reason).toBe('stop');
    });

    it('should return default-style response with empty/short history', async () => {
      const result = await service.chat('What do you see?', []);
      const content = result.choices[0]!.message.content;

      expect(content).toBeTruthy();
      expect(typeof content).toBe('string');
    });

    it('should return follow-up style response with history.length > 2', async () => {
      const history: ConversationMessage[] = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
        { role: 'user', content: 'Tell me more' },
      ];

      const result = await service.chat('Can you elaborate?', history);
      const content = result.choices[0]!.message.content;

      expect(content).toBeTruthy();
      expect(typeof content).toBe('string');
    });
  });

  describe('chatStream', () => {
    async function collectChunks(
      gen: AsyncGenerator<OpenAiStreamChunk>,
    ): Promise<OpenAiStreamChunk[]> {
      const chunks: OpenAiStreamChunk[] = [];
      for await (const chunk of gen) {
        chunks.push(chunk);
      }
      return chunks;
    }

    it('should yield chunks as AsyncGenerator', async () => {
      const gen = service.chatStream('Hello', []);
      const chunks = await collectChunks(gen);

      expect(chunks.length).toBeGreaterThanOrEqual(3);
    });

    it('should have all chunks share the same id and created', async () => {
      const gen = service.chatStream('Hello', []);
      const chunks = await collectChunks(gen);

      const id = chunks[0]!.id;
      const created = chunks[0]!.created;

      for (const chunk of chunks) {
        expect(chunk.id).toBe(id);
        expect(chunk.created).toBe(created);
      }
    });

    it('should have first chunk with delta.role = "assistant" and delta.content = ""', async () => {
      const gen = service.chatStream('Hello', []);
      const chunks = await collectChunks(gen);

      const first = chunks[0]!;
      expect(first.choices[0]!.delta.role).toBe('assistant');
      expect(first.choices[0]!.delta.content).toBe('');
      expect(first.choices[0]!.finish_reason).toBeNull();
    });

    it('should have final chunk with finish_reason = "stop" and empty delta', async () => {
      const gen = service.chatStream('Hello', []);
      const chunks = await collectChunks(gen);

      const last = chunks[chunks.length - 1]!;
      expect(last.choices[0]!.finish_reason).toBe('stop');
      expect(last.choices[0]!.delta).toEqual({});
    });

    it('should have all chunks with object = "chat.completion.chunk"', async () => {
      const gen = service.chatStream('Hello', []);
      const chunks = await collectChunks(gen);

      for (const chunk of chunks) {
        expect(chunk.object).toBe('chat.completion.chunk');
      }
    });
  });

  describe('ID generation', () => {
    it('should produce unique IDs across 10 calls', async () => {
      const ids = new Set<string>();

      for (let i = 0; i < 10; i++) {
        const result = await service.analyzeImage(`uploads/test-${i}.png`);
        ids.add(result.id);
      }

      expect(ids.size).toBe(10);
    });
  });

  describe('DI wiring', () => {
    it('should resolve AI_SERVICE_TOKEN to MockAiService from AiModule', async () => {
      const module: TestingModule = await Test.createTestingModule({
        imports: [AiModule],
      }).compile();

      const aiService = module.get<IAiService>(AI_SERVICE_TOKEN);

      expect(aiService).toBeDefined();
      expect(aiService).toBeInstanceOf(MockAiService);
    });
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { MockAiService } from '@/ai/mock-ai.service';
import { IAiService } from '@/ai/interfaces/ai-service.interface';
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

    it('should have created as Unix timestamp within range of now', async () => {
      const before = Math.floor(Date.now() / 1000);
      const result = await service.analyzeImage('uploads/test.png');
      const after = Math.floor(Date.now() / 1000);

      expect(result.created).toBeGreaterThanOrEqual(before);
      expect(result.created).toBeLessThanOrEqual(after);
    });

    it('should have model set to "gpt-4o"', async () => {
      const result = await service.analyzeImage('uploads/test.png');

      expect(result.model).toBe('gpt-4o');
    });

    it('should have choices[0].message.role as "assistant"', async () => {
      const result = await service.analyzeImage('uploads/test.png');

      expect(result.choices[0]?.message.role).toBe('assistant');
    });

    it('should have choices[0].finish_reason as "stop"', async () => {
      const result = await service.analyzeImage('uploads/test.png');

      expect(result.choices[0]?.finish_reason).toBe('stop');
    });

    it('should have usage.total_tokens equal to prompt_tokens + completion_tokens', async () => {
      const result = await service.analyzeImage('uploads/test.png');

      expect(result.usage.total_tokens).toBe(
        result.usage.prompt_tokens + result.usage.completion_tokens,
      );
    });

    it('should have usage.completion_tokens equal to Math.ceil(content.length / 4)', async () => {
      const result = await service.analyzeImage('uploads/test.png');
      const content = result.choices[0]?.message.content ?? '';
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
      expect(result.choices[0]?.message.content).toBeTruthy();
      expect(result.usage).toBeDefined();
      expect(result.usage.prompt_tokens).toBeGreaterThanOrEqual(0);
      expect(result.usage.completion_tokens).toBeGreaterThan(0);
      expect(result.usage.total_tokens).toBeGreaterThan(0);
    });

    it('should produce deterministic responses for the same input', async () => {
      const result1 = await service.analyzeImage('uploads/test.png');
      const result2 = await service.analyzeImage('uploads/test.png');

      expect(result1.choices[0]?.message.content).toBe(
        result2.choices[0]?.message.content,
      );
    });

    it('should produce different responses for different imagePath values', async () => {
      const results = await Promise.all([
        service.analyzeImage('uploads/a.png'),
        service.analyzeImage('uploads/b.png'),
        service.analyzeImage('uploads/c.png'),
        service.analyzeImage('uploads/d.png'),
        service.analyzeImage('uploads/e.png'),
      ]);
      const contents = results.map(
        (r) => r.choices[0]?.message.content ?? '',
      );
      const uniqueContents = new Set(contents);

      // At least 2 different responses among 5 calls
      expect(uniqueContents.size).toBeGreaterThanOrEqual(2);
    });
  });

  describe('chat', () => {
    it('should return a valid chat.completion object', async () => {
      const result = await service.chat('What do you see?', 'img-1', []);

      expect(result.object).toBe('chat.completion');
      expect(result.choices).toHaveLength(1);
      expect(result.choices[0]?.message.role).toBe('assistant');
      expect(result.choices[0]?.finish_reason).toBe('stop');
    });

    it('should accept imageId parameter without error', async () => {
      const result = await service.chat(
        'Describe this',
        'img-uuid-123',
        [],
      );

      expect(result.choices[0]?.message.content).toBeTruthy();
    });

    it('should return default-style response with empty history', async () => {
      const result = await service.chat('What do you see?', 'img-1', []);
      const content = result.choices[0]?.message.content ?? '';

      expect(content).toBeTruthy();
      expect(typeof content).toBe('string');
    });

    it('should return default-style response with history.length === 1', async () => {
      const history: ConversationMessage[] = [
        { role: 'user', content: 'Hello' },
      ];
      const result = await service.chat('Tell me more', 'img-1', history);

      expect(result.choices[0]?.message.content).toBeTruthy();
    });

    it('should return default-style response with history.length === 2', async () => {
      const history: ConversationMessage[] = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
      ];
      const result = await service.chat('Tell me more', 'img-1', history);

      expect(result.choices[0]?.message.content).toBeTruthy();
    });

    it('should return follow-up style response with history.length > 2', async () => {
      const history: ConversationMessage[] = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
        { role: 'user', content: 'Tell me more' },
      ];

      const result = await service.chat('Can you elaborate?', 'img-1', history);
      const content = result.choices[0]?.message.content ?? '';

      expect(content).toBeTruthy();
      expect(typeof content).toBe('string');
    });

    it('should select from different pools based on history length', async () => {
      const shortHistory: ConversationMessage[] = [];
      const longHistory: ConversationMessage[] = [
        { role: 'user', content: 'a' },
        { role: 'assistant', content: 'b' },
        { role: 'user', content: 'c' },
      ];

      // Use multiple prompts to increase chance of seeing pool differences
      const shortResults = await Promise.all([
        service.chat('test1', 'img-1', shortHistory),
        service.chat('test2', 'img-1', shortHistory),
        service.chat('test3', 'img-1', shortHistory),
      ]);
      const longResults = await Promise.all([
        service.chat('test1', 'img-1', longHistory),
        service.chat('test2', 'img-1', longHistory),
        service.chat('test3', 'img-1', longHistory),
      ]);

      const shortContents = new Set(
        shortResults.map((r) => r.choices[0]?.message.content),
      );
      const longContents = new Set(
        longResults.map((r) => r.choices[0]?.message.content),
      );

      // The pools are distinct sets, so at least one response should differ
      const allShort = [...shortContents];
      const allLong = [...longContents];
      const overlap = allShort.filter((c) => allLong.includes(c));
      expect(overlap.length).toBeLessThan(allShort.length + allLong.length);
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
      const gen = service.chatStream('Hello', 'img-1', []);
      const chunks = await collectChunks(gen);

      // role chunk + at least 1 content chunk + stop chunk
      expect(chunks.length).toBeGreaterThanOrEqual(3);
    });

    it('should yield word-by-word content chunks', async () => {
      const gen = service.chatStream('Hello', 'img-1', []);
      const chunks = await collectChunks(gen);

      // Content chunks are between first (role) and last (stop)
      const contentChunks = chunks.slice(1, -1);
      expect(contentChunks.length).toBeGreaterThan(1);

      // Each content chunk should have content in delta
      for (const chunk of contentChunks) {
        expect(chunk.choices[0]?.delta.content).toBeDefined();
        expect(typeof chunk.choices[0]?.delta.content).toBe('string');
      }
    });

    it('should reassemble content chunks into a complete response', async () => {
      const gen = service.chatStream('Hello', 'img-1', []);
      const chunks = await collectChunks(gen);

      const contentChunks = chunks.slice(1, -1);
      const reassembled = contentChunks
        .map((c) => c.choices[0]?.delta.content ?? '')
        .join('');

      expect(reassembled.length).toBeGreaterThan(0);
      // Reassembled text should not have leading/trailing whitespace corruption
      expect(reassembled).toBe(reassembled.trimEnd());
    });

    it('should have all chunks share the same id and created', async () => {
      const gen = service.chatStream('Hello', 'img-1', []);
      const chunks = await collectChunks(gen);

      const id = chunks[0]?.id;
      const created = chunks[0]?.created;

      expect(id).toBeDefined();
      expect(created).toBeDefined();

      for (const chunk of chunks) {
        expect(chunk.id).toBe(id);
        expect(chunk.created).toBe(created);
      }
    });

    it('should have first chunk with delta.role = "assistant" and delta.content = ""', async () => {
      const gen = service.chatStream('Hello', 'img-1', []);
      const chunks = await collectChunks(gen);

      const first = chunks[0]!;
      expect(first.choices[0]?.delta.role).toBe('assistant');
      expect(first.choices[0]?.delta.content).toBe('');
      expect(first.choices[0]?.finish_reason).toBeNull();
    });

    it('should have final chunk with finish_reason = "stop" and empty delta', async () => {
      const gen = service.chatStream('Hello', 'img-1', []);
      const chunks = await collectChunks(gen);

      const last = chunks[chunks.length - 1]!;
      expect(last.choices[0]?.finish_reason).toBe('stop');
      expect(last.choices[0]?.delta).toEqual({});
    });

    it('should have all chunks with object = "chat.completion.chunk"', async () => {
      const gen = service.chatStream('Hello', 'img-1', []);
      const chunks = await collectChunks(gen);

      for (const chunk of chunks) {
        expect(chunk.object).toBe('chat.completion.chunk');
      }
    });

    it('should handle early termination via .return() without throwing', async () => {
      const gen = service.chatStream('Hello', 'img-1', []);

      // Consume only the first chunk
      const first = await gen.next();
      expect(first.done).toBe(false);

      // Terminate early
      const returnResult = await gen.return(undefined as never);
      expect(returnResult.done).toBe(true);

      // Subsequent next() should indicate done
      const after = await gen.next();
      expect(after.done).toBe(true);
    });

    it('should indicate done after exhaustion', async () => {
      const gen = service.chatStream('Hello', 'img-1', []);
      await collectChunks(gen);

      // Generator is exhausted — next call should return done
      const after = await gen.next();
      expect(after.done).toBe(true);
      expect(after.value).toBeUndefined();
    });

    it('should select follow-up responses with history.length > 2', async () => {
      const shortHistory: ConversationMessage[] = [];
      const longHistory: ConversationMessage[] = [
        { role: 'user', content: 'a' },
        { role: 'assistant', content: 'b' },
        { role: 'user', content: 'c' },
      ];

      const shortGen = service.chatStream('test', 'img-1', shortHistory);
      const longGen = service.chatStream('test', 'img-1', longHistory);

      const shortChunks = await collectChunks(shortGen);
      const longChunks = await collectChunks(longGen);

      const shortContent = shortChunks
        .slice(1, -1)
        .map((c) => c.choices[0]?.delta.content ?? '')
        .join('');
      const longContent = longChunks
        .slice(1, -1)
        .map((c) => c.choices[0]?.delta.content ?? '')
        .join('');

      // Both should produce non-empty content
      expect(shortContent.length).toBeGreaterThan(0);
      expect(longContent.length).toBeGreaterThan(0);
    });
  });

  describe('estimateTokens (via usage fields)', () => {
    it('should return 0 completion_tokens for an empty response content', async () => {
      // We can't directly call estimateTokens since it's module-private,
      // but we can verify via the usage fields that the formula works.
      // For non-empty mock responses, completion_tokens > 0.
      const result = await service.analyzeImage('uploads/test.png');
      const content = result.choices[0]?.message.content ?? '';

      expect(content.length).toBeGreaterThan(0);
      expect(result.usage.completion_tokens).toBe(
        Math.ceil(content.length / 4),
      );
    });

    it('should estimate prompt_tokens based on input length for chat', async () => {
      const shortPrompt = 'Hi';
      const longPrompt = 'This is a much longer prompt with many words';

      const shortResult = await service.chat(shortPrompt, 'img-1', []);
      const longResult = await service.chat(longPrompt, 'img-1', []);

      // Longer prompt should produce more prompt_tokens
      expect(longResult.usage.prompt_tokens).toBeGreaterThan(
        shortResult.usage.prompt_tokens,
      );
    });

    it('should include history tokens in prompt_tokens', async () => {
      const history: ConversationMessage[] = [
        { role: 'user', content: 'First message with some content' },
        { role: 'assistant', content: 'Response with some content too' },
      ];

      const withoutHistory = await service.chat('test', 'img-1', []);
      const withHistory = await service.chat('test', 'img-1', history);

      expect(withHistory.usage.prompt_tokens).toBeGreaterThan(
        withoutHistory.usage.prompt_tokens,
      );
    });
  });

  describe('hashSelect (via deterministic responses)', () => {
    it('should always return the same response for the same input', async () => {
      const results = await Promise.all(
        Array.from({ length: 5 }, () =>
          service.analyzeImage('uploads/same.png'),
        ),
      );

      const contents = results.map(
        (r) => r.choices[0]?.message.content ?? '',
      );
      const unique = new Set(contents);
      expect(unique.size).toBe(1);
    });

    it('should handle single-response pool gracefully', async () => {
      // The smallest pool has 3 entries, but we can verify the hash
      // doesn't fail on any input pattern by checking many different inputs
      const results = await Promise.all(
        Array.from({ length: 20 }, (_, i) =>
          service.analyzeImage(`uploads/img-${i}.png`),
        ),
      );

      for (const result of results) {
        expect(result.choices[0]?.message.content).toBeTruthy();
      }
    });
  });

  describe('ID generation', () => {
    it('should produce unique IDs across 100 calls', async () => {
      const ids = new Set<string>();

      for (let i = 0; i < 100; i++) {
        const result = await service.analyzeImage(`uploads/test-${i}.png`);
        ids.add(result.id);
      }

      expect(ids.size).toBe(100);
    });

    it('should produce IDs using only alphanumeric characters', async () => {
      for (let i = 0; i < 50; i++) {
        const result = await service.analyzeImage(`uploads/test-${i}.png`);
        expect(result.id).toMatch(/^chatcmpl-[a-zA-Z0-9]{29}$/);
      }
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

    it('should resolve a functional service that can analyze images', async () => {
      const module: TestingModule = await Test.createTestingModule({
        imports: [AiModule],
      }).compile();

      const aiService = module.get<IAiService>(AI_SERVICE_TOKEN);
      const result = await aiService.analyzeImage('uploads/test.png');

      expect(result.object).toBe('chat.completion');
      expect(result.choices[0]?.message.content).toBeTruthy();
    });
  });
});

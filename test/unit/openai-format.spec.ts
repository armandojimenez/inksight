import Ajv, { ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import { MockAiService } from '@/ai/mock-ai.service';
import { IAiService } from '@/ai/interfaces/ai-service.interface';
import { OpenAiStreamChunk } from '@/ai/interfaces/openai-stream-chunk.interface';

const chatCompletionSchema = require('../schemas/chat-completion.schema.json') as Record<
  string,
  unknown
>;
const streamChunkSchema = require('../schemas/stream-chunk.schema.json') as Record<
  string,
  unknown
>;

describe('OpenAI Format Validation', () => {
  let service: IAiService;
  let validateCompletion: ValidateFunction;
  let validateChunk: ValidateFunction;

  beforeAll(() => {
    const ajv = new Ajv({ strict: true, allErrors: true });
    addFormats(ajv);
    validateCompletion = ajv.compile(chatCompletionSchema);
    validateChunk = ajv.compile(streamChunkSchema);
  });

  beforeEach(() => {
    service = new MockAiService();
  });

  describe('Non-streaming (chat.completion)', () => {
    it('should validate analyzeImage response against schema', async () => {
      const result = await service.analyzeImage('uploads/test.png');
      const valid = validateCompletion(result);

      if (!valid) {
        fail(`Validation errors: ${JSON.stringify(validateCompletion.errors)}`);
      }
      expect(valid).toBe(true);
    });

    it('should validate chat response against schema', async () => {
      const result = await service.chat('What do you see?', 'img-1', []);
      const valid = validateCompletion(result);

      expect(valid).toBe(true);
    });

    it('should have correct id format', async () => {
      const result = await service.analyzeImage('uploads/test.png');

      expect(result.id).toMatch(/^chatcmpl-[a-zA-Z0-9]{29}$/);
    });

    it('should have non-negative integer usage fields that sum correctly', async () => {
      const result = await service.analyzeImage('uploads/test.png');

      expect(Number.isInteger(result.usage.prompt_tokens)).toBe(true);
      expect(Number.isInteger(result.usage.completion_tokens)).toBe(true);
      expect(Number.isInteger(result.usage.total_tokens)).toBe(true);
      expect(result.usage.prompt_tokens).toBeGreaterThanOrEqual(0);
      expect(result.usage.completion_tokens).toBeGreaterThanOrEqual(0);
      expect(result.usage.total_tokens).toBe(
        result.usage.prompt_tokens + result.usage.completion_tokens,
      );
    });

    it('should reject response with missing choices field', () => {
      const invalid = {
        id: 'chatcmpl-aaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        object: 'chat.completion',
        created: 1234567890,
        model: 'gpt-5.2',
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      };

      expect(validateCompletion(invalid)).toBe(false);
    });

    it('should reject response with missing usage field', () => {
      const invalid = {
        id: 'chatcmpl-aaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        object: 'chat.completion',
        created: 1234567890,
        model: 'gpt-5.2',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: 'test' },
            finish_reason: 'stop',
          },
        ],
      };

      expect(validateCompletion(invalid)).toBe(false);
    });

    it('should reject response with missing id field', () => {
      const invalid = {
        object: 'chat.completion',
        created: 1234567890,
        model: 'gpt-5.2',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: 'test' },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      };

      expect(validateCompletion(invalid)).toBe(false);
    });

    it('should reject response with wrong created type', () => {
      const invalid = {
        id: 'chatcmpl-aaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        object: 'chat.completion',
        created: 'not-a-number',
        model: 'gpt-5.2',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: 'test' },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      };

      expect(validateCompletion(invalid)).toBe(false);
    });

    it('should reject response with wrong object value', () => {
      const invalid = {
        id: 'chatcmpl-aaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        object: 'chat.completion.chunk',
        created: 1234567890,
        model: 'gpt-5.2',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: 'test' },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      };

      expect(validateCompletion(invalid)).toBe(false);
    });

    it('should reject response with empty choices array', () => {
      const invalid = {
        id: 'chatcmpl-aaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        object: 'chat.completion',
        created: 1234567890,
        model: 'gpt-5.2',
        choices: [],
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      };

      expect(validateCompletion(invalid)).toBe(false);
    });

    it('should reject response with invalid finish_reason value', () => {
      const invalid = {
        id: 'chatcmpl-aaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        object: 'chat.completion',
        created: 1234567890,
        model: 'gpt-5.2',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: 'test' },
            finish_reason: 'content_filter',
          },
        ],
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      };

      expect(validateCompletion(invalid)).toBe(false);
    });

    it('should reject response with additional properties', () => {
      const invalid = {
        id: 'chatcmpl-aaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        object: 'chat.completion',
        created: 1234567890,
        model: 'gpt-5.2',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: 'test' },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
        extra_field: true,
      };

      expect(validateCompletion(invalid)).toBe(false);
    });
  });

  describe('Streaming (chat.completion.chunk)', () => {
    async function collectChunks(
      gen: AsyncGenerator<OpenAiStreamChunk>,
    ): Promise<OpenAiStreamChunk[]> {
      const chunks: OpenAiStreamChunk[] = [];
      for await (const chunk of gen) {
        chunks.push(chunk);
      }
      return chunks;
    }

    it('should validate each stream chunk against schema', async () => {
      const gen = service.chatStream('Hello', 'img-1', []);
      const chunks = await collectChunks(gen);

      for (const chunk of chunks) {
        const valid = validateChunk(chunk);
        if (!valid) {
          fail(`Chunk validation errors: ${JSON.stringify(validateChunk.errors)} for chunk: ${JSON.stringify(chunk)}`);
        }
        expect(valid).toBe(true);
      }
    });

    it('should reject chunk with missing delta', () => {
      const invalid = {
        id: 'chatcmpl-aaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        object: 'chat.completion.chunk',
        created: 1234567890,
        model: 'gpt-5.2',
        choices: [
          {
            index: 0,
            finish_reason: null,
          },
        ],
      };

      expect(validateChunk(invalid)).toBe(false);
    });

    it('should reject chunk with wrong object value', () => {
      const invalid = {
        id: 'chatcmpl-aaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        object: 'chat.completion',
        created: 1234567890,
        model: 'gpt-5.2',
        choices: [
          {
            index: 0,
            delta: {},
            finish_reason: null,
          },
        ],
      };

      expect(validateChunk(invalid)).toBe(false);
    });

    it('should reject chunk with invalid finish_reason value', () => {
      const invalid = {
        id: 'chatcmpl-aaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        object: 'chat.completion.chunk',
        created: 1234567890,
        model: 'gpt-5.2',
        choices: [
          {
            index: 0,
            delta: {},
            finish_reason: 'length',
          },
        ],
      };

      expect(validateChunk(invalid)).toBe(false);
    });

    it('should reject chunk with empty choices array', () => {
      const invalid = {
        id: 'chatcmpl-aaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        object: 'chat.completion.chunk',
        created: 1234567890,
        model: 'gpt-5.2',
        choices: [],
      };

      expect(validateChunk(invalid)).toBe(false);
    });

    it('should reject chunk with additional properties in delta', () => {
      const invalid = {
        id: 'chatcmpl-aaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        object: 'chat.completion.chunk',
        created: 1234567890,
        model: 'gpt-5.2',
        choices: [
          {
            index: 0,
            delta: { content: 'test', tool_calls: [] },
            finish_reason: null,
          },
        ],
      };

      expect(validateChunk(invalid)).toBe(false);
    });
  });
});

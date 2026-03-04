import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { MockAiService } from '@/ai/mock-ai.service';
import { IAiService } from '@/ai/interfaces/ai-service.interface';
import { OpenAiStreamChunk } from '@/ai/interfaces/openai-stream-chunk.interface';

/* eslint-disable @typescript-eslint/no-require-imports */
const chatCompletionSchema = require('../schemas/chat-completion.schema.json') as Record<string, unknown>;
const streamChunkSchema = require('../schemas/stream-chunk.schema.json') as Record<string, unknown>;

describe('OpenAI Format Validation', () => {
  let service: IAiService;
  let ajv: Ajv;

  beforeAll(() => {
    ajv = new Ajv({ strict: true, allErrors: true });
    addFormats(ajv);
  });

  beforeEach(() => {
    service = new MockAiService();
  });

  describe('Non-streaming (chat.completion)', () => {
    it('should validate analyzeImage response against schema', async () => {
      const result = await service.analyzeImage('uploads/test.png');
      const validate = ajv.compile(chatCompletionSchema);
      const valid = validate(result);

      expect(valid).toBe(true);
      if (!valid) {
        // eslint-disable-next-line no-console
        console.error('Validation errors:', validate.errors);
      }
    });

    it('should validate chat response against schema', async () => {
      const result = await service.chat('What do you see?', []);
      const validate = ajv.compile(chatCompletionSchema);
      const valid = validate(result);

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

    it('should reject response with missing required field', () => {
      const validate = ajv.compile(chatCompletionSchema);
      const invalid = {
        id: 'chatcmpl-abc',
        object: 'chat.completion',
        created: 1234567890,
        model: 'gpt-4o',
        // missing choices and usage
      };

      expect(validate(invalid)).toBe(false);
    });

    it('should reject response with wrong type', () => {
      const validate = ajv.compile(chatCompletionSchema);
      const invalid = {
        id: 'chatcmpl-abc',
        object: 'chat.completion',
        created: 'not-a-number', // wrong type
        model: 'gpt-4o',
        choices: [],
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      };

      expect(validate(invalid)).toBe(false);
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
      const gen = service.chatStream('Hello', []);
      const chunks = await collectChunks(gen);
      const validate = ajv.compile(streamChunkSchema);

      for (const chunk of chunks) {
        const valid = validate(chunk);
        if (!valid) {
          // eslint-disable-next-line no-console
          console.error('Chunk validation errors:', validate.errors, chunk);
        }
        expect(valid).toBe(true);
      }
    });

    it('should reject chunk with missing delta', () => {
      const validate = ajv.compile(streamChunkSchema);
      const invalid = {
        id: 'chatcmpl-aaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        object: 'chat.completion.chunk',
        created: 1234567890,
        model: 'gpt-4o',
        choices: [
          {
            index: 0,
            // missing delta
            finish_reason: null,
          },
        ],
      };

      expect(validate(invalid)).toBe(false);
    });

    it('should reject chunk with wrong object value', () => {
      const validate = ajv.compile(streamChunkSchema);
      const invalid = {
        id: 'chatcmpl-aaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        object: 'chat.completion', // wrong — should be chat.completion.chunk
        created: 1234567890,
        model: 'gpt-4o',
        choices: [
          {
            index: 0,
            delta: {},
            finish_reason: null,
          },
        ],
      };

      expect(validate(invalid)).toBe(false);
    });
  });
});

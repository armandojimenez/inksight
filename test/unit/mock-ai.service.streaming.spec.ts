import { MockAiService } from '@/ai/mock-ai.service';
import { OpenAiStreamChunk } from '@/ai/interfaces/openai-stream-chunk.interface';

describe('MockAiService — chatStream streaming', () => {
  let service: MockAiService;
  const PROMPT = 'Describe this image';
  const IMAGE_ID = '550e8400-e29b-41d4-a716-446655440000';

  beforeEach(() => {
    service = new MockAiService();
    delete process.env.STREAM_CHUNK_DELAY_MS;
  });

  afterEach(() => {
    delete process.env.STREAM_CHUNK_DELAY_MS;
  });

  async function collectChunks(
    gen: AsyncGenerator<OpenAiStreamChunk>,
  ): Promise<OpenAiStreamChunk[]> {
    const chunks: OpenAiStreamChunk[] = [];
    for await (const chunk of gen) {
      chunks.push(chunk);
    }
    return chunks;
  }

  describe('delay configuration', () => {
    it('should yield chunks with no delay when STREAM_CHUNK_DELAY_MS is unset', async () => {
      const start = Date.now();
      const gen = service.chatStream(PROMPT, IMAGE_ID, []);
      const chunks = await collectChunks(gen);
      const elapsed = Date.now() - start;

      expect(chunks.length).toBeGreaterThan(2);
      expect(elapsed).toBeLessThan(100); // effectively instant
    });

    it('should yield chunks with no delay when STREAM_CHUNK_DELAY_MS is 0', async () => {
      process.env.STREAM_CHUNK_DELAY_MS = '0';

      const start = Date.now();
      const gen = service.chatStream(PROMPT, IMAGE_ID, []);
      const chunks = await collectChunks(gen);
      const elapsed = Date.now() - start;

      expect(chunks.length).toBeGreaterThan(2);
      expect(elapsed).toBeLessThan(100);
    });

    it('should yield chunks with delay when STREAM_CHUNK_DELAY_MS is set', async () => {
      process.env.STREAM_CHUNK_DELAY_MS = '20';

      const start = Date.now();
      const gen = service.chatStream(PROMPT, IMAGE_ID, []);
      const chunks = await collectChunks(gen);
      const elapsed = Date.now() - start;

      // With N content chunks and 20ms delay each, should take meaningful time
      const contentChunks = chunks.filter(
        (c) => c.choices[0]?.delta.content !== undefined && c.choices[0].delta.content !== '',
      );
      expect(elapsed).toBeGreaterThanOrEqual(contentChunks.length * 15); // allow some tolerance
    });
  });

  describe('abort signal', () => {
    it('should terminate stream mid-generation when aborted', async () => {
      process.env.STREAM_CHUNK_DELAY_MS = '10';
      const ac = new AbortController();

      const gen = service.chatStream(PROMPT, IMAGE_ID, [], ac.signal);

      // Collect a few chunks then abort
      const chunks: OpenAiStreamChunk[] = [];
      for await (const chunk of gen) {
        chunks.push(chunk);
        if (chunks.length === 3) {
          ac.abort();
        }
      }

      // Full response has more chunks — we should have fewer
      const fullGen = service.chatStream(PROMPT, IMAGE_ID, []);
      const fullChunks = await collectChunks(fullGen);

      expect(chunks.length).toBeLessThan(fullChunks.length);
    });

    it('should yield zero content chunks when pre-aborted', async () => {
      const ac = new AbortController();
      ac.abort(); // pre-abort

      const gen = service.chatStream(PROMPT, IMAGE_ID, [], ac.signal);
      const chunks = await collectChunks(gen);

      const contentChunks = chunks.filter(
        (c) => c.choices[0]?.delta.content !== undefined && c.choices[0].delta.content !== '',
      );
      expect(contentChunks).toHaveLength(0);
    });

    it('should cancel the delay timer immediately on abort', async () => {
      process.env.STREAM_CHUNK_DELAY_MS = '5000'; // very long delay
      const ac = new AbortController();

      const start = Date.now();
      const gen = service.chatStream(PROMPT, IMAGE_ID, [], ac.signal);

      // Start iterating — first chunk (role) should come through, then abort during delay
      const chunks: OpenAiStreamChunk[] = [];
      const iterator = gen[Symbol.asyncIterator]();

      // Get first chunk (role announcement — no delay before it)
      const first = await iterator.next();
      if (!first.done) chunks.push(first.value);

      // Abort while waiting for the next chunk delay
      setTimeout(() => ac.abort(), 50);

      // Continue iterating — should resolve quickly after abort
      let result = await iterator.next();
      while (!result.done) {
        chunks.push(result.value);
        result = await iterator.next();
      }

      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(500); // way less than 5000ms delay
    });

    it('should return done: true after abort (no resource leaks)', async () => {
      const ac = new AbortController();
      ac.abort();

      const gen = service.chatStream(PROMPT, IMAGE_ID, [], ac.signal);

      // Exhaust the generator
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _ of gen) {
        // drain
      }

      // Generator should be done
      const result = await gen.next();
      expect(result.done).toBe(true);
    });
  });
});

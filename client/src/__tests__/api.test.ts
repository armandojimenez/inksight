import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  uploadImage,
  sendMessage,
  streamMessage,
  parseSSEStream,
  getMessages,
  getImages,
  deleteImage,
  getImageFileUrl,
  healthCheck,
  ApiRequestError,
} from '@/lib/api';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function errorResponse(status: number, body?: unknown): Response {
  const responseBody = body ?? {
    statusCode: status,
    error: 'Error',
    code: 'TEST_ERROR',
    message: 'Test error',
    timestamp: '2026-01-01T00:00:00Z',
    path: '/api/test',
    requestId: 'req-1',
  };
  return new Response(JSON.stringify(responseBody), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getImageFileUrl', () => {
    it('returns correct URL for image ID', () => {
      expect(getImageFileUrl('abc-123')).toBe('/api/images/abc-123/file');
    });
  });

  describe('uploadImage', () => {
    it('sends POST with FormData and returns response', async () => {
      const mockResponse = { id: 'img-1', filename: 'photo.png', mimeType: 'image/png', size: 1024, analysis: null };
      mockFetch.mockResolvedValueOnce(jsonResponse(mockResponse));

      const file = new File(['test'], 'photo.png', { type: 'image/png' });
      const result = await uploadImage(file);

      expect(mockFetch).toHaveBeenCalledWith('/api/upload', expect.objectContaining({
        method: 'POST',
        body: expect.any(FormData),
      }));
      expect(result).toEqual(mockResponse);
    });

    it('passes abort signal', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: 'img-1' }));
      const controller = new AbortController();

      await uploadImage(new File([''], 'test.png'), controller.signal);

      expect(mockFetch).toHaveBeenCalledWith('/api/upload', expect.objectContaining({
        signal: controller.signal,
      }));
    });

    it('throws ApiRequestError on failure', async () => {
      mockFetch.mockResolvedValueOnce(errorResponse(400));

      await expect(uploadImage(new File([''], 'test.png'))).rejects.toThrow(ApiRequestError);
    });
  });

  describe('sendMessage', () => {
    it('sends POST with JSON body and returns response', async () => {
      const mockCompletion = { id: 'cmpl-1', object: 'chat.completion' };
      mockFetch.mockResolvedValueOnce(jsonResponse(mockCompletion));

      const result = await sendMessage('img-1', 'Hello');

      expect(mockFetch).toHaveBeenCalledWith('/api/chat/img-1', expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Hello' }),
      }));
      expect(result).toEqual(mockCompletion);
    });

    it('throws on error response', async () => {
      mockFetch.mockResolvedValueOnce(errorResponse(404));

      await expect(sendMessage('bad-id', 'Hello')).rejects.toThrow(ApiRequestError);
    });
  });

  describe('streamMessage', () => {
    it('sends POST and returns raw response for streaming', async () => {
      const mockRes = new Response('data: test\n\n', { status: 200 });
      mockFetch.mockResolvedValueOnce(mockRes);

      const result = await streamMessage('img-1', 'Describe this');

      expect(mockFetch).toHaveBeenCalledWith('/api/chat-stream/img-1', expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Describe this' }),
      }));
      expect(result).toBe(mockRes);
    });

    it('throws on error response', async () => {
      mockFetch.mockResolvedValueOnce(errorResponse(500));

      await expect(streamMessage('img-1', 'Hello')).rejects.toThrow(ApiRequestError);
    });
  });

  describe('parseSSEStream', () => {
    function createSSEResponse(chunks: string): Response {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(chunks));
          controller.close();
        },
      });
      return new Response(stream, { status: 200 });
    }

    it('parses SSE data lines into StreamChunk objects', async () => {
      const chunk = { id: 'c-1', object: 'chat.completion.chunk', created: 1, model: 'mock', choices: [] };
      const response = createSSEResponse(`data: ${JSON.stringify(chunk)}\n\n`);

      const results = [];
      for await (const c of parseSSEStream(response)) {
        results.push(c);
      }

      expect(results).toEqual([chunk]);
    });

    it('stops on [DONE] signal', async () => {
      const chunk1 = { id: 'c-1', choices: [{ delta: { content: 'Hi' } }] };
      const chunk2 = { id: 'c-2', choices: [{ delta: { content: '!' } }] };
      const response = createSSEResponse(
        `data: ${JSON.stringify(chunk1)}\n\ndata: ${JSON.stringify(chunk2)}\n\ndata: [DONE]\n\n`,
      );

      const results = [];
      for await (const c of parseSSEStream(response)) {
        results.push(c);
      }

      expect(results).toHaveLength(2);
    });

    it('skips empty lines and non-data lines', async () => {
      const chunk = { id: 'c-1' };
      const response = createSSEResponse(
        `\n: comment\nevent: message\ndata: ${JSON.stringify(chunk)}\n\n`,
      );

      const results = [];
      for await (const c of parseSSEStream(response)) {
        results.push(c);
      }

      expect(results).toEqual([chunk]);
    });

    it('throws if response body is null', async () => {
      const response = new Response(null, { status: 200 });
      Object.defineProperty(response, 'body', { value: null });

      const gen = parseSSEStream(response);
      await expect(gen.next()).rejects.toThrow('Response body is null');
    });
  });

  describe('getMessages', () => {
    it('fetches message history for an image', async () => {
      const mockHistory = { imageId: 'img-1', messages: [], totalMessages: 0, page: 1, pageSize: 20, totalPages: 0 };
      mockFetch.mockResolvedValueOnce(jsonResponse(mockHistory));

      const result = await getMessages('img-1');

      expect(mockFetch).toHaveBeenCalledWith('/api/chat/img-1/history', expect.any(Object));
      expect(result).toEqual(mockHistory);
    });

    it('includes pagination params in query string', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ messages: [] }));

      await getMessages('img-1', { page: 2, limit: 10 });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/chat/img-1/history?page=2&limit=10',
        expect.any(Object),
      );
    });

    it('omits empty pagination params', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ messages: [] }));

      await getMessages('img-1', {});

      expect(mockFetch).toHaveBeenCalledWith('/api/chat/img-1/history', expect.any(Object));
    });
  });

  describe('getImages', () => {
    it('fetches image gallery', async () => {
      const mockGallery = { images: [], total: 0, page: 1, pageSize: 20, totalPages: 0 };
      mockFetch.mockResolvedValueOnce(jsonResponse(mockGallery));

      const result = await getImages();

      expect(mockFetch).toHaveBeenCalledWith('/api/images', expect.any(Object));
      expect(result).toEqual(mockGallery);
    });

    it('includes pagination params', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ images: [] }));

      await getImages({ page: 3, limit: 5 });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/images?page=3&limit=5',
        expect.any(Object),
      );
    });
  });

  describe('deleteImage', () => {
    it('sends DELETE request', async () => {
      mockFetch.mockResolvedValueOnce(new Response(null, { status: 204 }));

      await deleteImage('img-1');

      expect(mockFetch).toHaveBeenCalledWith('/api/images/img-1', expect.objectContaining({
        method: 'DELETE',
      }));
    });

    it('throws on error response', async () => {
      mockFetch.mockResolvedValueOnce(errorResponse(404));

      await expect(deleteImage('bad-id')).rejects.toThrow(ApiRequestError);
    });
  });

  describe('healthCheck', () => {
    it('fetches health status', async () => {
      const mockHealth = { status: 'healthy', timestamp: '2026-01-01T00:00:00Z', checks: { database: 'connected', uptime: 100 } };
      mockFetch.mockResolvedValueOnce(jsonResponse(mockHealth));

      const result = await healthCheck();

      expect(mockFetch).toHaveBeenCalledWith('/api/health', expect.any(Object));
      expect(result).toEqual(mockHealth);
    });
  });

  describe('error handling', () => {
    it('ApiRequestError has correct status and body', async () => {
      const errorBody = {
        statusCode: 422,
        error: 'Unprocessable Entity',
        code: 'VALIDATION_ERROR',
        message: 'Invalid input',
        timestamp: '2026-01-01T00:00:00Z',
        path: '/api/test',
        requestId: 'req-1',
      };
      mockFetch.mockResolvedValueOnce(errorResponse(422, errorBody));

      try {
        await healthCheck();
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ApiRequestError);
        const apiErr = err as InstanceType<typeof ApiRequestError>;
        expect(apiErr.status).toBe(422);
        expect(apiErr.body).toEqual(errorBody);
        expect(apiErr.message).toBe('Invalid input');
      }
    });

    it('handles non-JSON error responses gracefully', async () => {
      // Server returns HTML error page or empty body
      const res = new Response('Internal Server Error', {
        status: 500,
        statusText: 'Internal Server Error',
      });
      mockFetch.mockResolvedValueOnce(res);

      try {
        await healthCheck();
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ApiRequestError);
        const apiErr = err as InstanceType<typeof ApiRequestError>;
        expect(apiErr.status).toBe(500);
        expect(apiErr.body.code).toBe('NETWORK_ERROR');
        expect(apiErr.body.message).toContain('500');
      }
    });
  });
});

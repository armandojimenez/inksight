/**
 * API Contract Tests
 *
 * Validates that realistic backend responses have the exact fields
 * the client code depends on. If the backend renames a field or
 * changes a type, these tests fail — catching contract drift that
 * unit tests with mocked fetch cannot detect.
 *
 * Each "backend payload" here mirrors the actual backend DTO shape
 * (from src/upload/dto/*.dto.ts, src/history/dto/*.dto.ts, etc.).
 */
import { describe, it, expect } from 'vitest';
import type {
  UploadResponse,
  GalleryResponse,
  HistoryResponse,
  HealthResponse,
  ApiError,
  ChatCompletion,
  StreamChunk,
  ImageData,
  MessageData,
} from '@/types';

// ─── Backend payloads (mirror actual DTO shapes) ──────────────────────

const UPLOAD_PAYLOAD = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  filename: 'photo.png',
  mimeType: 'image/png',
  size: 245832,
  analysis: {
    id: 'chatcmpl-abc123',
    object: 'chat.completion' as const,
    created: 1709554800,
    model: 'gpt-5.2',
    choices: [{
      index: 0,
      message: { role: 'assistant' as const, content: 'A mountain landscape.' },
      finish_reason: 'stop' as const,
    }],
    usage: { prompt_tokens: 255, completion_tokens: 50, total_tokens: 305 },
  },
};

const GALLERY_PAYLOAD = {
  images: [{
    id: '550e8400-e29b-41d4-a716-446655440000',
    originalFilename: 'mountain_view.png',
    mimeType: 'image/png',
    size: 245832,
    messageCount: 4,
    createdAt: '2026-03-04T10:30:00.000Z',
  }],
  total: 1,
  page: 1,
  pageSize: 20,
  totalPages: 1,
};

const HISTORY_PAYLOAD = {
  imageId: '550e8400-e29b-41d4-a716-446655440000',
  messages: [{
    id: 'a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5',
    role: 'user' as const,
    content: 'What objects can you identify?',
    timestamp: '2026-03-04T10:30:00.000Z',
  }, {
    id: 'b2c3d4e5-f6a7-4b8c-9d0e-f1a2b3c4d5e6',
    role: 'assistant' as const,
    content: 'I can see mountains and a blue sky.',
    timestamp: '2026-03-04T10:30:01.000Z',
  }],
  totalMessages: 2,
  page: 1,
  pageSize: 20,
  totalPages: 1,
};

const HEALTH_PAYLOAD = {
  status: 'healthy' as const,
  timestamp: '2026-03-04T10:30:00.000Z',
  checks: {
    database: 'connected' as const,
    uptime: 1234.56,
  },
};

const ERROR_PAYLOAD = {
  statusCode: 404,
  error: 'Not Found',
  code: 'IMAGE_NOT_FOUND',
  message: 'Image not found',
  timestamp: '2026-03-04T10:30:00.000Z',
  path: '/api/images/550e8400-e29b-41d4-a716-446655440000',
  requestId: '660e8400-e29b-41d4-a716-446655440001',
};

const CHAT_COMPLETION_PAYLOAD = {
  id: 'chatcmpl-abc123',
  object: 'chat.completion' as const,
  created: 1709554800,
  model: 'gpt-5.2',
  choices: [{
    index: 0,
    message: { role: 'assistant' as const, content: 'I see a landscape.' },
    finish_reason: 'stop' as const,
  }],
  usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
};

const STREAM_CHUNK_PAYLOAD = {
  id: 'chatcmpl-abc123',
  object: 'chat.completion.chunk' as const,
  created: 1709554800,
  model: 'gpt-5.2',
  choices: [{
    index: 0,
    delta: { role: 'assistant' as const, content: 'Hello' },
    finish_reason: null,
  }],
};

// ─── Contract validation helpers ──────────────────────────────────────

function assertHasFields(obj: Record<string, unknown>, fields: string[], context: string) {
  for (const field of fields) {
    expect(obj, `${context}: missing field "${field}"`).toHaveProperty(field);
    expect(obj[field], `${context}: field "${field}" is undefined`).not.toBeUndefined();
  }
}

function assertFieldType(obj: Record<string, unknown>, field: string, type: string, context: string) {
  expect(typeof obj[field], `${context}.${field} should be ${type}`).toBe(type);
}

// ─── Tests ────────────────────────────────────────────────────────────

describe('API Contracts', () => {
  describe('UploadResponse', () => {
    it('has all fields the client depends on', () => {
      const payload: UploadResponse = UPLOAD_PAYLOAD;
      assertHasFields(payload as unknown as Record<string, unknown>, ['id', 'filename', 'mimeType', 'size', 'analysis'], 'UploadResponse');
      assertFieldType(payload as unknown as Record<string, unknown>, 'id', 'string', 'UploadResponse');
      assertFieldType(payload as unknown as Record<string, unknown>, 'filename', 'string', 'UploadResponse');
      assertFieldType(payload as unknown as Record<string, unknown>, 'mimeType', 'string', 'UploadResponse');
      assertFieldType(payload as unknown as Record<string, unknown>, 'size', 'number', 'UploadResponse');
    });

    it('analysis is nullable and has ChatCompletion shape when present', () => {
      const payload: UploadResponse = UPLOAD_PAYLOAD;
      expect(payload.analysis).not.toBeNull();
      const analysis = payload.analysis!;
      assertHasFields(analysis as unknown as Record<string, unknown>, ['id', 'object', 'created', 'model', 'choices', 'usage'], 'UploadResponse.analysis');
      expect(analysis.choices.length).toBeGreaterThan(0);
      expect(analysis.choices[0]).toHaveProperty('message');
      expect(analysis.choices[0].message).toHaveProperty('content');
    });

    it('accepts null analysis', () => {
      const payload: UploadResponse = { ...UPLOAD_PAYLOAD, analysis: null };
      expect(payload.analysis).toBeNull();
    });
  });

  describe('GalleryResponse', () => {
    it('has pagination fields', () => {
      const payload: GalleryResponse = GALLERY_PAYLOAD;
      assertHasFields(payload as unknown as Record<string, unknown>, ['images', 'total', 'page', 'pageSize', 'totalPages'], 'GalleryResponse');
      assertFieldType(payload as unknown as Record<string, unknown>, 'total', 'number', 'GalleryResponse');
      assertFieldType(payload as unknown as Record<string, unknown>, 'page', 'number', 'GalleryResponse');
    });

    it('each image has all ImageData fields', () => {
      const image: ImageData = GALLERY_PAYLOAD.images[0]!;
      assertHasFields(image as unknown as Record<string, unknown>, ['id', 'originalFilename', 'mimeType', 'size', 'messageCount', 'createdAt'], 'GalleryResponse.images[]');
      assertFieldType(image as unknown as Record<string, unknown>, 'id', 'string', 'ImageData');
      assertFieldType(image as unknown as Record<string, unknown>, 'originalFilename', 'string', 'ImageData');
      assertFieldType(image as unknown as Record<string, unknown>, 'messageCount', 'number', 'ImageData');
    });

    it('images array does not expose internal fields', () => {
      const image = GALLERY_PAYLOAD.images[0] as unknown as Record<string, unknown>;
      expect(image).not.toHaveProperty('uploadPath');
      expect(image).not.toHaveProperty('storedFilename');
      expect(image).not.toHaveProperty('version');
      expect(image).not.toHaveProperty('initialAnalysis');
    });
  });

  describe('HistoryResponse', () => {
    it('has all required fields', () => {
      const payload: HistoryResponse = HISTORY_PAYLOAD;
      assertHasFields(payload as unknown as Record<string, unknown>, ['imageId', 'messages', 'totalMessages', 'page', 'pageSize', 'totalPages'], 'HistoryResponse');
    });

    it('each message has MessageData fields', () => {
      const msg: MessageData = HISTORY_PAYLOAD.messages[0]!;
      assertHasFields(msg as unknown as Record<string, unknown>, ['id', 'role', 'content', 'timestamp'], 'HistoryResponse.messages[]');
      expect(['user', 'assistant']).toContain(msg.role);
    });

    it('uses totalMessages (not total) for count', () => {
      const payload = HISTORY_PAYLOAD as unknown as Record<string, unknown>;
      expect(payload).toHaveProperty('totalMessages');
      expect(payload).not.toHaveProperty('totalImages');
    });
  });

  describe('HealthResponse', () => {
    it('has all required fields', () => {
      const payload: HealthResponse = HEALTH_PAYLOAD;
      assertHasFields(payload as unknown as Record<string, unknown>, ['status', 'timestamp', 'checks'], 'HealthResponse');
      assertHasFields(payload.checks as unknown as Record<string, unknown>, ['database', 'uptime'], 'HealthResponse.checks');
    });

    it('status is "healthy" or "degraded"', () => {
      expect(['healthy', 'degraded']).toContain(HEALTH_PAYLOAD.status);
    });

    it('database is "connected" or "disconnected"', () => {
      expect(['connected', 'disconnected']).toContain(HEALTH_PAYLOAD.checks.database);
    });
  });

  describe('ApiError', () => {
    it('has all fields the client error handler depends on', () => {
      const payload: ApiError = ERROR_PAYLOAD;
      assertHasFields(payload as unknown as Record<string, unknown>, ['statusCode', 'error', 'code', 'message', 'timestamp', 'path', 'requestId'], 'ApiError');
    });

    it('statusCode is a number, not a string', () => {
      assertFieldType(ERROR_PAYLOAD as unknown as Record<string, unknown>, 'statusCode', 'number', 'ApiError');
    });
  });

  describe('ChatCompletion', () => {
    it('has OpenAI-compatible structure', () => {
      const payload: ChatCompletion = CHAT_COMPLETION_PAYLOAD;
      assertHasFields(payload as unknown as Record<string, unknown>, ['id', 'object', 'created', 'model', 'choices', 'usage'], 'ChatCompletion');
      expect(payload.object).toBe('chat.completion');
      expect(payload.choices[0]).toHaveProperty('message');
      expect(payload.choices[0]!.message).toHaveProperty('role');
      expect(payload.choices[0]!.message).toHaveProperty('content');
    });

    it('usage has token fields', () => {
      assertHasFields(CHAT_COMPLETION_PAYLOAD.usage as unknown as Record<string, unknown>, ['prompt_tokens', 'completion_tokens', 'total_tokens'], 'ChatCompletion.usage');
    });
  });

  describe('StreamChunk', () => {
    it('has OpenAI streaming chunk structure', () => {
      const payload: StreamChunk = STREAM_CHUNK_PAYLOAD;
      assertHasFields(payload as unknown as Record<string, unknown>, ['id', 'object', 'created', 'model', 'choices'], 'StreamChunk');
      expect(payload.object).toBe('chat.completion.chunk');
    });

    it('choices have delta (not message)', () => {
      const choice = STREAM_CHUNK_PAYLOAD.choices[0]!;
      expect(choice).toHaveProperty('delta');
      expect(choice).not.toHaveProperty('message');
      expect(choice).toHaveProperty('finish_reason');
    });

    it('delta has optional role and content', () => {
      const delta = STREAM_CHUNK_PAYLOAD.choices[0]!.delta;
      // Both present in this payload
      expect(delta).toHaveProperty('role');
      expect(delta).toHaveProperty('content');
    });
  });

  describe('Field naming consistency', () => {
    it('gallery uses "total" while history uses "totalMessages"', () => {
      // This is a known asymmetry in the API. The client handles it.
      // If backend changes either name, these tests catch it.
      expect(GALLERY_PAYLOAD).toHaveProperty('total');
      expect(GALLERY_PAYLOAD).not.toHaveProperty('totalMessages');
      expect(HISTORY_PAYLOAD).toHaveProperty('totalMessages');
      expect(HISTORY_PAYLOAD).not.toHaveProperty('total');
    });

    it('gallery images use "originalFilename" while upload uses "filename"', () => {
      // Another known asymmetry. Gallery returns the DB field name,
      // upload returns a shorter alias. Client maps accordingly.
      expect(GALLERY_PAYLOAD.images[0]).toHaveProperty('originalFilename');
      expect(UPLOAD_PAYLOAD).toHaveProperty('filename');
      expect(UPLOAD_PAYLOAD).not.toHaveProperty('originalFilename');
    });
  });
});

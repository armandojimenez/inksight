import type {
  UploadResponse,
  ChatCompletion,
  StreamChunk,
  HistoryResponse,
  GalleryResponse,
  HealthResponse,
  ApiError,
  PaginationParams,
} from '@/types';

const BASE = '/api';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function assertUUID(id: string): void {
  if (!UUID_RE.test(id)) {
    throw new Error(`Invalid image ID: ${id}`);
  }
}

/** Maps known API error codes to user-friendly messages */
const ERROR_MESSAGES: Record<string, string> = {
  IMAGE_NOT_FOUND: 'Image not found. It may have been deleted.',
  IMAGE_PROCESSING_FAILED: 'Failed to process the image. Please try a different file.',
  VALIDATION_ERROR: 'Invalid input. Please check your request.',
  FILE_TOO_LARGE: 'File is too large. Maximum size is 16 MB.',
  UNSUPPORTED_FILE_TYPE: 'File type not supported. Use PNG, JPG, or GIF.',
  MESSAGE_LIMIT_REACHED: 'Message limit reached for this image.',
  AI_SERVICE_ERROR: 'AI service is temporarily unavailable. Please try again.',
  NETWORK_ERROR: 'Network error. Please check your connection.',
};

class ApiRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: ApiError,
  ) {
    super(ERROR_MESSAGES[body.code] ?? body.message);
    this.name = 'ApiRequestError';
  }
}

async function parseErrorBody(res: Response): Promise<ApiError> {
  try {
    return (await res.json()) as ApiError;
  } catch {
    return {
      statusCode: res.status,
      error: res.statusText || 'Unknown Error',
      code: 'NETWORK_ERROR',
      message: `Request failed with status ${res.status}`,
      timestamp: new Date().toISOString(),
      path: '',
      requestId: '',
    };
  }
}

async function throwIfNotOk(res: Response): Promise<void> {
  if (!res.ok) {
    const body = await parseErrorBody(res);
    throw new ApiRequestError(res.status, body);
  }
}

async function handleResponse<T>(res: Response): Promise<T> {
  await throwIfNotOk(res);
  return res.json() as Promise<T>;
}

function queryString(params?: PaginationParams): string {
  if (!params) return '';
  const qs = new URLSearchParams();
  if (params.page != null) qs.set('page', String(params.page));
  if (params.limit != null) qs.set('limit', String(params.limit));
  const str = qs.toString();
  return str ? `?${str}` : '';
}

export async function uploadImage(
  file: File,
  signal?: AbortSignal,
): Promise<UploadResponse> {
  const form = new FormData();
  form.append('image', file);
  const res = await fetch(`${BASE}/upload`, {
    method: 'POST',
    body: form,
    signal,
  });
  return handleResponse<UploadResponse>(res);
}

export async function sendMessage(
  imageId: string,
  message: string,
  signal?: AbortSignal,
): Promise<ChatCompletion> {
  assertUUID(imageId);
  const res = await fetch(`${BASE}/chat/${encodeURIComponent(imageId)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
    signal,
  });
  return handleResponse<ChatCompletion>(res);
}

export async function streamMessage(
  imageId: string,
  message: string,
  signal?: AbortSignal,
): Promise<Response> {
  assertUUID(imageId);
  const res = await fetch(`${BASE}/chat-stream/${encodeURIComponent(imageId)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
    signal,
  });
  await throwIfNotOk(res);
  return res;
}

function isValidStreamChunk(data: unknown): data is StreamChunk {
  if (typeof data !== 'object' || data === null) return false;
  const obj = data as Record<string, unknown>;
  return (
    typeof obj['id'] === 'string' &&
    Array.isArray(obj['choices'])
  );
}

export async function* parseSSEStream(
  response: Response,
): AsyncGenerator<StreamChunk> {
  if (!response.body) {
    throw new Error('Response body is null — streaming not supported');
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const payload = trimmed.slice(6);
        if (payload === '[DONE]') return;
        try {
          const parsed: unknown = JSON.parse(payload);
          if (isValidStreamChunk(parsed)) {
            yield parsed;
          }
        } catch {
          // Skip malformed JSON chunks — do not crash the stream
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export async function getMessages(
  imageId: string,
  params?: PaginationParams,
  signal?: AbortSignal,
): Promise<HistoryResponse> {
  assertUUID(imageId);
  const res = await fetch(
    `${BASE}/chat/${encodeURIComponent(imageId)}/history${queryString(params)}`,
    { signal },
  );
  return handleResponse<HistoryResponse>(res);
}

export async function getImages(
  params?: PaginationParams,
  signal?: AbortSignal,
): Promise<GalleryResponse> {
  const res = await fetch(`${BASE}/images${queryString(params)}`, { signal });
  return handleResponse<GalleryResponse>(res);
}

export async function deleteImage(
  imageId: string,
  signal?: AbortSignal,
): Promise<void> {
  assertUUID(imageId);
  const res = await fetch(`${BASE}/images/${encodeURIComponent(imageId)}`, {
    method: 'DELETE',
    signal,
  });
  await throwIfNotOk(res);
}

export function getImageFileUrl(imageId: string): string {
  assertUUID(imageId);
  return `${BASE}/images/${encodeURIComponent(imageId)}/file`;
}

export async function healthCheck(
  signal?: AbortSignal,
): Promise<HealthResponse> {
  const res = await fetch(`${BASE}/health`, { signal });
  return handleResponse<HealthResponse>(res);
}

export { ApiRequestError };

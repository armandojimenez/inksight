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

class ApiRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: ApiError,
  ) {
    super(body.message);
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
  const res = await fetch(`${BASE}/chat/${imageId}`, {
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
  const res = await fetch(`${BASE}/chat-stream/${imageId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
    signal,
  });
  await throwIfNotOk(res);
  return res;
}

export async function* parseSSEStream(
  response: Response,
): AsyncGenerator<StreamChunk> {
  const reader = response.body!.getReader();
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
        yield JSON.parse(payload) as StreamChunk;
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
  const res = await fetch(
    `${BASE}/chat/${imageId}/history${queryString(params)}`,
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
  const res = await fetch(`${BASE}/images/${imageId}`, {
    method: 'DELETE',
    signal,
  });
  // DELETE returns 204 No Content — no body to parse on success
  await throwIfNotOk(res);
}

export function getImageFileUrl(imageId: string): string {
  return `${BASE}/images/${imageId}/file`;
}

export async function healthCheck(
  signal?: AbortSignal,
): Promise<HealthResponse> {
  const res = await fetch(`${BASE}/health`, { signal });
  return handleResponse<HealthResponse>(res);
}

export { ApiRequestError };

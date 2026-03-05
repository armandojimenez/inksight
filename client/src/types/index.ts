export interface ImageData {
  readonly id: string;
  readonly originalFilename: string;
  readonly mimeType: string;
  readonly size: number;
  readonly messageCount: number;
  readonly createdAt: string;
}

export interface UploadResponse {
  readonly id: string;
  readonly filename: string;
  readonly mimeType: string;
  readonly size: number;
  /**
   * Runtime shape is OpenAI ChatCompletion. The backend DTO types this as
   * Record<string, unknown> for Swagger flexibility, but the actual value
   * is always the return of MockAiService.analyzeImage().
   * See: src/ai/interfaces/openai-chat-completion.interface.ts
   */
  readonly analysis: ChatCompletion | null;
}

export interface MessageData {
  readonly id: string;
  readonly role: 'user' | 'assistant';
  readonly content: string;
  readonly timestamp: string;
}

export interface ChatCompletion {
  readonly id: string;
  readonly object: 'chat.completion';
  readonly created: number;
  readonly model: string;
  readonly choices: readonly ChatCompletionChoice[];
  readonly usage: {
    readonly prompt_tokens: number;
    readonly completion_tokens: number;
    readonly total_tokens: number;
  };
}

export interface ChatCompletionChoice {
  readonly index: number;
  readonly message: {
    readonly role: 'assistant';
    readonly content: string;
  };
  readonly finish_reason: 'stop' | 'length';
}

export interface StreamChunk {
  readonly id: string;
  readonly object: 'chat.completion.chunk';
  readonly created: number;
  readonly model: string;
  readonly choices: readonly StreamChunkChoice[];
}

export interface StreamChunkChoice {
  readonly index: number;
  readonly delta: {
    readonly role?: 'assistant';
    readonly content?: string;
  };
  readonly finish_reason: 'stop' | null;
}

export interface HistoryResponse {
  readonly imageId: string;
  readonly messages: readonly MessageData[];
  readonly totalMessages: number;
  readonly page: number;
  readonly pageSize: number;
  readonly totalPages: number;
}

export interface GalleryResponse {
  readonly images: readonly ImageData[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly totalPages: number;
}

export interface HealthResponse {
  readonly status: 'healthy' | 'degraded';
  readonly timestamp: string;
  readonly checks: {
    readonly database: 'connected' | 'disconnected';
    readonly uptime: number;
  };
}

export interface ApiError {
  readonly statusCode: number;
  readonly error: string;
  readonly code: string;
  readonly message: string;
  readonly timestamp: string;
  readonly path: string;
  readonly requestId: string;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
}

# Inksight — Technical Design Document

**Version:** 1.0
**Last Updated:** March 2, 2026
**Author:** Inksight Team

---

## 1. Introduction

This document describes the technical architecture, design decisions, and implementation details for Inksight. Each major technology choice is backed by an Architecture Decision Record (ADR) in the `docs/adr/` folder, documenting context, alternatives considered, and rationale.

**Related Documents:**
- [PRD](./PRD.md) — Feature requirements and acceptance criteria
- [ADR Index](#10-architecture-decision-records) — All technology decisions with rationale
- [UI Design Spec](./ui-design-spec.md) — Visual design, components, accessibility

---

## 2. Architecture Overview

Inksight follows a **modular monolith** architecture — a single deployable unit with clearly separated internal modules. This provides the organizational benefits of microservices (separation of concerns, independent testability) without the operational overhead (service discovery, inter-service communication, distributed transactions).

### 2.1 Why Modular Monolith

For a single-team product at this stage, a modular monolith is the right call:
- **Simplicity:** One process, one deploy, one database
- **Performance:** No network hops between services, no serialization overhead
- **Extractability:** NestJS modules are self-contained — any module can be extracted to a standalone service later by exposing its service layer via HTTP/gRPC

### 2.2 Request Flow

```
Client Request
     │
     ▼
┌─────────────────────┐
│   Global Middleware  │  Helmet, CORS, Request Logging
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│    Global Guards     │  ThrottlerGuard (rate limiting)
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│   Global Pipes       │  ValidationPipe (DTO validation)
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│    Controller        │  Route handling, parameter extraction
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│    Service Layer     │  Business logic, orchestration
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Repository / Cache  │  Data access, caching
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│    Database (PostgreSQL) │  Persistent storage
└─────────────────────┘
```

### 2.3 Key Design Principles

| Principle | How It's Applied |
|-----------|-----------------|
| **Single Responsibility** | Each NestJS module owns one domain (upload, chat, AI, history) |
| **Dependency Inversion** | Services depend on interfaces, not implementations. The AI service is consumed via an interface — mock or real OpenAI are interchangeable |
| **Fail Fast** | Input validation happens at the controller layer via DTOs and pipes. Invalid requests never reach the service layer |
| **Convention over Configuration** | NestJS decorators and conventions reduce boilerplate while keeping code explicit |

---

## 3. Backend Architecture

> **ADR:** [001 — Backend Framework: NestJS](./adr/001-backend-framework.md)

### 3.1 NestJS Module Graph

```
AppModule
├── ServeStaticModule        → Serves React build from client/dist/
├── ConfigModule             → Environment-based configuration
├── ThrottlerModule          → Global rate limiting
├── TypeOrmModule            → Database connection + entities
├── CacheModule              → In-memory caching layer
├── UploadModule             → Image upload + validation
│   ├── UploadController
│   ├── UploadService
│   └── ImageEntity
├── ChatModule               → Chat + streaming endpoints
│   ├── ChatController
│   ├── ChatService
│   └── ChatMessageEntity
├── AiModule                 → Mock AI service (OpenAI-compatible)
│   └── AiService
├── HistoryModule            → Conversation history management
│   └── HistoryService
├── HealthModule             → Health check endpoint
│   └── HealthController
└── ScheduleModule           → @nestjs/schedule for periodic tasks
    └── CleanupService       → @Cron() job for expired data removal
```

### 3.2 Dependency Injection Flow

```typescript
// The AI service is injected via interface token — swappable at module level
@Module({
  providers: [
    {
      provide: AI_SERVICE_TOKEN,
      useClass: MockAiService,     // Swap to: OpenAiService
    },
  ],
  exports: [AI_SERVICE_TOKEN],
})
export class AiModule {}

// ChatService depends on the interface, not the implementation
@Injectable()
export class ChatService {
  constructor(
    @Inject(AI_SERVICE_TOKEN) private readonly aiService: IAiService,
    private readonly historyService: HistoryService,
  ) {}
}
```

This is the key architectural decision for testability and future extensibility. When Inksight connects to a real AI provider, only the `AiModule` provider configuration changes — zero modifications to `ChatService`, `ChatController`, or any other consumer.

### 3.3 Global Configuration

```typescript
// main.ts bootstrap
async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Global prefix for API routes (UI routes are excluded)
  app.setGlobalPrefix('api');

  // Security headers
  app.use(helmet());

  // CORS — restrictive in production, permissive in development
  app.enableCors({
    origin: process.env.NODE_ENV === 'production'
      ? process.env.ALLOWED_ORIGIN
      : true,
  });

  // Global validation — all DTOs auto-validated
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,           // Strip unknown properties
    forbidNonWhitelisted: true, // Throw on unknown properties
    transform: true,            // Auto-transform types
  }));

  // Global error filter — consistent error response format
  app.useGlobalFilters(new HttpExceptionFilter());

  // Global logging interceptor — request/response logging
  app.useGlobalInterceptors(new LoggingInterceptor());

  // Trust first proxy (Docker/Nginx) for correct client IP in rate limiting
  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  // Graceful shutdown
  app.enableShutdownHooks();

  await app.listen(3000);
}
```

### 3.4 Environment Configuration Validation

All environment variables are validated at startup using Joi schemas via `@nestjs/config`. The application fails fast with a descriptive error if any required variable is missing or invalid — preventing silent misconfiguration in production.

```typescript
ConfigModule.forRoot({
  isGlobal: true,
  validationSchema: Joi.object({
    PORT: Joi.number().default(3000),
    NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
    DATABASE_URL: Joi.string().uri().required(),
    UPLOAD_DIR: Joi.string().default('uploads'),
    MAX_FILE_SIZE: Joi.number().default(16 * 1024 * 1024),
    RATE_LIMIT_TTL: Joi.number().default(60000),
    RATE_LIMIT_MAX: Joi.number().default(100),
  }),
  validationOptions: {
    abortEarly: true,  // Stop on first validation error
  },
})
```

---

## 4. API Design

### 4.1 REST Conventions

| Convention | Rule |
|-----------|------|
| Base path | `/api` prefix for all endpoints |
| Naming | Kebab-case URLs (`/chat-stream`, not `/chatStream`) |
| Methods | POST for actions (upload, chat), GET for retrieval (history, health) |
| Status codes | 201 for creation, 200 for success, 4xx for client errors, 5xx for server errors |
| Error format | Consistent `{ statusCode, error, code, message, timestamp, path, requestId }` shape everywhere |

### 4.2 Consistent Error Response Format

Every error across the application returns this shape:

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "code": "INVALID_FILE_TYPE",
  "message": "File type 'bmp' is not supported. Allowed types: png, jpg, jpeg, gif",
  "timestamp": "2026-03-02T10:30:00.000Z",
  "path": "/api/upload",
  "requestId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
}
```

The `code` field provides a machine-readable error identifier for client-side error handling (e.g., showing localized messages or triggering specific UI behavior). The `requestId` field matches the `X-Request-Id` response header for cross-referencing with server logs.

**Standard error codes:**

| Code | HTTP Status | Meaning |
|------|------------|---------|
| `INVALID_FILE_TYPE` | 415 | Unsupported file extension or MIME type |
| `FILE_TOO_LARGE` | 413 | File exceeds 16MB limit |
| `FILE_CONTENT_MISMATCH` | 400 | Magic bytes don't match declared type |
| `MISSING_FILE` | 400 | No file attached to upload request |
| `IMAGE_NOT_FOUND` | 404 | Image ID doesn't exist |
| `INVALID_UUID` | 400 | Malformed UUID parameter |
| `INVALID_MESSAGE` | 400 | Message validation failed (empty, too long, wrong type) |
| `RATE_LIMITED` | 429 | Rate limit exceeded |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

This is enforced by the global `HttpExceptionFilter`:

```typescript
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status = exception instanceof HttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    const message = exception instanceof HttpException
      ? exception.message
      : 'Internal server error';

    // Extract error code from exception metadata if available
    const exceptionResponse = exception instanceof HttpException
      ? exception.getResponse()
      : null;
    const code = typeof exceptionResponse === 'object' && exceptionResponse !== null
      ? (exceptionResponse as any).code || 'INTERNAL_ERROR'
      : 'INTERNAL_ERROR';

    // Use correlation ID from request (set by LoggingInterceptor)
    const requestId = request.headers['x-request-id'] || request['correlationId'];

    // Never leak stack traces or internal details
    response.status(status).json({
      statusCode: status,
      error: HttpStatus[status],
      code,
      message,
      timestamp: new Date().toISOString(),
      path: request.url,
      requestId,
    });
  }
}
```

### 4.3 Input Validation via DTOs

All request bodies are validated using `class-validator` decorators. Invalid requests are rejected before reaching the service layer.

```typescript
export class ChatRequestDto {
  @IsString({ message: 'Message must be a string' })
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsNotEmpty({ message: 'Message cannot be empty' })
  @MinLength(1, { message: 'Message cannot be blank' })
  @MaxLength(2000, { message: 'Message cannot exceed 2000 characters' })
  message: string;
}

export class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Page must be an integer' })
  @Min(1, { message: 'Page must be at least 1' })
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Limit must be an integer' })
  @Min(1, { message: 'Limit must be at least 1' })
  @Max(50, { message: 'Limit cannot exceed 50' })
  limit?: number = 20;
}
```

The `@Transform` decorator trims whitespace before any validation runs. A message of `"   "` becomes `""` and fails the `@IsNotEmpty()` check — preventing whitespace-only submissions.

The global `ValidationPipe` automatically validates incoming requests against these DTOs and returns structured error messages.

---

## 5. Mock AI Service Design

> **ADR:** [005 — AI Service Abstraction](./adr/005-ai-service-abstraction.md)

### 5.1 Interface Contract

The AI service is consumed via an interface. This is the single most important design decision for future extensibility:

```typescript
export interface IAiService {
  analyzeImage(imagePath: string): Promise<OpenAiChatCompletion>;

  chat(
    prompt: string,
    imageId: string,
    history: ConversationMessage[],
  ): Promise<OpenAiChatCompletion>;

  chatStream(
    prompt: string,
    imageId: string,
    history: ConversationMessage[],
  ): AsyncGenerator<OpenAiStreamChunk>;
}
```

### 5.2 OpenAI Response Format (Non-Streaming)

The mock precisely replicates the [OpenAI Chat Completions API](https://platform.openai.com/docs/api-reference/chat/object) response format. All required fields match the upstream spec; optional fields not relevant to the mock (`system_fingerprint`, `logprobs`) are omitted:

```typescript
export interface OpenAiChatCompletion {
  id: string;                    // "chatcmpl-" + 29 random alphanumeric chars
  object: 'chat.completion';
  created: number;               // Unix timestamp (seconds)
  model: string;                 // "gpt-5.2"
  choices: Array<{
    index: number;
    message: {
      role: 'assistant';
      content: string;
    };
    finish_reason: 'stop' | 'length';
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}
```

### 5.3 OpenAI Streaming Format

Streaming follows the [OpenAI SSE streaming protocol](https://platform.openai.com/docs/api-reference/chat/streaming) exactly. Each chunk uses `chat.completion.chunk` as the object type, and the final event is followed by a `data: [DONE]` sentinel:

```typescript
export interface OpenAiStreamChunk {
  id: string;                    // Same ID for all chunks in one response
  object: 'chat.completion.chunk';
  created: number;               // Same timestamp for all chunks
  model: string;
  choices: Array<{
    index: number;
    delta: {
      role?: 'assistant';        // Present only in first chunk
      content?: string;          // Present in content chunks
    };
    finish_reason: null | 'stop'; // null until final chunk
  }>;
}
```

**Event sequence:**

```
1. First chunk:     delta: { role: "assistant", content: "" }     finish_reason: null
2. Content chunks:  delta: { content: "word" }                    finish_reason: null
   (repeated for each word, ~50ms apart)
3. Final chunk:     delta: {}                                     finish_reason: "stop"
4. Sentinel:        data: [DONE]
```

### 5.4 Mock Response Generation

The mock service generates contextually appropriate responses:

```typescript
@Injectable()
export class MockAiService implements IAiService {
  private readonly visionResponses = [
    'This image contains a scenic landscape with mountains in the background...',
    'I can see a detailed photograph showing several people in what appears to be...',
    'The image displays a complex diagram or chart that illustrates...',
  ];

  private readonly chatResponses: Record<string, string[]> = {
    default: [
      'Based on what I can see in the image, ...',
      'Looking at this more closely, I notice ...',
    ],
    followUp: [
      'Building on our earlier discussion about this image, ...',
      'To add to what I mentioned before, ...',
    ],
  };

  // Selects response based on conversation length (context-aware)
  private selectResponse(history: ConversationMessage[]): string {
    if (history.length > 2) {
      return this.chatResponses.followUp[/* hash-based selection */];
    }
    return this.chatResponses.default[/* hash-based selection */];
  }
}
```

### 5.5 Token Estimation

The mock calculates approximate token counts to make the usage field realistic:

```typescript
private estimateTokens(text: string): number {
  // OpenAI approximation: ~4 characters per token for English text
  return Math.ceil(text.length / 4);
}
```

---

## 6. SSE Streaming Design

> **ADR:** [006 — SSE Streaming Approach](./adr/006-sse-streaming.md)

### 6.1 Why Manual SSE (Not @Sse Decorator)

The product requirement specifies `POST /chat-stream/:imageId`. NestJS's `@Sse()` decorator is designed for GET endpoints. For POST with full control over the streaming lifecycle, we use manual response writing.

### 6.2 Streaming Controller Implementation

```typescript
@Post('chat-stream/:imageId')
async chatStream(
  @Param('imageId', ParseUUIDPipe) imageId: string,
  @Body() dto: ChatRequestDto,
  @Req() req: Request,
  @Res() res: Response,
) {
  // Validate image exists
  const image = await this.chatService.findImage(imageId);
  if (!image) throw new NotFoundException(`Image '${imageId}' not found`);

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
  res.flushHeaders();

  // Track client connection
  let isClientConnected = true;
  req.on('close', () => { isClientConnected = false; });

  try {
    // Persist user message BEFORE streaming (same as non-streaming path)
    // This ensures the user message is saved even if the stream fails mid-way
    await this.historyService.addMessage(imageId, 'user', dto.message);

    const history = await this.historyService.getHistory(imageId);
    const stream = this.aiService.chatStream(dto.message, imageId, history);
    let fullContent = '';

    for await (const chunk of stream) {
      if (!isClientConnected) break;

      // Accumulate content for history
      if (chunk.choices[0]?.delta?.content) {
        fullContent += chunk.choices[0].delta.content;
      }

      // Write SSE event
      res.write(`data: ${JSON.stringify(chunk)}\n\n`);
    }

    // Send [DONE] sentinel
    if (isClientConnected) {
      res.write('data: [DONE]\n\n');
    }

    // Persist assistant response after stream completes
    // User message was already saved above — only the assistant response depends on stream success
    if (fullContent) {
      await this.historyService.addMessage(imageId, 'assistant', fullContent);
    }
  } catch (error) {
    if (isClientConnected) {
      res.write(`data: ${JSON.stringify({ error: 'Stream failed' })}\n\n`);
    }
  } finally {
    res.end();
  }
}
```

### 6.3 Backpressure Handling

Node.js streams handle backpressure via the writable stream's `drain` event. If the client reads slowly:

```typescript
const writeChunk = (res: Response, data: string): Promise<void> => {
  return new Promise((resolve) => {
    const canContinue = res.write(data);
    if (!canContinue) {
      res.once('drain', resolve);
    } else {
      resolve();
    }
  });
};
```

### 6.4 Connection Timeout

Idle streams are terminated after 30 seconds to prevent resource leaks:

```typescript
const timeout = setTimeout(() => {
  if (isClientConnected) {
    res.write('data: [DONE]\n\n');
    res.end();
  }
}, 30_000);

// Clear timeout when stream completes naturally
clearTimeout(timeout);
```

### 6.5 Reconnection Strategy

SSE's built-in `Last-Event-ID` header enables resumable streams when using the browser's `EventSource` API. However, since Inksight uses `POST` with `fetch` + `ReadableStream` (not `EventSource`), resume-from-ID is not applicable — `EventSource` only supports `GET`.

Instead, reconnection is handled client-side with exponential backoff retry (see Section 11.3). On stream failure, the client re-sends the full request. This is the correct approach because:
- Mock AI responses are non-deterministic — there's no "resume from token N" capability
- The full re-request ensures the response is complete and consistent
- Retry with backoff handles transient network issues gracefully

---

## 7. Database Design

> **ADR:** [002 — Database: PostgreSQL + TypeORM](./adr/002-database.md)

### 7.1 Entity Definitions

```typescript
@Entity('images')
export class ImageEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 255 })
  originalFilename: string;

  @Column({ length: 255, unique: true })
  storedFilename: string;

  @Column({ length: 50 })
  mimeType: string;

  @Column('integer')
  size: number;

  @Column({ length: 500 })
  uploadPath: string;

  @Column('text', { nullable: true })
  initialAnalysis: string;           // JSON string

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @VersionColumn()
  version: number;  // Optimistic locking — prevents concurrent overwrites

  @OneToMany(() => ChatMessageEntity, (msg) => msg.image, { cascade: true })
  messages: ChatMessageEntity[];
}

@Entity('chat_messages')
export class ChatMessageEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  imageId: string;

  @Column({ type: 'varchar', length: 20 })
  role: 'user' | 'assistant';

  @Column('text')
  content: string;

  @Column('integer', { nullable: true })
  tokenCount: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => ImageEntity, (img) => img.messages, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'imageId' })
  image: ImageEntity;
}
```

### 7.2 Indexes

```typescript
@Index('idx_chat_messages_image_id', ['imageId'])
@Index('idx_chat_messages_created_at', ['createdAt'])
@Entity('chat_messages')
export class ChatMessageEntity { ... }
```

- `imageId` index: Fast lookup of all messages for a conversation
- `createdAt` index: Efficient ordering and cleanup of old messages

### 7.3 TypeORM Configuration

```typescript
TypeOrmModule.forRoot({
  type: 'postgres',
  url: process.env.DATABASE_URL || 'postgres://inksight:inksight_dev@localhost:5432/inksight',
  entities: [ImageEntity, ChatMessageEntity],
  synchronize: false,           // Never in production — use migrations
  migrations: ['dist/database/migrations/*.js'],
  migrationsRun: true,          // Auto-run pending migrations on startup
  retryAttempts: 10,            // Retry DB connection on startup (e.g., Docker Compose race)
  retryDelay: 3000,             // 3 seconds between retries
  extra: {
    max: 20,                    // Connection pool size
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  },
})
```

**Key decisions:**
- `synchronize: false` — Forces use of migrations (production discipline)
- `migrationsRun: true` — No manual migration step needed; pending migrations run on startup
- `retryAttempts: 10` — Handles Docker Compose startup race (app starts before PostgreSQL is ready)
- `@VersionColumn()` on ImageEntity — Optimistic locking prevents silent concurrent overwrites (chat messages are append-only, no locking needed)

### 7.4 Migration Strategy

```bash
# Generate migration from entity changes
npx typeorm migration:generate -d src/database/data-source.ts src/database/migrations/InitialSchema

# Migration file structure
src/database/migrations/
├── 1709337600000-InitialSchema.ts    # images + chat_messages tables
└── (future migrations as needed)
```

Each migration is idempotent — running it multiple times is safe. The migration files are committed to version control, ensuring reproducible schema state.

### 7.5 Connection Lifecycle

```typescript
// Graceful shutdown — close DB connection on SIGTERM/SIGINT
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      useFactory: () => ({
        type: 'postgres',
        url: process.env.DATABASE_URL,
        // ... config
      }),
    }),
  ],
})
export class DatabaseModule implements OnModuleDestroy {
  constructor(private dataSource: DataSource) {}

  async onModuleDestroy() {
    if (this.dataSource.isInitialized) {
      await this.dataSource.destroy();
    }
  }
}
```

### 7.6 Retry Utility for Transient Failures

For database operations that can fail transiently (connection reset, temporary lock timeout), a simple retry utility wraps critical operations:

```typescript
async function withRetry<T>(
  operation: () => Promise<T>,
  options: { attempts?: number; delayMs?: number; backoff?: number } = {},
): Promise<T> {
  const { attempts = 3, delayMs = 500, backoff = 2 } = options;
  let lastError: Error;

  for (let i = 0; i < attempts; i++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      if (i < attempts - 1) {
        await new Promise(res => setTimeout(res, delayMs * Math.pow(backoff, i)));
      }
    }
  }

  throw lastError!;
}
```

Used in services for critical DB writes:
```typescript
await withRetry(() => this.msgRepo.save({ imageId, role, content }));
```

This handles transient PostgreSQL errors (connection pool exhaustion, brief network blips) without failing the entire request.

### 7.7 Image Deletion

```typescript
@Delete('images/:imageId')
async deleteImage(
  @Param('imageId', ParseUUIDPipe) imageId: string,
) {
  const image = await this.uploadService.findImage(imageId);
  if (!image) throw new NotFoundException(`Image '${imageId}' not found`);

  // Remove file from disk
  await fs.unlink(image.uploadPath).catch(() => {}); // Ignore if already gone

  // Cascade delete (removes all chat_messages via FK)
  await this.uploadService.deleteImage(imageId);

  // Invalidate all caches for this image
  await this.cacheManager.del(`image:${imageId}`);
  await this.cacheManager.del(`history:${imageId}`);
  await this.cacheManager.del(`recent:${imageId}`);

  return; // 204 No Content
}
```

### 7.8 Image File Serving

Images stored on disk need a serving endpoint so the frontend can display thumbnails and previews. A dedicated controller endpoint provides proper headers, 404 handling, and UUID-based lookup:

```typescript
@Get('images/:imageId/file')
async serveImage(
  @Param('imageId', ParseUUIDPipe) imageId: string,
  @Res() res: Response,
) {
  const image = await this.uploadService.findImage(imageId);
  if (!image) throw new NotFoundException(`Image '${imageId}' not found`);

  res.setHeader('Content-Type', image.mimeType);
  res.setHeader('Content-Disposition', `inline; filename="${image.originalFilename}"`);
  res.setHeader('Cache-Control', 'public, max-age=3600'); // 1 hour browser cache

  const fileStream = createReadStream(image.uploadPath);
  fileStream.on('error', () => {
    if (!res.headersSent) {
      throw new NotFoundException('Image file not found on disk');
    }
  });
  fileStream.pipe(res);
}
```

This approach is preferred over `ServeStaticModule` for the `uploads/` directory because:
- **Access control:** Every request validates the image exists in the database
- **Proper headers:** Content-Type is set from the DB record, not guessed from extension
- **404 handling:** Missing files return a structured JSON error, not a generic static file 404
- **Decoupled from disk layout:** The URL uses the image UUID, not the filename on disk

---

## 8. Caching Architecture

> **ADR:** [007 — Caching Strategy](./adr/007-caching-strategy.md)

### 8.1 Cache Layer Design

```
Request → Controller → Service → Cache Check
                                    │
                         ┌──────────┴──────────┐
                         │                      │
                    Cache Hit              Cache Miss
                         │                      │
                    Return cached           Query DB
                         │                      │
                         │               Store in cache
                         │                      │
                         └──────────┬───────────┘
                                    │
                              Return to client
```

### 8.2 Implementation

Using NestJS's built-in `CacheModule` with in-memory store:

```typescript
@Module({
  imports: [
    CacheModule.register({
      ttl: 300_000, // Default: 5 minutes (ms)
      max: 100,     // Max items in cache
    }),
  ],
})
export class AppModule {}
```

### 8.3 Cache Keys and TTLs

| Data | Cache Key Pattern | TTL | Invalidation Trigger |
|------|-------------------|-----|---------------------|
| Image metadata | `image:{imageId}` | 10 min | Image delete |
| Chat history | `history:{imageId}` | 5 min | New message added |
| Recent messages (last 50, default cap) | `recent:{imageId}` | 5 min | New message added |

### 8.4 Write-Through Invalidation

On every write operation, the relevant cache keys are invalidated:

```typescript
@Injectable()
export class HistoryService {
  constructor(
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    @InjectRepository(ChatMessageEntity) private msgRepo: Repository<ChatMessageEntity>,
  ) {}

  async addMessage(imageId: string, role: MessageRole, content: string, tokenCount?: number) {
    const entity = this.msgRepo.create({ imageId, role, content, tokenCount });
    // Retry once on transient DB failure
    const saved = await withRetry(() => this.msgRepo.save(entity), { attempts: 2, delayMs: 200 });
    // Invalidate both history and recent caches via single method
    await this.invalidateCache(imageId);
    return saved;
    // Note: enforceHistoryCap() is called by ChatService after the full
    // request (user + assistant) — not inline here.
  }

  async getHistory(imageId: string, page = 1, limit = DEFAULT_PAGE_SIZE) {
    // Flat cache key — only caches page 1 with default limit (see ADR-007)
    const useCache = page === 1 && limit === DEFAULT_PAGE_SIZE;
    const cacheKey = CACHE_KEYS.history(imageId);

    if (useCache) {
      const cached = await this.cacheManager.get(cacheKey);
      if (cached) return cached;
    }

    const [messages, total] = await this.msgRepo.findAndCount({
      where: { imageId },
      order: { createdAt: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    const result = { messages, total };

    if (useCache) await this.cacheManager.set(cacheKey, result);
    return result;
  }

  async invalidateCache(imageId: string) {
    // Uses Promise.allSettled so both deletes are always attempted
    await Promise.allSettled([
      this.cacheManager.del(CACHE_KEYS.history(imageId)),
      this.cacheManager.del(CACHE_KEYS.recent(imageId)),
    ]);
  }
}
```

### 8.5 Scalability Path

The current in-memory cache is sufficient for a single-process deployment. For horizontal scaling:
- Swap to Redis via `@nestjs/cache-manager` + `cache-manager-redis-store`
- Configuration change only — no code changes in services
- This is documented in `adr/007-caching-strategy.md`

### 8.6 Scheduled Data Cleanup

Using `@nestjs/schedule` for periodic removal of expired data:

```typescript
@Injectable()
export class CleanupService {
  private readonly logger = new Logger(CleanupService.name);

  constructor(
    @InjectRepository(ImageEntity) private imageRepo: Repository<ImageEntity>,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async cleanupExpiredData() {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago

    const expiredImages = await this.imageRepo.find({
      where: { createdAt: LessThan(cutoff) },
      select: ['id', 'uploadPath'],
    });

    let cleaned = 0;
    for (const image of expiredImages) {
      // Guard: skip images with recent chat activity (active session protection)
      const recentMessage = await this.msgRepo.findOne({
        where: { imageId: image.id, createdAt: MoreThan(cutoff) },
      });
      if (recentMessage) {
        this.logger.log(`Skipping image ${image.id} — has recent chat activity`);
        continue;
      }

      await fs.unlink(image.uploadPath).catch(() => {});
      await this.imageRepo.remove(image); // Cascade deletes messages
      await this.cacheManager.del(`image:${image.id}`);
      await this.cacheManager.del(`history:${image.id}`);
      cleaned++;
    }

    if (cleaned > 0) {
      this.logger.log(`Cleaned up ${cleaned} expired images (${expiredImages.length - cleaned} skipped — active sessions)`);
    }
  }
}
```

---

## 9. Security Architecture

### 9.1 Defense Layers

```
Layer 1: Network        → Helmet security headers, CORS
Layer 2: Rate Limiting  → @nestjs/throttler per-route limits
Layer 3: Input          → ValidationPipe + class-validator DTOs
Layer 4: File Upload    → Magic byte verification, filename sanitization
Layer 5: Database       → TypeORM parameterized queries (no raw SQL)
Layer 6: Output         → No stack traces in production, consistent error format
```

### 9.2 Rate Limiting Configuration

> **ADR:** [008 — Rate Limiting](./adr/008-rate-limiting.md)

```typescript
@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        name: 'short',
        ttl: 1000,     // 1 second window
        limit: 3,      // 3 requests per second
      },
      {
        name: 'medium',
        ttl: 60000,    // 1 minute window
        limit: 100,    // 100 requests per minute
      },
    ]),
  ],
})
export class AppModule {}

// Per-route overrides
@Controller('api')
export class UploadController {
  @Post('upload')
  @Throttle({ medium: { ttl: 60000, limit: 10 } })  // Stricter: 10 uploads/min
  async upload() { ... }
}
```

### 9.3 Threat Model

| Attack Surface | Threat | Mitigation | Residual Risk |
|---------------|--------|------------|---------------|
| `POST /api/upload` | **Disk fill** — 16MB × 10 req/min = 160MB/min | Rate limit (10 uploads/min per IP), 24-hour TTL cleanup via `@Cron()` | Sustained attack from multiple IPs could fill disk before cleanup runs; production would add disk usage alerts |
| Upload filename | **Path traversal** — `../../etc/passwd` in filename | `basename()` strips directory components; regex replaces non-alphanumeric chars; files stored as `{uuid}.{ext}` (decoupled from user input) | None — UUID storage eliminates filename-based attacks entirely |
| Upload content | **Malicious file masquerading as image** — `.jpg` extension with executable payload | Magic byte verification ensures file header matches declared MIME type; no server-side image processing or execution | Content beyond the magic bytes is not inspected; acceptable because files are served with explicit `Content-Type` from DB, never executed |
| Rate limiting | **Bypass behind proxy** — all requests appear from proxy IP | `trust proxy` configured to read `X-Forwarded-For` from first proxy hop | Spoofed `X-Forwarded-For` headers; mitigated by trusting only the first hop (`trust proxy: 1`) |
| `POST /api/chat-stream` | **SSE connection exhaustion** — attacker opens many long-lived connections | 30-second idle timeout, `req.on('close')` cleanup, rate limit (30 chat req/min per IP) | Slow-drain attacks holding connections just under timeout; production would add max concurrent connections per IP |
| Chat input | **Prompt injection via message content** | AI layer is mocked — no real LLM to manipulate; production integration would add input sanitization and output filtering | Not applicable while mock is in use |

### 9.4 File Upload Security

```typescript
@Injectable()
export class FileValidationPipe implements PipeTransform {
  private readonly MAGIC_BYTES: Record<string, Buffer> = {
    'image/png':  Buffer.from([0x89, 0x50, 0x4E, 0x47]),
    'image/jpeg': Buffer.from([0xFF, 0xD8, 0xFF]),
    'image/gif':  Buffer.from([0x47, 0x49, 0x46]),
  };

  transform(file: Express.Multer.File): Express.Multer.File {
    // 1. Check file exists
    if (!file) throw new BadRequestException('No file provided');

    // 2. Check extension
    const ext = extname(file.originalname).toLowerCase();
    if (!['.png', '.jpg', '.jpeg', '.gif'].includes(ext)) {
      throw new UnsupportedMediaTypeException(`File type '${ext}' not supported`);
    }

    // 3. Verify magic bytes match declared type
    const expectedMagic = this.MAGIC_BYTES[file.mimetype];
    if (expectedMagic && !file.buffer.subarray(0, expectedMagic.length).equals(expectedMagic)) {
      throw new BadRequestException('File content does not match declared type');
    }

    // 4. Sanitize original filename for display purposes
    const sanitized = basename(file.originalname).replace(/[^a-zA-Z0-9._-]/g, '_');
    file.originalname = sanitized;

    // Note: Files are stored on disk as `uploads/{uuid}.{ext}`, NOT using the
    // original filename. The UUID is the image's primary key; the original
    // filename is preserved in the DB for display only. This eliminates all
    // filename collision and path traversal risks.

    return file;
  }
}
```

> **Note on `memoryStorage`:** Multer uses `memoryStorage()` so `file.buffer` is available for magic byte verification. At the 16MB file size limit × 10 concurrent uploads (rate limit), peak memory is ~160MB — acceptable for expected load. For higher concurrency, switch to `diskStorage()` with post-write magic byte verification via `fs.createReadStream()` reading only the first 4 bytes.

---

## 10. Logging & Observability

### 10.1 Structured Logging

Every request is logged with a correlation ID for traceability:

```typescript
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    const requestId = request.headers['x-request-id'] || uuid();
    const { method, url } = request;

    // Attach to request for downstream use (error filter, services)
    request['correlationId'] = requestId;

    // Return X-Request-Id in response for client-side log correlation
    response.setHeader('X-Request-Id', requestId);

    const start = Date.now();

    return next.handle().pipe(
      tap(() => {
        const duration = Date.now() - start;
        this.logger.log(
          `[${requestId}] ${method} ${url} — ${response.statusCode} — ${duration}ms`,
        );
      }),
      catchError((error) => {
        const duration = Date.now() - start;
        this.logger.error(
          `[${requestId}] ${method} ${url} — ${duration}ms — ${error.message}`,
        );
        throw error;
      }),
    );
  }
}
```

### 10.2 Health Check

```typescript
@Controller('health')
export class HealthController {
  constructor(private dataSource: DataSource) {}

  @Get()
  async check() {
    // Active probe — detects degraded connectivity, not just initialization state
    const dbHealthy = await this.dataSource
      .query('SELECT 1')
      .then(() => true)
      .catch(() => false);

    return {
      status: dbHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      checks: {
        database: dbHealthy ? 'connected' : 'disconnected',
        uptime: process.uptime(),
      },
    };
  }
}
```

### 10.3 Request Monitoring

The `LoggingInterceptor` outputs structured data suitable for aggregation by external monitoring tools (Datadog, CloudWatch, ELK stack). Each log entry includes:

| Field | Purpose |
|-------|---------|
| `correlationId` | Trace a request across log entries |
| `method` + `url` | Identify endpoint |
| `duration` | Response time in ms |
| `statusCode` | Success/failure tracking |
| `error.message` | Error categorization |

For production, these structured logs enable:
- **Error rate monitoring** — count 4xx/5xx per endpoint per time window
- **Latency tracking** — P50/P95/P99 response times per endpoint
- **Throughput monitoring** — requests per second
- **Alerting** — trigger on error rate spikes or latency degradation

No external monitoring dependency is required — the structured log output is the monitoring interface. Any log aggregator can parse and visualize it.

---

## 11. Frontend Architecture

> **ADR:** [003 — Frontend: React + Vite](./adr/003-frontend-framework.md)
> **ADR:** [004 — Styling: Tailwind + shadcn/ui](./adr/004-styling.md)

### 11.1 Component Tree

```
App
├── Layout
│   ├── Sidebar
│   │   ├── ImageGallery          # List of uploaded images
│   │   └── ImageThumbnail        # Individual image card
│   └── MainContent
│       ├── UploadView            # Drag-and-drop + initial analysis
│       │   ├── DropZone
│       │   ├── UploadProgress
│       │   └── AnalysisResult
│       └── ChatView              # Conversation interface
│           ├── ImagePreview      # Expandable uploaded image
│           ├── MessageList       # Scrollable message area
│           │   ├── UserMessage
│           │   └── AssistantMessage (supports streaming)
│           ├── SuggestedQuestions # Empty state prompts
│           └── ChatInput         # Text input + send button
├── ErrorBoundary
└── Toaster                       # Global toast notifications
```

### 11.2 State Management

No external state library — React's built-in hooks are sufficient for this scope:

| State | Location | Why |
|-------|----------|-----|
| Current image ID | `useState` in `App` | Lifted to parent, passed down |
| Image list | `useState` + `useEffect` fetch | Refetched on upload |
| Chat messages | `useState` in `ChatView` | Local to chat, refetched on image switch |
| Streaming state | `useRef` for accumulator | Avoids re-renders per token |
| Upload progress | `useState` in `UploadView` | Local to upload flow |

### 11.3 SSE Client Implementation

```typescript
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY = 1000; // 1 second, doubles each retry

const useStreamingChat = (imageId: string) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const accumulatorRef = useRef('');

  const streamResponse = async (message: string, attempt = 0): Promise<void> => {
    const response = await fetch(`/api/chat-stream/${imageId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    });

    if (!response.ok) {
      throw new Error(`Stream failed: ${response.status}`);
    }

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const text = decoder.decode(value);
      const lines = text.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') return; // Stream completed successfully

          const chunk = JSON.parse(data);
          const content = chunk.choices[0]?.delta?.content;
          if (content) {
            accumulatorRef.current += content;
            setMessages(prev => {
              const updated = [...prev];
              updated[updated.length - 1] = {
                role: 'assistant',
                content: accumulatorRef.current,
              };
              return updated;
            });
          }
        }
      }
    }
  };

  const sendMessage = async (content: string) => {
    setMessages(prev => [...prev, { role: 'user', content }]);
    setIsStreaming(true);
    accumulatorRef.current = '';
    setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        await streamResponse(content, attempt);
        setRetryCount(0);
        break; // Success — exit retry loop
      } catch (error) {
        if (attempt < MAX_RETRIES) {
          setRetryCount(attempt + 1);
          const delay = RETRY_BASE_DELAY * Math.pow(2, attempt);
          await new Promise(res => setTimeout(res, delay));
          // Reset accumulator — retry gets full response
          accumulatorRef.current = '';
        } else {
          // All retries exhausted — show error
          setMessages(prev => {
            const updated = [...prev];
            updated[updated.length - 1] = {
              role: 'assistant',
              content: 'Sorry, the response failed. Please try again.',
              error: true,
            };
            return updated;
          });
          setRetryCount(0);
        }
      }
    }

    setIsStreaming(false);
  };

  return { messages, isStreaming, retryCount, sendMessage };
};
```

Key features:
- **Exponential backoff retry** (1s → 2s → 4s) on stream failure
- **`retryCount` state** for UI to display "Retrying..." indicator
- **Accumulator reset** on retry — the server re-sends the full response
- **Graceful failure** after max retries — error message shown to user

### 11.4 Build Integration

```json
// package.json scripts
{
  "scripts": {
    "build:client": "cd client && npm run build",
    "build:server": "nest build",
    "build": "npm run build:client && npm run build:server",
    "start": "npm run build && node dist/main.js",
    "start:dev": "nest start --watch",
    "start:dev:client": "cd client && npm run dev"
  }
}
```

**Production (`npm start`):** Builds React → `client/dist/`, builds NestJS → `dist/`, serves both from one process.

**Development:** Run NestJS with `--watch` and Vite dev server separately for HMR. Vite proxies API calls to NestJS.

```typescript
// client/vite.config.ts
export default defineConfig({
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
  build: {
    outDir: 'dist',
  },
});
```

---

## 12. Testing Architecture

> **ADR:** [009 — Testing: Jest + Supertest](./adr/009-testing.md)

### 12.1 Test Structure

```
test/
├── unit/
│   ├── ai.service.spec.ts          # Mock AI response format validation
│   ├── upload.service.spec.ts       # File validation, metadata handling
│   ├── chat.service.spec.ts         # Chat orchestration logic
│   ├── history.service.spec.ts      # History CRUD, limits, cleanup
│   ├── file-validation.pipe.spec.ts # Magic byte checking
│   └── http-exception.filter.spec.ts
├── integration/
│   ├── upload.controller.spec.ts    # Full upload request lifecycle
│   ├── chat.controller.spec.ts      # Full chat request lifecycle
│   └── stream.controller.spec.ts    # SSE streaming lifecycle
├── e2e/
│   └── app.e2e-spec.ts             # Full application flow
└── fixtures/
    ├── test-image.png               # Valid PNG for upload tests
    ├── test-image.jpg               # Valid JPEG for upload tests
    ├── fake-image.txt               # Wrong extension for rejection tests
    └── corrupted.png                # Valid extension, wrong content
```

### 12.2 Testing the Mock AI Service

The mock AI service has the highest coverage requirement (100%) because the response format IS the feature:

```typescript
describe('MockAiService', () => {
  describe('analyzeImage', () => {
    it('should return valid OpenAI Chat Completion format', async () => {
      const result = await service.analyzeImage('/path/to/image.png');

      // Structural validation
      expect(result.id).toMatch(/^chatcmpl-[a-zA-Z0-9]{29}$/);
      expect(result.object).toBe('chat.completion');
      expect(result.created).toBeCloseTo(Math.floor(Date.now() / 1000), -1);
      expect(result.model).toBe('gpt-5.2');

      // Choices validation
      expect(result.choices).toHaveLength(1);
      expect(result.choices[0].index).toBe(0);
      expect(result.choices[0].message.role).toBe('assistant');
      expect(result.choices[0].message.content).toBeTruthy();
      expect(result.choices[0].finish_reason).toBe('stop');

      // Usage validation
      expect(result.usage.prompt_tokens).toBeGreaterThan(0);
      expect(result.usage.completion_tokens).toBeGreaterThan(0);
      expect(result.usage.total_tokens).toBe(
        result.usage.prompt_tokens + result.usage.completion_tokens
      );
    });
  });

  describe('chatStream', () => {
    it('should yield chunks in correct OpenAI streaming format', async () => {
      const chunks: OpenAiStreamChunk[] = [];
      for await (const chunk of service.chatStream('test', 'img-1', [])) {
        chunks.push(chunk);
      }

      // All chunks share same ID
      const ids = new Set(chunks.map(c => c.id));
      expect(ids.size).toBe(1);

      // First chunk has role
      expect(chunks[0].choices[0].delta.role).toBe('assistant');

      // Middle chunks have content
      const contentChunks = chunks.slice(1, -1);
      contentChunks.forEach(c => {
        expect(c.choices[0].delta.content).toBeTruthy();
      });

      // Last chunk has finish_reason
      const lastChunk = chunks[chunks.length - 1];
      expect(lastChunk.choices[0].finish_reason).toBe('stop');
    });
  });
});
```

### 12.3 Mocking Strategy

Every layer is testable in isolation through deep mocking of dependencies:

| Layer | What's Mocked | How |
|-------|---------------|-----|
| **Service unit tests** | TypeORM repositories | `jest.fn()` on `find`, `save`, `remove`, `findAndCount` |
| **Controller integration tests** | AI service | DI token override: `{ provide: AI_SERVICE_TOKEN, useValue: mockAiService }` |
| **Cache tests** | Cache manager | `{ provide: CACHE_MANAGER, useValue: { get: jest.fn(), set: jest.fn(), del: jest.fn() } }` |
| **Upload tests** | File system | `jest.spyOn(fs, 'writeFile')` and `jest.spyOn(fs, 'unlink')` |
| **Retry tests** | DB operations | `jest.fn().mockRejectedValueOnce().mockResolvedValue()` |
| **Locking tests** | Concurrent saves | Two `save()` calls with stale version number |

```typescript
// Example: Service unit test with mocked repository
const module = await Test.createTestingModule({
  providers: [
    HistoryService,
    {
      provide: getRepositoryToken(ChatMessageEntity),
      useValue: {
        find: jest.fn().mockResolvedValue([]),
        findAndCount: jest.fn().mockResolvedValue([[], 0]),
        save: jest.fn().mockResolvedValue({ id: 'msg-1' }),
        remove: jest.fn(),
      },
    },
    {
      provide: CACHE_MANAGER,
      useValue: { get: jest.fn(), set: jest.fn(), del: jest.fn() },
    },
  ],
}).compile();
```

This approach ensures:
- **Zero external dependencies** in unit tests (no DB, no cache, no file system)
- **Controlled failure injection** — mock a repository to throw `QueryFailedError` to test retry logic
- **DI token swapping** — the same `AI_SERVICE_TOKEN` pattern used in production enables test isolation

### 12.4 E2E Test Flow

```typescript
describe('Inksight E2E', () => {
  it('should complete full upload → chat → stream → history flow', async () => {
    // 1. Upload an image
    const upload = await request(app.getHttpServer())
      .post('/api/upload')
      .attach('image', 'test/fixtures/test-image.png')
      .expect(201);

    const imageId = upload.body.id;
    expect(upload.body.analysis.object).toBe('chat.completion');

    // 2. Chat about the image
    const chat = await request(app.getHttpServer())
      .post(`/api/chat/${imageId}`)
      .send({ message: 'What is in this image?' })
      .expect(200);

    expect(chat.body.object).toBe('chat.completion');

    // 3. Stream a follow-up
    const stream = await request(app.getHttpServer())
      .post(`/api/chat-stream/${imageId}`)
      .send({ message: 'Tell me more about the colors' })
      .expect(200);

    expect(stream.headers['content-type']).toContain('text/event-stream');

    // 4. Check history has all messages
    const history = await request(app.getHttpServer())
      .get(`/api/chat/${imageId}/history`)
      .expect(200);

    expect(history.body.messages).toHaveLength(4); // 2 user + 2 assistant
  });
});
```

---

## 13. Build & Deployment

### 13.1 Single Command Experience

The developer experience:

```bash
git clone <repo>
npm install
npm start
# → Opens browser to http://localhost:3000
```

Behind `npm start`:
1. `npm run build:client` — Vite compiles React → `client/dist/`
2. `npm run build:server` — NestJS compiles TypeScript → `dist/`
3. `node dist/main.js` — Starts server, runs DB migrations, serves everything

### 13.2 Dockerfile (Multi-Stage Build)

```dockerfile
# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
COPY client/package*.json ./client/
RUN npm ci && cd client && npm ci
COPY . .
RUN npm run build

# Stage 2: Production
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nestjs
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/client/dist ./client/dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
RUN mkdir -p uploads && chown nestjs:nodejs uploads
USER nestjs
EXPOSE 3000
CMD ["node", "dist/main.js"]
```

Key decisions:
- **Multi-stage** — build artifacts only, no source code in production image
- **Non-root user** — `nestjs` user for security (no container running as root)
- **Alpine base** — minimal image size (~150MB vs ~900MB for full Node)
- **`npm ci`** — deterministic installs from lockfile

### 13.3 Environment Configuration

```bash
# .env.example — committed to repo (copy to .env for local development)
PORT=3000                    # Server port
NODE_ENV=development         # development | production | test
DATABASE_URL=postgres://inksight:inksight_dev@localhost:5432/inksight
UPLOAD_DIR=uploads           # Image upload directory
MAX_FILE_SIZE=16777216       # 16MB in bytes
RATE_LIMIT_TTL=60000         # Rate limit window (ms)
RATE_LIMIT_MAX=100           # Max requests per window
```

All values have sensible defaults via Joi schema validation (see Section 3.4). The app runs with zero configuration in development but **fails fast** with a descriptive error if a required variable (e.g., `DATABASE_URL`) is missing in production.

### 13.4 CI/CD Pipeline

A GitHub Actions workflow runs on every push and pull request:

```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_DB: inksight_test
          POSTGRES_USER: inksight
          POSTGRES_PASSWORD: inksight_test
        ports: ['5432:5432']
        options: >-
          --health-cmd "pg_isready -U inksight"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: cd client && npm ci
      - run: npm run lint
      - run: npm run build
      - run: npm test -- --coverage
        env:
          DATABASE_URL: postgres://inksight:inksight_test@localhost:5432/inksight_test
```

This ensures every commit is linted, builds cleanly, and passes all tests against a real PostgreSQL instance — matching the production setup exactly.

---

## 14. Future Considerations

Items not in scope for v1 but architecturally prepared for:

### 14.1 API Versioning

The current API is unversioned (`/api/upload`, `/api/chat/:imageId`). If breaking changes are introduced in the future, versioning can be added via URL prefix (`/api/v1/`, `/api/v2/`) or header-based versioning (`Accept: application/vnd.inksight.v2+json`). The modular monolith structure supports versioned controllers — a v2 controller can coexist with v1 by importing the same services.

For v1, versioning is deferred because the API surface is small and there are no external consumers. Adding versioning prematurely would add complexity without benefit.

### 14.2 Observability & Distributed Tracing

The `LoggingInterceptor` with `X-Request-Id` headers provides the foundation for distributed tracing. For production deployments with multiple services:

- **OpenTelemetry** can be added via `@opentelemetry/sdk-node` — the interceptor's correlation ID maps to a trace ID
- **Prometheus metrics** can be exposed via a `/metrics` endpoint using `@willsoto/nestjs-prometheus` for request rate, latency percentiles, and error counts
- The structured log output is already compatible with ELK, Datadog, and CloudWatch log aggregators

### 14.3 Performance Testing

Before production deployment, load testing is recommended using tools like k6 or Artillery to validate:
- Concurrent upload throughput under connection pool limits
- SSE streaming latency under concurrent connections
- Database query performance with large conversation histories
- Rate limiter behavior under sustained load

The Docker Compose setup enables local load testing against the same infrastructure used in production.

### 14.4 Database Backup & Recovery

PostgreSQL supports `pg_dump` for logical backups and WAL archiving for point-in-time recovery. In production:
- Automated daily `pg_dump` to object storage (S3/GCS)
- Continuous WAL archiving for sub-second RPO (Recovery Point Objective)
- The `docker-compose.yml` volume mount (`pgdata`) persists data across container restarts

### 14.5 Content Security Policy

Beyond Helmet's default security headers, a Content Security Policy (CSP) is configured for the served React application:

```typescript
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'blob:'],
      connectSrc: ["'self'"],
    },
  },
}));
```

This prevents XSS attacks by restricting which resources the browser can load — even if an attacker manages to inject content.

---

## 15. Architecture Decision Records

All major technology decisions are documented in the `docs/adr/` folder:

| ADR | Decision | Key Trade-off |
|-----|----------|---------------|
| [000](./adr/000-language-and-platform.md) | TypeScript + Node.js over Python + Flask | SSE streaming, shared-language stack, and structured architecture over template familiarity |
| [001](./adr/001-backend-framework.md) | NestJS as backend framework | Structure vs. simplicity — NestJS provides built-in patterns over Express's DIY approach |
| [002](./adr/002-database.md) | PostgreSQL + TypeORM for persistence | Concurrent writes via MVCC over SQLite's single-writer model |
| [003](./adr/003-frontend-framework.md) | React + Vite for the web client | Right-sized SPA over Next.js's SSR complexity |
| [004](./adr/004-styling.md) | Tailwind CSS + shadcn/ui for styling | Utility-first + accessible components over CSS Modules DIY |
| [005](./adr/005-ai-service-abstraction.md) | Interface-based AI service for swappability | Compile-time contract over loose coupling |
| [006](./adr/006-sse-streaming.md) | Manual SSE over NestJS @Sse decorator | POST support + lifecycle control over idiomatic but GET-only |
| [007](./adr/007-caching-strategy.md) | In-memory cache with Redis-ready abstraction | Zero dependencies now, one-config-change upgrade later |
| [008](./adr/008-rate-limiting.md) | @nestjs/throttler for rate limiting | NestJS-native guards over Express middleware |
| [009](./adr/009-testing.md) | Jest + Supertest for testing | Framework alignment over Vitest speed |
| [010](./adr/010-project-structure.md) | Single package.json with client/ subfolder | One-command setup over monorepo complexity |

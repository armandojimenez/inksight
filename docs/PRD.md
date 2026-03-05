# Inksight — Product Requirements Document

**Version:** 1.0
**Last Updated:** March 2, 2026
**Author:** Armando Jimenez

---

## 1. Overview

Inksight is an AI-powered visual assistant that enables users to upload images and engage in intelligent, context-aware conversations about them. Users can ask questions, request analysis, and receive real-time streamed responses — all within a modern web interface that makes visual AI accessible and intuitive.

The platform pairs a robust NestJS backend (handling image processing, AI orchestration, conversation management, and persistent storage) with a polished React frontend that delivers a seamless, responsive experience.

---

## 2. Problem Statement

Working with images today often requires switching between multiple tools — one to view, another to analyze, another to discuss findings. There's no unified experience where a user can drop in an image and simply *talk* about it, with the assistant remembering the full context of the conversation.

Inksight solves this by providing a single interface where image upload, AI-powered analysis, and multi-turn conversational chat come together in one fluid workflow.

---

## 3. Product Goals

| Goal | Description |
|------|-------------|
| **Instant Analysis** | Users upload an image and receive an AI-generated analysis within seconds |
| **Conversational Depth** | Follow-up questions retain full conversation context per image |
| **Real-time Feedback** | Responses stream token-by-token, eliminating perceived wait time |
| **Production Reliability** | Persistent storage, caching, error recovery, and graceful degradation |
| **Delightful UX** | A modern, responsive interface that feels fast and polished |

---

## 3.1 Scope Exclusions

The following are intentional non-goals for v1. Each was evaluated and deferred with clear rationale:

| Exclusion | Rationale |
|-----------|-----------|
| **Authentication** | Single-user demonstration — adding JWT/session auth would complicate setup without validating core product value (see SEC-11) |
| **Multi-tenancy** | No user accounts means no tenant isolation needed; architecture supports adding it via AuthModule + guards |
| **Real AI inference** | The product validates the UX and engineering patterns — swapping the mock for a real OpenAI client is a config change, not an architecture change |
| **WEBP/AVIF support** | PNG, JPG, and GIF cover 95%+ of user uploads; modern formats can be added by extending the magic byte map |
| **API versioning** | Single consumer (our React client), no external API contracts to maintain; the global prefix (`/api`) provides a natural versioning seam if needed |
| **Dark mode** | Design system is prepared (CSS custom properties, Tailwind `dark:` variant), but v1 ships light-only to reduce testing surface |
| **Real-time collaboration** | Single-user product — no concurrent editing, no WebSocket presence, no conflict resolution needed |
| **Mobile native apps** | Responsive web UI covers mobile use cases; native apps are a separate product decision |

---

## 4. Technical Architecture

### 4.1 High-Level Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| **Backend** | NestJS (TypeScript) | Modular architecture, built-in validation/pipes/interceptors, native SSE support, production-grade |
| **Frontend** | React + Vite (TypeScript) | Fast dev/build, component-driven, strong ecosystem |
| **Database** | PostgreSQL via TypeORM | Production-grade concurrent write handling (MVCC), connection pooling, row-level locking. Docker Compose for single-command setup |
| **Caching** | In-memory cache (NestJS CacheModule) | Reduces DB reads for hot data (recent conversations, image metadata) |
| **AI Layer** | Mock OpenAI-compatible service | Implements the exact OpenAI Chat Completions and Vision API response formats, designed for seamless swap to a real provider |
| **Static Serving** | NestJS ServeStaticModule | Single-process deployment — backend serves the React build |

### 4.2 System Architecture

```
┌─────────────────────────────────────────────────────┐
│                     React Client                     │
│  ┌──────────┐  ┌──────────┐  ┌───────────────────┐  │
│  │  Upload   │  │   Chat   │  │  Streaming View   │  │
│  │  Module   │  │  Module  │  │    (SSE Client)   │  │
│  └────┬─────┘  └────┬─────┘  └────────┬──────────┘  │
└───────┼──────────────┼─────────────────┼─────────────┘
        │              │                 │
        ▼              ▼                 ▼
┌─────────────────────────────────────────────────────┐
│                   NestJS Backend                     │
│                                                      │
│  ┌──────────┐  ┌──────────┐  ┌───────────────────┐  │
│  │  Upload   │  │   Chat   │  │    Streaming      │  │
│  │ Controller│  │Controller│  │   Controller      │  │
│  └────┬─────┘  └────┬─────┘  └────────┬──────────┘  │
│       │              │                 │              │
│       ▼              ▼                 ▼              │
│  ┌──────────────────────────────────────────────┐    │
│  │              Service Layer                    │    │
│  │  ┌─────────┐ ┌──────────┐ ┌──────────────┐   │    │
│  │  │ Upload  │ │   Chat   │ │   History     │   │    │
│  │  │ Service │ │  Service │ │   Service     │   │    │
│  │  └────┬────┘ └────┬─────┘ └──────┬───────┘   │    │
│  └───────┼───────────┼──────────────┼────────────┘    │
│          │           │              │                 │
│          ▼           ▼              ▼                 │
│  ┌──────────────────────────────────────────────┐    │
│  │          Mock AI Service                      │    │
│  │  (OpenAI-compatible response format)          │    │
│  └──────────────────────────────────────────────┘    │
│          │           │              │                 │
│          ▼           ▼              ▼                 │
│  ┌──────────────────────────────────────────────┐    │
│  │     Cache Layer (In-Memory / NestJS Cache)    │    │
│  └─────────────────────┬────────────────────────┘    │
│                        ▼                              │
│  ┌──────────────────────────────────────────────┐    │
│  │     Database Layer (TypeORM + PostgreSQL)          │    │
│  │  ┌─────────────┐  ┌────────────────────┐      │    │
│  │  │ images      │  │ chat_messages      │      │    │
│  │  │ table       │  │ table              │      │    │
│  │  └─────────────┘  └────────────────────┘      │    │
│  └──────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────┘
```

### 4.3 Module Structure

```
src/
├── app.module.ts                  # Root module, imports all feature modules
├── main.ts                        # Bootstrap, global pipes, CORS, static serving
│
├── upload/                        # Image Upload Module
│   ├── upload.module.ts
│   ├── upload.controller.ts       # POST /api/upload
│   ├── upload.service.ts          # File validation, storage, metadata
│   ├── dto/
│   │   └── upload-response.dto.ts
│   └── entities/
│       └── image.entity.ts        # TypeORM entity
│
├── chat/                          # Chat Module
│   ├── chat.module.ts
│   ├── chat.controller.ts         # POST /api/chat/:imageId, POST /api/chat-stream/:imageId
│   ├── chat.service.ts            # Orchestrates AI calls, history
│   ├── dto/
│   │   ├── chat-request.dto.ts
│   │   └── chat-response.dto.ts
│   └── entities/
│       └── chat-message.entity.ts # TypeORM entity
│
├── ai/                            # Mock AI Service Module
│   ├── ai.module.ts
│   ├── ai.service.ts              # Mock OpenAI responses (vision + chat + streaming)
│   └── interfaces/
│       ├── openai-response.interface.ts
│       └── openai-stream-chunk.interface.ts
│
├── history/                       # Conversation History Module
│   ├── history.module.ts
│   ├── history.service.ts         # CRUD for conversation history, cleanup
│   └── interfaces/
│       └── conversation.interface.ts
│
├── database/                      # Database Module
│   ├── database.module.ts         # TypeORM configuration, connection
│   └── migrations/                # TypeORM migration files
│
├── cache/                         # Cache Module
│   ├── cache.module.ts            # NestJS CacheModule setup
│   └── cache.service.ts           # Cache helpers, invalidation logic
│
├── cleanup/                       # Scheduled Cleanup Module
│   └── cleanup.service.ts         # @Cron() job for expired data removal
│
└── common/                        # Shared utilities
    ├── filters/
    │   └── http-exception.filter.ts
    ├── interceptors/
    │   ├── logging.interceptor.ts
    │   └── cache.interceptor.ts
    ├── guards/
    │   └── rate-limit.guard.ts
    ├── pipes/
    │   └── file-validation.pipe.ts
    ├── utils/
    │   └── retry.ts               # withRetry utility for transient DB failures
    └── constants.ts
```

---

## 5. Feature Requirements

### 5.1 Image Upload & Initial Analysis

**Endpoint:** `POST /api/upload`

**Description:** Users upload an image file and receive a unique image ID along with an AI-generated initial analysis of the image content.

#### Functional Requirements

| ID | Requirement | Details |
|----|-------------|---------|
| UP-1 | Accept multipart form upload | Field name: `image`, single file per request |
| UP-2 | Validate file type | Allow: `png`, `jpg`, `jpeg`, `gif`. Reject all others with `400` |
| UP-3 | Validate file content | Verify magic bytes match declared extension (not just extension check) |
| UP-4 | Enforce file size limit | Max 16MB. Return `413 Payload Too Large` if exceeded |
| UP-5 | Generate unique image ID | UUID v4, returned in response |
| UP-6 | Store image to disk | Save to `uploads/{uuid}.{ext}` — UUID from the image record, original filename preserved in DB for display only |
| UP-7 | Store image metadata | Persist: `id`, `originalFilename`, `mimeType`, `size`, `uploadPath`, `createdAt` |
| UP-8 | Return initial AI analysis | Call mock vision analysis, return description of image content |
| UP-9 | Handle missing file | Return `400` with clear error message |
| UP-10 | Handle concurrent uploads | No race conditions on ID generation or file writes |

#### Response Format

**Success (201 Created):**
```json
{
  "id": "uuid-v4-string",
  "filename": "photo.jpg",
  "mimeType": "image/jpeg",
  "size": 245832,
  "analysis": {
    "id": "chatcmpl-xxxx",
    "object": "chat.completion",
    "created": 1709337600,
    "model": "gpt-5.2",
    "choices": [
      {
        "index": 0,
        "message": {
          "role": "assistant",
          "content": "This image shows..."
        },
        "finish_reason": "stop"
      }
    ],
    "usage": {
      "prompt_tokens": 265,
      "completion_tokens": 52,
      "total_tokens": 317
    }
  }
}
```

**Error (400 Bad Request):**
```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "code": "MISSING_FILE",
  "message": "No image file provided",
  "timestamp": "2026-03-02T10:30:00.000Z",
  "path": "/api/upload",
  "requestId": "a1b2c3d4-..."
}
```

**Error (413 Payload Too Large):**
```json
{
  "statusCode": 413,
  "error": "Payload Too Large",
  "code": "FILE_TOO_LARGE",
  "message": "File size exceeds the 16MB limit",
  "timestamp": "2026-03-02T10:30:00.000Z",
  "path": "/api/upload",
  "requestId": "a1b2c3d4-..."
}
```

**Error (415 Unsupported Media Type):**
```json
{
  "statusCode": 415,
  "error": "Unsupported Media Type",
  "code": "INVALID_FILE_TYPE",
  "message": "File type 'bmp' is not supported. Allowed types: png, jpg, jpeg, gif",
  "timestamp": "2026-03-02T10:30:00.000Z",
  "path": "/api/upload",
  "requestId": "a1b2c3d4-..."
}
```

---

### 5.2 Conversational Chat (Non-Streaming)

**Endpoint:** `POST /api/chat/:imageId`

**Description:** Users send a text question about a previously uploaded image and receive a complete AI response. The conversation context is maintained across multiple exchanges.

#### Functional Requirements

| ID | Requirement | Details |
|----|-------------|---------|
| CH-1 | Accept JSON body with `message` field | Validate presence and non-empty string |
| CH-2 | Validate image exists | Return `404` if `imageId` not found |
| CH-3 | Include conversation history in context | Send prior messages to AI service for context |
| CH-4 | Return OpenAI-compatible response | Full Chat Completion response format |
| CH-5 | Persist user message to history | Store before calling AI |
| CH-6 | Persist assistant response to history | Store after receiving AI response |
| CH-7 | Handle concurrent chats per image | Thread-safe access to conversation state |
| CH-8 | Validate message length | Max 2000 characters, return `400` if exceeded |
| CH-9 | Sanitize message input | Trim leading/trailing whitespace before validation; reject whitespace-only messages |
| CH-10 | Validate parameter types | `imageId` must be valid UUID v4 format; reject with `400` and descriptive message if malformed |

#### Request Format

```json
{
  "message": "What objects can you identify in this image?"
}
```

#### Response Format

**Success (200 OK):**
```json
{
  "id": "chatcmpl-xxxx",
  "object": "chat.completion",
  "created": 1709337600,
  "model": "gpt-5.2",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "In this image, I can identify several objects..."
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 320,
    "completion_tokens": 85,
    "total_tokens": 405
  }
}
```

**Error (404 Not Found):**
```json
{
  "statusCode": 404,
  "error": "Not Found",
  "code": "IMAGE_NOT_FOUND",
  "message": "Image with ID 'abc-123' not found",
  "timestamp": "2026-03-02T10:30:00.000Z",
  "path": "/api/chat/abc-123",
  "requestId": "a1b2c3d4-..."
}
```

---

### 5.3 Real-Time Streaming Chat

**Endpoint:** `POST /api/chat-stream/:imageId`

**Description:** Same as the chat endpoint, but responses are streamed token-by-token via Server-Sent Events (SSE). This dramatically reduces perceived latency and provides a modern, responsive feel.

#### Functional Requirements

| ID | Requirement | Details |
|----|-------------|---------|
| ST-1 | Stream via Server-Sent Events | `Content-Type: text/event-stream` |
| ST-2 | Match OpenAI streaming chunk format | Each chunk is a `chat.completion.chunk` object |
| ST-3 | Include all SSE event types | First chunk with `role`, delta chunks with `content`, final chunk with `finish_reason: "stop"` |
| ST-4 | Send `[DONE]` sentinel | Final `data: [DONE]` event signals stream end |
| ST-5 | Handle client disconnection | Detect dropped connections, clean up resources |
| ST-6 | Persist complete response to history | Accumulate streamed tokens, save full message after stream completes |
| ST-7 | Include conversation history in context | Same history awareness as non-streaming |
| ST-8 | Implement connection timeout | Close idle connections after 30 seconds |
| ST-9 | Handle backpressure | Buffer management for slow clients |
| ST-10 | Handle concurrent streams | Multiple simultaneous streaming connections on different images must not interfere or degrade performance |

#### SSE Event Format

Each event follows the OpenAI streaming format:

**First chunk (role):**
```
data: {"id":"chatcmpl-xxxx","object":"chat.completion.chunk","created":1709337600,"model":"gpt-5.2","choices":[{"index":0,"delta":{"role":"assistant","content":""},"finish_reason":null}]}

```

**Content chunks (repeated):**
```
data: {"id":"chatcmpl-xxxx","object":"chat.completion.chunk","created":1709337600,"model":"gpt-5.2","choices":[{"index":0,"delta":{"content":"This"},"finish_reason":null}]}

```

**Final chunk:**
```
data: {"id":"chatcmpl-xxxx","object":"chat.completion.chunk","created":1709337600,"model":"gpt-5.2","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}

data: [DONE]

```

---

### 5.4 Conversation History Management

**Description:** Every image maintains its own conversation thread. History is persisted, retrievable, and provides context for follow-up questions.

#### Functional Requirements

| ID | Requirement | Details |
|----|-------------|---------|
| HI-1 | Store messages per image | Each image has an independent conversation thread |
| HI-2 | Message structure | `role` (user/assistant), `content`, `timestamp`, `imageId` |
| HI-3 | History informs AI responses | Full conversation sent as context to mock AI service |
| HI-4 | Retrieve conversation history | `GET /api/chat/:imageId/history` returns full thread |
| HI-5 | Concurrent access safety | Multiple simultaneous chats on different images must not interfere |
| HI-6 | Cleanup old conversations | Configurable TTL — auto-remove conversations older than threshold |
| HI-7 | History limit | Cap at most recent 50 messages per image to manage context size |
| HI-8 | Works for both endpoints | Streaming and non-streaming both read/write the same history |

#### History Response Format

**`GET /api/chat/:imageId/history?page=1&limit=20` — Success (200 OK):**
```json
{
  "imageId": "uuid-v4-string",
  "messages": [
    {
      "id": "msg-uuid",
      "role": "user",
      "content": "What is in this image?",
      "timestamp": "2026-03-02T10:30:00.000Z"
    },
    {
      "id": "msg-uuid",
      "role": "assistant",
      "content": "This image shows a mountain landscape...",
      "timestamp": "2026-03-02T10:30:01.200Z"
    }
  ],
  "totalMessages": 2,
  "page": 1,
  "pageSize": 20,
  "totalPages": 1
}
```

---

### 5.5 Image Gallery (List All Images)

**Endpoint:** `GET /api/images`

**Description:** Returns a list of all uploaded images with metadata and message counts. Powers the sidebar gallery component.

#### Functional Requirements

| ID | Requirement | Details |
|----|-------------|---------|
| GAL-1 | Return all images | Ordered by `createdAt` descending (newest first) |
| GAL-2 | Include message count | Each image includes the count of associated chat messages |
| GAL-3 | Lightweight response | Return metadata only — no file content, no conversation history |
| GAL-4 | Support pagination | Optional `page` and `limit` query parameters |

#### Response Format

**Success (200 OK):**
```json
{
  "images": [
    {
      "id": "uuid-v4-string",
      "originalFilename": "photo.jpg",
      "mimeType": "image/jpeg",
      "size": 245832,
      "messageCount": 4,
      "createdAt": "2026-03-02T10:30:00.000Z"
    }
  ],
  "total": 1,
  "page": 1,
  "pageSize": 20,
  "totalPages": 1
}
```

---

### 5.6 Image Deletion

**Endpoint:** `DELETE /api/images/:imageId`

**Description:** Users can delete an uploaded image and all associated conversation history. This ensures clean data lifecycle management and supports the gallery UI's delete action.

#### Functional Requirements

| ID | Requirement | Details |
|----|-------------|---------|
| DEL-1 | Delete image record | Remove image metadata from database |
| DEL-2 | Cascade delete messages | All associated chat messages are removed |
| DEL-3 | Remove file from disk | Delete the stored image file from `uploads/` directory |
| DEL-4 | Invalidate cache | Clear all cached data for this image (metadata, history, gallery) |
| DEL-5 | Validate image exists | Return `404` if `imageId` not found |
| DEL-6 | Validate imageId format | Return `400` if `imageId` is not valid UUID v4 |
| DEL-7 | Idempotent design | Second delete of same ID returns `404` (not an error) |

#### Response Format

**Success (204 No Content):**
*(No response body)*

**Error (404 Not Found):**
```json
{
  "statusCode": 404,
  "error": "Not Found",
  "code": "IMAGE_NOT_FOUND",
  "message": "Image with ID 'abc-123' not found",
  "timestamp": "2026-03-02T10:30:00.000Z",
  "path": "/api/images/abc-123",
  "requestId": "a1b2c3d4-..."
}
```

---

### 5.7 Persistent Storage & Caching

**Description:** All data is persisted to a PostgreSQL database via TypeORM, with an in-memory caching layer for frequently accessed data.

#### Database Schema

**`images` table:**

| Column | Type | Constraints |
|--------|------|------------|
| `id` | UUID (PK) | Generated, primary key |
| `originalFilename` | VARCHAR(255) | Not null |
| `storedFilename` | VARCHAR(255) | Not null, unique |
| `mimeType` | VARCHAR(50) | Not null |
| `size` | INTEGER | Not null |
| `uploadPath` | VARCHAR(500) | Not null |
| `initialAnalysis` | TEXT | Nullable — JSON string of initial AI analysis |
| `createdAt` | DATETIME | Auto-generated |
| `updatedAt` | DATETIME | Auto-updated |

**`chat_messages` table:**

| Column | Type | Constraints |
|--------|------|------------|
| `id` | UUID (PK) | Generated, primary key |
| `imageId` | UUID (FK) | References `images.id`, indexed, cascade delete |
| `role` | VARCHAR(20) | Not null — validated at the application layer via TypeScript union type `'user' | 'assistant'`. VARCHAR used for ORM portability |
| `content` | TEXT | Not null |
| `tokenCount` | INTEGER | Nullable — estimated token count |
| `createdAt` | DATETIME | Auto-generated |
| `updatedAt` | DATETIME | Auto-updated |

#### Caching Strategy

| Data | Cache TTL | Invalidation |
|------|-----------|-------------|
| Image metadata | 10 minutes | On image delete |
| Recent chat messages (last 10) | 5 minutes | On new message added |
| Conversation history | 5 minutes | On new message added |

#### Functional Requirements

| ID | Requirement | Details |
|----|-------------|---------|
| DB-1 | TypeORM with PostgreSQL | Production-grade MVCC, connection pooling, Docker Compose setup |
| DB-2 | Database migrations | Versioned, reproducible schema changes |
| DB-3 | Connection pooling | Managed by TypeORM, configured for concurrent access |
| DB-4 | Cache layer | NestJS CacheModule with in-memory store |
| DB-5 | Cache invalidation | Write-through — invalidate on mutation |
| DB-6 | Graceful connection handling | Retry on transient failures, proper shutdown cleanup |
| DB-7 | Data cleanup | Scheduled removal of images/conversations older than 24 hours |
| DB-8 | Cascade deletes | Deleting an image removes all associated chat messages |
| DB-9 | Optimistic locking | `@VersionColumn` on ImageEntity prevents concurrent overwrites — TypeORM throws on version mismatch. Chat messages are append-only (INSERT, never concurrent UPDATE) so locking is unnecessary there |
| DB-10 | Connection retry | `retryAttempts: 10`, `retryDelay: 3000` on startup; custom retry utility for transient DB failures in services |

---

### 5.8 Web Client (React UI)

**Description:** A modern, responsive single-page application that provides the complete Inksight experience — upload, analyze, chat, and stream — all in one polished interface.

#### Screens & Components

**5.8.1 — Landing / Upload View**
- Drag-and-drop zone with visual feedback (hover state, file type indicators)
- Click-to-browse fallback
- File type and size validation on the client side (before upload)
- Upload progress indicator
- Smooth transition to chat view after successful upload
- Display initial AI analysis upon upload completion

**5.8.2 — Chat View**
- Full-screen chat interface anchored to a specific image
- Uploaded image displayed as a thumbnail/preview (expandable)
- Message input with send button and Enter-to-submit
- User messages aligned right, assistant messages aligned left
- Streaming responses render token-by-token with a typing indicator
- Auto-scroll to latest message
- Conversation history loads on entry
- Toggle between streaming and non-streaming mode (demonstrates both endpoints)
- Empty state with suggested questions ("What's in this image?", "Describe the colors", etc.)

**5.8.3 — Sidebar / Image Gallery**
- List of previously uploaded images with thumbnails
- Click to switch between image conversations
- Shows message count per image
- Delete option per image

**5.8.4 — Shared UI Patterns**
- Consistent error toasts for API failures
- Loading skeletons during data fetches
- Responsive layout (desktop and mobile-friendly)
- Keyboard shortcuts (Ctrl+Enter to send, Escape to close modals)

#### UI Technical Requirements

| ID | Requirement | Details |
|----|-------------|---------|
| UI-1 | React 18+ with TypeScript | Strict mode, functional components only |
| UI-2 | Vite for build tooling | Fast HMR in dev, optimized production builds |
| UI-3 | Tailwind CSS | Utility-first styling, consistent design system |
| UI-4 | SSE client implementation | `fetch` with `ReadableStream` for streaming (`EventSource` is not used — it only supports GET, and the streaming endpoint requires POST) |
| UI-5 | Responsive design | Flexbox/Grid, works on 320px–1920px viewports |
| UI-6 | Error boundaries | Graceful UI recovery on component errors |
| UI-7 | Optimistic updates | Show user message immediately, before server confirms |
| UI-8 | Accessible | Semantic HTML, ARIA labels, keyboard navigable, sufficient contrast |
| UI-9 | Stream reconnection | Client-side retry with exponential backoff if SSE stream drops mid-response; user notified of retry attempt |

---

## 6. Mock AI Service Specification

The AI service layer implements mock responses that precisely match the OpenAI API format. This design allows the mock to be swapped for a real OpenAI client with zero changes to the controller or service layers.

### 6.1 Vision Analysis (Mock)

**Simulates:** `POST https://api.openai.com/v1/chat/completions` with image input

**Behavior:**
- Accepts an image path
- Returns a hardcoded analysis response after a simulated delay (100ms)
- Response format matches OpenAI Chat Completion with vision

**Mock Response Fields:**
| Field | Value |
|-------|-------|
| `id` | `chatcmpl-` + random alphanumeric (29 chars) |
| `object` | `"chat.completion"` |
| `created` | Current Unix timestamp |
| `model` | `"gpt-5.2"` |
| `choices[0].index` | `0` |
| `choices[0].message.role` | `"assistant"` |
| `choices[0].message.content` | Hardcoded image description |
| `choices[0].finish_reason` | `"stop"` |
| `usage.prompt_tokens` | Simulated count (e.g., 265) |
| `usage.completion_tokens` | Based on response length |
| `usage.total_tokens` | Sum of prompt + completion |

### 6.2 Chat Completion (Mock, Non-Streaming)

**Simulates:** `POST https://api.openai.com/v1/chat/completions` with `stream: false`

**Behavior:**
- Accepts a prompt string, image ID, and conversation history
- Returns a context-aware response after simulated delay (200ms)
- Should vary response based on conversation length (e.g., "Based on our earlier discussion...")

### 6.3 Chat Completion (Mock, Streaming)

**Simulates:** `POST https://api.openai.com/v1/chat/completions` with `stream: true`

**Behavior:**
- Yields SSE events matching OpenAI's streaming format
- Splits response into word-level tokens
- Each chunk delivered with a 50ms delay (simulates generation speed)
- Event sequence: role chunk → content chunks → finish chunk → `[DONE]`

**Chunk Format:**
| Field | Value |
|-------|-------|
| `id` | Same ID for all chunks in one response |
| `object` | `"chat.completion.chunk"` |
| `created` | Same timestamp for all chunks |
| `model` | `"gpt-5.2"` |
| `choices[0].delta` | `{role}` on first, `{content}` on middle, `{}` on last |
| `choices[0].finish_reason` | `null` until final chunk, then `"stop"` |

---

## 7. Non-Functional Requirements

### 7.1 Security

| ID | Requirement | Implementation |
|----|-------------|---------------|
| SEC-1 | Rate limiting | Global: 100 req/min. Upload: 10 req/min. Chat: 30 req/min per IP |
| SEC-2 | Input validation | All DTOs validated via `class-validator` + NestJS `ValidationPipe` |
| SEC-3 | File upload security | Magic byte verification, filename sanitization, path traversal prevention |
| SEC-4 | Content-type enforcement | Reject requests with wrong `Content-Type` headers |
| SEC-5 | SQL injection prevention | TypeORM parameterized queries (no raw SQL) |
| SEC-6 | XSS prevention | JSON-only API responses, no HTML rendering from user input |
| SEC-7 | CORS configuration | Restrictive in production, permissive in development |
| SEC-8 | Error information leakage | No stack traces or internal details in production error responses |
| SEC-9 | Helmet headers | Standard security headers via `helmet` middleware |
| SEC-10 | Request size limits | Body: 1MB JSON. Upload: 16MB multipart |
| SEC-11 | Authentication | Intentionally deferred — single-user demonstration. Production deployment would add JWT-based authentication with refresh tokens. The modular architecture supports adding an AuthModule with guards without modifying existing controllers |

### 7.2 Performance

| ID | Requirement | Implementation |
|----|-------------|---------------|
| PER-1 | Concurrent request handling | NestJS async/await, non-blocking I/O throughout |
| PER-2 | Response caching | Cache layer for repeated queries on same image |
| PER-3 | Efficient file handling | Stream-based upload processing, no full-file buffering in memory |
| PER-4 | Database query optimization | Indexed columns (`imageId`, `createdAt`), pagination for history |
| PER-5 | Connection management | TypeORM connection pooling, proper cleanup on shutdown |
| PER-6 | SSE efficiency | Proper connection cleanup on client disconnect |
| PER-7 | Resource cleanup | Scheduled cleanup of expired data, temp file removal |

### 7.3 Reliability

| ID | Requirement | Implementation |
|----|-------------|---------------|
| REL-1 | Structured logging | Request/response logging with correlation IDs via interceptor |
| REL-2 | Global error handling | `HttpExceptionFilter` catches all unhandled errors, returns consistent format |
| REL-3 | Health check endpoint | `GET /api/health` returns service status and DB connectivity |
| REL-4 | Graceful shutdown | `app.enableShutdownHooks()` — close DB connections, finish active streams |
| REL-5 | Input edge cases | Empty strings, unicode, extremely long input, malformed JSON |
| REL-6 | Database resilience | Connection pool retry logic, graceful handling of transient connection failures |
| REL-7 | Upload atomicity | Temp file → rename pattern prevents partial uploads being served |
| REL-8 | Request monitoring | Structured log output includes request count, error rate, and response time per endpoint — suitable for aggregation by external monitoring tools (Datadog, CloudWatch, ELK) |
| REL-9 | Database connection retry | Exponential backoff retry on startup if PostgreSQL is not yet available; transient failure retry for DB operations via TypeORM `retryAttempts` |

### 7.4 Scalability

| ID | Requirement | Implementation |
|----|-------------|---------------|
| SCA-1 | Stateless API design | No server-side sessions; all state in DB/cache |
| SCA-2 | Modular architecture | Each feature is an independent NestJS module, swappable |
| SCA-3 | Database abstraction | TypeORM abstracts the database driver — swappable to MySQL or other providers via config |
| SCA-4 | Cache abstraction | NestJS CacheModule supports swapping to Redis with config change only |
| SCA-5 | AI service abstraction | Interface-based AI service — mock swappable for real OpenAI client |
| SCA-6 | File storage abstraction | Local disk now, swappable to S3/GCS via interface |
| SCA-7 | Configuration management | Environment-based config via `@nestjs/config` |
| SCA-8 | Load balancer ready | Stateless API + SSE with `X-Accel-Buffering: no` header works behind nginx/ALB without sticky sessions |

---

## 8. Testing Strategy

### 8.1 Test Categories

| Category | Scope | Tool |
|----------|-------|------|
| **Unit Tests** | Individual services, pipes, guards | Jest |
| **Integration Tests** | Controller + service + DB interactions | Jest + Supertest |
| **E2E Tests** | Full HTTP request lifecycle | Jest + Supertest |
| **Mock Validation** | AI response format correctness | Jest assertions against OpenAI schemas |

### 8.2 Test Coverage Targets

| Area | Minimum Coverage |
|------|-----------------|
| Services | 90% |
| Controllers | 85% |
| Pipes / Guards / Filters | 95% |
| Mock AI Service | 100% |
| Overall | 85% |

### 8.3 Key Test Scenarios

**Upload:**
- Successful upload with valid image
- Reject invalid file types
- Reject oversized files
- Reject missing file
- Reject corrupted file (extension doesn't match content)
- Concurrent upload handling
- Filename sanitization (path traversal attempts)

**Chat (Non-Streaming):**
- Successful chat with valid image
- 404 for nonexistent image
- Empty message validation
- Overly long message validation
- Response matches OpenAI format exactly
- Conversation history included in context
- Concurrent chats on different images

**Chat (Streaming):**
- Full SSE stream received correctly
- Each chunk matches OpenAI streaming format
- Stream ends with `[DONE]` event
- Client disconnection handled gracefully
- History updated after stream completes
- Concurrent streams on different images

**History:**
- History persists across multiple chats
- History retrieval returns correct order
- History cap at 50 messages enforced
- History informs AI responses
- Concurrent access to same image history

**Database:**
- Migrations run cleanly on fresh DB
- CRUD operations for images and messages
- Cascade delete (image → messages)
- Cache hit/miss behavior
- Cache invalidation on writes

**Error Handling:**
- All endpoints return consistent error format
- Rate limiting triggers correctly
- Malformed JSON rejected
- Unexpected errors don't leak internals

---

## 9. API Summary

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/upload` | Upload image, receive analysis |
| `GET` | `/api/images` | List all uploaded images (paginated) |
| `POST` | `/api/chat/:imageId` | Send message, receive complete response |
| `POST` | `/api/chat-stream/:imageId` | Send message, receive streamed response (SSE) |
| `GET` | `/api/chat/:imageId/history` | Retrieve conversation history (paginated) |
| `GET` | `/api/images/:imageId/file` | Serve the uploaded image file with proper Content-Type |
| `DELETE` | `/api/images/:imageId` | Delete image and all associated conversations |
| `GET` | `/api/health` | Service health check |

---

## 10. Milestones

### Phase 1 — Foundation
- Project scaffold (NestJS + React + TypeORM)
- Image upload endpoint with validation
- Chat endpoint with mock OpenAI responses
- Mock AI service with correct response formats
- Unit + integration tests for Phase 1

### Phase 2 — Streaming
- SSE streaming endpoint
- Mock streaming AI service with correct chunk format
- Client disconnect handling
- React streaming UI component
- Tests for streaming behavior

### Phase 3 — Conversation History
- History persistence to PostgreSQL via TypeORM
- History-aware mock AI responses
- History retrieval endpoint with pagination
- History works for both streaming and non-streaming
- Image deletion with cascade
- Tests for history management

### Phase 4 — Production Storage & Hardening
- Database migration verification and index optimization
- Optimistic locking via `@VersionColumn` for concurrent safety
- Connection retry logic (startup + transient failures)
- Cache layer implementation with write-through invalidation
- Connection pooling tuning and graceful shutdown
- Tests for database operations, locking, and retry

### Phase 5 — Production Hardening
- Rate limiting
- Security headers (Helmet)
- Structured logging with correlation IDs
- Health check endpoint
- Global error handling
- Graceful shutdown

### Phase 6 — Web Client
- React app scaffold with Vite + Tailwind
- Upload view with drag-and-drop
- Chat view with streaming support
- Image gallery sidebar
- Responsive layout and polish

### Phase 7 — Final Polish
- Documentation (README, API docs)
- Test coverage review
- Code cleanup and final review

---

## 11. Success Criteria

The product is considered complete when:

1. All API endpoints function correctly and return OpenAI-compatible response formats
2. Streaming delivers real-time token-by-token responses via SSE
3. Conversation history persists and informs subsequent AI responses
4. All data persists to PostgreSQL with proper migrations
5. Caching reduces redundant database reads
6. Rate limiting, input validation, and security headers are in place
7. Test suite passes with 85%+ coverage
8. Web client provides a polished upload → chat → stream experience
9. Single command (`npm start`) runs the full application
10. README documents architecture, setup, and design decisions

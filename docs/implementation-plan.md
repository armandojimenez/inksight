# Inksight — Implementation Plan

**Version:** 1.1
**Last Updated:** March 2, 2026
**Author:** Armando Jimenez

---

## Overview

This plan defines the exact execution order for building Inksight. Each phase follows **TDD discipline** — tests are written first, then implementation makes them pass. Every phase ends with a verifiable milestone: passing tests, a manual smoke test, a git tag, and a testable state.

**Related Documents:**
- [PRD](./PRD.md) — What to build
- [Technical Design](./technical-design.md) — How to build it
- [ADRs](./adr/) — Why we made each decision
- [UI Design Spec](./ui-design-spec.md) — How it should look

---

## Phase Discipline

Every phase concludes with a **Phase Gate** — three checks that must pass before moving forward:

| Gate | What | Why |
|------|------|-----|
| **Automated** | `npm test` with phase-specific test filter passes | Proves correctness under test conditions |
| **Smoke Test** | Manual curl/browser verification of actual running endpoints | Proves the code works end-to-end in a real environment (not just mocked tests) |
| **Git Tag** | `git tag` with descriptive message | Creates a rollback point and documents progress |

The smoke test is not a replacement for automated tests — it's a complementary verification that catches issues automated tests can miss: wrong HTTP status codes in production mode, missing response headers, serialization differences between test and real environments, Docker networking issues, and integration bugs that only surface under real I/O.

**Running smoke tests:** Start the server with `docker-compose up -d db && npm run start:dev`, then execute the curl commands in a separate terminal.

---

## Phase Overview

| Phase | Name | Depends On | Deliverable | Git Tag |
|-------|------|-----------|-------------|---------|
| 0 | Project Scaffold | — | Running NestJS app with Docker Compose | `v0.0-scaffold` |
| 1 | Image Upload | Phase 0 | `POST /api/upload` with validation | `v0.1-upload` |
| 2 | Mock AI Service | Phase 0 | OpenAI-compatible mock responses | `v0.2-mock-ai` |
| 3 | Chat Endpoint | Phases 1, 2 | `POST /api/chat/:imageId` | `v0.3-chat` |
| 4 | SSE Streaming | Phase 3 | `POST /api/chat-stream/:imageId` | `v0.4-streaming` |
| 5 | Conversation History, Gallery & Deletion | Phase 4 | History persistence + pagination + `GET /api/images` + `DELETE /api/images/:imageId` | `v0.5-history` |
| 6 | Database Hardening | Phase 5 | Optimistic locking, retry logic, indexes, connection tuning | `v0.6-hardened-db` |
| 7 | Caching Layer | Phase 6 | In-memory cache for DB reads | `v0.7-cache` |
| 8 | Production Hardening | Phase 7 | Rate limiting, security headers, logging, health check | `v0.8-hardened` |
| 9 | API Documentation | Phase 8 | Swagger, Postman collection, test script | `v0.9-api-docs` |
| 10 | React Client | Phase 8 | Full UI: upload, chat, streaming, gallery | `v0.10-client` |
| 11 | E2E Tests | Phase 10 | Full end-to-end test suite | `v0.11-e2e` |
| 12 | Final Polish | Phase 11 | README, code cleanup, coverage report | `v1.0` |

### PRD Milestone → Implementation Phase Mapping

| PRD Milestone | Implementation Phases |
|---------------|----------------------|
| Phase 1: Foundation | Phases 0, 1, 2, 3 |
| Phase 2: Streaming | Phase 4 |
| Phase 3: History | Phase 5 |
| Phase 4: Storage & Hardening | Phases 6, 7 |
| Phase 5: Production Polish | Phase 8 |
| Phase 6: Web Client | Phases 9, 10 |
| Phase 7: Quality & Delivery | Phases 11, 12 |

---

## Phase 0: Project Scaffold

**Goal:** A running NestJS app with Docker Compose, PostgreSQL, and the complete module structure.

**Reference Docs:** [TDD Sec 2–3](./technical-design.md#2-architecture-overview) (architecture, modules, global config), [TDD Sec 3.4](./technical-design.md#34-environment-configuration-validation) (Joi validation), [TDD Sec 4.2](./technical-design.md#42-consistent-error-response-format) (error format), [TDD Sec 10.1](./technical-design.md#101-structured-logging) (LoggingInterceptor + X-Request-Id), [TDD Sec 13.2–13.4](./technical-design.md#132-dockerfile-multi-stage-build) (Dockerfile, .env, CI), [ADR-000](./adr/000-language-and-platform.md), [ADR-001](./adr/001-backend-framework.md), [ADR-002](./adr/002-database.md)

### Tasks
1. Initialize NestJS project with TypeScript strict mode
2. Create `docker-compose.yml` (PostgreSQL 16 + app, with health check)
3. Create multi-stage `Dockerfile` for the NestJS app (builder → runner)
4. Create `.dockerignore` (exclude `node_modules/`, `.git/`, `uploads/`, `*.md`)
5. Create `.env.example` with all variables and sensible defaults
6. Configure TypeORM connection to PostgreSQL
7. Set up `@nestjs/config` with Joi schema validation (fail-fast on misconfiguration)
8. Set up module structure (empty modules for upload, chat, ai, history, health)
9. Configure global middleware: ValidationPipe, HttpExceptionFilter, LoggingInterceptor (with X-Request-Id)
10. Initialize client/ folder with React + Vite + Tailwind + shadcn/ui
11. Configure ServeStaticModule to serve `client/dist/`
12. Set up Jest + Supertest test infrastructure
13. Write `npm start` script that builds client + server + starts
14. Create `.github/workflows/ci.yml` — lint, type-check, test, build on push/PR

### Tests to Write First
- [ ] `health.controller.spec.ts` — health endpoint returns status with DB connectivity
- [ ] `app.module.spec.ts` — all modules load without error
- [ ] `http-exception.filter.spec.ts` — consistent error format with `code`, `requestId`, `timestamp`

### Phase Gate

**Automated:**
```bash
npm test -- --testPathPattern="health|app.module|http-exception"
# All 3 test files pass
```

**Smoke Test:**
```bash
# 1. Health endpoint returns OK
curl -s http://localhost:3000/api/health | jq .
# ✓ status: "healthy", checks.database: "connected"

# 2. X-Request-Id header present on every response
curl -sI http://localhost:3000/api/health | grep -i x-request-id
# ✓ X-Request-Id: <uuid>

# 3. Unknown route returns consistent error format (not framework default)
curl -s http://localhost:3000/api/nonexistent | jq .
# ✓ { statusCode: 404, error: "Not Found", code: "...", message: "...", requestId: "..." }

# 4. Docker Compose starts cleanly
docker-compose down -v && docker-compose up -d db
# ✓ PostgreSQL passes health check within 30 seconds
```

**Git:**
```bash
git tag v0.0-scaffold -m "Project scaffold with Docker Compose, PostgreSQL, module structure"
```

---

## Phase 1: Image Upload

**Goal:** Users can upload images with full validation and receive a unique ID.

**Reference Docs:** [PRD Sec 5.1](./PRD.md#51-image-upload--initial-analysis) (requirements + response format), [TDD Sec 9.4](./technical-design.md#94-file-upload-security) (magic byte validation), [TDD Sec 7.1](./technical-design.md#71-entity-definitions) (ImageEntity schema)

### Tasks
1. Create `ImageEntity` with TypeORM decorators
2. Generate initial database migration
3. Implement `FileValidationPipe` (extension check, magic byte verification, size limit)
4. Implement `UploadService` (file storage, metadata persistence, UUID generation)
5. Implement `UploadController` (`POST /api/upload`)
6. Configure Multer for multipart file handling
7. Create `uploads/` directory management (`.gitkeep`, auto-creation)
8. Implement filename sanitization (path traversal prevention)
9. Validate upload field name (reject if field isn't named `image`)
10. Configure request body size limits: `express.json({ limit: '1mb' })` and multipart `MAX_FILE_SIZE` from env (SEC-10)
11. Add `UPLOAD_DIR` and `MAX_FILE_SIZE` to ConfigModule Joi validation schema

### Tests to Write First
- [ ] `file-validation.pipe.spec.ts`
  - Accepts valid PNG, JPG, JPEG, GIF
  - Rejects invalid extensions (`.bmp`, `.exe`, `.txt`)
  - Rejects files where magic bytes don't match extension
  - Rejects files exceeding 16MB
  - Rejects empty/missing file
  - Sanitizes filenames with path traversal attempts (`../../etc/passwd`)
- [ ] `upload.service.spec.ts`
  - Generates UUID v4 for each upload
  - Stores file to disk with sanitized name
  - Persists metadata (originalFilename, mimeType, size, path)
  - Handles concurrent uploads without ID collision
- [ ] `upload.controller.spec.ts` (integration)
  - `POST /api/upload` with valid image → 201 with image ID
  - `POST /api/upload` without file → 400
  - `POST /api/upload` with invalid type → 415
  - `POST /api/upload` with oversized file → 413

### Phase Gate

**Automated:**
```bash
npm test -- --testPathPattern="upload|file-validation"
# All upload + validation tests pass
```

**Smoke Test:**
```bash
# 1. Upload valid image → 201 with UUID
curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST http://localhost:3000/api/upload \
  -F "image=@test/fixtures/test-image.png" | jq .
# ✓ HTTP 201, body has id (UUID), filename, mimeType, size
# ✓ X-Request-Id header present

# 2. Verify file exists on disk
ls uploads/
# ✓ Stored file with sanitized name present

# 3. Upload invalid type → 415
curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST http://localhost:3000/api/upload \
  -F "image=@test/fixtures/fake-image.txt"
# ✓ HTTP 415, code: "INVALID_FILE_TYPE"

# 4. Upload no file → 400
curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST http://localhost:3000/api/upload
# ✓ HTTP 400, code: "MISSING_FILE"

# 5. Upload with path traversal filename → sanitized (no directory escape)
curl -s -X POST http://localhost:3000/api/upload \
  -F "image=@test/fixtures/test-image.png;filename=../../etc/passwd.png" | jq .filename
# ✓ Sanitized filename (no path separators)
```

**Git:**
```bash
git tag v0.1-upload -m "Image upload with validation, magic bytes, path traversal prevention"
```

### Review Findings Deferred to Later Phases

The following findings from the Phase 1 code review are intentionally deferred. Each item is tracked as a task in its target phase.

| Finding | Deferred To | Rationale |
|---------|-------------|-----------|
| Rate limiting on upload endpoint | Phase 8 (Task 1) | Already tracked: upload-specific 10 req/min limit |
| Polyglot file re-encoding (image/text confusion) | Phase 5 | Add re-encoding when file serving endpoint is built |
| Orphaned temp file periodic cleanup | Phase 8 (Task 8) | Add to CleanupService alongside image expiration |
| `initialAnalysis` column → JSONB + migration | Phase 3 | Wire AI response into upload; migration + type change together |
| Global filters/interceptors via DI tokens | Phase 8 (Task 11) | Already tracked: migrate to APP_FILTER/APP_INTERCEPTOR |
| SSE logging compatibility | Phase 4 | Verify LoggingInterceptor doesn't interfere with SSE streams |
| Swagger/OpenAPI decorators | Phase 9 (9A) | Already tracked: install @nestjs/swagger + decorators |
| Import path consistency audit | Phase 12 | Low priority, bundle in final polish pass |

---

## Phase 2: Mock AI Service

**Goal:** OpenAI-compatible mock service that returns correctly formatted responses for both vision analysis and chat.

**Reference Docs:** [TDD Sec 5.1](./technical-design.md#51-interface-contract) (IAiService interface), [TDD Sec 5.2](./technical-design.md#52-openai-response-format-non-streaming) (OpenAiChatCompletion — exact field spec), [TDD Sec 5.3](./technical-design.md#53-openai-streaming-format) (OpenAiStreamChunk — exact field spec), [TDD Sec 5.4](./technical-design.md#54-mock-response-generation) (context-aware responses), [TDD Sec 5.5](./technical-design.md#55-token-estimation) (token estimation), [ADR-005](./adr/005-ai-service-abstraction.md), [OpenAI Chat Completions API](https://platform.openai.com/docs/api-reference/chat/create) (upstream reference)

### Tasks
1. Define `IAiService` interface with TypeScript types
2. Define `OpenAiChatCompletion` and `OpenAiStreamChunk` interfaces
3. Create JSON Schema files for OpenAI response validation (`test/schemas/chat-completion.schema.json`, `test/schemas/stream-chunk.schema.json`)
4. Implement `MockAiService` (non-streaming)
   - `analyzeImage()` — returns vision analysis in Chat Completion format
   - `chat()` — returns context-aware response in Chat Completion format
5. Register `MockAiService` via DI token (`AI_SERVICE_TOKEN`)
6. Implement realistic ID generation (`chatcmpl-` + 29 alphanumeric chars)
7. Implement token estimation (characters / 4)
8. Implement context-aware response selection (varies based on history length)

### Tests to Write First
- [ ] `mock-ai.service.spec.ts`
  - `analyzeImage` returns valid `chat.completion` object
  - Response `id` matches pattern `chatcmpl-[a-zA-Z0-9]{29}`
  - `created` is a valid Unix timestamp (within 5 seconds of now)
  - `model` is `"gpt-4o"`
  - `choices[0].message.role` is `"assistant"`
  - `choices[0].finish_reason` is `"stop"`
  - `usage.total_tokens` equals `prompt_tokens + completion_tokens`
  - `usage.completion_tokens` is proportional to response content length
  - `chat` returns valid `chat.completion` object
  - `chat` with history > 2 messages returns a follow-up style response
  - All response fields are present (no undefined/null for required fields)
- [ ] `openai-format.spec.ts` (JSON Schema validation)
  - Non-streaming response validates against `chat-completion.schema.json`
  - Every required field is present with correct type
  - `id` format is correct (`chatcmpl-` prefix + 29 chars)
  - `usage` fields are non-negative integers that sum correctly
  - Schema validation catches missing fields (negative test: strip a field → schema rejects)
  - Schema validation catches wrong types (negative test: string where number expected → schema rejects)

### Phase Gate

**Automated:**
```bash
npm test -- --testPathPattern="mock-ai|openai-format"
# All mock AI + schema validation tests pass
# Schema tests prove format compliance programmatically, not just by field checking
```

**Smoke Test:**
```
Phase 2 has no HTTP endpoints — it's a service-only phase.
Verification is fully covered by automated tests.
Manual integration verification happens in Phase 3 when the chat endpoint calls this service.
```

**Git:**
```bash
git tag v0.2-mock-ai -m "Mock AI service with OpenAI-compatible format, JSON Schema validation"
```

### Review Findings Deferred to Later Phases

The following findings from the Phase 2 code review are intentionally deferred. Each item is tracked as a task in its target phase.

| Finding | Deferred To | Rationale |
|---------|-------------|-----------|
| Add ~50ms inter-chunk delay to `chatStream` for realistic latency simulation | Phase 4 (Task 1) | Delays are an SSE transport concern; word-by-word chunking is already implemented |
| Wire `AbortController` to client disconnect for streaming cancellation | Phase 4 (Task 3) | Requires HTTP controller context that doesn't exist until the SSE endpoint is built |
| Implement backpressure handling at `res.write`/`drain` boundary | Phase 4 (Task 4) | Transport-layer concern; the AsyncGenerator protocol supports this but wiring requires the SSE controller |
| Consider grapheme-safe chunking for Unicode/CJK content | Phase 4 (Task 1) | Current word-split is sufficient for English mock responses; real provider will emit its own token boundaries |

---

## Phase 3: Chat Endpoint

**Goal:** Users can send questions about uploaded images and receive AI responses.

**Reference Docs:** [PRD Sec 5.2](./PRD.md#52-conversational-chat-non-streaming) (requirements + response format), [TDD Sec 4.3](./technical-design.md#43-input-validation-via-dtos) (ChatRequestDto validation), [TDD Sec 5.2](./technical-design.md#52-openai-response-format-non-streaming) (expected OpenAI response shape)

### Tasks
1. Implement `ChatRequestDto` with class-validator decorators (`@IsString`, `@Transform(trim)`, `@IsNotEmpty`, `@MinLength(1)`, `@MaxLength(2000)`, custom error messages)
2. Implement `ChatService` (validates image exists, calls AI service)
3. Implement `ChatController` (`POST /api/chat/:imageId`) with `ParseUUIDPipe` on `imageId`
4. Wire up AI service injection via `AI_SERVICE_TOKEN`
5. Return OpenAI-compatible response format
6. Implement `PaginationQueryDto` with `@IsOptional`, `@IsInt`, `@Min(1)`, `@Max(50)` for future history endpoint
7. Wire initial AI analysis into upload flow: call `analyzeImage()` after file save, store JSON result in `initialAnalysis`
8. Migration: alter `initialAnalysis` from TEXT to JSONB (nullable, backward-compatible with existing null rows)
9. Update `UploadService` to populate `initialAnalysis` and return parsed object in response `analysis` field

### Tests to Write First
- [ ] `chat.controller.spec.ts` (integration)
  - `POST /api/chat/:imageId` with valid message → 200 with Chat Completion
  - `POST /api/chat/:imageId` with nonexistent image → 404
  - `POST /api/chat/:imageId` with empty message → 400
  - `POST /api/chat/:imageId` with message > 2000 chars → 400
  - `POST /api/chat/:imageId` with whitespace-only message → 400 (trimmed to empty)
  - `POST /api/chat/:imageId` with non-string message (number, array) → 400
  - `POST /api/chat/:imageId` with missing body → 400
  - `POST /api/chat/not-a-uuid` with malformed imageId → 400
  - Response format matches OpenAI Chat Completion exactly
  - Response includes `usage` field with token counts
  - Concurrent chat requests on different images → both succeed independently
  - Concurrent chat requests on same image → both succeed (no race condition)
- [ ] `chat.service.spec.ts`
  - Calls AI service with correct parameters
  - Throws NotFoundException for unknown image ID
  - Validates UUID format for imageId parameter

### Phase Gate

**Automated:**
```bash
npm test -- --testPathPattern="chat"
# All chat controller + service tests pass
```

**Smoke Test:**
```bash
# Prerequisite: upload an image and capture the ID
IMAGE_ID=$(curl -s -X POST http://localhost:3000/api/upload \
  -F "image=@test/fixtures/test-image.png" | jq -r .id)

# 1. Chat with valid message → 200 with OpenAI format
curl -s http://localhost:3000/api/chat/$IMAGE_ID \
  -H "Content-Type: application/json" \
  -d '{"message": "What is in this image?"}' | jq .
# ✓ HTTP 200
# ✓ .object == "chat.completion"
# ✓ .id starts with "chatcmpl-"
# ✓ .choices[0].message.role == "assistant"
# ✓ .choices[0].message.content is non-empty
# ✓ .usage.total_tokens == .usage.prompt_tokens + .usage.completion_tokens

# 2. Chat with nonexistent image → 404
curl -s http://localhost:3000/api/chat/00000000-0000-0000-0000-000000000000 \
  -H "Content-Type: application/json" \
  -d '{"message": "test"}' | jq .
# ✓ HTTP 404, code: "IMAGE_NOT_FOUND"

# 3. Chat with empty message → 400
curl -s http://localhost:3000/api/chat/$IMAGE_ID \
  -H "Content-Type: application/json" \
  -d '{"message": ""}' | jq .
# ✓ HTTP 400, code: "INVALID_MESSAGE"

# 4. Chat with bad UUID → 400
curl -s http://localhost:3000/api/chat/not-a-uuid \
  -H "Content-Type: application/json" \
  -d '{"message": "test"}' | jq .
# ✓ HTTP 400, code: "INVALID_UUID"

# 5. Chat with whitespace-only → 400
curl -s http://localhost:3000/api/chat/$IMAGE_ID \
  -H "Content-Type: application/json" \
  -d '{"message": "   "}' | jq .
# ✓ HTTP 400 (trimmed to empty → rejected)
```

**Git:**
```bash
git tag v0.3-chat -m "Chat endpoint with input validation, OpenAI response format"
```

---

## Phase 4: SSE Streaming

**Goal:** Chat responses stream token-by-token via Server-Sent Events.

**Reference Docs:** [PRD Sec 5.3](./PRD.md#53-real-time-streaming-chat) (requirements + SSE event format), [TDD Sec 5.3](./technical-design.md#53-openai-streaming-format) (OpenAiStreamChunk — exact field spec + event sequence), [TDD Sec 6.1–6.5](./technical-design.md#61-why-manual-sse-not-sse-decorator) (streaming implementation: manual SSE, backpressure, timeout, reconnection), [ADR-006](./adr/006-sse-streaming.md)

### Tasks
1. Add ~50ms inter-chunk delay to `MockAiService.chatStream` for realistic latency simulation
   - Word-by-word chunking already implemented in Phase 2
   - Add configurable delay between yields (0ms in test, ~50ms in dev)
   - Consider grapheme-safe chunking if Unicode/CJK content is needed (use `Intl.Segmenter`)
2. Implement streaming controller method (`POST /api/chat-stream/:imageId`)
   - Set SSE headers (`text/event-stream`, `no-cache`, `keep-alive`)
   - Write `data: {chunk}\n\n` for each chunk
   - Write `data: [DONE]\n\n` at end
3. Implement client disconnect detection (`req.on('close')`) with `AbortController`
   - Wire `AbortSignal` to generator consumption loop
   - Ensure generator cleanup via `try/finally` on abort
4. Implement backpressure handling (`res.write` / `drain` event)
   - Pause generator consumption when write buffer is full
   - Resume on `drain` event
5. Implement connection timeout (30 seconds)
6. Verify LoggingInterceptor compatibility with SSE streams (must not buffer or interfere with chunked responses)

### Tests to Write First
- [ ] `mock-ai.service.streaming.spec.ts` (delay-specific tests; structural streaming tests already in Phase 2's `mock-ai.service.spec.ts`)
  - `chatStream` yields chunks with configurable delay between them
  - Abort signal terminates stream mid-generation
  - Generator cleanup runs on abort (no resource leaks)
- [ ] `stream.controller.spec.ts` (integration)
  - `POST /api/chat-stream/:imageId` → 200 with `text/event-stream`
  - Response contains SSE-formatted events (`data: {...}\n\n`)
  - Stream ends with `data: [DONE]\n\n`
  - Nonexistent image → 404
  - Empty message → 400
  - Full response can be reconstructed from delta contents

### Phase Gate

**Automated:**
```bash
npm test -- --testPathPattern="stream|streaming"
# All streaming tests pass (unit + integration)
```

**Smoke Test:**
```bash
# Prerequisite: upload an image
IMAGE_ID=$(curl -s -X POST http://localhost:3000/api/upload \
  -F "image=@test/fixtures/test-image.png" | jq -r .id)

# 1. Stream response → verify SSE format
curl -s -N http://localhost:3000/api/chat-stream/$IMAGE_ID \
  -H "Content-Type: application/json" \
  -d '{"message": "Describe this image"}' 2>&1 | head -20
# ✓ Content-Type: text/event-stream
# ✓ Lines follow "data: {...}\n\n" format
# ✓ First chunk: delta.role == "assistant"
# ✓ Middle chunks: delta.content is a word/token
# ✓ Last line: "data: [DONE]"

# 2. Reconstruct full response from chunks
curl -s -N http://localhost:3000/api/chat-stream/$IMAGE_ID \
  -H "Content-Type: application/json" \
  -d '{"message": "Describe this image"}' 2>&1 \
  | grep "^data: {" \
  | sed 's/^data: //' \
  | jq -r '.choices[0].delta.content // empty' \
  | tr -d '\n'
# ✓ Produces a coherent, complete sentence

# 3. Verify all chunks share the same ID
curl -s -N http://localhost:3000/api/chat-stream/$IMAGE_ID \
  -H "Content-Type: application/json" \
  -d '{"message": "test"}' 2>&1 \
  | grep "^data: {" \
  | sed 's/^data: //' \
  | jq -r '.id' | sort -u | wc -l
# ✓ Output: 1 (all chunks share one ID)
```

**Git:**
```bash
git tag v0.4-streaming -m "SSE streaming with OpenAI chunk format, disconnect detection, backpressure"
```

### Review Findings Deferred to Later Phases

The following findings from the Phase 4 code review are intentionally deferred. Each item is tracked as a task in its target phase.

| Finding | Deferred To | Rationale |
|---------|-------------|-----------|
| Rate limiting on `/api/chat-stream` endpoint | Phase 8 (Task 1) | Already tracked: chat-stream shares the Chat rate limit tier (30 req/min) |
| Concurrent SSE connection cap per client IP | Phase 8 (Task 14) | Requires rate-limiting infrastructure from Phase 8; cap prevents resource exhaustion from many open streams |
| Helmet CSP nonce for SSE `connect-src` | Phase 10 (Task 17) | CSP only matters when a browser client exists; Phase 10 adds the React frontend |

---

## Phase 5: Conversation History, Gallery & Image Deletion

**Goal:** Each image maintains its own conversation thread. History informs AI responses. Gallery lists all images. Images can be deleted with full cleanup.

**Reference Docs:** [PRD Sec 5.4](./PRD.md#54-conversation-history-management) (history requirements + response format), [PRD Sec 5.5](./PRD.md#55-image-gallery-list-all-images) (gallery response format), [PRD Sec 5.6](./PRD.md#56-image-deletion) (deletion requirements + cascade), [TDD Sec 7.1](./technical-design.md#71-entity-definitions) (ChatMessageEntity), [TDD Sec 7.7](./technical-design.md#77-image-deletion) (deletion implementation), [TDD Sec 7.8](./technical-design.md#78-image-file-serving) (image file serving)

### Tasks
1. Create `ChatMessageEntity` with TypeORM decorators
2. Generate database migration for chat_messages table
3. Implement `HistoryService` (add message, get paginated history, cleanup)
4. Update `ChatService` to persist messages and pass history to AI
5. Update `MockAiService` to generate context-aware responses based on history length
6. Implement `GET /api/chat/:imageId/history?page=1&limit=20` endpoint with `PaginationQueryDto`
7. Implement history cap (50 messages per image)
8. Ensure both streaming and non-streaming persist to history (user message saved BEFORE stream starts)
9. Implement `GET /api/images` endpoint (paginated list with message counts for sidebar gallery)
10. Implement `DELETE /api/images/:imageId` endpoint (cascade delete messages, remove file, invalidate cache)
11. Implement `GET /api/images/:imageId/file` endpoint (serve uploaded image with proper Content-Type, 404 handling)
12. Validate served image Content-Type is derived from stored mimeType, not file extension (defense against polyglot files)

### Tests to Write First
- [ ] `history.service.spec.ts`
  - `addMessage` persists user and assistant messages
  - `getHistory` returns messages in chronological order
  - History is scoped per image (image A history doesn't leak into image B)
  - History cap at 50 messages — oldest messages dropped
  - Concurrent writes to different images don't interfere
- [ ] `history.controller.spec.ts` (integration)
  - `GET /api/chat/:imageId/history` → 200 with paginated message array
  - `GET /api/chat/:imageId/history?page=2&limit=5` → correct page of results
  - Response includes `totalMessages`, `page`, `pageSize`, `totalPages`
  - History includes messages from both chat and chat-stream endpoints
  - Messages have correct roles, content, and timestamps
  - Nonexistent image → 404
  - New image with no chats → 200 with empty messages array
  - Invalid pagination params (page=0, limit=100) → 400
- [ ] `gallery.controller.spec.ts` (integration)
  - `GET /api/images` → 200 with paginated image list
  - Each image includes `messageCount`
  - Images ordered by `createdAt` descending (newest first)
  - Empty database → 200 with empty images array
  - After upload → image appears in list
  - After delete → image removed from list
  - Pagination: `?page=2&limit=5` returns correct page
- [ ] `delete.controller.spec.ts` (integration)
  - `DELETE /api/images/:imageId` with valid image → 204 No Content
  - `DELETE /api/images/:nonexistent` → 404
  - After delete: `GET /api/chat/:imageId/history` → 404
  - After delete: image file removed from disk
  - After delete: cache invalidated (subsequent GET misses cache)
  - `DELETE /api/images/not-a-uuid` → 400
- [ ] `image-file.controller.spec.ts` (integration)
  - `GET /api/images/:imageId/file` with valid image → 200 with correct Content-Type
  - `GET /api/images/:nonexistent/file` → 404
  - `GET /api/images/not-a-uuid/file` → 400
  - Response includes `Content-Disposition` header
- [ ] `chat-with-history.spec.ts` (integration)
  - First chat → AI gets empty history
  - Second chat → AI gets previous exchange in history
  - Streaming chat → AI response persisted to history after stream completes

### Phase Gate

**Automated:**
```bash
npm test -- --testPathPattern="history|gallery|delete|chat-with-history"
# All history, gallery, delete, and history-integration tests pass
```

**Smoke Test:**
```bash
# 1. Full conversation flow
IMAGE_ID=$(curl -s -X POST http://localhost:3000/api/upload \
  -F "image=@test/fixtures/test-image.png" | jq -r .id)

curl -s http://localhost:3000/api/chat/$IMAGE_ID \
  -H "Content-Type: application/json" \
  -d '{"message": "What is this?"}' > /dev/null

curl -s http://localhost:3000/api/chat/$IMAGE_ID \
  -H "Content-Type: application/json" \
  -d '{"message": "Tell me more"}' > /dev/null

# 2. History shows all 4 messages (2 user + 2 assistant)
curl -s "http://localhost:3000/api/chat/$IMAGE_ID/history" | jq .totalMessages
# ✓ Output: 4

# 3. History has correct pagination fields
curl -s "http://localhost:3000/api/chat/$IMAGE_ID/history?page=1&limit=2" | jq '{page, pageSize, totalPages}'
# ✓ { page: 1, pageSize: 2, totalPages: 2 }

# 4. Gallery shows image with message count
curl -s http://localhost:3000/api/images | jq '.images[0] | {id, messageCount}'
# ✓ messageCount: 4

# 5. Delete → cascade cleanup
curl -s -o /dev/null -w "%{http_code}" -X DELETE http://localhost:3000/api/images/$IMAGE_ID
# ✓ HTTP 204

# 6. History returns 404 after deletion
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/chat/$IMAGE_ID/history
# ✓ HTTP 404

# 7. File removed from disk
ls uploads/ | grep -c "$IMAGE_ID" || echo "File gone ✓"
# ✓ File gone

# 8. Gallery no longer lists the image
curl -s http://localhost:3000/api/images | jq '.total'
# ✓ Output: 0
```

**Git:**
```bash
git tag v0.5-history -m "Conversation history, image gallery, deletion with cascade cleanup"
```

---

## Phase 6: Database Hardening

**Goal:** Optimize database layer with indexes, locking, retry logic, and production-grade connection management.

**Reference Docs:** [TDD Sec 7.1–7.6](./technical-design.md#71-entity-definitions) (entities, indexes, TypeORM config, migrations, connection lifecycle, withRetry), [ADR-002](./adr/002-database.md) (PostgreSQL selection + connection pool config)

### Tasks
1. Verify `ImageEntity` is properly configured with `@VersionColumn()` (ChatMessageEntity is append-only — no locking needed)
2. Generate and verify database migrations
3. Add indexes: `imageId` on chat_messages, `createdAt` on both tables
4. Verify cascade delete (deleting image removes all messages)
5. Configure connection pooling (max 20, idle timeout 30s)
6. Configure `retryAttempts: 10` and `retryDelay: 3000` in TypeORM config for startup retry
7. Implement `withRetry` utility for transient DB failure retry in services
8. Implement graceful shutdown (close DB connections on SIGTERM/SIGINT)
9. Add database connectivity check to health endpoint
10. Test optimistic locking — concurrent updates to same entity should throw `OptimisticLockVersionMismatchError`

### Tests to Write First
- [ ] `database.integration.spec.ts`
  - Migrations run cleanly on fresh database
  - Image CRUD operations work through TypeORM
  - Message CRUD operations work through TypeORM
  - Cascade delete: removing image removes all associated messages
  - Index exists on `chat_messages.imageId`
  - Connection pool handles concurrent requests
- [ ] `locking.spec.ts`
  - Concurrent update to same image → `OptimisticLockVersionMismatchError` on stale version
  - Sequential updates increment version correctly
  - `@VersionColumn` is present on ImageEntity
- [ ] `retry.spec.ts`
  - `withRetry` retries on transient error
  - `withRetry` respects max attempts
  - `withRetry` uses exponential backoff
  - `withRetry` passes through on first success
- [ ] `health.controller.spec.ts` (updated)
  - Health endpoint reports database connectivity status

### Phase Gate

**Automated:**
```bash
npm test -- --testPathPattern="database|locking|retry|health"
# All DB hardening tests pass
```

**Smoke Test:**
```bash
# 1. Health endpoint shows DB connected
curl -s http://localhost:3000/api/health | jq .checks.database
# ✓ "connected"

# 2. Startup retry works (stop DB → start app → start DB → app connects)
docker-compose stop db
npm run start:dev &  # App starts, logs retry attempts
sleep 5
docker-compose start db
sleep 15
curl -s http://localhost:3000/api/health | jq .checks.database
# ✓ "connected" (app retried and connected after DB came up)
# Kill the background app process after test

# 3. Graceful shutdown (no hanging connections)
# Start app, upload image, then send SIGTERM
# ✓ App logs "Database connection closed" on shutdown
# ✓ Process exits cleanly (exit code 0)

# 4. Version column increments on update
# Upload an image, note the version, update it, check version incremented
# (Verified primarily via automated locking tests — manual check is supplementary)
```

**Git:**
```bash
git tag v0.6-hardened-db -m "Database hardening: indexes, optimistic locking, retry, connection pooling"
```

---

## Phase 7: Caching Layer

**Goal:** Reduce database reads for frequently accessed data.

**Reference Docs:** [TDD Sec 8.1–8.5](./technical-design.md#81-cache-layer-design) (cache design, keys/TTLs, write-through invalidation, scalability path), [ADR-007](./adr/007-caching-strategy.md)

### Tasks
1. Install `@nestjs/cache-manager@^3.0.0` and `cache-manager@^5.0.0`
2. Add `CACHE_MANAGER` mock to all 12 existing test files that use HistoryService or ImagesService (prerequisite — must pass before any service changes)
3. Configure NestJS CacheModule (in-memory, TTL: 5min/300_000ms, max: 100 items, `isGlobal: true`)
4. Create `src/cache/cache-keys.ts` — centralized cache key constants
5. Add cache to `HistoryService.getHistory()` (key: `history:{imageId}`, page 1 + default limit only)
6. Add cache to `HistoryService.getRecentMessages()` (key: `recent:{imageId}`, default count=50 only)
7. Add cache to `ImagesService.getImageForServing()` (key: `image:{imageId}`, TTL 10min — **cache ImageEntity only, NOT ReadStream**)
8. Add `HistoryService.invalidateCache(imageId)` — single public method for history/recent cache invalidation
9. Implement write-through invalidation: `addMessage`, `enforceHistoryCap` (when deleting), `deleteByImageId`, `deleteImage` (cross-service via `invalidateCache`)
10. Wrap all cache `get`/`set`/`del` in try/catch — failures logged, never re-thrown (Redis readiness)
11. Add cache-related logging (hit/miss/invalidation for debugging)
12. Fix `technical-design.md:853` TTL from `300` to `300_000` (ms, not seconds)
13. Update ADR-007 key patterns to document flat key simplification

> **Key design decisions:** Flat cache keys matching ADR-007 (no paginated keys, no key tracker Map). Pages 2+ and non-default counts go to DB uncached. `CacheInterceptor`/decorators rejected in favor of manual cache-aside for invalidation control. See [detailed plan](/Users/armandojimenez/.claude/plans/phase-7-caching-layer.md).

### Tests to Write First
- [ ] Add `CACHE_MANAGER` mock to all 12 existing test files (3 unit + 9 integration) — verify `npm test` passes
- [ ] `cache.integration.spec.ts`
  - First call to getHistory → cache miss → DB query
  - Second call to getHistory → cache hit → no DB query
  - getHistory with non-default pagination → always DB (not cached)
  - Adding a message → cache invalidated
  - Next getHistory call → cache miss → fresh DB query
  - Cache respects TTL (short TTL + real delay, NOT jest.useFakeTimers — incompatible with lru-cache)
  - Cache respects max size (LRU eviction)
  - getRecentMessages — miss/hit/invalidation pattern (default count only)
  - getRecentMessages with non-default count → always DB
  - image:{imageId} — entity cached, ReadStream created fresh each time
  - deleteImage → invalidates image, history, and recent keys
  - Different imageIds don't cross-contaminate cache
  - enforceHistoryCap → cache invalidated when messages deleted, no-op when within cap
  - deleteByImageId → cache invalidated
  - Cache get/set failure → falls through to DB, does not throw
  - invalidateCache for non-existent imageId → no-op, no error
  - addMessage for imageId A does not invalidate imageId B's cache

### Phase Gate

**Automated:**
```bash
npm test -- --testPathPattern="cache"
# All cache tests pass
```

**Smoke Test:**
```bash
# 1. Upload image and chat, then check history twice — watch logs for cache behavior
IMAGE_ID=$(curl -s -X POST http://localhost:3000/api/upload \
  -F "image=@test/fixtures/test-image.png" | jq -r .id)

curl -s http://localhost:3000/api/chat/$IMAGE_ID \
  -H "Content-Type: application/json" \
  -d '{"message": "test"}' > /dev/null

# First history call → cache MISS (check server logs)
curl -s "http://localhost:3000/api/chat/$IMAGE_ID/history" > /dev/null
# ✓ Server log: "Cache MISS for history:<imageId>"

# Second history call → cache HIT (check server logs)
curl -s "http://localhost:3000/api/chat/$IMAGE_ID/history" > /dev/null
# ✓ Server log: "Cache HIT for history:<imageId>"

# 2. Send another message → cache invalidated
curl -s http://localhost:3000/api/chat/$IMAGE_ID \
  -H "Content-Type: application/json" \
  -d '{"message": "another"}' > /dev/null

# Next history call → cache MISS again (invalidated by new message)
curl -s "http://localhost:3000/api/chat/$IMAGE_ID/history" > /dev/null
# ✓ Server log: "Cache MISS for history:<imageId>"
```

**Git:**
```bash
git tag v0.7-cache -m "In-memory caching with write-through invalidation, Redis-ready abstraction"
```

### Review Findings Deferred to Later Phases

The following findings from the Phase 7 code review are intentionally deferred. Each item is tracked as a task in its target phase.

| Finding | Deferred To | Rationale |
|---------|-------------|-----------|
| CleanupService cache invalidation (call `invalidateCache` + `del('image:{id}')` per deleted image) | Phase 8 (Task 8) | CleanupModule is still a stub; `invalidateCache()` method will be ready from Phase 7 |
| `listImages()` / `getMessageCountBatch()` caching | Not planned | Volatile data (uploads/deletes), cache invalidation complexity for multi-entity paginated results not justified for MVP |
| In-memory store serialization behavior (returns same object reference, no round-trip) | Redis upgrade path | When switching to Redis, cached data will be serialized — class instances become plain objects. Acceptable for MVP. |

---

## Phase 8: Production Hardening

**Goal:** Rate limiting, security headers, structured logging, health check.

**Reference Docs:** [TDD Sec 9.1–9.4](./technical-design.md#91-defense-layers) (security layers, rate limiting config, file upload security), [TDD Sec 10.1–10.3](./technical-design.md#101-structured-logging) (logging, health check, request monitoring), [TDD Sec 8.6](./technical-design.md#86-scheduled-data-cleanup) (cleanup cron with active session guard), [ADR-008](./adr/008-rate-limiting.md)

### Tasks

> **Note:** Tasks 2–7 were already implemented in Phase 0. This phase focuses on rate limiting, cleanup, and remaining hardening.

1. Install and configure `@nestjs/throttler`
   - Global: 100 req/min, 3 req/sec
   - Upload: 10 req/min (stricter)
   - Chat + Chat-Stream: 30 req/min (shared tier)
   - Health: exempt
2. ~~Install and configure `helmet` security headers~~ *(done in Phase 0)*
3. ~~Configure CORS (permissive in dev, restrictive in prod)~~ *(done in Phase 0)*
4. ~~Implement `LoggingInterceptor` with correlation IDs~~ *(done in Phase 0)*
5. ~~Implement `GET /api/health` with DB connectivity check~~ *(done in Phase 0)*
6. ~~Enable `app.enableShutdownHooks()` for graceful shutdown~~ *(done in Phase 0)*
7. ~~Ensure no stack traces leak in production error responses~~ *(done in Phase 0)*
8. Install `@nestjs/schedule`, implement `CleanupService` with `@Cron(EVERY_HOUR)` for 24-hour data expiration and orphaned temp file cleanup (`.tmp-*` files older than 1 hour in UPLOAD_DIR). **Cache invalidation:** For each deleted image, call `historyService.invalidateCache(imageId)` and `cacheManager.del('image:{imageId}')` — the `invalidateCache()` method is available from Phase 7
9. Set `trust proxy` in main.ts so rate limiting uses real client IPs: `app.getHttpAdapter().getInstance().set('trust proxy', 1)`
10. Add `RATE_LIMIT_TTL`, `RATE_LIMIT_MAX`, and `ALLOWED_ORIGIN` to ConfigModule Joi validation schema
11. Migrate HttpExceptionFilter and LoggingInterceptor from `new` instantiation to `APP_FILTER`/`APP_INTERCEPTOR` DI provider tokens
12. ~~Add JSON body size limit (`app.use(json({ limit: '1mb' }))`)~~ *(done in Phase 4 hardening)*
13. Add message content sanitization: strip control characters (U+0000–U+001F except whitespace), validate no null bytes — prevents log injection and storage corruption
14. Add concurrent SSE connection cap per client IP (e.g., max 5 open streams) — prevents resource exhaustion from many simultaneous streaming connections. Implement as a NestJS guard on `StreamController`

### Tests to Write First
- [ ] `rate-limiting.spec.ts`
  - Exceeding global rate limit → 429
  - Exceeding upload rate limit → 429
  - Exceeding chat-stream rate limit → 429
  - Health endpoint not rate-limited
  - Rate limit headers present in response
  - Concurrent SSE connection cap exceeded → 429 (max 5 per client IP)
- [ ] `security.spec.ts`
  - Helmet headers present (X-Content-Type-Options, X-Frame-Options, etc.)
  - CORS headers correct for configured origin
  - Error responses don't contain stack traces
  - Unknown routes return 404 (not framework default page)
  - JSON body larger than 1MB → 413
  - Message with control characters is sanitized or rejected
- [ ] `logging.spec.ts`
  - Requests are logged with correlation ID
  - Response time is logged
  - Error responses are logged
- [ ] `cleanup.service.spec.ts`
  - Cleanup removes images older than 24 hours
  - Cleanup removes associated messages (cascade)
  - Cleanup removes files from disk
  - Cleanup invalidates cache for removed images
  - Cleanup skips images within TTL
  - Cleanup skips images with recent chat activity
  - Cleanup removes orphaned `.tmp-*` files older than 1 hour
  - Cleanup skips recent `.tmp-*` files (in-progress uploads)

### Phase Gate

**Automated:**
```bash
npm test -- --testPathPattern="rate-limiting|security|cleanup|logging"
# All production hardening tests pass
```

**Smoke Test:**
```bash
# 1. Rate limiting works — rapid-fire upload requests
for i in {1..12}; do
  curl -s -o /dev/null -w "%{http_code} " -X POST http://localhost:3000/api/upload \
    -F "image=@test/fixtures/test-image.png"
done
echo ""
# ✓ First 10 return 201, then 429 (upload limit: 10/min)

# 2. Rate limit headers present
curl -sI -X POST http://localhost:3000/api/upload \
  -F "image=@test/fixtures/test-image.png" | grep -i "x-ratelimit"
# ✓ X-RateLimit-Limit and X-RateLimit-Remaining headers present

# 3. Health endpoint is NOT rate limited
for i in {1..120}; do
  curl -s -o /dev/null http://localhost:3000/api/health
done
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/health
# ✓ Still 200 (health is exempt)

# 4. Security headers present
curl -sI http://localhost:3000/api/health | grep -iE "x-content-type|x-frame|strict-transport|x-request-id"
# ✓ X-Content-Type-Options: nosniff
# ✓ X-Frame-Options: SAMEORIGIN
# ✓ X-Request-Id: <uuid>

# 5. Error responses contain no stack traces
curl -s http://localhost:3000/api/chat/bad-uuid \
  -H "Content-Type: application/json" \
  -d '{"message":"test"}' | jq .
# ✓ No "stack", "trace", or file paths in response body

# 6. Structured log output
# ✓ Check server stdout: logs contain [requestId] METHOD URL — STATUS — DURATIONms
```

**Git:**
```bash
git tag v0.8-hardened -m "Production hardening: rate limiting, Helmet, logging, cleanup cron"
```

---

## Phase 9: API Documentation & Testing Tools

**Goal:** Three ways to explore and test the API.

**Reference Docs:** [PRD Sec 5.1–5.6](./PRD.md#5-feature-requirements) (all endpoint response formats for Swagger schemas), [TDD Sec 4.1–4.3](./technical-design.md#41-rest-conventions) (REST conventions, error format, DTOs)

### Tasks

#### 9A: Swagger/OpenAPI (Interactive Docs)
1. Install `@nestjs/swagger`
2. Add `SwaggerModule.setup('api/docs', app, document)` to bootstrap
3. Add `@ApiTags`, `@ApiOperation`, `@ApiResponse`, `@ApiBody` decorators to all controllers
4. Add `@ApiProperty` to all DTOs
5. Configure Swagger metadata (title, description, version)

#### 9B: Postman Collection
1. Create `docs/inksight.postman_collection.json`
2. Include all endpoints with:
   - Pre-configured request bodies
   - Example responses
   - Environment variable for `base_url` (`{{base_url}}`)
   - Collection-level description with setup instructions
3. Create `docs/inksight.postman_environment.json` (localhost:3000)
4. Add collection runner order: upload → chat → stream → history → gallery → delete

#### 9C: API Test Script
1. Create `scripts/test-api.sh`
   - Automated curl-based test of all endpoints
   - Colored output (green pass, red fail)
   - Tests the full flow: upload → chat → stream → history → gallery → delete → health
   - Captures and validates response status codes and response headers
   - Displays response bodies for inspection
   - Executable with `chmod +x scripts/test-api.sh`

### Phase Gate

**Automated:**
```
No additional automated tests for this phase — Swagger and Postman are documentation artifacts.
The test script (scripts/test-api.sh) is itself a manual verification tool.
```

**Smoke Test:**
```bash
# 1. Swagger loads and shows all endpoints
open http://localhost:3000/api/docs
# ✓ All 8 endpoints listed (upload, images, image-file, chat, chat-stream, history, delete, health)
# ✓ DTOs show validation constraints
# ✓ Response schemas match our format
# ✓ "Try it out" works for each endpoint

# 2. Postman collection runs successfully
# Import docs/inksight.postman_collection.json → Run Collection
# ✓ All requests return expected status codes
# ✓ Variables (base_url, imageId) chain correctly between requests

# 3. API test script passes
./scripts/test-api.sh
# ✓ All steps green
# ✓ Full flow: upload → chat → stream → history → gallery → delete → health
```

**Git:**
```bash
git tag v0.9-api-docs -m "Swagger, Postman collection, and API test script"
```

---

## Phase 10: React Client

**Goal:** Full web client with upload, chat, streaming, and image gallery.

**Reference Docs:** [TDD Sec 11.1–11.4](./technical-design.md#111-component-tree) (component tree, state management, SSE client with retry, build integration), [UI Design Spec](./ui-design-spec.md) (visual design, tokens, component specs, accessibility), [ADR-003](./adr/003-frontend-framework.md), [ADR-004](./adr/004-styling.md), [ADR-006](./adr/006-sse-streaming.md) (client-side SSE approach: `fetch` + `ReadableStream`, not `EventSource`)

### Tasks
1. Set up component structure per UI Design Spec
2. Import `tokens.css` as the design token source
3. Configure Tailwind with token values
4. Install shadcn/ui components: Button, Input, Toast, Dialog, ScrollArea
5. Implement `UploadView` — drag-and-drop with progress and validation
6. Implement `ChatView` — message list with streaming support
7. Implement `Sidebar` — image gallery with selection
8. Implement `useStreamingChat` hook (fetch + ReadableStream SSE parsing + exponential backoff retry on stream failure)
9. Implement optimistic updates (user message appears before server confirms)
10. Implement error handling with toast notifications
11. Implement suggested questions for empty chat state
12. Implement responsive layout (sidebar collapses on mobile)
13. Implement keyboard shortcuts (Enter to send, Escape to close sidebar)
14. Add loading skeletons for initial data fetches
15. Implement image deletion from sidebar (confirmation dialog → `DELETE /api/images/:id` → remove from list)
16. Test accessibility: tab navigation, screen reader, focus management
17. Configure Helmet CSP `connect-src` directive to allow SSE connections from the React client origin — required for `fetch`-based streaming to work under a Content Security Policy

### Component Test Plan
- [ ] `client/src/__tests__/UploadView.test.tsx` — renders dropzone, handles drag events, shows progress, shows errors, rejects invalid file types client-side
- [ ] `client/src/__tests__/ChatView.test.tsx` — renders messages, auto-scrolls, handles streaming, shows suggested questions on empty state
- [ ] `client/src/__tests__/Sidebar.test.tsx` — renders image list, handles selection, shows active state, delete button triggers confirmation
- [ ] `client/src/__tests__/ChatInput.test.tsx` — validates input, handles Enter/Shift+Enter, trims whitespace, disables during streaming
- [ ] `client/src/__tests__/useStreamingChat.test.ts` — parses SSE events, accumulates tokens, handles errors, retries on stream failure with exponential backoff
- [ ] `client/src/__tests__/ToastNotifications.test.tsx` — success/error/warning/info variants render correctly, auto-dismiss for success

### Phase Gate

**Automated:**
```bash
cd client && npm test
# All 6 component/hook test files pass
```

**Smoke Test (browser):**
```
Open http://localhost:3000 in Chrome and verify:

Upload flow:
  ✓ Drag-and-drop zone visible with instructions
  ✓ Drag a PNG over the zone → visual feedback (border changes)
  ✓ Drop the file → upload progress indicator appears
  ✓ Upload completes → initial AI analysis displayed
  ✓ Transition to chat view is smooth

Chat flow:
  ✓ Image thumbnail/preview visible at top
  ✓ Suggested questions appear on empty state
  ✓ Type a message → send with Enter
  ✓ User message appears immediately (optimistic update, right-aligned)
  ✓ Streaming indicator shows (pulsing dots)
  ✓ Assistant response streams in token-by-token (left-aligned, AI teal background)
  ✓ Auto-scroll follows the streaming response
  ✓ After stream completes, message is fully rendered

Sidebar & Gallery:
  ✓ Uploaded image appears in sidebar with filename and message count
  ✓ Upload a second image → appears in sidebar
  ✓ Click between images → chat view switches, history loads
  ✓ Delete button → confirmation dialog → image removed from list

Responsive:
  ✓ Resize to 375px width → sidebar collapses
  ✓ Hamburger menu → opens sidebar as overlay
  ✓ Escape closes sidebar overlay

Keyboard:
  ✓ Tab navigates through interactive elements
  ✓ Enter submits message
  ✓ Focus ring visible on all interactive elements

Error handling:
  ✓ Upload invalid file → error toast appears
  ✓ Toast auto-dismisses for success, persists for errors
```

**Git:**
```bash
git tag v0.10-client -m "React client: upload, chat, streaming, gallery, responsive, accessible"
```

---

## Phase 11: E2E Tests

**Goal:** Full end-to-end test suite covering the complete user journey.

**Reference Docs:** [TDD Sec 12.1–12.4](./technical-design.md#121-test-structure) (test structure, mock AI testing, mocking strategy, E2E flow), [ADR-009](./adr/009-testing.md)

### Tasks
1. Write E2E test: full upload → chat → stream → history flow
2. Write E2E test: concurrent uploads
3. Write E2E test: concurrent chats on different images
4. Write E2E test: error scenarios (invalid file, missing image, rate limiting)
5. Write E2E test: streaming with client disconnect
6. Run full test suite with coverage report

### E2E Test Scenarios
- [ ] Upload image → chat → get history → verify all messages present
- [ ] Upload image → stream → verify complete response reconstructable from chunks
- [ ] Upload image → multiple chats → verify history grows and pagination works
- [ ] Upload two images → chat on both → verify histories are independent
- [ ] Upload image → chat → delete image → verify 404 on history + chat + file removed
- [ ] Upload invalid file → verify proper error response
- [ ] Chat on nonexistent image → verify 404
- [ ] Chat with whitespace-only message → verify 400
- [ ] Chat with non-UUID imageId → verify 400
- [ ] Exceed rate limit → verify 429
- [ ] Health check → verify database status reported
- [ ] Concurrent streams on different images → verify both complete correctly

### Phase Gate

**Automated:**
```bash
npm run test:e2e
# All 12 E2E scenarios pass

npm run test:cov
# Coverage report:
#   Overall: ≥ 85%
#   Mock AI Service: 100%
#   Pipes / Guards / Filters: ≥ 95%
#   Services: ≥ 90%
#   Controllers: ≥ 85%
```

**Smoke Test:**
```
E2E tests ARE the smoke test for this phase — they exercise the full HTTP stack.
Verify that coverage thresholds are met by inspecting the coverage report output.
Additionally, run the API test script one more time to confirm no regressions:

  ./scripts/test-api.sh
  # ✓ All green
```

**Git:**
```bash
git tag v0.11-e2e -m "E2E test suite, 85%+ coverage across all modules"
```

---

## Phase 12: Final Polish

**Goal:** README, code cleanup, and final review.

**Reference Docs:** [TDD Sec 13.1](./technical-design.md#131-single-command-experience) (developer experience), [TDD Sec 14](./technical-design.md#14-future-considerations) (future considerations for README mention), [ADR-010](./adr/010-project-structure.md)

### Tasks
1. Write comprehensive README.md
   - Project overview and architecture
   - Quick start: `docker-compose up`
   - API documentation link (`/api/docs`)
   - Testing instructions (Swagger, Postman, script, Jest)
   - Design decisions summary (link to ADRs)
   - AI tools disclosure (link to `docs/ai-tools.md`)
   - Project structure overview
2. Audit and normalize import paths across all source files (consistent `@/` alias usage)
3. Verify all tests pass
3. Verify Docker Compose builds and runs from clean state
4. Verify `npm start` serves both API and React client
5. Remove any dead code, console.logs, TODOs
6. Run final code review
7. Generate test coverage report
8. Create final git tag

### README Structure
```
# Inksight
Quick description + screenshot

## Quick Start
docker-compose up → open localhost:3000

## Architecture
High-level diagram + link to docs/

## API
Link to Swagger at /api/docs

## Testing
How to run: Jest, Postman, script

## Design Decisions
Link to ADRs

## AI Tools Used
Link to docs/ai-tools.md

## Project Structure
Tree of key files
```

### Phase Gate (Final)

**Automated:**
```bash
# Full test suite from clean state
npm test                          # Unit + integration: all pass
npm run test:e2e                  # E2E: all pass
npm run test:cov                  # Coverage: ≥ 85%
cd client && npm test             # Client tests: all pass
```

**Smoke Test (clean-room verification):**
```bash
# Simulate a fresh clone — the most important test
docker-compose down -v            # Destroy all state
rm -rf uploads/*                  # Clean uploads
docker-compose up --build -d      # Build and start from scratch

# Wait for healthy
until curl -sf http://localhost:3000/api/health > /dev/null; do sleep 2; done

# Verify everything works
open http://localhost:3000           # ✓ React UI loads
open http://localhost:3000/api/docs  # ✓ Swagger loads with all endpoints
./scripts/test-api.sh               # ✓ All green

# Full manual walkthrough
# ✓ Upload image via UI → analysis appears
# ✓ Chat → streaming response
# ✓ Upload second image → appears in sidebar
# ✓ Switch between images → histories are independent
# ✓ Delete image → cascade cleanup
# ✓ Check response headers: X-Request-Id, Content-Type, rate limit headers
# ✓ README is clear, links work, architecture diagram is accurate
# ✓ git log shows clean, phased progression with descriptive tags
```

**Git:**
```bash
git tag v1.0 -m "Inksight v1.0 — Production-ready visual assistant API"
```

---

## Appendix A: Test File Index

| File | Phase | Scope |
|------|-------|-------|
| `test/unit/app.module.spec.ts` | 0 | All modules load without error |
| `test/unit/health.controller.spec.ts` | 0, 6 | Health endpoint, DB connectivity status |
| `test/unit/http-exception.filter.spec.ts` | 0 | Consistent error format with code, requestId, timestamp |
| `test/unit/file-validation.pipe.spec.ts` | 1 | File type, magic bytes, size |
| `test/unit/upload.service.spec.ts` | 1 | File storage, metadata |
| `test/integration/upload.controller.spec.ts` | 1 | Upload HTTP lifecycle |
| `test/unit/mock-ai.service.spec.ts` | 2 | OpenAI response format |
| `test/unit/openai-format.spec.ts` | 2 | JSON Schema validation |
| `test/unit/chat.service.spec.ts` | 3 | Chat orchestration |
| `test/integration/chat.controller.spec.ts` | 3 | Chat HTTP lifecycle + input validation depth |
| `test/unit/mock-ai.service.streaming.spec.ts` | 4 | Streaming chunk format + schema validation |
| `test/integration/stream.controller.spec.ts` | 4 | SSE HTTP lifecycle |
| `test/unit/history.service.spec.ts` | 5 | History CRUD, limits, pagination |
| `test/integration/history.controller.spec.ts` | 5 | History HTTP lifecycle + pagination |
| `test/integration/gallery.controller.spec.ts` | 5 | Image list, pagination, message counts |
| `test/integration/delete.controller.spec.ts` | 5 | Image deletion, cascade, file cleanup, cache invalidation |
| `test/integration/image-file.controller.spec.ts` | 5 | Image file serving, Content-Type, 404 |
| `test/integration/chat-with-history.spec.ts` | 5 | History integration |
| `test/integration/database.integration.spec.ts` | 6 | Migration, CRUD, cascade |
| `test/unit/locking.spec.ts` | 6 | Optimistic locking via @VersionColumn |
| `test/unit/retry.spec.ts` | 6 | withRetry utility (backoff, max attempts) |
| `test/integration/cache.integration.spec.ts` | 7 | Cache hit/miss/invalidation |
| `test/integration/rate-limiting.spec.ts` | 8 | Throttle behavior |
| `test/integration/security.spec.ts` | 8 | Headers, CORS, error leaks |
| `test/unit/cleanup.service.spec.ts` | 8 | Scheduled data cleanup (24hr TTL + active session guard) |
| `test/unit/logging.interceptor.spec.ts` | 8 | Request logging, correlation IDs, response time |
| `client/src/__tests__/UploadView.test.tsx` | 10 | Upload dropzone, drag, progress, errors |
| `client/src/__tests__/ChatView.test.tsx` | 10 | Messages, auto-scroll, streaming |
| `client/src/__tests__/Sidebar.test.tsx` | 10 | Image list, selection, delete |
| `client/src/__tests__/ChatInput.test.tsx` | 10 | Input validation, keyboard shortcuts |
| `client/src/__tests__/useStreamingChat.test.ts` | 10 | SSE parsing, retry, error handling |
| `client/src/__tests__/ToastNotifications.test.tsx` | 10 | Toast variants, auto-dismiss |
| `test/e2e/app.e2e-spec.ts` | 11 | Full journey |
| `test/schemas/chat-completion.schema.json` | 2 | OpenAI non-streaming response schema |
| `test/schemas/stream-chunk.schema.json` | 2 | OpenAI streaming chunk schema |

---

## Appendix B: Test Pyramid

```
         ┌───────────┐
         │   E2E     │  1 file, 12 scenarios
         │  (Jest +  │  Full HTTP lifecycle
         │ Supertest)│  Real DB, real cache
         ├───────────┤
         │Integration│  12 files
         │  (Jest +  │  Controller + Service + DB
         │ Supertest)│  Mocked AI service
     ┌───┤───────────┤
     │   │   Unit    │  14 files
     │   │  (Jest)   │  Isolated services
     │   │           │  All deps mocked
     ├───┤───────────┤
     │   │  Client   │  6 files
     │   │  (Vitest/ │  React components
     │   │   RTL)    │  API calls mocked
     ├───┤───────────┤
     │   │  Schema   │  2 JSON Schema files
     │   │Validation │  OpenAI format compliance
     │   │           │  Programmatic proof
     └───┴───────────┘
```

**Total:** 33 test files + 2 JSON Schema files = **35 test artifacts**

---

## Appendix C: Developer Experience Summary

When a developer clones this project, their experience is:

```
1. Reads README.md                   → Understands architecture in 2 minutes
2. docker-compose up                 → PostgreSQL health-checks → app starts (zero config)
3. Opens localhost:3000              → Sees polished React UI
4. Uploads an image                  → Gets AI analysis
5. Sees image in gallery sidebar     → GET /api/images powers the list
6. Chats about the image             → Gets streaming response with retry on failure
7. Deletes an image                  → Cascade cleanup (messages, file, cache)
8. Opens localhost:3000/api/docs     → Interactive Swagger docs
9. Imports Postman collection        → Tests every endpoint including DELETE
10. Runs ./scripts/test-api.sh       → Sees full flow verified
11. npm test                         → 85%+ coverage, all green (locking, retry, validation tests)
12. Reads docs/adr/                  → Sees deliberate decisions with trade-off summaries
13. Reads git log                    → Sees clean, phased progression
14. Checks .github/workflows/ci.yml  → CI pipeline validates every commit
15. Checks X-Request-Id headers      → Every response traceable in logs
```

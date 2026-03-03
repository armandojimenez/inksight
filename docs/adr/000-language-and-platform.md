# ADR-000: Language & Platform — TypeScript + Node.js over Python + Flask

**Status:** Accepted
**Date:** March 2, 2026

---

## Context

The starting point for Inksight is a Flask/Python template (`app.py`) that scaffolds a visual assistant API with three endpoint stubs (`/upload`, `/chat/<image_id>`, `/chat-stream/<image_id>`), an in-memory dict for storage, and placeholder mock functions for OpenAI responses. The template uses `app.run(debug=True, threaded=True)` for concurrency.

Before writing any code, we evaluated whether Flask/Python was the strongest foundation for the full scope of the product — or whether a different platform would yield a better result.

---

## The Question We Asked

> For an application whose core challenges are SSE streaming, concurrent real-time connections, a React frontend, database persistence with an ORM, and production-grade API patterns (validation, DI, rate limiting, error handling) — and whose AI layer is entirely mocked with no image processing — what platform produces the best engineered result?

---

## What This Application Actually Does With Images

Inksight's relationship with images is:

1. **Receive** a file upload (multipart form data)
2. **Validate** file type (extension check + magic byte verification)
3. **Store** the file to disk (write bytes to filesystem)
4. **Return** a mock text response (hardcoded string, identical regardless of image content)

There is **no image processing**. No pixel manipulation, no computer vision, no feature extraction, no model inference. The AI layer returns a static text response after a simulated delay. Python's dominance in ML/CV (PyTorch, TensorFlow, OpenCV, PIL/Pillow) provides zero advantage here because none of those libraries are used.

If the AI layer were real, it would be an HTTP POST to the OpenAI API — an operation identical from Node.js or Python.

---

## Options Considered

### Option A: Flask (Python) — The Provided Template

**Pros:**
- Template is provided — zero setup time for the initial scaffold
- Python is widely readable and concise for simple scripts
- SQLAlchemy is a mature, powerful ORM
- The Flask ecosystem has libraries for most needs (flask-limiter, flask-cors, marshmallow)

**Cons:**

1. **SSE streaming is fundamentally awkward in Flask.**
   Flask runs on WSGI, a synchronous protocol. The template uses `threaded=True`, which spawns a thread per request. For SSE streaming — where a connection stays open for the duration of the response — each streaming client holds a thread for the entire stream lifetime. Under concurrent streaming (which is an explicit requirement), this leads to thread pool exhaustion.

   The standard workaround is to switch to an ASGI framework (Quart, FastAPI) or use `gevent`/`eventlet` monkey-patching — but both approaches abandon Flask's threading model, defeating the purpose of starting with the Flask template.

   Node.js handles this natively. Its event loop processes thousands of concurrent long-lived connections on a single thread without any special configuration.

2. **No built-in application structure.**
   Flask is a micro-framework by design. For the scope of Inksight (6 modules, 15+ endpoints, validation, DI, caching, rate limiting, scheduled tasks, error handling), the Flask approach requires assembling independent libraries:
   - `marshmallow` or `pydantic` for validation
   - `flask-injector` or manual DI for dependency injection
   - `flask-limiter` for rate limiting
   - `flask-cors` for CORS
   - `APScheduler` for scheduled tasks
   - Custom exception handlers for consistent error formatting

   Each library has its own conventions, configuration patterns, and integration quirks. The result is a patchwork architecture where structural consistency depends entirely on developer discipline.

3. **No compile-time type safety.**
   Python type hints are advisory — they're not enforced at runtime or compile time. A function annotated as `-> OpenAiChatCompletion` can return anything without error. For a project where the mock AI response format must precisely match the OpenAI API specification (field names, types, nesting), compile-time enforcement catches mismatches before they become runtime bugs.

4. **Two-language stack.**
   The frontend is React (TypeScript). With a Python backend, the team maintains two languages, two type systems, and no shared contracts between frontend and backend. A TypeScript backend shares interfaces, DTOs, and type definitions with the React client — any API contract change is caught at compile time on both sides.

5. **The template's database placeholder suggests SQLite.**
   The commented-out code reads `DATABASE_URL = "sqlite:///./visual_assistant.db"`. SQLite uses a single-writer model — only one write transaction executes at a time. In a chat application where multiple concurrent streaming responses persist messages simultaneously, this creates lock contention. (See [ADR-002](./002-database.md) for the full analysis.)

---

### Option B: FastAPI (Python) — The Modern Alternative

If staying in Python, FastAPI would be the correct choice over Flask:

**Pros:**
- Native async/await support (ASGI, not WSGI)
- `StreamingResponse` with async generators for SSE — significantly cleaner than Flask
- Pydantic validation built-in (similar to class-validator)
- Auto-generated Swagger/OpenAPI documentation
- Dependency injection system
- Type hints used for runtime validation (not just advisory)

**Cons:**
- Still requires assembling multiple libraries for caching, rate limiting, and scheduled tasks
- No equivalent to NestJS's module system — project structure is convention-only
- Two-language stack with the React frontend remains
- The provided template is Flask, not FastAPI — switching within Python still requires rewriting the entire scaffold
- The Python ecosystem for web API middleware (guards, interceptors, pipes as composable patterns) is less mature than NestJS

**Verdict:** FastAPI is a strong framework, and if the decision were "must use Python," FastAPI would be the right call. But it still leaves the two-language gap and the assembly-required architecture.

---

### Option C: NestJS (TypeScript/Node.js) — Selected

**Pros:**

1. **SSE streaming is native to the platform.**
   Node.js's event loop handles concurrent long-lived connections without threads. A streaming response is a writable stream — the same primitive Node.js uses for everything. No monkey-patching, no framework workarounds, no thread pool tuning. This is what Node.js was built for.

2. **Structured architecture out of the box.**
   NestJS provides modules, controllers, services, pipes, guards, interceptors, and exception filters as first-class concepts. Every Inksight feature maps to a module. Validation, rate limiting, logging, and error handling are declarative (decorators), not imperative (manual wiring). The architecture is enforced by the framework, not by discipline.

3. **TypeScript end-to-end.**
   Same language for the React frontend and the NestJS backend. Shared interfaces for API contracts (`OpenAiChatCompletion`, `ChatRequestDto`, error response shapes). A change to the response format is caught at compile time on both client and server. This eliminates an entire class of integration bugs.

4. **Dependency injection enables the mock-to-real swap.**
   The AI service is consumed via an interface token (`AI_SERVICE_TOKEN`). Swapping `MockAiService` for `OpenAiService` is a single line change in module configuration — no consumer code is modified. NestJS's DI container is the same pattern used by Angular and Spring, proven at scale.

5. **Testing infrastructure.**
   `@nestjs/testing` creates isolated test modules with dependency overrides. The AI service token is swapped in tests the same way it would be swapped in production. Supertest provides in-memory HTTP testing without spinning up a real server.

6. **Production patterns are built-in, not bolted-on.**
   - `@nestjs/throttler` — rate limiting with per-route decorator overrides
   - `@nestjs/config` — environment-based configuration with Joi validation
   - `@nestjs/schedule` — cron jobs for data cleanup
   - `@nestjs/cache-manager` — caching with Redis-ready abstraction
   - `@nestjs/swagger` — auto-generated API documentation from decorators
   - `class-validator` + `class-transformer` — DTO validation with custom error messages

   These are maintained by the NestJS team, tested together, and follow consistent conventions.

7. **OpenAI API compatibility.**
   The OpenAI Chat Completions API is a JSON HTTP API. TypeScript interfaces map 1:1 to the JSON schema. The mock service implements `OpenAiChatCompletion` and `OpenAiStreamChunk` interfaces that are type-checked at compile time — guaranteeing every required field is present with the correct type.

**Cons:**
- Steeper learning curve than Flask for developers unfamiliar with decorator-based frameworks
- Heavier framework — more boilerplate than a micro-framework for trivial endpoints
- Departs from the provided Flask template, requiring a new scaffold

---

## The Streaming Question in Depth

SSE streaming is the hardest engineering challenge in this project, and the platform choice has the biggest impact here. A side-by-side comparison:

**Flask (threaded=True):**
```python
@app.route('/chat-stream/<image_id>', methods=['POST'])
def chat_stream(image_id):
    def generate():
        for word in response.split():
            yield f"data: {json.dumps(chunk)}\n\n"
            time.sleep(0.05)  # Blocks the thread for 50ms per token
        yield "data: [DONE]\n\n"
    return Response(generate(), content_type='text/event-stream')
```
Each call to `time.sleep()` blocks the thread. With 10 concurrent streams, 10 threads are blocked. With 100, 100 threads. Python's GIL means these threads don't truly parallelize CPU work. Client disconnect detection requires additional machinery (`request.environ.get('werkzeug.server.shutdown')`).

**NestJS (event-loop):**
```typescript
for await (const chunk of this.aiService.chatStream(...)) {
    if (!isClientConnected) break;
    res.write(`data: ${JSON.stringify(chunk)}\n\n`);
}
```
The `await` yields control back to the event loop during the 50ms delay. Other requests, other streams, and disconnect events are processed during that yield. A single thread handles thousands of concurrent streams. Client disconnect is detected via `req.on('close')` — a native Node.js event.

---

## Decision

**TypeScript + Node.js with NestJS.**

The application's core challenges — SSE streaming, concurrent real-time connections, structured API patterns, and a shared-language React frontend — align with Node.js's strengths. Python's advantages in ML/CV don't apply here because the AI layer is mocked.

The template's API design is preserved exactly — same endpoints, mock function signatures, validation rules, and progression from in-memory to database. The implementation language changes; the product requirements and API contract do not.

---

## Consequences

- The provided `app.py` serves as the API specification — all endpoint paths, response formats, and mock behaviors are preserved
- Full-stack TypeScript eliminates frontend/backend type mismatches
- NestJS's module system enforces architectural boundaries that Flask would leave to convention
- Docker Compose provides the same one-command developer experience regardless of language choice
- If the AI layer transitions from mock to real (OpenAI API), the HTTP call is identical from Node.js — no Python advantage applies

---

## What Would Change This Decision

If any of these were true, Python would be the right call:

- The application performed actual image processing (OpenCV, PIL, feature extraction)
- The AI layer used a Python-only ML model (PyTorch, TensorFlow inference)
- The team was exclusively Python-experienced with no TypeScript knowledge
- The product had no frontend (pure API, no React client)
- SSE streaming was not a requirement (simple request-response only)

None of these apply to Inksight.

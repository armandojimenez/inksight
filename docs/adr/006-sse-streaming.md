# ADR-006: Real-Time Delivery — SSE over WebSockets, Manual Response over @Sse Decorator

**Status:** Accepted
**Date:** March 2, 2026

## Context

Inksight's streaming chat endpoint needs to deliver AI responses token-by-token in real time. This requires choosing both a transport protocol (SSE vs WebSockets) and an implementation approach within NestJS.

## Part 1: Transport Protocol — SSE vs WebSockets

### Option A: WebSockets
- **Pros:** Full-duplex communication (both client and server can send at any time). Lower per-message overhead after the initial handshake. Supports binary data. Well-suited for applications requiring bidirectional real-time communication (multiplayer games, collaborative editing, live chat between users).
- **Cons:**
  - **Overkill for this use case.** Inksight's streaming is unidirectional — the server streams tokens to the client. The client sends a single POST request and then receives a stream of tokens. There is no need for the client to send data mid-stream.
  - **Connection management overhead.** WebSockets require explicit connection lifecycle management (heartbeats, reconnection logic, connection state tracking). SSE handles reconnection automatically via the browser's `EventSource` API.
  - **Proxy and infrastructure complexity.** WebSockets require sticky sessions for load balancers, special nginx configuration (`proxy_set_header Upgrade`), and can be blocked by corporate firewalls and proxies that don't support the Upgrade handshake.
  - **Not HTTP-native.** WebSocket connections start as HTTP but upgrade to a different protocol. This means standard HTTP middleware (authentication, rate limiting, logging, CORS) doesn't apply after the upgrade without custom handling.
  - **Incompatible with the OpenAI streaming standard.** OpenAI's Chat Completions API uses SSE for streaming (`text/event-stream`). Using WebSockets would mean our mock service uses a different transport than the real API it's designed to replace.

### Option B: Server-Sent Events (Selected)
- **Pros:**
  - **Perfect fit for unidirectional streaming.** SSE is designed exactly for the pattern Inksight needs: client sends a request, server streams a response.
  - **HTTP-native.** SSE runs over standard HTTP. All existing middleware (authentication, rate limiting, CORS, logging, caching headers) works without modification.
  - **Automatic reconnection.** The browser's `EventSource` API handles reconnection with configurable retry intervals. (Not applicable here — Inksight uses `fetch` + `ReadableStream` because the streaming endpoint requires POST. Reconnection is handled manually via exponential backoff retry in the `useStreamingChat` hook.)
  - **Infrastructure friendly.** Works through all HTTP proxies, load balancers, and corporate firewalls without special configuration. No Upgrade handshake, no sticky sessions required.
  - **OpenAI compatibility.** Matches the exact transport and format used by OpenAI's streaming API (`data: {...}\n\n` with `[DONE]` sentinel). The mock service can be swapped for a real OpenAI client with zero transport changes.
  - **Simpler client implementation.** `fetch()` with `ReadableStream` — no WebSocket library needed.
- **Cons:** Unidirectional only (server → client). Limited to text data (no binary). Maximum of ~6 concurrent connections per domain in some browsers (mitigated by HTTP/2 multiplexing).

### Decision: SSE

For a server-streams-to-client pattern, SSE is the correct choice. WebSockets would add connection management complexity, infrastructure requirements, and protocol mismatch with OpenAI — all without providing any capability that SSE doesn't already cover for this use case.

The key insight: **choose the simplest protocol that fully satisfies the requirements.** WebSockets are powerful, but their power is in bidirectional communication — which Inksight doesn't need.

---

## Part 2: NestJS Implementation — Manual SSE vs @Sse Decorator

### Option A: NestJS @Sse() Decorator + Observable
- **Pros:** Idiomatic NestJS pattern. Returns an `Observable<MessageEvent>` from the controller. Type-safe, clean integration with NestJS's reactive programming model.
- **Cons:** The `@Sse()` decorator is designed for **GET** endpoints. It sets `Content-Type: text/event-stream` automatically but expects a GET handler. The product requirement specifies `POST` for the streaming endpoint because the client sends a message body (the user's question). Forcing this into a GET pattern would require moving the message to query parameters — a poor API design for a chat interface.

### Option B: Manual SSE via @Res() (Selected)
- **Pros:**
  - **Works naturally with POST.** The endpoint accepts a JSON body and streams the response.
  - **Full lifecycle control.** Explicit control over headers, chunk writing, connection detection, backpressure, and cleanup.
  - **Backpressure handling.** Direct access to the Node.js writable stream's `drain` event for handling slow clients.
  - **Error recovery.** Can write error events mid-stream and close the connection gracefully.
  - **Production pattern.** This is how OpenAI's own API server implements streaming.
- **Cons:** More verbose. Manual header setting. Bypasses some NestJS response interceptors.

### Decision: Manual SSE

The POST requirement and the need for explicit lifecycle control make manual SSE the right choice.

## Implementation Pattern

```typescript
@Post('chat-stream/:imageId')
async chatStream(@Param('imageId', ParseUUIDPipe) imageId: string, @Body() dto: ChatRequestDto, @Req() req: Request, @Res() res: Response) {
  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  // Client disconnect detection
  let connected = true;
  req.on('close', () => { connected = false; });

  for await (const chunk of this.aiService.chatStream(...)) {
    if (!connected) break;
    res.write(`data: ${JSON.stringify(chunk)}\n\n`);
  }

  res.write('data: [DONE]\n\n');
  res.end();
}
```

## Client-Side SSE Handling

```typescript
// Using fetch + ReadableStream (not EventSource, since this is POST)
const response = await fetch(`/api/chat-stream/${imageId}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ message }),
});

const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  const lines = decoder.decode(value).split('\n');
  for (const line of lines) {
    if (line.startsWith('data: ') && line !== 'data: [DONE]') {
      const chunk = JSON.parse(line.slice(6));
      // Update UI with chunk.choices[0].delta.content
    }
  }
}
```

Note: We use `fetch` + `ReadableStream` instead of `EventSource` because `EventSource` only supports GET requests. The POST requirement necessitates the fetch-based approach.

## Consequences

- SSE keeps the architecture simple — no WebSocket server, no upgrade handling, no sticky sessions
- The streaming format matches OpenAI's protocol exactly — swapping to a real provider requires zero transport changes
- Client disconnect is detected via the request `close` event — resources are cleaned up immediately
- The `X-Accel-Buffering: no` header prevents nginx/proxy buffering in production
- Standard HTTP middleware (rate limiting, authentication, logging) applies to the streaming endpoint without modification

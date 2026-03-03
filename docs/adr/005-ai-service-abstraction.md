# ADR-005: AI Service — Interface-Based Abstraction

**Status:** Accepted
**Date:** March 2, 2026

## Context

Inksight's AI capabilities are currently provided by a mock service that returns hardcoded responses in the OpenAI API format. The architecture must support swapping this mock for a real AI provider (OpenAI, Anthropic, or any other LLM API) without modifying the rest of the application.

## Options Considered

### Option A: Direct mock functions (inline)
- **Pros:** Simplest approach — mock functions called directly from controllers.
- **Cons:** Tight coupling between controllers and the mock implementation. Swapping to a real provider would require modifying every controller and service that calls the mock. No way to inject different implementations for testing vs. production.

### Option B: NestJS service without interface
- **Pros:** Injectable, testable, centralized.
- **Cons:** Without an interface contract, there's no guarantee that a replacement service provides the same methods and return types. Swap requires class replacement and hope the API matches.

### Option C: Interface-based service with DI token (Selected)
- **Pros:**
  - **Compile-time contract:** The `IAiService` interface defines exactly what methods any AI provider must implement and what types they return.
  - **DI token swap:** The AI implementation is registered via a token (`AI_SERVICE_TOKEN`). Swapping from `MockAiService` to `OpenAiService` is a single line change in the module configuration.
  - **Test isolation:** Tests can provide a mock implementation via the same token, ensuring test behavior matches the interface contract.
  - **OpenAI format compliance:** Both the interface types and the mock implementation enforce the exact OpenAI Chat Completion response format — ensuring the mock is a faithful stand-in.
- **Cons:** Slightly more boilerplate than a direct service. Requires defining an interface and using `@Inject()` with a token.

## Decision

**Interface-based AI service with NestJS dependency injection token.** This provides a clean contract for any AI provider, compile-time type safety, and a one-line swap path from mock to real.

## Interface Definition

```typescript
export interface IAiService {
  analyzeImage(imagePath: string): Promise<OpenAiChatCompletion>;
  chat(prompt: string, imageId: string, history: ConversationMessage[]): Promise<OpenAiChatCompletion>;
  chatStream(prompt: string, imageId: string, history: ConversationMessage[]): AsyncGenerator<OpenAiStreamChunk>;
}
```

## Swap Example

```typescript
// Current (mock)
{ provide: AI_SERVICE_TOKEN, useClass: MockAiService }

// Future (real OpenAI)
{ provide: AI_SERVICE_TOKEN, useClass: OpenAiService }
```

## Consequences

- All AI consumers use `@Inject(AI_SERVICE_TOKEN)` — never a concrete class
- Response types (`OpenAiChatCompletion`, `OpenAiStreamChunk`) are shared interfaces used by both the mock and future real implementations
- The mock service is a full implementation, not a stub — it generates realistic IDs, timestamps, and token counts
- Adding a new AI provider (e.g., Anthropic) requires implementing `IAiService` and registering it — no other code changes

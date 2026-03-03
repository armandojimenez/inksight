# ADR-001: Backend Framework — NestJS

**Status:** Accepted
**Date:** March 2, 2026

## Context

> **Prerequisite:** [ADR-000](./000-language-and-platform.md) established TypeScript + Node.js as the platform. This ADR selects the framework within that platform.

Inksight requires a backend framework that supports RESTful APIs, Server-Sent Events (SSE) streaming, input validation, modular architecture, and TypeScript. The framework must enable production-grade patterns (dependency injection, middleware, guards, interceptors) while remaining maintainable for a small team.

## Options Considered

### Option A: Express.js
- **Pros:** Ubiquitous, massive ecosystem, minimal learning curve
- **Cons:** No built-in structure — requires manual wiring of validation, DI, module organization, error handling. Every architectural pattern must be implemented from scratch or assembled from disparate libraries. Projects tend toward inconsistency without strict discipline.

### Option B: Fastify
- **Pros:** Best raw performance benchmarks, schema-based validation, plugin architecture
- **Cons:** Smaller ecosystem than Express, less established patterns for large applications, TypeScript support is good but not first-class in the way NestJS provides it.

### Option C: NestJS (Selected)
- **Pros:**
  - **Modular by design:** Each feature is an isolated module with its own controllers, services, and entities. This maps directly to Inksight's feature set (upload, chat, streaming, history).
  - **Built-in production patterns:** Validation pipes, exception filters, interceptors, guards — all first-class concepts, not afterthoughts.
  - **Dependency injection:** Services are injectable and mockable. The AI service interface can be swapped between mock and real implementations without changing consumers.
  - **Native SSE support:** While we use manual SSE for POST endpoints, the framework's Observable-based streaming is available for future GET-based event streams.
  - **TypeScript-first:** Decorators, generics, and strict typing throughout. No `@types` packages or type gymnastics.
  - **Testing:** `@nestjs/testing` module provides first-class test module creation with dependency overrides.
- **Cons:** Steeper learning curve than Express, heavier framework. Overkill for trivial CRUD apps.

## Decision

**NestJS.** The modular architecture aligns with the product's feature boundaries, and the built-in patterns (validation, DI, interceptors) eliminate the need to assemble and maintain a custom middleware stack. For a production-grade application with streaming, caching, and database integration, the structure NestJS provides is an asset, not overhead.

## Consequences

- All backend code follows NestJS conventions (modules, controllers, services, DTOs)
- Dependency injection is used throughout — no manual instantiation of services
- The framework's decorator-based approach means business logic is cleanly separated from cross-cutting concerns (logging, validation, rate limiting)
- New team members familiar with Angular-style architecture will onboard quickly

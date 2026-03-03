# ADR-008: Rate Limiting — @nestjs/throttler

**Status:** Accepted
**Date:** March 2, 2026

## Context

Inksight must protect against abuse and ensure fair resource usage across clients. Rate limiting is needed at both the global level (prevent DDoS) and per-route level (upload endpoints should be more restrictive than read endpoints).

## Options Considered

### Option A: express-rate-limit
- **Pros:** Widely used, battle-tested, simple middleware setup.
- **Cons:** Operates as Express middleware — doesn't integrate with NestJS's guard/decorator system. Per-route configuration requires separate middleware instances and manual route matching. No awareness of NestJS's request lifecycle (pipes, guards, interceptors).

### Option B: @nestjs/throttler (Selected)
- **Pros:**
  - **NestJS-native:** Works as a guard, integrating into the standard NestJS request lifecycle (after middleware, before pipes).
  - **Decorator-based per-route config:** `@Throttle()` decorator on individual controller methods allows fine-grained control without middleware wiring.
  - **Multiple rate limit windows:** Supports named throttlers — different windows for burst protection (3 req/sec) and sustained protection (100 req/min).
  - **Storage abstraction:** Default in-memory storage, swappable to Redis for distributed rate limiting.
  - **Guard-level rejection:** Returns `429 Too Many Requests` with the standard error format before any business logic executes.
- **Cons:** Less widely known than express-rate-limit. Slightly more setup for the module registration.

## Decision

**@nestjs/throttler.** It integrates naturally with NestJS's architecture, supports per-route decorator overrides, and provides multiple rate limit windows for different protection levels.

## Configuration

```
Global: 100 requests per minute, 3 requests per second
Upload: 10 per minute (stricter — file uploads are expensive)
Chat: 30 per minute (moderate — prevents conversation flooding)
Health: Exempt (monitoring should never be rate-limited)
```

## Consequences

- `ThrottlerGuard` is registered globally — all endpoints are rate-limited by default
- Individual routes use `@Throttle()` for stricter limits or `@SkipThrottle()` for exemptions
- Rate limit headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`) are included in responses
- Storage is in-memory — for multi-instance deployments, swap to `@nestjs/throttler` Redis storage

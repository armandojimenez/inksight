# ADR-007: Caching — In-Memory with Redis-Ready Abstraction

**Status:** Accepted
**Date:** March 2, 2026

## Context

Inksight needs a caching layer to reduce database reads for frequently accessed data (image metadata, recent conversation history). The cache must integrate with NestJS's ecosystem and support a clear upgrade path to distributed caching.

## Options Considered

### Option A: No caching
- **Pros:** Simplest approach, no cache invalidation complexity.
- **Cons:** Every request hits the database. For conversation history — which is read on every chat message to provide context — this means a DB query per message, even when the conversation hasn't changed since the last read.

### Option B: Redis
- **Pros:** Industry-standard distributed cache, supports horizontal scaling, TTL, pub/sub, persistence.
- **Cons:** Requires Redis to be running — adds an external dependency. For a single-process application, the network hop to Redis adds latency without corresponding benefit. Overkill for current scale.

### Option C: NestJS CacheModule with in-memory store (Selected)
- **Pros:**
  - **Zero external dependencies:** Uses `cache-manager` with an in-memory store. No Redis, no Memcached, no Docker.
  - **NestJS-native:** `@Inject(CACHE_MANAGER)` works throughout the application. Cache decorators available on controllers.
  - **Redis-ready:** Swapping to Redis requires installing `cache-manager-redis-store` and changing the CacheModule configuration. Zero code changes in services that use the cache.
  - **Configurable TTL and limits:** Per-key TTL and maximum cache size prevent memory leaks.
- **Cons:** In-memory cache is lost on restart. Not shared across multiple instances. Limited to single-process deployments.

## Decision

**NestJS CacheModule with in-memory store.** Provides meaningful performance improvement (eliminates redundant DB reads) with zero external dependencies. The `cache-manager` abstraction ensures a one-configuration-change upgrade to Redis when horizontal scaling requires distributed caching.

## Cache Design

| Data | Key Pattern | TTL | Invalidation |
|------|-------------|-----|-------------|
| Image metadata | `image:{id}` | 10 min | On delete |
| Conversation history | `history:{imageId}` | 5 min | On new message |
| Recent messages | `recent:{imageId}` | 5 min | On new message |

Write-through invalidation: every write operation (`addMessage`, `deleteImage`) explicitly deletes the affected cache keys. This prevents stale reads without complex invalidation logic.

## Scaling Path

1. **Current:** In-memory cache, single process
2. **Multi-instance:** Swap to Redis — change CacheModule config, deploy Redis
3. **High-throughput:** Redis Cluster with read replicas

## Consequences

- Services use `@Inject(CACHE_MANAGER)` — they don't know or care whether the backing store is in-memory or Redis
- Cache is treated as ephemeral — the application is correct without it (just slower)
- Max 100 items in cache prevents unbounded memory growth
- Cache miss is a normal path — always falls through to the database

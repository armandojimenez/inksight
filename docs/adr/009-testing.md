# ADR-009: Testing — Jest + Supertest

**Status:** Accepted
**Date:** March 2, 2026

## Context

Inksight needs unit, integration, and E2E testing with NestJS's testing utilities and TypeScript support.

## Options Considered

| Option | Verdict | Key Trade-off |
|--------|---------|---------------|
| **Vitest + Supertest** | Rejected | Faster execution, but NestJS's `@nestjs/testing` module, CLI, docs, and community all assume Jest. Fighting framework conventions adds friction without meaningful benefit at this test suite size |
| **Jest + Supertest** | **Selected** | NestJS default. Zero configuration friction. `@nestjs/testing` TestingModule enables isolated modules with dependency overrides. Supertest provides in-memory HTTP testing. Coverage built-in via `--coverage` |

## Decision

**Jest + Supertest.** Seamless NestJS integration, zero config overhead, and ecosystem alignment. The test suite is small enough that Vitest's speed advantage is irrelevant.

## Test Organization

```
test/
├── unit/         # Isolated service tests (mocked dependencies)
├── integration/  # Controller + service + DB tests
├── e2e/          # Full HTTP lifecycle tests
└── fixtures/     # Test images and data
```

## Consequences

- Test files use `.spec.ts` convention
- `@nestjs/testing` TestingModule used for integration and E2E tests
- Mock AI service overridden via DI token for deterministic responses
- Coverage reports generated via `jest --coverage`

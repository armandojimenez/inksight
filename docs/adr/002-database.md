# ADR-002: Database — PostgreSQL + TypeORM

**Status:** Accepted
**Date:** March 2, 2026

## Context

Inksight needs persistent storage for image metadata and conversation history. The database must support concurrent reads and writes from multiple streaming connections, provide a migration system for schema versioning, and handle the write-heavy nature of a real-time chat application where every message is persisted.

## Options Considered

### Option A: SQLite + TypeORM
- **Pros:** Zero-config file-based database, no external dependencies, simple for demos.
- **Cons:** SQLite uses a single-writer model — only one write transaction can execute at a time. In a chat application with concurrent streaming responses (each writing message history), this creates lock contention. WAL mode improves concurrent reads but does not solve concurrent writes. Additionally, SQLite lacks connection pooling, row-level locking, and advanced query optimization (EXPLAIN ANALYZE, partial indexes). For anything beyond a single-user demo, these limitations become real constraints.

### Option B: MySQL + TypeORM
- **Pros:** Mature, widely deployed, strong tooling ecosystem.
- **Cons:** Less performant than PostgreSQL for complex queries, weaker JSON support, table-level locking in some storage engines (MyISAM). InnoDB provides row-level locking but PostgreSQL's MVCC implementation is generally more efficient under write-heavy workloads.

### Option C: PostgreSQL + TypeORM (Selected)
- **Pros:**
  - **Concurrent write handling:** MVCC (Multi-Version Concurrency Control) provides row-level locking without read/write contention. Multiple streaming responses can persist messages simultaneously without blocking each other.
  - **Connection pooling:** Native connection pooling via TypeORM's pool configuration. For production, PgBouncer provides external pooling for high-connection scenarios.
  - **Advanced features:** JSONB for flexible data, partial indexes for optimized queries, EXPLAIN ANALYZE for query profiling, LISTEN/NOTIFY for real-time events.
  - **TypeORM integration:** First-class PostgreSQL support via `@nestjs/typeorm`. Entities, repositories, migrations — all work identically to any other TypeORM database.
  - **Production standard:** PostgreSQL is the default choice for production workloads in the Node.js ecosystem. It scales from development to thousands of concurrent connections.
  - **Docker Compose:** A single `docker-compose up` command starts both PostgreSQL and the application. Zero local installation required — the developer experience remains frictionless.
- **Cons:** Requires Docker or a local PostgreSQL installation. Slightly more complex than a file-based database.

## Decision

**PostgreSQL + TypeORM.** A chat application with concurrent streaming connections needs a database that handles concurrent writes without lock contention. PostgreSQL's MVCC provides this, and Docker Compose eliminates the setup friction. A single `docker-compose up` command yields a fully operational system.

## Docker Compose Setup

```yaml
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: inksight
      POSTGRES_USER: inksight
      POSTGRES_PASSWORD: inksight_dev
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U inksight -d inksight"]
      interval: 5s
      timeout: 5s
      retries: 5

  app:
    build: .
    ports:
      - "3000:3000"
    depends_on:
      db:
        condition: service_healthy
    environment:
      DATABASE_URL: postgres://inksight:inksight_dev@db:5432/inksight
      NODE_ENV: production
    volumes:
      - uploads_data:/app/uploads

volumes:
  pgdata:
  uploads_data:
```

## Migration Strategy

TypeORM migrations are TypeScript files with `up()` and `down()` methods:

```bash
# Generate migration from entity changes
npx typeorm migration:generate -d src/database/data-source.ts src/database/migrations/InitialSchema
```

- `synchronize: false` — forces use of migrations (production discipline)
- `migrationsRun: true` — auto-runs pending migrations on startup
- Migration files are committed to version control

## Connection Pool Configuration

```typescript
TypeOrmModule.forRoot({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [ImageEntity, ChatMessageEntity],
  synchronize: false,
  migrationsRun: true,
  extra: {
    max: 20,           // Max connections in pool
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  },
})
```

## Consequences

- Docker Compose is required to run the application (documented in README)
- `docker-compose up` is the single command to start everything
- All queries go through TypeORM repositories — no raw SQL, preventing SQL injection by design
- Connection pooling is configured out of the box (max 20 connections)
- Migrations provide versioned, reproducible schema changes
- For local development without Docker, a local PostgreSQL instance can be used by setting `DATABASE_URL`

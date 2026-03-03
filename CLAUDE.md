# Inksight

AI-powered visual assistant — image upload + conversational chat with real-time streaming.

## Stack

| Layer | Technology |
|-------|-----------|
| Backend | NestJS 11, TypeScript 5.x |
| Database | PostgreSQL 16, TypeORM 0.3.x |
| Frontend | React 18, Vite, Tailwind CSS, shadcn/ui |
| Testing | Jest, Supertest |
| Infrastructure | Docker Compose |

## Architecture

Modular monolith — one NestJS module per feature domain:

```
src/
├── upload/     # Image upload + validation
├── chat/       # Chat + streaming controllers
├── ai/         # Mock AI service (OpenAI-compatible)
├── history/    # Conversation persistence
├── cache/      # In-memory caching layer
├── cleanup/    # Scheduled data cleanup
├── database/   # TypeORM config + migrations
└── common/     # Filters, interceptors, guards, pipes
```

## Rules

- **Repository pattern** via `@InjectRepository()` — no Active Record, no raw SQL
- **DI tokens for abstraction** — AI service behind `AI_SERVICE_TOKEN`, swappable via module config
- **DTOs validated** with `class-validator` + global `ValidationPipe`
- **Consistent error shape** everywhere: `{ statusCode, error, code, message, timestamp, path, requestId }`
- **Files stored as** `uploads/{uuid}.{ext}` — original filename in DB only
- **`@VersionColumn()`** on `ImageEntity` only — chat messages are append-only, no locking needed
- **No authentication** — intentionally deferred, documented in PRD SEC-11
- **Global prefix** `/api` on all routes

## Testing

- **TDD discipline** — tests first, then implementation
- `test/unit/` — isolated service tests, mocked dependencies
- `test/integration/` — controller + service + DB via `TestingModule`
- `test/e2e/` — full HTTP lifecycle via Supertest
- Override AI in tests: `.overrideProvider(AI_SERVICE_TOKEN).useClass(TestMockAiService)`
- **Coverage target:** 85%+

## Git

[Conventional Commits](https://www.conventionalcommits.org/) — enforced, no exceptions:

| Prefix | Usage |
|--------|-------|
| `docs:` | Documentation only |
| `feat:` | New functionality |
| `test:` | Adding or updating tests |
| `fix:` | Bug fix |
| `refactor:` | Restructure without behavior change |
| `chore:` | Tooling, config, dependencies |

**Commit rhythm follows TDD:** `test:` (red) → `feat:` (green) → `refactor:` (optional). Multiple commits per phase, NOT one blob. Tag at each phase gate (`v0.0-scaffold`, `v0.1-upload`, etc.).

## No Shortcuts, No Compromises

**The correct fix is ALWAYS better than the quick fix. No exceptions.**

- **Fix bugs when you find them.** If a bug affects the work you're doing, fix it NOW — don't defer it, don't say "out of scope", don't create a follow-up task for it. The only exception is if the fix requires infrastructure from a future phase (e.g., needs the AI service that doesn't exist yet).
- **Take the correct approach, not the easy one.** Technical debt compounds. A shortcut today becomes a refactoring nightmare tomorrow. Always choose the long-term solution — even if it means touching more files or writing more tests.
- **Never assume, always verify.** Don't trust plans, comments, variable names, or your own intuition. Read the code. Read the PRD. Compare against the technical design. Document what you find with `file:line` references.
- **"Good enough" is not good enough.** If there's a known issue — a missing validation, a race condition, an inconsistent error shape — raise it, figure it out, fix it. Don't say "acceptable for now" or "close enough."
- **The user makes the decisions.** When there's a tradeoff (performance vs. simplicity, strict vs. permissive validation), present the options with evidence and let the user decide. Don't silently pick the easy path.
- **Document everything you verify.** Context is lost between sessions. If you verified magic bytes, cite the spec. If you checked the PRD, reference the requirement ID. If you tested an edge case, note the test file and line. Future sessions depend on this.

## Starting a Session

Check current progress before doing anything:
1. `git log --oneline -5` — see where we left off
2. Read `docs/implementation-plan.md` — find the current phase
3. Build and test what exists — `npm test` must pass before adding new code

## Development

```bash
docker-compose up -d db    # Start PostgreSQL
npm run start:dev          # Start NestJS in watch mode
npm test                   # Run tests
```

Each implementation phase ends with: passing tests, manual smoke test, git tag.

## Documentation

| Document | Purpose |
|----------|---------|
| [PRD](docs/PRD.md) | Feature requirements, API contracts, acceptance criteria |
| [Technical Design](docs/technical-design.md) | Architecture, code patterns, security model |
| [Implementation Plan](docs/implementation-plan.md) | 13-phase build order with TDD gates |
| [UI Design Spec](docs/ui-design-spec.md) | Components, design tokens, accessibility (WCAG 2.1 AA) |
| [ADRs](docs/adr/) | 11 architecture decision records |

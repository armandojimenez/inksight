# ADR-010: Project Structure — Single Package with Client Subfolder

**Status:** Accepted
**Date:** March 2, 2026

## Context

Inksight consists of a NestJS backend and a React frontend. These need to coexist in a single repository with a clear build and deployment story. The structure must minimize setup friction — ideally, one install command and one start command.

## Options Considered

### Option A: npm Workspaces (Monorepo)
- **Pros:** Separate `package.json` for client and server, shared dependencies hoisted to root, clean dependency boundaries.
- **Cons:** Adds complexity — `npm install` behavior differs with workspaces (hoisting issues, phantom dependencies). Build scripts need workspace-aware orchestration. Developers unfamiliar with workspaces may be confused by the structure. For a two-package project, the overhead exceeds the benefit.

### Option B: Completely separate repositories
- **Pros:** Maximum isolation between frontend and backend.
- **Cons:** Requires two separate clone/install/run steps. Versioning across repos is manual. Deployment requires coordinating two build pipelines. Completely impractical for a single deliverable.

### Option C: Single package.json with client/ subfolder (Selected)
- **Pros:**
  - **One install:** `npm install` at the root handles server dependencies. A `postinstall` script runs `cd client && npm install` for the client.
  - **One command:** `npm start` builds client, builds server, runs everything.
  - **Clear separation:** Server code in `src/`, client code in `client/src/`. No confusion about what lives where.
  - **Simple scripts:** Root `package.json` orchestrates builds without workspace tooling.
  - **Git-friendly:** Single repo, single branch, single PR for full-stack changes.
- **Cons:** Client has its own `package.json` (Vite + React dependencies), which means two `node_modules` directories. This is intentional — client and server dependencies don't mix.

## Decision

**Single package.json with a `client/` subfolder.** The developer experience is: `npm install && npm start`. Everything works. The client has its own `package.json` for Vite and React dependencies, installed automatically via a `postinstall` hook.

## Directory Layout

```
inksight/
├── package.json           # Server deps + orchestration scripts
├── tsconfig.json          # NestJS TypeScript config
├── nest-cli.json
├── src/                   # NestJS backend source
├── test/                  # Backend tests
├── client/                # React frontend
│   ├── package.json       # Client deps (React, Vite, Tailwind)
│   ├── vite.config.ts
│   ├── src/
│   └── dist/              # Built output (served by NestJS)
├── uploads/               # Image storage (gitignored)
├── docs/                  # Documentation
│   ├── PRD.md
│   ├── technical-design.md
│   └── adr/
└── README.md
```

## Build Flow

```
npm install
  └── postinstall: cd client && npm install

npm start
  ├── build:client: cd client && npm run build  → client/dist/
  ├── build:server: nest build                  → dist/
  └── node dist/main.js                         → serves everything on :3000
```

## Consequences

- Two `node_modules` directories (root + client) — this is intentional to avoid dependency conflicts
- `postinstall` hook ensures `npm install` at root sets up everything
- `client/dist/` is `.gitignored` — built as part of `npm start`
- Development runs two processes (NestJS watch + Vite dev server) but production is one process
- Vite's proxy configuration routes `/api/*` to NestJS during development

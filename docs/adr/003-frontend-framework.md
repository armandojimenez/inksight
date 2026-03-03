# ADR-003: Frontend Framework — React + Vite

**Status:** Accepted
**Date:** March 2, 2026

## Context

Inksight includes a web client for image upload, AI chat, and real-time streaming. The frontend is a single-page application (SPA) that communicates with the NestJS backend via REST and SSE. There are no SEO requirements, no server-side rendering needs, and no complex routing.

## Options Considered

### Option A: Next.js
- **Pros:** Full-featured React framework, file-based routing, SSR/SSG capabilities, API routes.
- **Cons:** Introduces a second server process alongside NestJS. Next.js API routes would conflict with NestJS endpoints, creating architectural confusion. SSR provides no value for an authenticated app with no public pages. The framework adds significant complexity (build configuration, middleware, server components) without corresponding benefit for this use case. Engineers would rightly ask "why Next.js?" and there is no compelling answer.

### Option B: Vanilla HTML/CSS/JavaScript
- **Pros:** Zero build step, maximum simplicity, no framework overhead.
- **Cons:** Doesn't demonstrate modern frontend skills. Managing state (message lists, streaming accumulators, upload progress) without a component model leads to imperative DOM manipulation. Harder to maintain and extend.

### Option C: React + Vite (Selected)
- **Pros:**
  - **Right-sized:** React provides component-based architecture and state management without the overhead of a full framework. Vite provides instant HMR in development and optimized static builds for production.
  - **Single-process deployment:** `npm run build` outputs static files to `client/dist/`. NestJS serves this directory via `ServeStaticModule`. One process, one port, one command.
  - **SSE support:** React hooks + `fetch` with `ReadableStream` provide clean streaming integration. No extra libraries needed.
  - **Industry standard:** React is the most widely used frontend library. Any engineer will be immediately comfortable reading the code.
- **Cons:** Requires a separate build step for the client. Development requires either a proxy setup or running two processes.

## Decision

**React + Vite.** The SPA architecture perfectly matches the product needs — no SSR, no SEO, no complex routing. Vite's fast builds and static output integrate cleanly with NestJS's static serving. One command gets you the full experience.

## Development Workflow

- **Production:** `npm run build` compiles client → `client/dist/`, server → `dist/`. Single `node dist/main.js` process.
- **Development:** Vite dev server runs on port 5173 with a proxy to NestJS on port 3000. Hot module replacement for instant feedback.

## Consequences

- Client code lives in `client/` subfolder with its own `package.json` (installed as part of root `npm install`)
- Production build is a two-step process: build client, then build server
- No SSR complexity — all rendering happens client-side
- State management uses React's built-in hooks (useState, useEffect, useRef) — no Redux or external state library needed for this scope

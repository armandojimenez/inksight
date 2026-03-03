# ADR-004: Styling — Tailwind CSS + shadcn/ui

**Status:** Accepted
**Date:** March 2, 2026

## Context

The web client needs styling that enables rapid development of a polished, accessible UI.

## Options Considered

| Option | Verdict | Key Trade-off |
|--------|---------|---------------|
| **CSS Modules** | Rejected | Scoped styles but requires writing every component from scratch, including accessibility handling for modals, toasts, and dropdowns |
| **Tailwind only** | Rejected | Fast utility-first development, but complex accessible components (focus traps, ARIA, keyboard nav) must be built manually |
| **Tailwind + shadcn/ui** | **Selected** | Tailwind for layout/custom styling + shadcn/ui (Radix UI primitives) for accessible interactive components. Components are copied into the project — fully owned, not a dependency |

## Decision

**Tailwind CSS + shadcn/ui.** Tailwind handles layout with zero context-switching. shadcn/ui provides accessible, production-ready interactive components without pulling in a heavy library like Material UI. This is the most widely adopted styling approach in the React ecosystem (2024–2026).

## Consequences

- All styling via Tailwind utility classes — no separate CSS files
- shadcn/ui components live in `client/src/components/ui/`, committed to the repo
- Design tokens configured in `tailwind.config.ts`
- Responsive design via Tailwind breakpoint prefixes (`sm:`, `md:`, `lg:`)

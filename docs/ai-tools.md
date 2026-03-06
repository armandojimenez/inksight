# AI Tools & Orchestration

**Author:** Inksight Team
**Date:** March 2, 2026

---

## Philosophy

AI was used as a **force multiplier** for implementation, not a replacement for engineering judgment. Every architectural decision, design choice, and trade-off was made by me — AI tools accelerated the execution of those decisions.

The approach: **I do the thinking, AI does the typing.**

---

## Tools Used

### Claude Code (Primary Development Tool)
**Role:** AI pair programmer for the entire development lifecycle

**How it was used:**
- **Architecture Design:** Explored trade-offs between frameworks, databases, and patterns through structured Q&A. All decisions documented in ADRs.
- **Implementation:** Generated code from detailed specifications (PRD, Technical Design Doc). Every module was reviewed, tested, and refined before committing.
- **Testing:** Generated test suites from documented test scenarios, then iterated on edge cases.
- **Documentation:** Assisted with PRD, Technical Design Document, and ADR generation from architectural discussions.

### Claude Code Skills Used

| Skill | Purpose | Where Applied |
|-------|---------|--------------|
| **Frontend Design** | UI/UX design system creation, visual prototyping | Design spec, React component architecture, interactive prototype |
| **Code Review** | Quality assurance, security analysis | Pre-commit review of all modules |
| **Security Audit** | OWASP compliance, vulnerability detection | Upload validation, rate limiting, input sanitization |
| **Test Automation** | Test strategy, coverage analysis | Unit, integration, and E2E test suites |

### Web Research
- Reviewed Inkit's public website to study brand design system (colors, typography, visual patterns)
- Referenced OpenAI API documentation for exact response format compliance
- Consulted NestJS, TypeORM, and React documentation for best practices

---

## Orchestration Approach

```
Phase 1: Research & Planning
├── Studied product requirements
├── Researched Inkit's brand and design system
├── Made architectural decisions (documented in ADRs)
└── Created PRD, Technical Design Doc, UI Design Spec

Phase 2: Implementation
├── Scaffolded project structure
├── Built each feature module with tests
├── Used AI for code generation from specs
└── Reviewed all generated code for quality

Phase 3: Quality Assurance
├── Security audit of all endpoints
├── Code review of complete codebase
├── Test coverage analysis and gap filling
└── Accessibility audit of UI components

Phase 4: Polish & Documentation
├── UI refinement and responsive testing
├── README and setup documentation
├── Final code review pass
└── Build and deployment verification
```

---

## What AI Did NOT Do

- **Architectural decisions:** All technology choices, trade-offs, and design patterns were human-driven
- **Requirements interpretation:** Understanding the product's intent and prioritization was human judgment
- **Design aesthetic:** Visual direction, brand alignment, and UX decisions were human-directed
- **Quality standards:** Definition of "done" and acceptance criteria were human-defined
- **Testing strategy:** Which scenarios to test and what constitutes coverage was human-planned

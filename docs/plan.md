# Implementation Plan: Job Applicant Agent

**Date:** 2026-10-29 | **Spec:** [requirements.md](requirements.md)

## Summary

Implement all 15 requirements as a local-first Electron desktop application. Use deterministic extraction/matching and evidence-grounded template rendering to avoid paid AI dependencies. Allow only Gmail reads and draft creation. Bundle the runtime for Windows/macOS users.

Design inputs: [architecture.md](architecture.md), [constitution.md](constitution.md), and the user's requirements captured in [requirements.md](requirements.md). This is a greenfield implementation; there is no legacy code, rewrite topology, or source-conversion inventory.

## Technical Context

- Language: strict TypeScript; React 19; Electron 45; Node.js 24 LTS for development.
- Dependencies: PDFParse, Mammoth, html-to-text, Zod, Lucide, local font assets.
- Storage: encrypted workspace/original-resume/client/token files through OS safeStorage; atomic writes.
- Targets: Windows x64 NSIS; macOS x64/arm64 DMG/ZIP.
- Validation: Vitest fixtures/service tests, TypeScript, Playwright Electron smoke, browser layout/flow checks, npm audit.
- Performance constraints: 10 MB per document, 200k extracted characters, 30 files per selection, 200 emails per retrieval, 100 draft jobs per batch. These are safety/scale bounds, not a latency guarantee.
- Network dependencies: Google OAuth and Gmail only; native completion notifications are free.

## Constitution Check

| Principle | Design Decision | Result |
| --- | --- | --- |
| Never send | Fixed Gmail endpoint allowlist and no sending bridge | PASS |
| Local by default | Local parsers/scoring/storage; explicit Google operations | PASS |
| Protected secrets | safeStorage only; fail closed | PASS |
| Documents are data | Text-only parsing, PDF evaluation disabled, no remote HTML rendering | PASS |
| Honest evidence | Resume coverage separated from preference overlap | PASS |
| Visible uncertainty | Missing fields, editable recipients, preview, per-job errors | PASS |
| Renderer isolation | Sandboxed window, narrow preload, sender/frame validation | PASS |
| Bundled runtime | electron-builder targets and native CI builds | PASS (release acceptance pending) |
| Minimal infrastructure | No app server, cloud database, paid notification or model API | PASS |

## Applied Guidelines

The installed migration guideline catalog contains Spring Boot scaffolding and Struts-to-Spring transformations; neither applies to this greenfield Electron app. Follow the project constitution, Electron process isolation, installed-app OAuth PKCE, and the architecture's allowlisted transport instead. No Java framework migration rules are applied.

## Implementation Steps

Checkboxes below represent implementation tasks; their verification status is summarized separately so compiled source is not confused with public-release certification.

### Phase 1: Setup

**P1.1 — Desktop scaffold.** Requirements: REQ-011, REQ-014. Design input: architecture Technical Context / Folder Structure.

- [ ] T001 [Plan:P1.1] Configure renderer, Electron main/preload compilation, dependencies, and scripts in `package.json`, `vite.config.ts`, `tsconfig.json`, and `tsconfig.electron.json`.

### Phase 2: Domain And Storage

**P2.1 — Extraction, scoring, and draft rendering.** Requirements: REQ-003, REQ-005, REQ-006, REQ-007, REQ-008, REQ-012. Design input: architecture Import And Match / Data Model.

- [ ] T002 [Plan:P2.1] Define serializable job/resume/preference/API types and template defaults in `shared/types.ts`.
- [ ] T003 [Plan:P2.1] Implement field extraction, custom skill dictionary, evidence-based resume ranking, template substitution, and safe multipart MIME in `shared/engine.ts`.
- [ ] T004 [Plan:P2.1] Implement PDF/DOCX extraction, parser cleanup, and input bounds in `electron/documents.ts`.

**P2.2 — Secure local persistence.** Requirements: REQ-013. Design input: architecture Data Model / Security And Failure Boundaries.

- [ ] T005 [Plan:P2.2] Implement OS-encrypted atomic files and redacted rotating activity logging in `electron/storage.ts`.

### Phase 3: Gmail Integration

**P3.1 — Installed-app authorization and retrieval.** Requirements: REQ-001, REQ-002, REQ-012, REQ-013. Design input: architecture OAuth / Import And Match.

- [ ] T006 [US1] [Plan:P3.1] Implement encrypted Desktop-client import, PKCE/state loopback authorization, refresh/revoke, and date/query Gmail retrieval with HTML/attachment extraction in `electron/gmail.ts`.

**P3.2 — Draft-only processing and notifications.** Requirements: REQ-009, REQ-010, REQ-013, REQ-015. Design input: architecture Draft Batch / Security And Failure Boundaries.

- [ ] T007 [US1] [Plan:P3.2] Implement allowlisted Gmail reads and `POST /drafts`, blocking sending/arbitrary endpoints in `electron/gmail.ts`.
- [ ] T008 [US1] [Plan:P3.2] Implement trusted IPC, serialized imports/updates/draft batches, selected-resume attachments, per-job persistence, duplicate skipping, and native completion notification in `electron/main.ts` and `electron/preload.cts`.

### Phase 4: User Workspace

**P4.1 — Dashboard and configuration.** Requirements: REQ-002, REQ-004, REQ-006, REQ-007, REQ-008, REQ-011, REQ-015. Design input: architecture Ownership / Primary Flows.

- [ ] T009 [US2] [Plan:P4.1] Implement real/native versus explicit fictional browser adapters in `src/api.ts`.
- [ ] T010 [US2] [Plan:P4.1] Implement ranked dashboard, search/filter/sort/selection, resumes, settings/template inputs, import/date/OAuth dialogs, field correction, email preview, batch confirmation, and completion feedback in `src/App.tsx`.
- [ ] T011 [US2] [Plan:P4.1] Implement responsive styling, accessible controls/dialog focus, local fonts/logo, and renderer CSP in `src/styles.css`, `src/main.tsx`, `public/mark.svg`, and `index.html`.

### Phase 5: Verification And Delivery

**P5.1 — Verification evidence.** Requirements: REQ-001 through REQ-015. Design input: architecture boundaries and release acceptance criteria.

- [ ] T012 [Plan:P5.1] Validate domain/document/storage/transport boundaries in `tests/engine.test.ts` and `tests/services.test.ts`, and real desktop startup in `tests/desktop.smoke.mjs`.
- [ ] T013 [Plan:P5.1] Check desktop/mobile browser flows, dependency advisories, build output, and document live Gmail/OS-specific gaps in `docs/RELEASE.md`.

**P5.2 — Standalone release.** Requirements: REQ-014. Design input: architecture Technical Context and release checklist.

- [ ] T014 [Plan:P5.2] Configure Windows/macOS packaging in `package.json` and `.github/workflows/release.yml`; document setup/signing/installation in `README.md` and `docs/RELEASE.md`.
- [ ] T015 [Plan:P5.2] Run host packaging and schedule Windows/dual-architecture installation, signing, OAuth, and notification acceptance using `docs/RELEASE.md`.

## Project Structure

```text
.github/workflows/release.yml  native installer CI
electron/                     privileged desktop services and preload
shared/                       domain types and deterministic engine
src/                          React application and browser/native adapters
public/                       local brand asset
tests/                        regression fixtures and desktop smoke
docs/                         architecture, requirements, plan, release gates
```

See [architecture.md](architecture.md) for the full file-level tree.

## Requirement Mapping

| REQ ID | Description | Plan Items | Implementation Evidence |
| --- | --- | --- | --- |
| REQ-001 | Secure Gmail OAuth | P3.1, P5.1 | `electron/gmail.ts`, `electron/storage.ts` |
| REQ-002 | Email/date/file inputs | P3.1, P4.1 | `electron/gmail.ts`, `electron/main.ts`, `src/App.tsx` |
| REQ-003 | Structured job fields | P2.1 | `shared/engine.ts`, `shared/types.ts` |
| REQ-004 | User preferences | P4.1 | `src/App.tsx`, `electron/main.ts` |
| REQ-005 | Resume/configured comparison | P2.1 | `shared/engine.ts#rankJob` |
| REQ-006 | Ranked jobs | P2.1, P4.1 | `shared/engine.ts`, `electron/main.ts`, `src/App.tsx` |
| REQ-007 | Multiple/best resume | P2.1, P4.1 | `electron/main.ts`, `shared/engine.ts`, `src/App.tsx` |
| REQ-008 | Personalized stored template | P2.1, P4.1 | `shared/types.ts`, `shared/engine.ts#draftFor`, `src/App.tsx` |
| REQ-009 | Gmail draft save | P3.2 | `electron/main.ts`, `electron/gmail.ts` |
| REQ-010 | Never send | P3.2, P5.1 | `electron/gmail.ts#gmailRequest`, `tests/services.test.ts` |
| REQ-011 | Dashboard | P1.1, P4.1 | `src/App.tsx`, `src/styles.css` |
| REQ-012 | PDF/DOCX/email | P2.1, P3.1 | `electron/documents.ts`, `electron/gmail.ts`, `tests/services.test.ts` |
| REQ-013 | Logs/errors/secrets | P2.2, P3.1, P3.2 | `electron/storage.ts`, `electron/main.ts`, `electron/gmail.ts` |
| REQ-014 | Standalone Windows/macOS | P1.1, P5.2 | `package.json`, `.github/workflows/release.yml`, `docs/RELEASE.md` |
| REQ-015 | Completion notice | P3.2, P4.1 | `electron/main.ts`, `src/App.tsx` |

## Implementation And Verification Status

- T001-T012 and T014 source implementations are present. Automated tests, strict type checks, production build, and the macOS Electron startup smoke test pass.
- T013 desktop browser search/review/settings and desktop/mobile layout checks pass; npm audit reports zero vulnerabilities in the current resolved tree. Live Google authorization/drafting remains a manual gate.
- T015 host packaging produced a standalone macOS arm64 app plus DMG/ZIP; the packaged app passed startup and PDF-worker extraction smoke checks. Unsigned local macOS artifacts are not equivalent to a signed Windows/macOS public release. Windows installation, Google consent, account-specific Gmail drafts, OS encryption behavior, native notification permissions, and signing/notarization require target-environment acceptance.
- No requirements are intentionally omitted. Restrictions and release dependencies are disclosed rather than marked as fully verified.
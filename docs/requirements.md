# Requirements

Scope: a single-user, local-first Windows/macOS desktop application named Job Applicant Agent. Installed users need no developer runtime. Draft-only means the app never invokes a sending endpoint; Google itself does not offer a draft-only scope.

| ID | Requirement | Acceptance |
| --- | --- | --- |
| REQ-001 | Secure Gmail OAuth | Desktop client JSON import, system browser consent, PKCE/state, loopback callback, refresh/revoke, OS-encrypted tokens. |
| REQ-002 | Input-driven email/date/file retrieval | Inclusive local dates, optional Gmail query, email bodies/attachments, multi-file upload, and pasted descriptions. |
| REQ-003 | Structured job extraction | Title, company, location, required skills, and experience; missing values shown honestly; key fields editable. |
| REQ-004 | Configurable preferences | Persist preferred locations, preferred/custom skills, minimum score, and applicant name. |
| REQ-005 | Compare resume and configured skills | Separate evidence from resume versus user preference; explicit weighted formula. |
| REQ-006 | Rank jobs | Descending score with search, source/status filters, and newest sort. |
| REQ-007 | Multiple resumes and best selection | Multi-file PDF/DOCX resume input; score each resume; display best resume and attach original. |
| REQ-008 | Personalized email | Persist editable template; fill job/resume-backed fields; preview before creation. |
| REQ-009 | Save Gmail drafts | MIME email plus selected resume saved through Gmail drafts.create; persist returned draft ID. |
| REQ-010 | Never send automatically | No sending IPC/API; transport allowlist blocks send resources; user sends outside app. |
| REQ-011 | Dashboard | Job/title/company/location/score/resume/draft state, batch selection, errors, workspace summary. |
| REQ-012 | Content extraction | Text PDF, DOCX, plain email, HTML-to-text, Gmail PDF/DOCX attachments; explicit OCR limitation. |
| REQ-013 | Logging/errors/secure storage | OS encryption, atomic files, scoped IPC validation, safe logs, per-file/job errors and network timeouts. |
| REQ-014 | Windows/macOS standalone | Electron-builder DMG/ZIP and NSIS configuration; cross-platform CI; end users need no Python/Git. |
| REQ-015 | Free completion notification | Native desktop notification and in-app result with number of jobs ready and failures/skips. |

## Assumptions

- Gmail OAuth credentials/consent are provided by the user or distributor; public scope verification is a release prerequisite where applicable.
- Local deterministic matching/template generation is the cost-free baseline, not a generative AI service. Documents are data, never executable instructions.
- A description can omit recipient/company/location; the user reviews and corrects fields before creating drafts.
- The app does not interact with job-board application forms or send emails.
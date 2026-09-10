# PrepForge Backend

Backend for **PrepForge**, an AI-powered interview preparation application.

This repository is the HTTP API, persistence layer, and the **single shared generation pipeline**. The frontend lives in a separate repository:

https://github.com/darsh1125/prepforge-frontend

Do not merge these projects into a monorepo.

## Stack

- Node.js
- Express
- TypeScript (strict)
- MongoDB + Mongoose
- Zod
- Vitest

## Local setup

```bash
cd prepforge-backend
cp .env.example .env
npm install
```

Fill `MONGODB_URI` when you need persistence. Health checks work without MongoDB.

### Development workflow

Terminal 1 (this repo):

```bash
npm run dev
```

API base: `http://localhost:5000`

Health: `http://localhost:5000/health`

Terminal 2 (frontend repo):

```bash
cd prepforge-frontend
npm run dev
```

UI: `http://localhost:3000`

## Environment variables

| Variable | Purpose |
| --- | --- |
| `PORT` | API port (default `5000`) |
| `NODE_ENV` | `development` / `test` / `production` |
| `MONGODB_URI` | MongoDB connection string (never commit secrets) |
| `SESSION_SECRET` | JWT signing secret; use at least 32 random characters in production |
| `WEB_ORIGIN` | Allowed frontend origin for CORS and state-changing request Origin checks |
| `AUTH_COOKIE_NAME` | HTTP-only authentication cookie name |
| `AUTH_TOKEN_TTL_SECONDS` | Finite JWT cookie lifetime |
| `BCRYPT_ROUNDS` | Password hashing work factor |
| `LLM_API_KEY` | OpenAI-compatible provider key for extraction and generation; tests must not require it |

CORS is origin-specific and `credentials: true`; wildcard origins are not used. Authentication uses a signed JWT in an HTTP-only cookie. Local development uses `SameSite=Lax`; production uses `SameSite=None; Secure` because the frontend and backend may have different sites. State-changing production requests require the exact `Origin` header configured in `WEB_ORIGIN`, which provides CSRF defense for the separate deployment.

## Commands

```bash
npm run dev
npm run build
npm run start
npm run lint
npm run typecheck
npm run test
npm run evaluate -- --input <cases.json> --output <kits.json>
```

The evaluator is a Mongo-free batch entry point over the same `generateKitPipeline()` used by the web API:

```bash
npm run evaluate -- --input cases.json --output kits.json
```

The input is a JSON array of `{ id, jd, company_url, days }` cases. Output is the exact Appendix B envelope with `version: "1.0"`, an ISO `generated_at`, and one ordered `ok` or `failed` result per input ID. Invalid IDs or duplicate IDs fail the whole invocation; invalid fields on an identified case become a failed result while the remaining cases continue. Output is written atomically and parent directories are created when needed. Evaluator retrieval uses the explicit internal `evaluation` mode so localhost fixtures can work without weakening production SSRF policy. Cases run with a bounded concurrency of two.

## Architecture

```
prepforge-frontend  --HTTP JSON-->  prepforge-backend
                                         |
                                         +--> MongoDB
                                         +--> retrieval / research
                                         +--> LLM provider
                                         +--> deterministic core
```

### Shared pipeline

`src/core/pipeline/generateKit.ts` is the **only** generation entry point.

```
Express API  \
               ---> generateKit(...)
CLI evaluator /
```

The CLI maps each case to `{ jd, companyUrl, daysAvailable, mode: "evaluation" }` and invokes this same in-memory pipeline. It does not start Express, connect to MongoDB, or include editor/practice metadata in output. Schedule allocation, coverage, IDs, final validation, and Appendix A assembly remain deterministic core work.

`src/core` is framework-independent: no Express `Request`/`Response`, no React, no Next.js.

Pipeline stages: extract requirements → fetch homepage → discover/rank/retrieve pages → research interview process → generate questions → deterministic coverage → gap fill → flashcards → deterministic schedule → validate → persist.

### Strict Appendix A contract

The evaluator kit shape is defined in `src/schemas/kit.ts` (Zod + inferred TypeScript types). Re-exports live in `src/types/kit.ts`. Future evaluator I/O types live in `src/types/evaluator.ts`. Field names are exact (`company_brief`, `company_url`, `jd_chars`, `pages_used`, `requirement_ids`, `days_available`, `question_ids`, `uncovered_requirement_ids`).

Internal MongoDB documents may include `ownerId`, `status`, `progress`, `warnings`, `editorMetadata`, `practiceMetadata`, and `inputFingerprint`. Those fields must **not** be injected into Appendix A when exporting.

### Kit Builder (Prompt 10)

The protected builder endpoints edit only owned kits and require `expectedRevision` on every mutation. A successful mutation increments `revision`; stale writes return `KIT_VERSION_CONFLICT` (HTTP 409). Backend validation owns field limits, allowed categories, requirement references, unique reorder IDs, and immutable company source URLs.

Questions and flashcards retain stable exported IDs. Internal metadata stores a separate UUID identity, origin (`generated` or `user`), edited state, pin state, and order. Deleted IDs are reserved so later additions do not reuse an exported ID. Question edits update deterministic coverage; schedules are rebuilt when valid, or marked stale when must-have coverage is lost. Reordering preserves schedule and coverage content while persisting the new order.

Builder routes:

- `PATCH /api/kits/:id/company-brief`
- `POST|PATCH|DELETE /api/kits/:id/questions` and `PATCH /api/kits/:id/questions/reorder`
- `PATCH /api/kits/:id/questions/:questionId/pin`
- `POST|PATCH|DELETE /api/kits/:id/flashcards`
- `PATCH /api/kits/:id/flashcards/:flashcardId/pin`

These routes return the updated builder state plus the strict `kit` Appendix A projection. Internal metadata is returned only as separate top-level editor state and never appears inside questions, flashcards, or the company brief source list.

### Flashcard Practice (Prompt 12)

Practice state is stored in the separate `PracticeState` collection, keyed by kit owner, kit, and stable flashcard `internalId`. It contains nullable confidence (`1`, `2`, `3`, or `null`), practice count, and last-practiced time; it never enters Appendix A. Editing a card preserves its history because the internal identity remains stable. Deleting a card removes its practice record, and orphaned records are excluded from sessions.

`GET /api/kits/:id/practice` returns the current cards, internal practice DTOs, and aggregate stats. `PATCH /api/kits/:id/practice/:flashcardInternalId` accepts only `{ confidence: 1 | 2 | 3 }`; the backend owns timestamps and increments `practiceCount` atomically. Sessions sort deterministically: unpracticed first, then confidence 1/2/3, oldest practice time first, then stable builder order. Practice does not change the builder revision, coverage, schedule, or call an LLM.

### Section Regeneration (Prompt 11)

Regeneration is deliberately separate from `generateKitPipeline()`. The reusable services in `src/core/regeneration/` are:

- `regenerateCompanyBrief()`: derives a fresh brief from persisted company/interview evidence, preserving manually edited fields and replacing the source list with the evidence actually used.
- `regenerateQuestionCategory()`: partitions the selected category by current metadata, generates only replacement candidates, deduplicates against preserved prompts, preserves surviving exported IDs, and allocates new IDs above the current/deleted maximum.
- `regenerateSchedule()`: calls only the deterministic scheduler and performs zero LLM calls.

For category regeneration, `origin=user`, `edited=true`, and `pinned=true` are preservation conditions. Preserve wins when multiple conditions apply. Other categories, flashcards, research, and extracted requirements are untouched. New questions are generated with `origin=generated`, `edited=false`, `pinned=false`, fresh internal IDs, and appended within the selected category. Coverage is recomputed across the complete question set; only must-have gaps induced by the replacement are targeted for bounded repair. Pre-existing gaps are reported but are not silently repaired.

Candidate generation and validation complete before the document is mutated. Provider failure or invalid output leaves the old section intact. All regeneration mutations require `expectedRevision`, enforce ownership and the category enum, and return `KIT_VERSION_CONFLICT` for stale clients. Endpoints are `POST /api/kits/:id/regenerate/company-brief`, `POST /api/kits/:id/regenerate/questions/:category`, and `POST /api/kits/:id/regenerate/schedule`.

### Deterministic vs LLM work

Must stay TypeScript (no LLM):

- coverage comparison
- schedule allocation
- ID generation
- referential integrity
- schema validation
- retry policy mechanics
- state preservation mechanics

LLM (later, specialized stages, not one giant prompt):

- requirement extraction
- company / interview-process interpretation
- question and flashcard content

Warnings vs fatal failures: missing hiring pages or public interview discussion should become warnings (`completed_with_warnings`). `failed` is only for runs that cannot produce a usable kit.

## Retrieval security

Production fetching must reject non-HTTP(S) URLs and private/loopback addresses (SSRF). The CLI evaluator uses a **narrow** `evaluator` fetch mode so fixtures such as `http://localhost:8099/acme/` can be allowed. There is no global “disable SSRF” switch. See `src/core/retrieval/urlPolicy.ts`.

## Database

- `User`: `email`, `passwordHash`, timestamps. No plaintext passwords. Auth uses signed HTTP-only JWT cookies.
- `Kit`: owner, input (`jd`, `company_url`, `days`), generation `status` / `progress` / `warnings`, embedded Appendix A `kit`, editor and practice metadata, optional input fingerprint.

## Current implementation status (Prompt 15)

Implemented:

- Express app, JSON parsing, CORS, 404/error handlers
- `GET /health`
- Typed env loading
- Mongo connection helpers
- User and Kit models
- Appendix A Zod schemas and referential integrity
- Generation status / warning types
- OpenAI-compatible structured LLM client boundary with injectable test doubles
- URL policy boundary
- Shared dependency-injected `generateKitPipeline()`
- Evaluator CLI command surface
- Domain tests
- Bounded company-site retrieval foundation with SSRF checks, redirects, robots, parsing, ranking, and partial-failure warnings
- JD extraction with validated structured output, deterministic normalization, evidence filtering, and stable requirement IDs
- Multi-stage technical, behavioural, system-design, and company-fit question generation
- Deterministic requirement coverage, targeted gap filling, and must-have fallback questions
- Grounded flashcard generation with bounded repair, strict references, deduplication, and internal metadata
- Deterministic study scheduling with exact day counts, priority scoring, integer minute allocation, and repeat review
- Canonical dependency-injected end-to-end generation pipeline with persisted progress
- Persistence-backed duplicate trigger protection and stale-generation recovery
- Strict final Appendix A assembly and validation before completion
- Revisioned kit builder with local-draft-friendly question, flashcard, company brief, pin, add/delete, and reorder mutations
- Stable generated/user item metadata, deleted-ID reservation, ownership checks, strict mutation validation, and conflict responses
- Deterministic coverage/schedule derivation after builder edits
- Working Appendix B batch evaluator with strict input validation, per-case isolation, bounded concurrency, atomic output, and canonical pipeline reuse

Known provider-dependent limitations:

- Live LLM generation and public research require configured provider credentials.
- The evaluator command is fully wired, but a successful live-provider batch requires those credentials and an available fixture/public source.

## Company retrieval

`src/core/retrieval/crawl-company.ts` exposes the framework-independent `crawlCompanySite()` entry point. It validates the supplied URL, fetches the homepage, reads `robots.txt`, extracts same-host links from actual HTML, ranks those links by deterministic relevance signals, and fetches a small bounded set. It does not probe fixed paths such as `/careers`; a nonstandard linked path such as `/company/join-us` is discovered through the page itself.

Production retrieval accepts only HTTP(S), rejects loopback/private/link-local/metadata targets, checks DNS resolution, validates every redirect, uses a finite timeout and response byte limit, and processes only HTML or plain text. Redirects are handled manually with a small maximum. Transient 429/502/503/504 and network failures receive limited exponential backoff retries.

The evaluator mode is an explicit internal `mode: "evaluator"` option for trusted local fixtures such as `http://localhost:8099/acme/`. It is not exposed as a public request-body flag and must not be used for normal web traffic. The protected development endpoint always uses production mode:

`POST /api/kits/:id/research/company`

The endpoint requires authentication and kit ownership. It returns pages, final URLs, source tracking, metadata hints, and warnings, and persists retrieval warnings on the owned kit. It does not call an LLM or generate interview content.

## Public interview research

`src/core/research/interview-search.ts` provides the reusable `researchInterview()` stage. It generates a bounded, role-aware query set, calls the `SearchProvider` abstraction, validates and deduplicates normalized results, ranks likely company-specific interview evidence, and fetches up to five sources through the Prompt 3 safe fetcher. The default provider is Brave Web Search, configured with `SEARCH_API_URL` and `SEARCH_API_KEY`; tests use a fake provider, and missing provider configuration becomes a recoverable `INTERVIEW_SEARCH_UNAVAILABLE` warning.

Sources retain exact URLs, titles, domains, snippets, source type, authority category, fetch time, relevance score, and bounded cleaned text (12,000 characters per source). Company-owned, first-person-public, community, secondary, and unknown provenance remain distinct. No interview rounds, coding tests, or hiring claims are fabricated from the evidence packet.

`POST /api/kits/:id/research/interview` is protected by authentication and kit ownership. Results are stored in the kit's internal `research.interview` field and replace prior machine research results, making repeat clicks idempotent at the document level. Research warnings are also persisted without changing the strict Appendix A schema.

## JD extraction

`POST /api/kits/:id/extract` runs the narrow `extractJobDescription()` core stage using the OpenAI-compatible `LLMClient` boundary. The default provider is the OpenAI Chat Completions API with `LLM_MODEL` (default `gpt-4o-mini`), `LLM_BASE_URL`, and `LLM_API_KEY`. Tests inject a fake client and never require provider credentials.

The prompt receives only the pasted JD, clearly delimited as untrusted source data. The model returns role structure only; company research and public interview sources cannot add requirements. Output is validated with Zod, retried once with validation errors for malformed JSON or invalid enums, then fails with `JD_EXTRACTION_FAILED` rather than saving invalid data. Deterministic post-processing removes duplicates, benefits, EEO/legal text, application instructions, explicit negative requirements, and unsupported hallucinated items using conservative JD evidence checks.

Requirement IDs are assigned after validation in source order as `r1`, `r2`, and so on. Allowed kinds are `technical`, `behavioural`, and `domain`; allowed priorities are `must` and `nice`. Thin job descriptions remain thin, and empty results return `NO_EXPLICIT_REQUIREMENTS`. The original submitted JD character length is stored in extraction metadata as `jdChars`.

## Question generation

`POST /api/kits/:id/generate/questions` runs bounded category stages in deterministic order: technical, behavioural, system-design, then company-fit. Each stage receives only the context it needs and uses the existing structured LLM client. Technical, behavioural, and system-design questions must reference persisted JD requirement IDs; company-fit questions may use empty requirement references when grounded in company or public evidence.

Model drafts are validated, repaired at most once, normalized, deduplicated, checked against valid requirement IDs, and assigned exported IDs `q1`, `q2`, and so on in TypeScript. Difficulty is always an integer from 1 to 3. Generated question edit metadata (`origin`, `edited`, `pinned`) is stored separately and is not exposed in the strict Appendix A question shape.

Category failures are partial and produce warnings without discarding successful categories. Missing requirements or research skip unsupported categories honestly. Coverage checking, targeted gap generation, regeneration, flashcards, scheduling, and final kit completion are handled by the shared pipeline and deterministic services.

Scraped HTML is untrusted source text. The parser removes executable/noisy elements but does not treat page text as instructions. Future LLM prompts must preserve that boundary.

## Canonical generation pipeline

`src/core/pipeline/generateKit.ts` is the reusable orchestration entry point for the web API and future batch evaluator. It runs company crawl, public interview research, JD extraction, question generation and coverage, flashcards, deterministic scheduling, final validation, and strict Appendix A assembly. Core code has no Express or React dependencies; the API supplies persistence and progress callbacks.

`POST /api/kits/:id/generate` starts a server-side run and returns `202`. The kit document stores current `status`, `progress`, and `generation` metadata. The frontend polls `GET /api/kits/:id` every two seconds while an active stage is running, so refreshes recover the visible state. A persistence-backed atomic guard rejects fresh duplicate runs with `GENERATION_ALREADY_IN_PROGRESS`; runs older than `GENERATION_STALE_MINUTES` (default 15) may be retried.

Company retrieval and public interview search are recoverable warnings. JD extraction, must-have coverage failure, schedule invariant failure, and final validation failure are fatal. Flashcard provider failure is nonfatal when questions and a valid schedule still exist. Final status becomes `completed` only after strict schema, reference, coverage, schedule, and ID validation passes.

## Coverage, flashcards, and scheduling

Question coverage is computed in TypeScript from requirement IDs, never by asking the LLM whether a kit is complete. The first question pass is checked, uncovered IDs receive one targeted gap pass, and must-have gaps receive conservative deterministic fallback questions. Coverage is persisted as `uncovered_requirement_ids` and `passes`; internal diagnostics remain separate.

`POST /api/kits/:id/generate/flashcards` uses one narrow structured prompt with at most one repair attempt. Flashcards are grounded in the role, requirements, questions, and answer outlines. IDs are assigned in TypeScript as `f1`, `f2`, and so on; invalid requirement references are rejected, duplicate cards are removed, and metadata (`origin`, `edited`, `pinned`) is stored outside the strict Appendix A shape. Thin or requirement-free roles produce few or no cards, and provider failure preserves existing kit content with a warning.

`POST /api/kits/:id/generate/schedule` uses no LLM. The scheduler validates the stored `days` value (1-60), scores must requirements above nice requirements, weights harder questions earlier, distributes a deterministic total study budget using integer remainder allocation, and emits exactly the requested day count. Later days repeat valid high-value questions for review when there are more days than questions. Every must requirement must be represented by a scheduled question, otherwise scheduling fails without replacing prior content.

The LLM does not allocate study days, choose minute values, assign question IDs, or validate schedule references. Schedule arithmetic is pure TypeScript.

Robots rules are honored for the PrepForge user-agent and wildcard rules. Missing or unavailable robots files produce a recoverable warning and the crawler remains shallow, same-origin, low-concurrency, and rate-limited. Site terms cannot be universally interpreted automatically; operators remain responsible for applicable terms.

## Honesty

Thin job descriptions produce thin kits. Missing pages are reported, not invented.

## Deployment

Deploy this repository as a long-running Node.js service with Node 20+, `npm ci`, `npm run build`, and `npm start`. Configure `NODE_ENV=production`, `MONGODB_URI`, a strong unique `SESSION_SECRET`, the exact deployed frontend `WEB_ORIGIN`, `LLM_API_KEY`, and `SEARCH_API_KEY` in the host environment. Do not commit production values. The frontend must call this service through its public `NEXT_PUBLIC_API_URL`; the API uses credentialed CORS and production `SameSite=None; Secure` cookies for cross-site deployments. Verify `/health`, registration, login, refresh, logout, ownership isolation, and one real generation after deployment.

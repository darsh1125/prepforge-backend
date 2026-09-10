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
| `LLM_API_KEY` | Reserved for later LLM integration; tests must not require it |

CORS is origin-specific and `credentials: true`; wildcard origins are not used. Authentication uses a signed JWT in an HTTP-only, `SameSite=Lax` cookie. Production cookies are Secure. State-changing requests also check the `Origin` header against `WEB_ORIGIN`, which provides CSRF defense for the separate frontend/backend deployment.

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

`evaluate` is a **placeholder**. Generation is not implemented; the command exits with a clear pending message and does not invent kits.

## Architecture

```
prepforge-frontend  --HTTP JSON-->  prepforge-backend
                                         |
                                         +--> MongoDB
                                         +--> retrieval / research (later)
                                         +--> LLM provider (later)
                                         +--> deterministic core
```

### Shared pipeline

`src/core/pipeline/generateKit.ts` is the **only** generation entry point.

```
Express API  \
               ---> generateKit(...)
CLI evaluator /
```

`src/core` is framework-independent: no Express `Request`/`Response`, no React, no Next.js.

Planned stages (not implemented yet): extract requirements → fetch homepage → discover/rank/retrieve pages → research interview process → generate questions → deterministic coverage → gap fill → flashcards → deterministic schedule → validate → persist.

### Strict Appendix A contract

The evaluator kit shape is defined in `src/schemas/kit.ts` (Zod + inferred TypeScript types). Re-exports live in `src/types/kit.ts`. Future evaluator I/O types live in `src/types/evaluator.ts`. Field names are exact (`company_brief`, `company_url`, `jd_chars`, `pages_used`, `requirement_ids`, `days_available`, `question_ids`, `uncovered_requirement_ids`).

Internal MongoDB documents may include `ownerId`, `status`, `progress`, `warnings`, `editorMetadata`, `practiceMetadata`, and `inputFingerprint`. Those fields must **not** be injected into Appendix A when exporting.

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

- `User`: `email`, `passwordHash`, timestamps. No plaintext passwords. Auth is not implemented yet.
- `Kit`: owner, input (`jd`, `company_url`, `days`), generation `status` / `progress` / `warnings`, embedded Appendix A `kit`, editor and practice metadata, optional input fingerprint.

## Current implementation status (Prompt 3)

Implemented:

- Express app, JSON parsing, CORS, 404/error handlers
- `GET /health`
- Typed env loading
- Mongo connection helpers
- User and Kit models
- Appendix A Zod schemas and referential integrity
- Generation status / warning types
- LLM client interface (unimplemented)
- URL policy boundary
- Shared `generateKit()` stub
- Evaluator CLI command surface
- Domain tests
- Bounded company-site retrieval foundation with SSRF checks, redirects, robots, parsing, ranking, and partial-failure warnings

Not implemented (later prompts):

- LLM generation, requirement extraction, and public interview research
- coverage second pass, flashcards, scheduling
- kit builder, practice mode
- working batch evaluator output

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

Scraped HTML is untrusted source text. The parser removes executable/noisy elements but does not treat page text as instructions. Future LLM prompts must preserve that boundary.

Robots rules are honored for the PrepForge user-agent and wildcard rules. Missing or unavailable robots files produce a recoverable warning and the crawler remains shallow, same-origin, low-concurrency, and rate-limited. Site terms cannot be universally interpreted automatically; operators remain responsible for applicable terms.

## Honesty

Thin job descriptions produce thin kits. Missing pages are reported, not invented.

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

## Current implementation status (Prompt 1)

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

Not implemented (later prompts):

- registration / login / sessions
- crawler, research, LLM generation
- coverage second pass, flashcards, scheduling
- kit builder, practice mode
- working batch evaluator output

## Honesty

Thin job descriptions produce thin kits. Missing pages are reported, not invented.

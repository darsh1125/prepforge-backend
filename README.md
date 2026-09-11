# PrepForge Backend

PrepForge is an AI interview-preparation kit generator. This repository contains the Express API, MongoDB persistence, retrieval and research boundaries, LLM orchestration, deterministic coverage and scheduling logic, authentication, and the batch evaluator.

## Live Services

- Frontend: https://prepforge-frontend.netlify.app
- Backend API: https://prepforge-backend-pha6.onrender.com
- Frontend repository: https://github.com/darsh1125/prepforge-frontend
- Backend repository: https://github.com/darsh1125/prepforge-backend
- Health check: https://prepforge-backend-pha6.onrender.com/health

The frontend and backend remain separate repositories. MongoDB Atlas stores application state, Groq provides the OpenAI-compatible LLM endpoint, and Brave Search is an optional public-interview research provider.

## Technology

The versions are defined in `package.json`:

- Node.js `>=20`
- Express `5.1.0`
- TypeScript `^5.9.2`
- MongoDB with Mongoose `^8.18.0`
- Zod `^3.24.2` for request and output schemas
- `bcryptjs` for password hashing
- `jsonwebtoken` and `cookie-parser` for sessions
- Vitest, Supertest, and MongoDB Memory Server for tests
- Cheerio for bounded HTML cleaning and link extraction

Express owns HTTP concerns, Mongoose owns persistence, Zod validates boundaries, and the framework-independent `src/core` modules contain retrieval, generation, coverage, scheduling, validation, and practice logic.

## Local Setup

~~~bash
git clone https://github.com/darsh1125/prepforge-backend.git
cd prepforge-backend
npm ci
~~~

Create the environment file:

Windows:

~~~powershell
copy .env.example .env
~~~

macOS/Linux:

~~~bash
cp .env.example .env
~~~

For authentication and kits, provide a local MongoDB URI. Health checks and some unit tests do not require a running MongoDB instance.

Start the API:

~~~bash
npm run dev
~~~

The default API is http://localhost:5000 and the health endpoint is http://localhost:5000/health. Run the separate frontend with `NEXT_PUBLIC_API_URL=http://localhost:5000`.

## Environment Variables

| Variable | Required | Purpose | Example |
| --- | --- | --- | --- |
| `PORT` | No | HTTP port; Render supplies this in production | `5000` |
| `NODE_ENV` | No | `development`, `test`, or `production` | `development` |
| `MONGODB_URI` | For persistence | MongoDB connection string | `mongodb://127.0.0.1:27017/prepforge` |
| `SESSION_SECRET` | Production | JWT signing secret; at least 32 characters in production | placeholder only |
| `WEB_ORIGIN` | Browser use | Exact frontend origin for CORS and Origin checks | `http://localhost:3000` |
| `AUTH_COOKIE_NAME` | No | HTTP-only session cookie name | `pf_session` |
| `AUTH_TOKEN_TTL_SECONDS` | No | Session lifetime | `604800` |
| `BCRYPT_ROUNDS` | No | Password hashing work factor | `10` |
| `RETRIEVAL_TIMEOUT_MS` | No | Per-fetch timeout | `10000` |
| `RETRIEVAL_MAX_BYTES` | No | Maximum response body size | `4194304` |
| `RETRIEVAL_MAX_PAGES` | No | Maximum company pages | `7` |
| `RETRIEVAL_MAX_REDIRECTS` | No | Maximum redirects per fetch | `4` |
| `LLM_API_KEY` | Generation | Groq API key; tests can use injected clients | empty locally until configured |
| `LLM_MODEL` | Generation | OpenAI-compatible model name | `openai/gpt-oss-20b` |
| `LLM_BASE_URL` | Generation | OpenAI-compatible provider base URL | `https://api.groq.com/openai/v1` |
| `SEARCH_API_URL` | No | Search provider endpoint | `https://api.search.brave.com/res/v1/web/search` |
| `SEARCH_API_KEY` | No | Optional Brave Search key | empty |
| `GENERATION_STALE_MINUTES` | No | Age after which an active generation can be retried | `15` |

Never commit `.env`, production MongoDB credentials, provider keys, or real session secrets. `LLM_API_KEY` and `SEARCH_API_KEY` are read only by the backend.

## Exact Commands

~~~bash
npm run dev
npm run lint
npm run typecheck
npm run test
npm run build
npm run start
~~~

## Architecture

~~~text
src/
  app.ts, server.ts              Express composition and startup
  routes/                        HTTP route registration
  controllers/                   auth, kit, builder, practice, and health handlers
  middleware/                    auth, CSRF/Origin, and error handling
  models/                        User, Kit, and PracticeState Mongoose models
  schemas/                       Zod request, Appendix A, builder, and practice schemas
  config/                        environment and database connection
  core/
    auth/                        signed session helpers
    retrieval/                   URL policy, fetch, robots, cleaning, links, ranking
    research/                    public interview search and source cleaning/ranking
    extraction/                  JD prompts, validation, normalization, IDs
    generation/                  question and flashcard generation
    coverage/                    deterministic coverage and gap filling
    scheduling/                  deterministic priority and minute allocation
    regeneration/                preservation-aware section regeneration
    builder/                     revision and editor metadata helpers
    practice/                    confidence sorting and aggregate stats
    validation/                  Appendix A and referential validation
    pipeline/                    shared end-to-end generation orchestration
  cli/                            batch evaluator
tests/                             domain, security, evaluator, and contract tests
~~~

The web API and CLI evaluator share `src/core/pipeline/generateKit.ts`. The core pipeline has no Express or React dependency. The CLI does not create a second fake generation implementation.

## LLM Responsibilities

The deployed provider is Groq through its OpenAI-compatible Chat Completions API:

~~~env
LLM_MODEL=openai/gpt-oss-20b
LLM_BASE_URL=https://api.groq.com/openai/v1
~~~

The LLM handles structured semantic work:

- Extracting role structure and explicit JD requirements
- Generating categorized interview questions and answer outlines
- Generating grounded flashcards
- Targeted gap-question generation after deterministic coverage detects missing requirements

The company brief is assembled deterministically from retrieved company text and source URLs. The LLM does not decide requirement coverage, assign exported IDs, allocate days or minutes, validate references, or decide whether the final kit satisfies Appendix A.

## Generation Pipeline

The actual canonical order in `src/core/pipeline/generateKit.ts` is:

1. Validate preparation days and the company URL policy.
2. Crawl the supplied company URL, discover and rank same-host links, and collect recoverable retrieval warnings.
3. Research public interview evidence with bounded search and source fetching.
4. Extract role structure and requirements from the pasted JD.
5. Generate technical, behavioural, system-design, and company-fit questions in deterministic category order.
6. Validate question references and compute requirement coverage in TypeScript.
7. Run one targeted gap pass for uncovered requirements, then deterministic must-have fallback questions when needed.
8. Fail the pipeline if a must-have requirement remains uncovered; nice-to-have gaps can remain as warnings.
9. Generate grounded flashcards.
10. Allocate a deterministic study schedule with the requested number of days.
11. Validate Appendix A structure, IDs, references, coverage, and schedule invariants.
12. Return the kit; the web controller persists progress, warnings, generation state, and final state in MongoDB.

The sequence is staged so each boundary can validate its output, missing research can be represented honestly, deterministic operations cannot be overridden by model text, and provider failures do not corrupt an already valid section.

## Retrieval and Research

`src/core/retrieval/crawl-company.ts` starts from the supplied URL, fetches the homepage, cleans HTML, extracts relative and absolute links, ranks same-host candidates, and follows a bounded depth-one crawl. Defaults are a 10-second timeout, 4 MiB response limit, 7 pages, 4 redirects, two retries for transient failures, and a 50 ms request delay. Only `text/html` and `text/plain` are processed.

Redirects are manually followed and rechecked against the URL policy. Production rejects non-HTTP(S), loopback, private, link-local, metadata, and hostnames resolving to private addresses. `robots.txt` rules for `*` and the PrepForge user agent are honored. Missing or unavailable robots files produce a recoverable warning. Hiring/careers pages are discovered from links and ranked; fixed-path probing is not used.

`src/core/research/interview-search.ts` uses the `SearchProvider` abstraction. The default is Brave Web Search, configured by `SEARCH_API_URL` and `SEARCH_API_KEY`. It generates at most five role-aware queries, normalizes and deduplicates results, ranks them, and fetches up to five sources through the safe fetcher. Official company pages, public first-person reports, community/forum sources, secondary blogs, and unknown sources retain separate authority labels. Missing search credentials or unavailable public evidence becomes a warning, not fabricated company policy.

All job descriptions, crawled pages, snippets, and search results are untrusted source data. Prompts delimit source content and instruct the model not to follow embedded commands. HTML executable/noisy elements are removed before use, but external text is never treated as trusted application instructions.

## Requirement Extraction and Coverage

`src/core/extraction/jd-extractor.ts` validates structured model output, keeps only requirements supported by the pasted JD, and preserves thin JDs as thin. Requirements are normalized with:

- `id`: stable exported IDs such as `r1`, `r2`
- `text`: requirement text
- `kind`: `technical`, `behavioural`, or `domain`
- `priority`: `must` or `nice`

Benefits, legal text, application instructions, negative requirements, and unsupported model inventions are filtered by deterministic normalization.

`src/core/coverage/check-coverage.ts` builds a requirement-to-question map from `question.requirement_ids`. Covered and uncovered IDs are computed in TypeScript. The first pass is followed by one targeted gap pass. Remaining uncovered must-have requirements receive conservative deterministic fallback questions. A successful final kit cannot contain an uncovered must-have; a nice-to-have gap may remain with a warning.

## Scheduling

`src/core/scheduling/build-schedule.ts` never calls the LLM. It validates the input, scores must requirements above nice requirements and harder questions above easier ones, prioritizes questions, and allocates a bounded study budget using integer remainder allocation. It emits exactly the requested number of days, sequential day numbers, a focus string, integer minutes, and question IDs.

For one day, one schedule day is emitted. For longer windows, questions are distributed across days and repeated for review when there are more days than questions. The supported range is 1-60 days. Schedule validation rejects invalid references, day counts, day ordering, non-integer minutes, and schedules that fail must-have coverage.

## Appendix A and Persistence

`src/schemas/kit.ts` defines the strict Appendix A contract and `src/core/validation/kit.ts` validates it before completion. Referential integrity checks verify requirement, question, flashcard, and schedule references. Internal persistence fields are kept outside the exported kit projection.

MongoDB models persist:

- `User`: normalized email and bcrypt password hash
- `Kit`: owner, input, progress, warnings, generation status, research, extraction, questions, metadata, coverage, flashcards, schedule, revisions, and the Appendix A-shaped kit
- `PracticeState`: owner/kit/card identity, confidence, practice count, and last-practiced time

Question and flashcard metadata uses stable internal IDs plus `origin`, `edited`, `pinned`, and `order`. User-created, edited, and pinned items are preserved during category regeneration. Untouched generated items may be replaced. Deleted export IDs are reserved so later additions do not reuse them. Builder mutations require `expectedRevision`; stale writes return HTTP 409.

## Authentication and Security

Registration hashes passwords with bcrypt. Login creates a signed JWT in an HTTP-only cookie; logout clears it; protected middleware verifies the cookie and attaches the authenticated user. Kit and practice controllers query by both resource ID and authenticated owner ID.

Production cookies use `httpOnly`, `secure`, `sameSite: "none"`, and the configured finite TTL. Development uses `sameSite: "lax"`. CORS allows only `WEB_ORIGIN` with `credentials: true`; the frontend uses `credentials: "include"`. State-changing production requests also require the exact configured `Origin` header.

Input bodies are limited and validated with Zod. Retrieval has URL, DNS, protocol, redirect, content-type, content-size, timeout, retry, and SSRF checks. The evaluator has a narrow internal `mode: "evaluator"` that permits supplied localhost fixtures such as `http://localhost:8099/acme/`; production requests cannot select that mode and still reject unsafe public targets.

## Failure Handling and Trade-offs

- Invalid or unsafe URLs fail validation before retrieval.
- 404s, timeouts, unsupported content, unavailable robots, missing hiring pages, and missing public interview evidence become honest warnings where a usable kit can continue.
- Thin JDs remain thin instead of being filled with invented requirements.
- Malformed structured LLM output receives a bounded repair attempt; invalid output then fails the relevant stage.
- LLM unavailable and rate-limited states are surfaced as provider failures; tests inject fake clients.
- Duplicate generation triggers are blocked by a persistence-backed lock; stale active runs can be retried.
- Flashcard provider failure preserves existing content when possible.
- Schedule and final validation failures do not replace prior valid content.
- Retrieval is intentionally shallow and bounded, trading completeness for predictable latency and lower SSRF/rate-limit exposure.
- Render free-tier cold starts and Groq/search provider quotas can delay or limit live generation.
- Scheduling is deterministic and explainable rather than a full optimization solver.

## Deployment

### Render backend

Use Node 20+ with:

~~~bash
npm ci --include=dev && npm run build
npm start
~~~

Set these values in Render, using placeholders for secrets:

~~~env
NODE_ENV=production
MONGODB_URI=<MongoDB Atlas SRV URI>
SESSION_SECRET=<strong random secret, at least 32 characters>
WEB_ORIGIN=https://prepforge-frontend.netlify.app
AUTH_COOKIE_NAME=pf_session
AUTH_TOKEN_TTL_SECONDS=604800
BCRYPT_ROUNDS=10
LLM_API_KEY=<Groq API key>
LLM_MODEL=openai/gpt-oss-20b
LLM_BASE_URL=https://api.groq.com/openai/v1
SEARCH_API_URL=https://api.search.brave.com/res/v1/web/search
SEARCH_API_KEY=
~~~

Do not set a production MongoDB URI to localhost. Render supplies `PORT` through the environment. Verify `/health`, registration, login, refresh, logout, ownership isolation, and one real generation after deployment.

### Netlify frontend

Set:

~~~env
NEXT_PUBLIC_API_URL=https://prepforge-backend-pha6.onrender.com
~~~

The backend must use the exact Netlify URL as `WEB_ORIGIN`, without a trailing slash. Never expose backend secrets in Netlify variables.

## Batch Evaluator

The mandatory command is:

~~~bash
npm run evaluate -- --input <cases.json> --output <kits.json>
~~~

Example:

~~~bash
npm run evaluate -- --input cases.json --output kits.json
~~~

Input is a JSON array:

~~~json
[
  {
    "id": "case-01",
    "jd": "Senior Backend Engineer...",
    "company_url": "http://localhost:8099/acme/",
    "days": 5
  }
]
~~~

Output is an Appendix B envelope with one ordered result per input:

~~~json
{
  "version": "1.0",
  "generated_at": "...",
  "kits": [
    { "id": "case-01", "status": "ok", "kit": {}, "error": null }
  ]
}
~~~

The evaluator validates IDs and fields, continues after a case-level invalid input or generation failure, writes one result per case, uses bounded concurrency of two, writes output atomically, and invokes the same `generateKitPipeline()` as the web API. Duplicate or missing IDs invalidate the invocation. Evaluator mode is the only path that permits the supplied localhost fixture; production SSRF policy is unchanged.

## Tests

~~~bash
npm run lint
npm run typecheck
npm run test
~~~

The tests cover deterministic coverage and gap passes, deterministic scheduling including one-day and sixty-day boundaries, Appendix A and referential validation, retrieval and SSRF policy, robots and redirects, authentication/input schemas, evaluator isolation and output, regeneration preservation, practice ordering/confidence, question and flashcard generation boundaries, and pipeline failure handling.

## Known Limitations and Potential Assignment Gaps

- The frontend has no automated browser end-to-end test suite; validation is covered by backend domain/API tests and manual production testing.
- Public interview research depends on an optional Brave Search credential. Without it, the application intentionally reports warnings and does not invent sources.
- The live provider path requires valid Groq credentials; tests use injected clients and do not prove provider availability.
- There is no full external integration test against the deployed Netlify, Render, MongoDB Atlas, and Groq services in this repository.

## Creative Feature

The implemented creative feature is confidence-aware flashcard practice. It persists confidence and practice history separately from the generated Appendix A kit, prioritizes weak and unpracticed cards, and lets the user turn generated content into a focused review session without changing the builder revision or schedule.

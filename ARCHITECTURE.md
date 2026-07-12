# Content Intelligence Platform — Architecture

A complete, replica-ready specification of the system: what it does, how it's built, every table, every endpoint, every flow.

---

## 1. What the product is

A multi-account content intelligence platform for marketing teams. Each **account** (brand) has its own knowledge base, personas, source types, and pipeline. The system helps a team turn source material (videos, blogs, webinars, reports, etc.) into a production-ready **repurposing plan**, keeps ideas in a lab, watches for trending topics via an AI supervisor, and schedules approved content onto a calendar.

Every output is **grounded in the account's knowledge base** — if the KB has nothing relevant, the system refuses rather than inventing.

**Primary user flow:** upload knowledge → paste/upload source → get scored insights and a repurposing plan → route promising pieces into the Studio → draft/approve → schedule.

---

## 2. Tech stack

| Layer | Choice | Why |
|-------|--------|-----|
| Frontend | React 19 + Vite 6 + TypeScript 5.7 | Modern React, fast dev loop |
| State | Zustand 5 | Simple global store, no boilerplate |
| Router | React Router 7 | Standard client routing |
| Auth + DB | Supabase (Postgres + Auth + Storage) | RLS-native multi-tenant, JWT-based auth |
| Serverless API | Vercel Node functions (`/api/*.ts`) | Same-origin, no CORS, easy env vars |
| LLM | OpenRouter (default model: `anthropic/claude-sonnet-4-5`) | Model-agnostic routing, single API key |
| Live signals | Tavily Search API | News/web search for trend supervisor |
| Cron | Vercel Cron | Daily automated trend scans |
| Deploy | Vercel + GitHub CI | Push-to-deploy |

**Retrieval:** semantic via pgvector (1024-dim vectors, HNSW cosine index). Embedding provider is auto-selected: **Voyage AI `voyage-3`** (default — 200M tokens free forever) or **OpenAI `text-embedding-3-small`** (with `dimensions: 1024`). Automatic keyword-scoring fallback when neither key is configured or an account still has un-embedded chunks. See §7.3.

---

## 3. Repository layout

```
Content-intelligence/
├── api/                              # Vercel serverless functions
│   ├── analyze-content.ts            # New Analysis: source → repurposing plan
│   ├── generate-content.ts           # Studio: outline / draft / regenerate / quality
│   ├── ideas-lab.ts                  # Ideas Lab: generate / webinar / seo / seasonal / expand
│   ├── trend-scan.ts                 # Trends: manual scan + daily cron
│   ├── trend-supervisor.ts           # Trends: supervise pasted candidate topics
│   └── extract-knowledge.ts          # KB: extract structured metadata from uploaded file
├── src/
│   ├── main.tsx                      # App bootstrap
│   ├── App.tsx                       # Route guard + AccountProvider
│   ├── index.css                     # All CSS (design tokens + component classes)
│   ├── config/                       # Model config, constants
│   ├── contexts/AccountContext.tsx   # Active account + switcher
│   ├── stores/authStore.ts           # Zustand: Supabase auth session
│   ├── store/index.ts                # Zustand: UI state (theme, active tab, studio, ideasSeed)
│   ├── lib/
│   │   ├── supabase.ts               # Supabase client + supabaseConfigured flag
│   │   ├── api.ts                    # All server calls (thin over fetch + supabase-js)
│   │   ├── retrieval.ts              # KB retrieval + strict grounding gate
│   │   ├── chunker.ts                # KB chunking on upload
│   │   ├── fileParser.ts             # PDF/DOCX/TXT/MD/CSV → plain text
│   │   ├── markdown.ts               # XSS-safe markdown → HTML renderer
│   │   ├── toast.ts                  # Shared safe toast helper
│   │   ├── audit.ts                  # Client-side audit log writer
│   │   ├── archetype-hint.ts         # Client mirror of server archetype detector
│   │   └── models.ts                 # LLM model config
│   ├── types/index.ts                # All shared TS types
│   ├── components/
│   │   ├── layout/AppShell.tsx       # Lazy-loads pages, holds Sidebar + Topbar + Outlet
│   │   ├── layout/Sidebar.tsx        # Icon nav (7 items)
│   │   ├── layout/Topbar.tsx         # Title + AccountSwitcher + theme + signout
│   │   └── auth/                     # Sign in / sign up UI
│   └── pages/                        # One file per major screen
│       ├── AnalyzePage.tsx           # New Analysis
│       ├── OpportunitiesPage.tsx     # Filter/route opportunities → Studio
│       ├── StudioPage.tsx            # Outline → Draft → Approve → Calendar
│       ├── KnowledgeBasePage.tsx     # Upload + toggle active + preview
│       ├── IdeasLabPage.tsx          # 5 sub-tabs (Generate/Saved/Seasonal/Webinar/SEO)
│       ├── TrendsPage.tsx            # Domain profile + scans + 4-bucket dashboard
│       ├── CalendarPage.tsx          # Scheduled/published/cancelled list
│       └── SettingsPage.tsx          # Integrations + platform status
├── supabase/migrations/              # SQL migrations, applied via Supabase Studio
├── vercel.json                       # Function config (maxDuration, crons, rewrites)
├── .env.example                      # Documents every env var
└── package.json
```

**Rule:** every file in `api/` is fully self-contained — the ONLY import allowed is `import type { VercelRequest, VercelResponse } from '@vercel/node'`. No cross-file imports. This eliminates a class of Vercel bundling bugs (files under `_shared/`, or `../lib/*` in some scenarios, may not be bundled into a serverless function's build). Utilities are duplicated across files by design.

---

## 4. Data model (Postgres via Supabase)

### 4.1 Multi-tenancy model

Three levels: **Organization → Account → User via `account_access`**.

- An **Organization** owns many Accounts (brands).
- A **User** belongs to an Organization (top-level tenant boundary).
- **`account_access`** is the M:N join between users and accounts, with a role (`manager | editor | viewer`). Every row-level security policy joins through this table.

The active **Account** in the UI is the "tenant" for all data reads and writes — even a user with access to 5 accounts sees data for exactly one at a time.

### 4.2 Table-by-table

Migrations live in `supabase/migrations/*.sql` and are applied via the Supabase SQL Editor (there's no automated migration runner). Order matters — apply by filename.

#### `organizations`
`id uuid pk`, `name text`, `created_at timestamptz`.
Top-level tenant boundary. Not directly used by most flows — most queries scope by `account_id`.

#### `accounts`
`id uuid pk`, `org_id uuid fk`, `name text`, `status ('active'|'paused'|'archived')`, `profile jsonb` (holds `domain_url`, `trend_profile`, and any per-account config), `created_at`.
The tenant everything is scoped by.

#### `users`
`id uuid pk` (mirrors `auth.users.id`), `org_id`, `name`, `email`, `is_org_admin bool`, `created_at`.
A trigger (migration `00004_auth_user_trigger.sql`) mirrors new rows from `auth.users` into this table on signup.

#### `account_access`
`user_id uuid`, `account_id uuid`, `role text`. Primary key is (`user_id`, `account_id`).
Powers RLS: `account_id IN (SELECT account_id FROM account_access WHERE user_id = auth.uid())`.

#### `knowledge_files`
`id uuid pk`, `account_id`, `file_name`, `category` (see enum below), `priority ('critical'|'high'|'standard'|'low')`, `source_type ('file'|'paste'|'url')`, `storage_url text null`, `active bool`, `version int`, `structured jsonb` (LLM-extracted metadata: summary, main_topics, important_facts, key_messages, audience, etc.), `ingest_status ('pending'|'processing'|'ready'|'failed')`, `uploaded_by uuid`, `created_at`.

**Categories:** `persona | brand | compliance | terminology | expert | guidelines | raw_notes | data | idea`. These drive retrieval (constraint chunks vs context chunks) and readiness (required categories per env config).

#### `knowledge_chunks`
`id uuid pk`, `file_id fk`, `account_id`, `chunk_text text`, `embed_model text` (e.g. `text-embedding-3-small`), `embedding vector(1536)` (nullable — filled by server-side embedding), `token_count int null`, `position int null`, `created_at`.
Chunking happens client-side on upload (`src/lib/chunker.ts`). Embeddings are generated server-side by `/api/extract-knowledge` on upload (best-effort — requires `OPENAI_API_KEY`), and by `/api/backfill-embeddings` for historical chunks. Retrieval calls the SQL RPC `match_chunks(p_account_id, p_query_embedding, p_match_count, p_exclude_file_ids)` which orders by cosine distance (`<=>`) and returns similarity as `1 − distance`. RLS on the RPC is `SECURITY INVOKER`, so the caller's `account_access` still gates access. When no embedding is available for the account, retrieval automatically falls back to keyword-overlap scoring.

#### `analyses`
`id uuid pk`, `account_id`, `source_text text`, `source_type text`, `result jsonb` (the full `AnalysisResult` returned by `/api/analyze-content`), `created_by`, `created_at`.

#### `opportunities`
`id uuid pk`, `account_id`, `analysis_id fk null`, `title`, `persona_file_id fk null`, `content_angle`, `format`, `status ('open'|'in_studio'|'dropped')`, `priority`, `persona_name`, `persona_relevance_score float`, `recommendation_reason`, `timeliness`, `suggested_cta`, `source_context`, `metadata jsonb` (holds sequence_rank, effort, hook, structure, kpi, prerequisites, kb_reference — the new production-ready fields), `created_at`.

#### `assets`
`id uuid pk`, `account_id`, `opportunity_id fk null`, `stage ('outline'|'draft'|'approved'|'scheduled'|'published')`, `body text null`, `quality jsonb`, `grounded_chunk_ids jsonb` (array of chunk IDs the draft is grounded in), `confirmed_source_ids jsonb`, `feedback_log jsonb`, `created_by`, `created_at`.

#### `calendar_items`
`id uuid pk`, `account_id`, `asset_id fk null`, `title`, `format`, `scheduled_for timestamptz null`, `status ('scheduled'|'published'|'cancelled')`, `body text null`, `quality jsonb null`, `created_at`.

#### `integrations`
Per-account external integration records. `type text`, `provider`, `credentials_ref` (never store secrets in the DB — this is a reference), `status`, `config jsonb`.

#### `source_types` (migration 00005 + 00008)
`id`, `account_id`, `name`, `slug`, `description`, `formats jsonb` (allowed output formats), `analysis_guidance text` (optional user override for archetype-default extraction rules), `created_at`.

Seeded with 6 types per Right Horizons account: ET Video, Author Blog, Weekly Content, Webinar, Event/Workshop, Trending Topic. Other accounts add their own.

#### `trend_scans` (migration 00007)
`id`, `account_id`, `source text` (e.g., `tavily`, `suggest`, `manual`, `cron:tavily`), `total_reviewed int`, `domain_sent`, `supertrends_sent`, `monitored`, `rejected`, `created_at`.
One row per scan run.

#### `trend_records` (migration 00007)
`id`, `account_id`, `scan_id fk null`, `topic`, `summary`, `classification ('domain_trend'|'supertrend_exception'|'monitor'|'reject')`, all 4 scores (`domain_relevance_score`, `trend_impact_score`, `adaptability_score`, `risk_score`, `confidence_score`), `priority`, `trend_stage`, `estimated_lifespan`, `recommended_route`, `reason`, `suggested_connection`, `recommended_formats jsonb`, `related_keywords jsonb`, `source_signals jsonb`, `status ('new'|'accepted'|'monitoring'|'rejected'|'actioned')`, `created_at`.

#### `audit_log`
`id`, `account_id`, `user_id null`, `action text`, `target_type null`, `target_id null`, `detail jsonb`, `created_at`. Client-side writer at `src/lib/audit.ts`.

### 4.3 Row-Level Security (RLS)

Every table has RLS enabled. The universal pattern is:

**SELECT policy:**
```sql
account_id IN (SELECT account_id FROM account_access WHERE user_id = auth.uid())
```

**INSERT / UPDATE / DELETE policy:**
```sql
account_id IN (
  SELECT account_id FROM account_access
  WHERE user_id = auth.uid() AND role IN ('manager', 'editor')
)
```
(Viewers cannot write.)

Migrations 00002 (base) and 00006 (storage) install these policies. Migration 00007 mirrors them for `trend_records` and `trend_scans`.

**Service-role bypass:** the daily trend cron uses `SUPABASE_SERVICE_ROLE_KEY` to bypass RLS when iterating accounts (see §7.9). This is the only privileged code path.

---

## 5. Frontend architecture

### 5.1 Bootstrap

- `src/main.tsx` mounts `<App />`.
- `App.tsx`: wraps in `AccountProvider` and `AuthListener`. If signed out → render `<AuthPage />`. If no account selected → render `<AccountPicker />`. Otherwise render `<AppShell />`.
- `AppShell` holds:
  - `Sidebar` (icon-only nav, 7 items)
  - `Topbar` (page title, `AccountSwitcher`, theme toggle, sign out)
  - `<Suspense>` around the page component (all pages lazy-loaded)

### 5.2 State

Two Zustand stores intentionally separated:

- **`stores/authStore.ts`** — the Supabase auth session (`user`, `session`, `signIn`, `signOut`). One source of truth for who is logged in.
- **`store/index.ts`** — UI state: theme, active tab, active studio opportunity, current studio asset (in-progress outline/draft), `ideasSeed` (when a trend routes into Ideas Lab it drops a seed here to prefill the brief).

Context (not Zustand) for the active account: `contexts/AccountContext.tsx` — because switching accounts should reset the child tree (React remount pattern).

### 5.3 Client → server calls

Every server call goes through `src/lib/api.ts`, organized by domain:

- `api.auth` — signUp/signIn/signOut (Supabase Auth)
- `api.kb` — upload/list/toggle/preview knowledge files
- `api.analysis` — run/list/get analyses (calls `/api/analyze-content`)
- `api.opportunities` — CRUD + createFromAnalysis
- `api.studio` — asset lifecycle (`generate-content`)
- `api.ideas` — generate/webinar/seo/seasonal/expand (calls `/api/ideas-lab`)
- `api.trends` — profile CRUD, runScan, superviseManual, list, updateStatus, remove
- `api.calendar` — list/add/schedule/updateStatus/export
- `api.integrations` — list/configure/updateStatus
- `api.sourceTypes` — list/create/update/delete
- `api.accounts` — profile updates

All methods return `{ data: T | null, error: string | null }` — never throw, so callers never need try/catch.

### 5.4 Design system

All CSS in `src/index.css`. Uses CSS custom properties for theme tokens (`--surface-card`, `--text-primary`, `--accent-primary`, etc.) that flip between light/dark. Component classes: `.glass-card-static`, `.btn`, `.btn-primary`, `.badge`, `.field`, `.field-label`, `.glass-input`, `.glass-textarea`, `.grid`, `.grid-2`, `.grid-3`, `.hairline`, `.modal-overlay`, `.glass-modal`, `.md-body`, `.toast`. No CSS framework, no Tailwind runtime.

---

## 6. Deployment topology

```
                Browser
                   │
                   ▼
    ┌──────────────────────────────┐
    │  Vercel Edge (static assets  │
    │  + serverless functions)     │
    │                              │
    │  /                → SPA      │
    │  /api/analyze-... → Node fn  │
    │  /api/ideas-lab   → Node fn  │
    │  /api/trend-scan  → Node fn  │
    │  /api/...         → Node fn  │
    └───────┬───────────────────┬──┘
            │                   │
            │                   │  (server-side only)
            ▼                   ▼
    ┌──────────────┐    ┌──────────────────┐
    │ Supabase     │    │ OpenRouter LLM   │
    │ Postgres     │    │ (Claude Sonnet)  │
    │ + Auth       │    └──────────────────┘
    │ + Storage    │
    └──────────────┘    ┌──────────────────┐
                        │ Tavily Search    │  (optional)
                        └──────────────────┘
```

Vercel Cron hits `GET /api/trend-scan` once per day (via `vercel.json crons`).

**vercel.json:**
- `functions` block sets `maxDuration` per endpoint (analyze/generate/ideas-lab: 120s; trend-scan: 300s; extract-knowledge: 60s)
- `rewrites` sends `/api/(.*)` to the API route and everything else to `/index.html` (SPA fallback)
- `crons` schedules the daily trend scan at `0 6 * * *` UTC

### 6.1 Environment variables

**Client (`VITE_*` — safe to expose):**
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` — public keys
- `VITE_CONSTRAINT_CATEGORIES` (default: `compliance,brand,guidelines`) — KB categories always included in retrieval
- `VITE_GENERATION_REQUIRED_CATEGORIES` (default: `brand`) — categories that gate generation readiness
- `VITE_RETRIEVAL_TOP_K` (default: `8`) — top-N context chunks

**Server (Vercel Environment Variables — never in code):**
- `OPENROUTER_API_KEY` **required** — the LLM key
- `LLM_MODEL` (default `anthropic/claude-sonnet-4-5`)
- `SITE_URL` — used as OpenRouter Referer header
- `VOYAGE_API_KEY` — enables semantic retrieval via Voyage AI (default provider, 200M tokens free forever). Used by `/api/embed-query`, `/api/extract-knowledge`, and `/api/backfill-embeddings`. Without any embedding provider set, the client falls back to keyword scoring — nothing breaks.
- `OPENAI_API_KEY` — alternative embedding provider (`text-embedding-3-small` with `dimensions: 1024`). Either this or `VOYAGE_API_KEY` is sufficient.
- `EMBED_PROVIDER` — optional. Forces `voyage` or `openai` when both keys are set (auto-picks Voyage otherwise).
- `TAVILY_API_KEY` — optional; without it, trend scans fall back to LLM-suggested candidate topics
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` — required by `/api/backfill-embeddings` (verifies caller role via anon key + JWT, does bulk writes via service role) and by `/api/extract-knowledge`'s chunk-embedding path. Also used by the daily trend cron. Without them, semantic retrieval still works read-side (RPC + embed-query), but chunk writes on upload and backfill are skipped.
- `CRON_SECRET` — optional bearer token; Vercel Cron sends `Authorization: Bearer <secret>`

---

## 7. Feature flows — end to end

Each subsection follows the same pattern: user goal → data flow → API contract → prompt design → result rendering → DB writes.

### 7.1 Auth + Account selection

1. User hits `/`. If no session, `<AuthPage />` shows.
2. `api.auth.signUp/signIn` calls Supabase Auth. On success, `supabase.auth.getSession()` returns a JWT.
3. A DB trigger (`00004_auth_user_trigger.sql`) mirrors the new `auth.users` row into `public.users` (with `org_id`).
4. `authStore` subscribes to `supabase.auth.onAuthStateChange` — every downstream call attaches the JWT automatically (supabase-js does this internally).
5. `AccountContext` calls `api.accounts.listMine()` (which joins `account_access → accounts`) and lets the user pick one. The picked `accountId` is stored in the context and every subsequent query is scoped by it.

### 7.2 Knowledge Base

**Purpose:** every generation grounds in this. If it's empty for a topic, the analyzer refuses.

**Upload flow (`KnowledgeBasePage.tsx` + `api.kb.upload`):**
1. User picks a file, category, priority.
2. Client parses to plain text via `src/lib/fileParser.ts`:
   - **PDF** → extract text via `pdfjs-dist`
   - **DOCX** → unzip in browser using native `DecompressionStream('deflate-raw')`, then extract `word/document.xml` text
   - **TXT / MD / CSV** → read as text
   - **Unknown** → attempt UTF-8 text read as a fallback
3. Text is chunked by `src/lib/chunker.ts` (paragraph-based, ~500 chars per chunk).
4. Client inserts `knowledge_files` row (`ingest_status='processing'`), then `knowledge_chunks` rows in bulk.
5. Client optionally calls `/api/extract-knowledge` to LLM-extract structured metadata (summary, main_topics, important_facts, key_messages, audience) — stored in `knowledge_files.structured`.
6. Updates row to `ingest_status='ready'`.
7. Toggle active/inactive: only active files feed retrieval.

**Preview:** click a file → drawer shows structured metadata + first N chunks.

### 7.3 Retrieval + strict grounding (`src/lib/retrieval.ts`)

Called by every generation endpoint (Analyze, Studio, Ideas Lab).

The interface is stable — `retrieve()` always returns `{ chunks, constraintChunks, sourcesUsed, topScore, readiness, retrievalMode }`. Only the scoring strategy differs.

**Steps:**
1. `checkReadiness(accountId)`: fetch all active `knowledge_files.category` values. Compare against `REQUIRED_CATEGORIES` (default `['brand']`). If a required category is missing → warn but don't refuse.
2. **Constraint chunks:** always fetch every chunk from files in `CONSTRAINT_CATEGORIES` (`compliance`, `brand`, `guidelines`). No scoring, no filtering — these are baseline context. This behaviour is preserved from the keyword era.
3. **Context chunks — semantic first:**
   - Client POSTs the query text to `/api/embed-query`. Server returns a 1536-d embedding via OpenAI (`text-embedding-3-small`), sliced to 8000 chars.
   - Client calls `supabase.rpc('match_chunks', { p_account_id, p_query_embedding, p_match_count: TOP_K, p_exclude_file_ids: constraintIds })`. The RPC returns top-K chunks by cosine similarity, joins `knowledge_files` for `file_name` + `category`, and filters to `active = true, ingest_status = 'ready'`. `SECURITY INVOKER` → RLS still applies.
   - `topScore` is the maximum returned similarity (0..1). `retrievalMode = 'semantic'`.
4. **Context chunks — keyword fallback:** used when any of the following are true:
   - `/api/embed-query` returned a non-200 (missing `OPENAI_API_KEY` → 503; other errors → 5xx).
   - The RPC returned 0 rows (means no chunks for this account have embeddings yet — a fresh migration or a new account before backfill runs).
   - Old behaviour: fetch up to 120 chunks by `position`, score `+1 per unique query keyword ≥ 5 chars`, sort desc, keep top-K. `topScore` is the raw keyword count. `retrievalMode = 'keyword'`.
5. **Strict grounding gate:**
   - Semantic mode → refuse if `topScore < VITE_RETRIEVAL_MIN_SIMILARITY` (default 0.25) AND no constraint chunks.
   - Keyword mode → refuse if `topScore === 0` AND no constraint chunks (unchanged).
   - Refusal returns `{ refused: true, reason: "I don't have that idea in the knowledge base..." }` for the caller UI to display.
6. Return `{ refused, chunks, constraintChunks, sourcesUsed, topScore, readiness, retrievalMode }`.

**`sourcesUsed`** is a de-duplicated list of `{file_id, file_name, category, structured}` derived from the chunks — shown to the user under "Sources Used from Knowledge Hub".

**Embedding lifecycle:**
- **Upload path:** `api.kb.upload` inserts chunks with `embedding = NULL`, then calls `/api/extract-knowledge` with `{file_id, account_id}`. The server extracts structured metadata AND (if `OPENAI_API_KEY` + `SUPABASE_SERVICE_ROLE_KEY` are set) embeds all chunks for that file in batches of 100, writing back via the service role.
- **Backfill path:** the KB page shows a status bar (`X of Y chunks embedded`) and a `Rebuild search index` button. Clicking it POSTs to `/api/backfill-embeddings` in a loop (up to 500 chunks per call) until `remaining = 0`. The endpoint verifies the caller's `account_access` role (`manager`/`editor` only) via their JWT, then uses the service role for the batch writes.
- **Constraint chunks:** never subject to similarity filtering; they're always returned in full to the LLM as baseline context.

### 7.4 New Analysis (`/api/analyze-content` + `AnalyzePage.tsx`)

**Purpose:** turn ONE source (video transcript, blog, webinar recap, etc.) into a repurposing plan — many derivative content pieces, each traceable to a source moment and a KB chunk.

#### Client sequence
```
User picks source type (chip) → archetype hint shown live
User fills brief (title, owner, text or URL, marketing notes)
Click "Run Analysis"
├─ Client calls retrieve(accountId, sourceText, sourceType)
├─ Fetches personas in parallel (files with category='persona')
├─ If retrieval.refused → show refusal, don't call API
├─ POST /api/analyze-content with:
│    source_text, source_type, source_type_context {name, slug, description, formats, analysis_guidance},
│    source_title, source_owner, source_url, marketing_notes,
│    knowledge_chunks[] (constraint chunks sliced + context chunks),
│    file_context (sourcesUsed metadata),
│    personas[],
│    account_id
├─ Server returns { success, analysis }
├─ If analysis.refused === true → show refusal
├─ Else render results panel (topics, insights, personas, depth, opportunities)
└─ Fire-and-forget save to `opportunities` via api.opportunities.createFromAnalysis
```

#### Server: archetype detection

The server inlines an archetype detector. It reads `source_type_context.slug` + `.name` and matches keyword patterns to one of **10 archetypes**: `video, blog, webinar, event, trending, research, interview, launch, competitor, recurring, generic`. Each archetype ships with a **rule block** — 4 lines of extraction guidance (focus, insight_style, format_bias, gotchas). This block is inserted into the user prompt.

Example — the `video` archetype rule:

- **Focus:** Quotable soundbites, speaker attribution, host-vs-guest tension, counter-intuitive on-camera claims.
- **Insight style:** Attribute every insight to the specific speaker. Prefer verbatim short quotes. Flag disagreements as most repurposable.
- **Format bias:** Short-form clips, quote carousels, tweet-length pull-quotes, speaker-organised recap blog.
- **Avoid:** Filler/greetings/sponsor reads. Attributing a host statement to a guest.

If the source type has `analysis_guidance` (user override) set, it's appended and takes priority.

#### Server: strict grounding rules

The system prompt makes it non-negotiable:
- Every insight, persona angle, and opportunity **must cite `kb_reference`** — an array of KB chunk IDs from the request payload.
- If nothing can be grounded, return `{refused: true, reason: "..."}` and nothing else.
- Do not invent KB IDs; do not ground in training data.

If the client sent zero `knowledge_chunks` (client-side gate already triggered), the handler short-circuits with a canned refusal payload — no LLM call.

#### Output schema (opportunities are production-ready)

Every opportunity has:

| Field | Purpose |
|-------|---------|
| `title` | Exact publishable headline (max ~90 chars) |
| `hook` | Exact first sentence of the piece (max 200 chars) |
| `structure` | 3-6 beat labels a writer turns into paragraphs |
| `content_angle` | What makes this piece distinct from the others |
| `recommended_format` | Constrained to the source type's `formats` array |
| `priority` | high / medium / low |
| `sequence_rank` | 1..N — 1 = ship this FIRST (by timeliness + readiness) |
| `effort` | quick / half-day / full-day |
| `persona_match` | Target persona |
| `suggested_cta` | Verb + object + destination |
| `kpi` | The ONE metric that proves this worked (specific number) |
| `prerequisites` | Assets/approvals needed before publishing. Empty = ready today. |
| `source_context` | Exact moment in source this piece repurposes |
| `kb_reference` | Array of KB chunk IDs — must not be empty |

The client renders these sorted by `sequence_rank`. The card shows: rank badge → priority → format → effort → title → hook (italic, coloured left border) → beat-by-beat structure → KPI → prerequisites (amber) → persona.

### 7.5 Opportunities (`OpportunitiesPage.tsx` + `api.opportunities`)

**Purpose:** ranked list of ideas across all analyses. Users triage → send to Studio.

- List filters by status (`all / open / in_studio / dropped`).
- **Send to Studio:** updates opportunity status to `in_studio`, sets `activeStudioOpp` in the UI store, navigates to Studio, reloads list so status flips immediately.
- **Drop / Reopen / Open in Studio:** simple status transitions.

### 7.6 Studio (`/api/generate-content` + `StudioPage.tsx`)

**Purpose:** two-stage generation (outline → draft) with a visible quality panel and regeneration loop. Nothing skips human review.

**Stages:**

1. **Generate Outline** (`action: 'outline'`)
   - Client retrieves KB chunks based on the opportunity brief.
   - Server prompt: senior content creator; obey brief, allowed format, persona, KB grounding.
   - Returns outline text; asset state = `outline`.
2. **Approve Outline → Generate Draft** (`action: 'draft'`)
   - Same retrieval, but with the outline as extra context.
   - Server writes the full piece obeying the outline + brand voice.
   - Returns draft text; asset state = `draft`.
3. **Quality Review** (`action: 'quality_review'` — runs automatically after draft)
   - Server scores: `source_support`, `specificity`, `clarity`, `persona_fit`, `compliance` — each 0-1 with a short explanation.
   - Result stored on `assets.quality`.
4. **Regenerate** (`action: 'regenerate'` — user provides feedback)
   - Same retrieval; prompt includes previous draft + user feedback; produces revised draft.
5. **Approve Draft**
   - `stage='approved'` in DB. UI shows the rendered markdown (`src/lib/markdown.ts` XSS-safe renderer), plus Copy, Download `.md`, Edit Draft (back to draft stage), and Send to Calendar.

**Prompt guardrails:**
- System prompt: brand-agnostic, "senior content creator", no more "financial services" hardcoding.
- When no KB is provided, `source_support` scores 1.0 (not penalised).
- Temperature: outline/draft 0.45, quality review 0.1.
- Every draft references chunk IDs it grounded in (stored in `assets.grounded_chunk_ids`).

**Error surfacing:** `!studioAsset` early return renders an inline error panel + working spinner. All 4 handlers wrap KB retrieval in `try/catch` so a KB failure doesn't kill the flow.

### 7.7 Ideas Lab (`/api/ideas-lab` + `IdeasLabPage.tsx`)

**Purpose:** freeform ideation not tied to a source — brief → grounded idea batch.

**5 sub-tabs:**

- **Generate** — 8 idea cards from topic + audience + brief.
- **Saved Library** — localStorage-persisted per account.
- **Seasonal** — 10 timely ideas based on the current date.
- **Webinar** — repurpose a long-form transcript into 15-18 mixed pieces across the funnel.
- **SEO** — keyword-plan style output.

**One brief → LLM call flow:**
1. Optional KB chunk retrieval (non-blocking — Ideas Lab does not gate on KB).
2. `POST /api/ideas-lab` with `{ task, brief_or_text, knowledge_chunks, avoid_titles }`.
3. Server routes on `task` to per-task prompt builders (all use the same base system prompt).
4. Returns normalised `{ ideas: [...] }`.

**Idea card schema** (each card is production-ready — see §7.4 for parallel fields plus these extras: `angle`, `visual_direction`, `why_it_works`, `platform_notes`, `content_pillar`, `slide_flow`, `scores{}` (5-dim breakdown), overall `score`).

**Expand with AI** — inside the detail drawer, the user picks a target format (brief / carousel / blog / caption); server returns type-specific structured output, rendered per-type in `<ExpandOutput>` (never raw JSON to the user).

**Ideas seed integration** — if the store's `ideasSeed` is populated (from Trends → route to Ideas Lab), the Generate brief prefills automatically.

### 7.8 Trends & Alerts (`/api/trend-scan`, `/api/trend-supervisor`, `TrendsPage.tsx`)

**Purpose:** an AI supervisor that scores, classifies, and routes trend signals so only qualified topics reach the pipeline.

#### Domain profile
Stored in `accounts.profile.trend_profile` (JSON). Fields: `business_name, industry, products, services, core_topics, target_keywords, target_locations, target_audience, business_goals, content_categories, brand_tone, restricted_topics, competitors, allowed_formats, max_recommendations, risk_tolerance, enabled`.

#### Modes
- **Run Live Scan** — collect signals via Tavily, supervise, save results.
- **AI-suggest candidates** — no Tavily; LLM proposes 12 candidate topics, then supervises them.
- **Paste topics** — user pastes topics (one per line), supervise directly.

#### Supervisor prompt (the AI's job)
- Deduplicate/cluster signals into distinct topics.
- Score each on 4 independent 0-100 scales: `domain_relevance`, `trend_impact`, `adaptability`, `risk`.
- Classify into: `domain_trend | supertrend_exception | monitor | reject`.
- Assign `priority`, `trend_stage`, `estimated_lifespan`, `confidence_score`.
- Write a specific `reason` for every decision.

**Routing thresholds:**
- `domain_trend`: relevance ≥ 60 AND impact ≥ 40 AND risk ≤ 60
- `supertrend_exception`: relevance < 60 AND impact ≥ 90 AND adaptability ≥ 65 AND risk ≤ 40 (with a natural, non-forced brand connection)
- `monitor`: relevant-but-weak or emerging
- `reject`: low signal, or too risky/outdated/duplicate

**Guardrails:** never invent trend data, never treat popularity as relevance, raise risk on politics/health/finance/law/tragedy and set `needs_human_review`.

#### Signal collection (`collectTavilySignals`)
Builds ~6 queries from the profile (core topics × location, keywords × location, industry, competitors, business name). Calls Tavily with `topic='news', search_depth='basic', max_results=5, days=14`. Dedupes by URL.

If `TAVILY_API_KEY` is missing OR Tavily returns nothing → fall back to `suggestCandidateSignals` (LLM proposes topics based on the profile).

#### Dashboard
4-bucket dashboard with filter chips (all / domain / supertrend / monitor / rejected / actioned). Each card shows classification badge, priority badge, trend_stage badge, confidence score, summary, 4 score bars, suggested_connection, reason, estimated_lifespan.

**Actions:** `Ideas Lab →` (seeds brief), `+ Opportunity` (createFromAnalysis), `+ Calendar` (calendar.add), `Promote` (monitor → accepted), `Dismiss` (delete).

#### Daily cron
`GET /api/trend-scan` runs at `0 6 * * *` UTC.
- Verifies `CRON_SECRET` (if set).
- Reads all accounts where `profile.trend_profile.enabled === true` (uses **service-role key** to bypass RLS).
- For each (max 10): collect signals → supervise → insert `trend_scans` + `trend_records` rows.
- If `SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` is missing → returns `{skipped: true, reason}` — manual scans still work.

### 7.9 Calendar (`CalendarPage.tsx` + `api.calendar`)

**Purpose:** the list of approved content, ready to schedule or export.

- Filter chips by status (`all / scheduled / published / cancelled`).
- **Set Date** (never scheduled) or **Reschedule** (already scheduled) — opens a `datetime-local` input, pre-fills with current value on Reschedule.
- **Cancel** — flips status to `cancelled` (`api.calendar.updateStatus`).
- **Export** — downloads a plain-text file with title/format/scheduled/status/body.

### 7.10 Settings (`SettingsPage.tsx`)

- Platform status card: DB connection, active account, user, account ID.
- Integrations grid: `Configure` (form: password inputs auto-detected for keys/tokens/secrets; falls back to JSON textarea when no fields are pre-defined) and `Test` (updates status).

---

## 8. LLM plumbing (identical across every endpoint)

Every serverless endpoint that calls the LLM inlines the same helper:

```ts
async function callLLM(systemPrompt, userPrompt, { maxTokens, temperature }) {
  // POST to https://openrouter.ai/api/v1/chat/completions
  // Retries: up to 2 with exponential backoff on 429
  // Errors surfaced as user-friendly strings for 401 / 402 / 404
  // Returns response.choices[0].message.content
}
```

Every endpoint also inlines the same `extractJSON(text)` helper that:
1. Strips markdown code fences.
2. Tries direct `JSON.parse`.
3. Falls back to finding the outermost `{...}` or `[...]` and parsing that.
4. Throws a clear "response could not be parsed as JSON" error otherwise — the handler catches this and returns `502` (a signal to the client to offer "try again").

**Critical rule:** every LLM prompt starts with `"CRITICAL OUTPUT RULE: respond with ONLY raw JSON — no markdown fences, no prose"`. Every schema is exact — the model is told what fields are required and what they mean.

---

## 9. Security & tenancy summary

- **Multi-tenancy** enforced by RLS on every table — no application-layer tenancy checks are trusted.
- **Auth JWT** from Supabase attaches to every DB call automatically via supabase-js.
- **Service-role key** is server-only and only used by the daily cron.
- **Cron authorization** via `CRON_SECRET` bearer token (Vercel Cron sets this automatically).
- **No secrets in DB rows** — `integrations.credentials_ref` is a reference, not a value.
- **Storage RLS** (migration 00006) mirrors the same account_access-based rules.
- **Client XSS defence:** the shared `toast` helper uses `textContent` (never `innerHTML`) and the markdown renderer escapes HTML before applying markdown transforms.

---

## 10. Content generation, end to end (worked example)

Let's follow a video transcript from upload to a scheduled tweet, calling out every hop.

### Step 1 — Upload the source video's transcript

User goes to Knowledge Base, uploads `sales_playbook_v3.pdf` under `category='guidelines'`.
- Client parses to text, chunks it (~500 chars each), inserts 40 `knowledge_chunks` rows.
- Client calls `/api/extract-knowledge` which returns `{summary, main_topics, important_facts, key_messages, audience}`; stored in `knowledge_files.structured`.
- File shows as `ingest_status='ready'` in the KB.

### Step 2 — Also upload personas

Repeat with `persona_hni_family_offices.pdf` under `category='persona'`. Now the account has 1 guideline file, 1 persona file. `checkReadiness` says `ready=true` (has `brand`... actually no, it has `guidelines`; if `brand` is required this would warn — depends on env).

### Step 3 — Start the analysis

User goes to New Analysis, picks source type **"ET Video"**. Client-side archetype hint says: `Archetype: Video / Podcast`. Formats badge says: `Repurposed as: Blog, Voice Page, Single Image, Carousel`.

User pastes the transcript ("30-minute ET video interview with the founder about AIF investments"), fills owner + marketing notes, clicks **Run Analysis**.

### Step 4 — Client-side retrieval

`retrieve(accountId, transcriptText, 'et_video')`:
- `checkReadiness()` — returns categories present + missing.
- Fetches all `knowledge_files` where `category in ('compliance','brand','guidelines')` and `active=true, ingest_status='ready'`. Fetches every chunk from those files → `constraintChunks`.
- Fetches all other active files, then their chunks (up to 120). Scores each by keyword overlap with transcript keywords. Top 8 = `chunks`. Track `topScore`.
- If `topScore=0 AND constraintChunks=[]` → refuse. Otherwise return them.

### Step 5 — Call `/api/analyze-content`

Payload includes:
- `source_text` (transcript, sliced to 15KB max),
- `source_type='ET Video'`,
- `source_type_context={name:'ET Video', slug:'et_video', description:'Economic Times video interviews...', formats:['Blog','Voice Page','Single Image','Carousel'], analysis_guidance:''}`,
- `source_title, source_owner, source_url, marketing_notes`,
- `knowledge_chunks[]` — up to 25, each with `{id, content}` (content sliced to 500 chars),
- `file_context[]` — metadata about each KB file used,
- `personas[]` — extracted from persona files' `structured` field,
- `account_id`.

Server:
1. Validates required fields.
2. If `knowledge_chunks=[]` → returns canned refusal (200 with `refused:true`).
3. Detects archetype from `source_type_context.slug='et_video'` → matches `/et[_ -]video/i` → `video` archetype.
4. Builds guidance block with the video-archetype rules + user-defined guidance (if any) + allowed formats.
5. Assembles user prompt with source type block, marketing section, KB files context, KB chunks (with IDs), personas, and source text.
6. Calls LLM with the strict-grounding system prompt.
7. Parses JSON. If parse fails → 502.
8. Returns `{success: true, analysis, id}`.

### Step 6 — Client renders the plan

The analysis panel shows:
- **Summary** — 2-3 sentences.
- **Topics** — 3-6 concrete topics extracted.
- **Insights** — each with confidence + source quote + `kb_reference` chunks.
- **Persona Matches** — with `matching_points` and `suggested_angle`.
- **Depth Analysis** — per-topic depth + gaps.
- **Repurposing Plan** — 5-8 derivative pieces sorted by `sequence_rank`:
  1. `#1 · high · Blog · quick` — **"Why the 1Cr AIF minimum still makes sense in 2026"** — *"Everyone talks about the entry barrier as a problem. Rachana explains why it's the feature."* — Beats: Cold open with the RBI stat → Contrast: what advisors get wrong → Rachana's 3 examples → What HNI families should do this quarter → CTA — KPI: 5 booked review calls in 7 days — Persona: HNI Family Office.
  2. `#2 · high · Carousel · half-day` — ...
  3. ...
- **Quality Check** — 4 ratings.
- **Warnings** — compliance flags if any.

Meanwhile, client fire-and-forgets `api.opportunities.createFromAnalysis(accountId, null, analysis.opportunities)` — the plan is saved into `opportunities` table with the rich `metadata` (hook, structure, effort, kpi, prerequisites, kb_reference).

### Step 7 — Route into Studio

User clicks **View in Opportunities Tab**. Filters to `open`. Picks the top card, clicks **Send to Studio**:
- `api.opportunities.updateStatus(opp.id, 'in_studio')`
- `setActiveStudioOpp(opp.id)` in the store
- `setActiveTab('studio')`

Studio loads with the opportunity brief pre-filled.

### Step 8 — Outline → Draft → Approve

User clicks **Generate Outline**:
- Client retrieves fresh KB chunks (`retrieve(accountId, oppBrief, 'studio')`)
- `POST /api/generate-content { action:'outline', opportunity_brief, knowledge_chunks, persona, format }`
- Server returns outline. Asset saved with `stage='outline'`.

User reviews, edits, clicks **Approve Outline → Generate Draft**:
- Same flow but action=`draft`, includes outline as context.
- Server returns draft markdown. Asset updated: `stage='draft', body=draft, grounded_chunk_ids=[...]`.
- Server also fires the quality review (`action='quality_review'`) — returns 5 scores. Asset `quality={source_support:0.9, specificity:0.85, clarity:0.9, persona_fit:0.8, compliance:0.95}`.

If quality reads well, user clicks **Approve Draft**:
- Asset `stage='approved'`. UI renders the markdown draft with Copy / Download / Edit Draft / Send to Calendar buttons.

### Step 9 — Send to Calendar

`api.calendar.add({ account_id, asset_id, title, format, scheduled_for: null, status: 'scheduled', body })`. A new `calendar_items` row appears in the Calendar tab.

### Step 10 — Schedule

User opens Calendar, clicks **Set Date** on the new item, picks a `datetime-local`, clicks **Confirm**:
- `api.calendar.schedule(accountId, id, scheduledDate)` — updates `scheduled_for`.
- Audit log entry written.

**Done.** From source transcript to a scheduled tweet, every step is traceable: opportunity → analysis → source chunks + KB chunks that grounded it → outline → draft → quality scores → calendar item.

---

## 11. Extension points (if you're rebuilding)

- **pgvector for retrieval:** the current retrieval is keyword-scoring. Swap in pgvector + an embedding pass in `/api/extract-knowledge` for semantic search. The retrieval interface (`chunks`, `constraintChunks`, `topScore`) stays the same.
- **New LLM providers:** every endpoint's `callLLM` is inlined and hits OpenRouter. Add a provider switch by conditioning on `LLM_MODEL` prefix (`openai/*` vs `anthropic/*` vs `google/*`).
- **Multi-region:** cron currently targets a single region. To distribute, split the cron across accounts by hash.
- **Realtime UI:** Supabase Realtime is not used. Adding it would push new trend records / opportunities to the UI without polling.
- **Storage:** knowledge file uploads go through Supabase Storage; the URL is stored on `knowledge_files.storage_url`. RLS on the bucket mirrors `account_access`.

---

## 12. Migration order (bootstrapping a fresh Supabase project)

Apply in the Supabase SQL Editor in this order:

1. `00001_schema.sql` — organizations, accounts, users, account_access, knowledge_*, analyses, opportunities, assets, calendar_items, integrations, audit_log
2. `00002_rls_policies.sql` — RLS on every table
3. `00003_extend_schema.sql` — any subsequent schema tweaks
4. `00004_auth_user_trigger.sql` — auto-mirror `auth.users` → `public.users`
5. `00005_source_types.sql` — source_types table + Right Horizons seed
6. `00006_storage_rls_fix.sql` — storage bucket RLS
7. `00007_trends.sql` — trend_scans + trend_records + RLS
8. `00008_source_type_guidance.sql` — adds `source_types.analysis_guidance`
9. `00009_pgvector.sql` — enables the `vector` extension, adds `knowledge_chunks.embedding vector(1024)`, HNSW cosine index, and the `match_chunks` RPC (SECURITY INVOKER)
10. `00010_embedding_dim_1024.sql` — idempotent migration that reconciles the column dim to 1024 if an earlier `vector(1536)` version was applied; no-op on fresh installs

`combined_migration.sql` in the same folder does all of this in one shot — useful for a brand-new project.

Then create at least one account and grant `account_access` for your user, seed a persona / brand file, and you can run the app end-to-end.

---

## 13. Deployment checklist (Vercel)

1. Push the repo to GitHub.
2. Connect Vercel to the repo. Vercel auto-detects Vite → builds `dist/`.
3. Set env vars in Vercel → Settings → Environment Variables:
   - `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (client — public)
   - `OPENROUTER_API_KEY` (server — required)
   - `LLM_MODEL` (server — optional; default is `anthropic/claude-sonnet-4-5`)
   - `TAVILY_API_KEY` (server — optional; enables live trend signals)
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (server — only for cron)
   - `CRON_SECRET` (server — optional cron auth)
4. Deploy. On success, `vercel.json crons` registers the daily trend scan automatically.
5. Apply the Supabase migrations in order (§12).
6. Create an account row and a matching `account_access` row for your user.
7. Log in, upload one file to KB, run an analysis. If it works, you're live.

---

*This document is the ground truth. If code disagrees with it, update the document.*

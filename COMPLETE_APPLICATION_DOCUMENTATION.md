# Content Intelligence Platform — Complete End-to-End Documentation

---

## Table of Contents

1. [Application Overview](#1-application-overview)
2. [Technology Stack](#2-technology-stack)
3. [Architecture & File Structure](#3-architecture--file-structure)
4. [Design System](#4-design-system)
5. [Database Schema](#5-database-schema)
6. [Authentication & Account System](#6-authentication--account-system)
7. [Navigation & Layout](#7-navigation--layout)
8. [Section 1: New Analysis (AnalyzePage)](#8-section-1-new-analysis)
9. [Section 2: Opportunities (OpportunitiesPage)](#9-section-2-opportunities)
10. [Section 3: Studio (StudioPage)](#10-section-3-studio)
11. [Section 4: Knowledge Base (KnowledgeBasePage)](#11-section-4-knowledge-base)
12. [Section 5: Ideas Lab (IdeasLabPage)](#12-section-5-ideas-lab)
13. [Section 6: Trends & Alerts (TrendsPage)](#13-section-6-trends--alerts)
14. [Section 7: Calendar (CalendarPage)](#14-section-7-calendar)
15. [Section 8: Settings (SettingsPage)](#15-section-8-settings)
16. [Knowledge Base Retrieval System](#16-knowledge-base-retrieval-system)
17. [Embedding System](#17-embedding-system)
18. [Text Chunking System](#18-text-chunking-system)
19. [File Parsing System](#19-file-parsing-system)
20. [Source Archetype System](#20-source-archetype-system)
21. [Weekly Anil & Rachana Content Playbook](#21-weekly-anil--rachana-content-playbook)
22. [Cross-Page Data Flow](#22-cross-page-data-flow)
23. [Complete API Reference](#23-complete-api-reference)
24. [Environment Variables](#24-environment-variables)
25. [Deployment & Infrastructure](#25-deployment--infrastructure)

---

## 1. Application Overview

Content Intelligence Platform is an AI-powered content repurposing and strategy tool built for marketing teams. It takes a single source piece (video transcript, blog, webinar, interview, etc.) and produces a complete content repurposing plan — derivative content pieces, target audiences, publication-ready drafts — all grounded in the team's own knowledge base (brand voice, personas, compliance rules, terminology).

### What it does, end to end:

1. **Upload Knowledge Base files** — personas, brand guidelines, compliance rules, expert notes. These are chunked, embedded, and indexed for semantic retrieval.
2. **Analyze source content** — paste a transcript or article, select source type, run AI analysis. The system extracts topics, matches personas, identifies opportunities, and creates a grounded repurposing plan.
3. **Manage opportunities** — each analysis generates 5-8 derivative content opportunities (carousel, blog, email, video script, etc.). These enter a pipeline.
4. **Create content in Studio** — select an opportunity, generate an AI outline, iterate with feedback, generate a full draft, run quality review, approve, and send to calendar.
5. **Generate ideas in Ideas Lab** — brainstorm content ideas by topic/audience/format. Repurpose webinars into 15-18 pieces. Generate SEO-focused or seasonal ideas. Expand ideas into full briefs, carousel scripts, or blog outlines.
6. **Monitor trends** — configure a domain profile, run live trend scans (via Tavily news API) or AI-suggested candidates, classify them through an AI Trend Supervisor, and route relevant trends to Ideas Lab or Opportunities.
7. **Schedule in Calendar** — all generated content lands in a calendar for scheduling, export, and status tracking.

### Who it's built for:

The platform is built for **Trilliant Media**, a marketing agency managing content for 5 client accounts: Right Horizons (financial services), Hoya Vision (eye care), Wipro 3D (additive manufacturing), Wipro Water (water purification), and Wepsol (enterprise solutions).

---

## 2. Technology Stack

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| Frontend framework | React | 19 | UI rendering |
| Build tool | Vite | 6 | Dev server, bundling |
| Language | TypeScript | 5.7 | Type safety |
| State management | Zustand | 5 | Global app state |
| Database | Supabase (PostgreSQL) | - | Auth, storage, data, RLS |
| Vector search | pgvector | - | 1024-dim embeddings for semantic retrieval |
| Serverless functions | Vercel | - | 9 API endpoints |
| LLM provider | OpenRouter | - | Routes to `anthropic/claude-sonnet-4-5` |
| Embedding providers | Voyage AI → OpenAI → OpenRouter | - | Multi-provider fallback |
| News/search API | Tavily | - | Live trend signals |
| CSS architecture | Custom CSS + Tailwind | 4 | Glassmorphism design system |
| Hosting | Vercel | - | Frontend + serverless |

---

## 3. Architecture & File Structure

```
Content-intelligence/
├── api/                          # Vercel serverless functions (each self-contained)
│   ├── analyze-content.ts        # Source analysis + repurposing plan
│   ├── generate-content.ts       # Outline / draft / regenerate / quality review
│   ├── ideas-lab.ts              # Content ideation (5 modes)
│   ├── trend-scan.ts             # Trend collection + supervision + cron
│   ├── trend-supervisor.ts       # Standalone trend classification
│   ├── auto-profile.ts           # Auto-detect business profile from URL
│   ├── extract-knowledge.ts      # Structured metadata extraction + embedding
│   ├── embed-query.ts            # Single query embedding for search
│   └── backfill-embeddings.ts    # Batch re-embed for index rebuilds
│
├── src/
│   ├── App.tsx                   # Root: ErrorBoundary > Router > AccountProvider > AppShell
│   ├── index.css                 # Full design system (glassmorphism, light/dark tokens)
│   ├── main.tsx                  # React entry point
│   │
│   ├── pages/                    # 8 lazy-loaded page components
│   │   ├── AnalyzePage.tsx       # Source analysis interface
│   │   ├── OpportunitiesPage.tsx # Opportunity pipeline
│   │   ├── StudioPage.tsx        # Content creation pipeline
│   │   ├── KnowledgeBasePage.tsx  # KB file management
│   │   ├── IdeasLabPage.tsx      # Content ideation
│   │   ├── TrendsPage.tsx        # Trend monitoring
│   │   ├── CalendarPage.tsx      # Content scheduling
│   │   └── SettingsPage.tsx      # Integrations & config
│   │
│   ├── components/layout/        # Shell components
│   │   ├── AppShell.tsx          # Glass panel + sidebar + page container
│   │   ├── Sidebar.tsx           # 8-tab vertical navigation
│   │   └── Topbar.tsx            # Title, account switcher, theme toggle
│   │
│   ├── lib/                      # Core libraries
│   │   ├── api.ts                # Full API client (1126 lines, all modules)
│   │   ├── retrieval.ts          # Semantic search + keyword fallback
│   │   ├── chunker.ts            # Text → overlapping chunks
│   │   ├── fileParser.ts         # Parse PDF/DOCX/XLSX/CSV/JSON/HTML/XML/RTF
│   │   ├── supabase.ts           # Lazy Supabase client with stubs
│   │   ├── audit.ts              # Audit logging helper
│   │   ├── markdown.ts           # Markdown → HTML renderer
│   │   └── archetype-hint.ts     # Client-side source archetype detection
│   │
│   ├── stores/
│   │   └── authStore.ts          # Zustand auth state (user, session, sign in/out)
│   ├── store/
│   │   └── index.ts              # Zustand app store (theme, tabs, studio state)
│   ├── contexts/
│   │   └── AccountContext.tsx     # Account provider + 5 hardcoded accounts
│   ├── config/
│   │   ├── constants.ts          # Source types, KB categories, integrations
│   │   └── grounding-contract.ts # LLM grounding rules template
│   └── types/
│       └── index.ts              # All TypeScript interfaces
│
├── supabase/migrations/          # Database migrations
│   ├── combined_migration.sql    # Full schema (all tables, RLS, triggers, seeds)
│   ├── 00005_source_types.sql    # Source types table + Right Horizons seed data
│   ├── 00007_trends.sql          # Trend tables (trend_scans, trend_records)
│   ├── 00009_pgvector.sql        # pgvector extension + match_chunks RPC
│   └── 00010_embedding_dim_1024.sql # Migration 1536→1024 dims
│
├── vercel.json                   # Vercel deployment config
├── package.json                  # Dependencies
├── tsconfig.json                 # TypeScript config
└── vite.config.ts                # Vite config with path aliases
```

### Critical Architecture Rule

**Every API file under `api/` must be 100% self-contained.** Vercel serverless functions cannot import from sibling files or `src/`. The only allowed import is `import type { VercelRequest, VercelResponse } from '@vercel/node'`. All utilities (LLM calling, JSON extraction, retry logic) are inlined in each file.

---

## 4. Design System

The platform uses a custom glassmorphism design system with CSS custom properties for light/dark theme switching.

### Color Tokens

| Token | Light Value | Dark Value | Usage |
|-------|------------|------------|-------|
| `--text-primary` | `#1E1B4B` | `#F1F5F9` | Main text |
| `--text-secondary` | `#475569` | `#CBD5E1` | Descriptions |
| `--text-muted` | `#9CA3AF` | `#94A3B8` | Hints, placeholders |
| `--surface-base` | `#FFFFFF` | `#0F172A` | Page background |
| `--surface-card` | `rgba(255,255,255,0.85)` | `rgba(30,41,59,0.85)` | Card background |
| `--accent-primary` | `#7C3AED` (purple) | `#7C3AED` | Buttons, active states |
| `--status-success` | `#10B981` (green) | same | Success indicators |
| `--status-warning` | `#F59E0B` (amber) | same | Warnings |
| `--status-danger` | `#DC2626` (red) | same | Errors, deletions |
| `--status-info` | `#0EA5E9` (blue) | same | Info badges |

### Layout Constants

| Property | Value |
|----------|-------|
| Sidebar width | 96px |
| Topbar height | 72px |
| Max app width | 1600px |
| App height | 95vh |
| Glass panel blur | `blur(40px) saturate(160%)` |
| Card border radius | 16px |

### Atmosphere Background

The app background is a multi-color radial gradient with 80px blur:
- Light: pastel indigo (20% 20%), pink (80% 10%), slate (center), green (10% 80%), yellow (90% 90%)
- Dark: deep indigo, purple, dark slate, emerald, warm gray at same positions

### Typography

- Font family: `'Inter', system-ui, -apple-system, sans-serif`
- Eyebrow labels: 11px, uppercase, letter-spacing 2px, muted color
- Section titles: 26px, bold, primary color
- Card headers: 14px, semibold

### Component Classes

| Class | Description |
|-------|-------------|
| `.glass-panel` | Main container with backdrop blur, border radius, shadow |
| `.glass-card-static` | Content cards with glass effect |
| `.sidebar` | Fixed 96px left navigation |
| `.sidebar-item` | Nav item with tooltip, hover/active states |
| `.badge` | Small rounded tag with background color |
| `.input`, `.textarea` | Form inputs with glass surface |
| `.btn-primary` | Purple accent button |
| `.btn-outline` | Bordered transparent button |
| `.page-enter` | Fade-in animation on page switch |

---

## 5. Database Schema

### Tables Overview

```
organizations ──┐
                 ├── accounts ──┬── knowledge_files ── knowledge_chunks (with vector embedding)
                 │              ├── analyses ── opportunities ── assets ── calendar_items
                 │              ├── integrations
                 │              ├── source_types
                 │              ├── trend_scans ── trend_records
                 │              └── audit_log
                 └── users ── account_access
```

### Table: `organizations`

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid (PK) | Auto-generated |
| `name` | text | Organization name |
| `created_at` | timestamptz | Auto-set |

Seed data: One org "Trilliant Media" with UUID `00000000-0000-0000-0000-000000000000`.

### Table: `accounts`

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid (PK) | Auto-generated |
| `org_id` | uuid (FK→organizations) | Parent org |
| `name` | text | Account/brand name |
| `status` | text | `'active'` / `'paused'` / `'archived'` |
| `profile` | jsonb | Extensible profile (stores trend_profile, domain_url, etc.) |

Seed data: 5 accounts — Right Horizons, Hoya Vision, Wipro 3D, Wipro Water, Wepsol.

### Table: `users`

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid (PK) | Matches Supabase auth.users.id |
| `org_id` | uuid (FK→organizations) | Parent org |
| `name` | text | Display name |
| `email` | text | Email address |
| `is_org_admin` | boolean | Admin flag |

Auto-created by trigger `handle_new_auth_user()` on auth signup.

### Table: `account_access`

| Column | Type | Description |
|--------|------|-------------|
| `user_id` | uuid (PK, FK→users) | User |
| `account_id` | uuid (PK, FK→accounts) | Account |
| `role` | text | `'manager'` / `'editor'` / `'viewer'` |

Auto-populated by trigger `grant_default_account_access()` — every new user gets `'editor'` access to all 5 accounts.

### Table: `knowledge_files`

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid (PK) | Auto-generated |
| `account_id` | uuid (FK→accounts) | Owner account |
| `file_name` | text | Original filename |
| `category` | text | One of: `persona`, `brand`, `compliance`, `terminology`, `expert`, `guidelines`, `raw_notes`, `data`, `idea` |
| `priority` | text | `'critical'` / `'high'` / `'standard'` / `'low'` |
| `source_type` | text | `'file'` / `'paste'` / `'url'` |
| `storage_url` | text | Supabase storage URL |
| `active` | boolean | Whether included in retrieval |
| `version` | int | Version counter |
| `structured` | jsonb | LLM-extracted metadata (summary, topics, key messages, etc.) |
| `ingest_status` | text | `'pending'` / `'processing'` / `'ready'` / `'failed'` |

### Table: `knowledge_chunks`

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid (PK) | Auto-generated |
| `file_id` | uuid (FK→knowledge_files) | Parent file |
| `account_id` | uuid (FK→accounts) | Owner account |
| `chunk_text` | text | Text content of this chunk |
| `embedding` | vector(1024) | pgvector embedding (1024 dimensions) |
| `embed_model` | text | Model used (e.g., `'voyage-3'`, `'text-embedding-3-small'`) |
| `token_count` | int | Estimated token count |
| `position` | int | Sequential position within file |

HNSW index: `knowledge_chunks_embedding_idx` using cosine distance (`vector_cosine_ops`) with `m=16, ef_construction=64`.

### Table: `analyses`

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid (PK) | Auto-generated |
| `account_id` | uuid (FK→accounts) | Owner account |
| `source_text` | text | Original source content |
| `source_type` | text | Source type label |
| `result` | jsonb | Full analysis result (summary, topics, insights, opportunities, etc.) |
| `created_by` | uuid (FK→users) | Who ran it |

### Table: `opportunities`

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid (PK) | Auto-generated |
| `account_id` | uuid (FK→accounts) | Owner account |
| `analysis_id` | uuid (FK→analyses) | Source analysis (nullable) |
| `title` | text | Opportunity title |
| `content_angle` | text | Unique angle |
| `format` | text | Recommended format |
| `status` | text | `'open'` / `'in_studio'` / `'dropped'` |
| `priority` | text | `'high'` / `'medium'` / `'standard'` / `'low'` |
| `persona_name` | text | Target persona |
| `persona_relevance_score` | numeric | 0.0-1.0 |
| `recommendation_reason` | text | Why this was recommended |
| `suggested_cta` | text | Call to action |
| `source_context` | text | Source insight reference |

### Table: `assets`

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid (PK) | Auto-generated |
| `opportunity_id` | uuid (FK→opportunities) | Parent opportunity |
| `stage` | text | `'outline'` / `'draft'` / `'approved'` / `'scheduled'` / `'published'` |
| `body` | text | Content body (markdown) |
| `quality` | jsonb | Quality review scores |
| `grounded_chunk_ids` | uuid[] | KB chunks used |
| `feedback_log` | jsonb | Array of feedback entries |

### Table: `calendar_items`

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid (PK) | Auto-generated |
| `account_id` | uuid (FK→accounts) | Owner account |
| `asset_id` | uuid (FK→assets) | Optional linked asset |
| `title` | text | Content title |
| `format` | text | Content format |
| `scheduled_for` | timestamptz | Scheduled publish date |
| `status` | text | `'scheduled'` / `'published'` / `'cancelled'` |
| `body` | text | Content body |

### Table: `trend_scans`

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid (PK) | Auto-generated |
| `account_id` | uuid (FK→accounts) | Owner account |
| `source` | text | `'tavily'`, `'suggest'`, or `'cron:tavily'` |
| `total_reviewed` | int | Total topics reviewed |
| `domain_sent` | int | Domain trends forwarded |
| `supertrends_sent` | int | Supertrend exceptions forwarded |
| `monitored` | int | Topics set to monitor |
| `rejected` | int | Topics rejected |

### Table: `trend_records`

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid (PK) | Auto-generated |
| `account_id` | uuid (FK→accounts) | Owner account |
| `scan_id` | uuid (FK→trend_scans) | Parent scan |
| `topic` | text | Trend topic name |
| `summary` | text | Why this trend matters |
| `classification` | text | `'domain_trend'` / `'supertrend_exception'` / `'monitor'` / `'reject'` |
| `domain_relevance_score` | int | 0-100 |
| `trend_impact_score` | int | 0-100 |
| `adaptability_score` | int | 0-100 |
| `risk_score` | int | 0-100 (higher = more risky) |
| `confidence_score` | int | 0-100 |
| `priority` | text | Priority level |
| `trend_stage` | text | Emerging/growing/peak/declining |
| `estimated_lifespan` | text | How long this trend is expected to last |
| `reason` | text | Why this classification was chosen |
| `suggested_connection` | text | How to connect this to the brand |
| `status` | text | `'new'` / `'accepted'` / `'monitoring'` / `'rejected'` / `'actioned'` |

### Table: `source_types`

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid (PK) | Auto-generated |
| `account_id` | uuid (FK→accounts) | Owner account |
| `name` | text | Display name (e.g., "Weekly Anil/Rachana") |
| `slug` | text | URL-safe identifier |
| `description` | text | What this source type is |
| `formats` | text[] | Allowed output formats |
| `analysis_guidance` | text | Custom guidance for analysis |

Seed data (Right Horizons): ET Video, Author Blog, Weekly Anil/Rachana, Webinar, Event/Workshop, Trending Topic.

### Table: `audit_log`

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid (PK) | Auto-generated |
| `account_id` | uuid (FK→accounts) | Owner account |
| `user_id` | uuid (FK→users) | Who performed the action |
| `action` | text | Action name (e.g., `'analyze'`, `'kb_upload'`, `'schedule'`) |
| `target_type` | text | Entity type affected |
| `target_id` | uuid | Entity ID affected |
| `detail` | jsonb | Additional context |

### Row-Level Security (RLS)

All tables have RLS enabled. Policies use the `account_access` table to restrict data:
- `SELECT`: User must have any role on the account
- `INSERT/UPDATE/DELETE`: User must have `'manager'` or `'editor'` role
- `viewers` can only SELECT

### Database Functions

**`match_chunks(p_account_id uuid, p_query_embedding vector, p_match_count int, p_exclude_file_ids uuid[])`**
RPC function for semantic search. Returns chunks ordered by cosine similarity (`1 - (embedding <=> p_query_embedding)`), excluding specified file IDs, limited to `p_match_count` results.

**`handle_new_auth_user()`**
Trigger function on `auth.users` INSERT. Creates a row in `users` table with data from auth metadata.

**`grant_default_account_access()`**
Trigger function on `users` INSERT. Grants `'editor'` role on all 5 accounts.

---

## 6. Authentication & Account System

### Authentication Flow

The app uses Supabase Auth with email/password. Auth state is managed by `authStore.ts` (Zustand).

1. **App loads** → `App.tsx` calls `useAuthStore.initialize()`
2. `initialize()` checks `supabase.auth.getSession()`:
   - If session exists: sets `user` and `session` in store
   - If no session: sets `initialized: true` (app renders without auth)
3. Auth state changes are tracked via `supabase.auth.onAuthStateChange`
4. Currently the app **does not require authentication** — it works with hardcoded accounts

### Account System

The platform manages 5 client accounts. Account selection is handled by `AccountContext.tsx`.

**Hardcoded Accounts:**

| ID | Name | URL |
|----|------|-----|
| `00000000-...-000000000001` | Right Horizons | `https://righthorizons.com` |
| `00000000-...-000000000002` | Hoya Vision | `https://www.hoyavision.com` |
| `00000000-...-000000000003` | Wipro 3D | `https://www.wipro3d.com` |
| `00000000-...-000000000004` | Wipro Water | `https://www.wiprowater.com` |
| `00000000-...-000000000005` | Wepsol | `https://www.wepsol.com` |

**Account Initialization Flow:**

1. Check URL query param `?account_id=...`
2. Fall back to `localStorage('ci_account_id')`
3. Default to first account (Right Horizons)
4. Fetch account details from Supabase, or use hardcoded data as fallback
5. Set `accountId` in context — all pages use this to scope data

**Account Switching:**

The `AccountSwitcher` dropdown in the Topbar lets the user switch accounts. On switch:
1. Save new account ID to localStorage
2. Call `resetAccountState()` — clears `activeStudioOpp`, `studioAsset`, `ideasSeed`
3. Fetch new account data
4. All pages re-render with new account context

---

## 7. Navigation & Layout

### AppShell Structure

```
┌──────────────────────────────────────────────────────┐
│  Atmosphere (blurred gradient background)             │
│  ┌────────────────────────────────────────────────┐  │
│  │  Glass Panel (frosted glass container)          │  │
│  │  ┌────┬──────────────────────────────────────┐ │  │
│  │  │    │  Topbar (title, account, theme, sign  │ │  │
│  │  │ S  │  out)                                 │ │  │
│  │  │ I  ├──────────────────────────────────────┤ │  │
│  │  │ D  │                                      │ │  │
│  │  │ E  │  Active Page Content                 │ │  │
│  │  │ B  │  (lazy-loaded)                       │ │  │
│  │  │ A  │                                      │ │  │
│  │  │ R  │                                      │ │  │
│  │  │    │                                      │ │  │
│  │  └────┴──────────────────────────────────────┘ │  │
│  └────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────┘
```

### Sidebar Navigation (8 tabs)

| Tab ID | Label | Icon | Description |
|--------|-------|------|-------------|
| `analyze` | New Analysis | Magnifying glass | Run content analysis |
| `opportunities` | Opportunities | Lightbulb | View opportunity pipeline |
| `studio` | Studio | Pencil | Create content from opportunities |
| `kb` | Knowledge Base | Book | Manage KB files |
| `ideas` | Ideas Lab | Flask | Generate content ideas |
| `trends` | Trends & Alerts | Pulse | Monitor industry trends |
| `calendar` | Calendar | Calendar | Schedule content |
| `settings` | Settings | Gear | Configure integrations |

Navigation is **state-driven, not URL-based**. Clicking a sidebar tab sets `useAppStore.activeTab`, which switches the rendered page component. All pages are lazy-loaded via `React.lazy()` with a Suspense fallback.

### Topbar

The topbar shows:
- **Eyebrow label** — context (e.g., "Source Analysis", "Content Pipeline")
- **Page title** — section name (e.g., "New Analysis", "Opportunities")
- **Account switcher** — dropdown showing current account, with list of all 5 accounts
- **Theme toggle** — sun/moon icon, toggles `data-theme` attribute on `<html>`
- **Sign out button** — calls `supabase.auth.signOut()`

---

## 8. Section 1: New Analysis

**Page:** `src/pages/AnalyzePage.tsx`
**API Endpoint:** `POST /api/analyze-content`
**Purpose:** Take a source piece and produce a grounded content repurposing plan.

### UI Layout

**Input Form (left column):**

```
┌─────────────────────────────────────┐
│ Source Type badges (ET Video, Blog,  │
│ Weekly Anil/Rachana, ...) [+ Add]   │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ Source Title        [input]     │ │
│ │ Source Owner         [input]     │ │
│ │                                 │ │
│ │ [Paste Text] [Paste Source Link]│ │
│ │ ┌───────────────────────────┐   │ │
│ │ │ Source Content (textarea) │   │ │
│ │ │ 8 rows                   │   │ │
│ │ └───────────────────────────┘   │ │
│ │ Marketing Notes (textarea, 3)   │ │
│ │                                 │ │
│ │ [  Run Analysis  ]             │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

**Agent Activity Stepper (right column):**

9-step vertical stepper that animates during analysis:
1. Reading Source
2. Checking Knowledge Base
3. Extracting Topics
4. Matching Personas
5. Assessing Depth
6. Generating Opportunities
7. Quality Check
8. Saving Results
9. Complete

Each step shows a green checkmark when complete, a spinning dot when active, and gray when pending.

### User Flow: Running an Analysis

**Step 1: Select Source Type**
User clicks one of the source type badges at the top. Each account has its own source types (seeded from `source_types` table). The selected type tells the AI how to approach this particular kind of source material.

**Step 2: Fill Input Fields**
- **Source Title** (required): e.g., "Anil Sir on SIP vs Lumpsum"
- **Source Owner** (optional): e.g., "Anil Rego"
- **Source Content** (required): Paste the full transcript, article text, or URL
- **Marketing Notes** (optional): Additional direction for the AI

**Step 3: Click "Run Analysis"**
The button is disabled until both `sourceTitle` and `sourceContent` are non-empty.

### Backend Flow (what happens when "Run Analysis" is clicked)

```
1. AnalyzePage.handleRunAnalysis()
   │
   ├─→ Start activity stepper animation (800ms per step)
   │
   ├─→ [PARALLEL] Fetch KB context:
   │    ├─→ retrieve(accountId, query, sourceType)
   │    │    ├─→ checkReadiness() — which KB categories exist?
   │    │    ├─→ Fetch constraint chunks (brand, compliance, guidelines)
   │    │    ├─→ embedQuery(text) → POST /api/embed-query → vector
   │    │    ├─→ scoreBySemantic() → Supabase RPC match_chunks
   │    │    │   OR fallback to scoreByKeywords()
   │    │    └─→ Return { chunks, constraintChunks, sourcesUsed }
   │    │
   │    └─→ Fetch persona files from Supabase
   │         (category='persona', active=true, ingest_status='ready')
   │
   ├─→ If retrieval refused (zero KB content): show error, stop
   │
   ├─→ Assemble request payload:
   │    • source_text (truncated to 15,000 chars)
   │    • source_type, source_type_context
   │    • knowledge_chunks (max 25, each content ≤500 chars)
   │    • personas (parsed from structured data)
   │    • file_context (KB file metadata)
   │
   ├─→ api.analysis.run() → POST /api/analyze-content
   │    │
   │    │ [SERVER-SIDE]
   │    ├─→ Validate required fields
   │    ├─→ If no knowledge_chunks: return "refused" response
   │    ├─→ detectArchetype() — match source type against 12 patterns
   │    ├─→ buildSourceGuidance() — construct archetype-specific rules
   │    ├─→ Assemble LLM prompt with all context sections
   │    ├─→ callLLM(GROUNDING_SYSTEM_PROMPT, prompt)
   │    │    → POST to OpenRouter (anthropic/claude-sonnet-4-5)
   │    │    → maxTokens: 8192, temperature: 0.35
   │    │    → Up to 3 attempts with exponential backoff on 429
   │    ├─→ extractJSON(response) — strip markdown fences, parse
   │    └─→ Return { success: true, analysis: {...} }
   │
   ├─→ On success: set result, stop stepper, scroll to results
   │
   └─→ Save opportunities (non-blocking):
        api.opportunities.createFromAnalysis(accountId, null, opps)
```

### Analysis LLM System Prompt (verbatim)

```
You are a senior content repurposing strategist. The user has ONE source piece
— a video, blog, webinar, report, interview, whatever — and your job is to
plan the derivative content pieces that can be created from it.

CORE MENTAL MODEL: One source → many outputs. You do not invent content; you
extract it from the source and shape it using the Knowledge Base.

STRICT KB GROUNDING RULE:
- Every insight, every persona angle, every derivative piece MUST cite the
  specific KB chunk ID(s) it draws from — in a "kb_reference" array on that item.
- The KB chunks you receive may include: persona/ICP profiles (WHO to target),
  brand voice (HOW to write), compliance rules (what to AVOID), expert
  transcripts (authority angles), terminology (exact words to use), and more.
  ALL of these are relevant.
- Do NOT fabricate KB content. Do NOT ground in your own training data.
  Do NOT invent chunk IDs.
```

### Analysis Output Schema (what the LLM returns)

```json
{
  "summary": "2-3 sentence description of the source material",
  "topics": ["Topic 1", "Topic 2", "Topic 3"],
  "insights": [
    {
      "text": "Key insight extracted from source",
      "confidence": "high",
      "source_reference": "Minute 12:30 of the video",
      "kb_reference": ["chunk-uuid-1"]
    }
  ],
  "persona_matches": [
    {
      "persona_name": "HNI Investor",
      "relevance_score": 0.85,
      "matching_points": ["Concern about market volatility", "Interest in SIP"],
      "suggested_angle": "How SIP protects wealth during market corrections",
      "kb_reference": ["chunk-uuid-2"]
    }
  ],
  "depth_analysis": [
    {
      "topic": "SIP vs Lumpsum",
      "depth": "deep",
      "key_points": ["Rupee cost averaging benefit", "Historical data comparison"],
      "gaps": ["No mention of tax implications"]
    }
  ],
  "opportunities": [
    {
      "title": "5 Times SIP Investors Laughed at Market Crashes",
      "hook": "Every crash since 2008 made SIP investors richer. Here's the data.",
      "structure": ["Hook with crash data", "3 real crash examples", "SIP return comparison", "CTA"],
      "content_angle": "Data-backed SIP resilience story",
      "recommended_format": "LinkedIn carousel",
      "priority": "high",
      "sequence_rank": 1,
      "effort": "half-day",
      "persona_match": "HNI Investor",
      "suggested_cta": "Start SIP with Right Horizons",
      "kpi": "Carousel saves + DM inquiries",
      "prerequisites": [],
      "source_context": "Anil's comparison of 2008/2020 SIP returns",
      "kb_reference": ["chunk-uuid-1", "chunk-uuid-2"]
    }
  ],
  "quality_check": {
    "source_richness": "high",
    "actionability": "high",
    "uniqueness": "medium",
    "completeness": "high"
  },
  "warnings": ["SEBI disclaimer required for all return claims"]
}
```

### Results Display

When analysis completes, the input form is replaced by a results view:

**Stats Row:** 4 stat cards showing Topics count, Insights count, Opportunities count, Source Quality.

**Warnings Banner:** Yellow card listing compliance/risk warnings.

**Summary Card:** Left-bordered card with the analysis summary.

**Topics & Depth Analysis:** Cards per topic showing depth level (deep=green, moderate=yellow, shallow=red), key points as bullets, gaps as badges.

**Key Insights:** Cards with confidence badge (high=green, medium=yellow, low=red), insight text, source reference.

**Audience Fit (Persona Matches):** 2-column grid. Each card has a conic-gradient score ring showing relevance (0-100%), persona name, suggested angle, matching points as badges.

**Repurposing Plan (Opportunities):** The main output. Sorted by `sequence_rank`. Each card shows:
- Rank number in a purple circle
- Format badge and priority/effort badges
- Title and hook (quoted)
- Content angle description
- Structure as a chain of pill-shaped labels with arrows
- Footer: persona, KPI, CTA
- Prerequisites warnings if any

**Sources Used:** Row of file name badges showing which KB files grounded the analysis.

**CTA Card:** Shows opportunity count, "View in Opportunities" button (navigates to Opportunities tab).

### Buttons and Actions

| Button | When Visible | What It Does |
|--------|-------------|--------------|
| Source type badges | Always (input form) | Selects the analysis source type |
| `+ Add` badge | Always (input form) | Opens AddSourceTypeModal |
| Red X on source type | Always (input form) | Deletes that source type |
| `Paste Text / Transcript` tab | Always (input form) | Switches to text input mode |
| `Paste Source Link` tab | Always (input form) | Switches to URL input mode |
| `Run Analysis` | When title + content filled | Starts the analysis |
| `New Analysis` | After results show | Resets to empty input form |
| `View in Opportunities` | After results show | Navigates to Opportunities tab |

### Example: Running an Analysis for Right Horizons

**Input:**
- Source Type: "Weekly Anil/Rachana" (triggers `weekly_expert_reflection` archetype)
- Source Title: "Weekly Reflection — Anil on Market Volatility"
- Source Owner: "Anil Rego"
- Content: "This week, markets corrected 3.2%... [transcript]"
- Marketing Notes: "Focus on reassuring content for HNIs"

**What happens:**
1. KB retrieval finds brand guidelines, compliance rules (SEBI disclaimers), persona files (HNI Investor, Young Professional)
2. Archetype detection matches `weekly_expert_reflection` — triggers the full Anil/Rachana playbook
3. The playbook rules enforce: no "Unlock"/"Boost" buzzwords, declarative headlines only, SEBI disclaimer on return claims, format eligibility matrix, carousel slide structure rules
4. Analysis returns 5-8 opportunities like carousels, LinkedIn posts, short video scripts — all grounded in KB with chunk IDs

---

## 9. Section 2: Opportunities

**Page:** `src/pages/OpportunitiesPage.tsx`
**Purpose:** Pipeline view of all content opportunities generated from analyses or trends.

### UI Layout

```
┌──────────────────────────────────────────┐
│ Header: "Opportunities"                   │
│ Status filter: [All] [Open] [In Studio]  │
│               [Dropped]                   │
│                                          │
│ ┌──────┐ ┌──────┐ ┌──────┐              │
│ │ Opp  │ │ Opp  │ │ Opp  │              │
│ │ Card │ │ Card │ │ Card │              │
│ │      │ │      │ │      │              │
│ │[Send]│ │[Open]│ │[Re-  │              │
│ │[Drop]│ │      │ │open] │              │
│ └──────┘ └──────┘ └──────┘              │
│   (3-column grid)                        │
└──────────────────────────────────────────┘
```

### Each Opportunity Card Shows:

- **Priority badge** — colored: high=red, medium=yellow, standard=blue, low=gray
- **Status badge** — open=green, in_studio=purple, dropped=gray
- **Title** — the opportunity title
- **Persona** — target persona name with relevance score
- **Content angle** — unique angle description
- **Format** — recommended output format
- **Recommendation reason** — why AI recommended this

### Buttons and Actions

| Button | Status | What It Does |
|--------|--------|--------------|
| `Send to Studio` | open | Sets status to `'in_studio'`, sets `activeStudioOpp`, clears `studioAsset`, navigates to Studio tab |
| `Drop` | open | Sets status to `'dropped'` |
| `Open in Studio` | in_studio | Navigates to Studio tab with this opportunity selected |
| `Reopen` | dropped | Sets status back to `'open'` |

### Data Flow

Opportunities enter this page from two sources:
1. **Analysis** — `AnalyzePage` calls `api.opportunities.createFromAnalysis()` after each analysis
2. **Trends** — `TrendsPage` creates opportunities from accepted trends

---

## 10. Section 3: Studio

**Page:** `src/pages/StudioPage.tsx`
**API Endpoint:** `POST /api/generate-content`
**Purpose:** Multi-stage content creation pipeline: Outline → Draft → Quality Review → Approve → Calendar.

### UI Layout

**Opportunity List View** (no opportunity selected):
3-column grid of in_studio opportunities. Click one to enter the Studio.

**Studio View** (opportunity selected):

```
┌──────────────────────────────────────────┐
│ [← All opportunities]                    │
│ Opportunity Title + Format Badge         │
│                                          │
│ [Generate Outline]  (when no asset)      │
│                                          │
│ ┌──────────────────────────────────────┐ │
│ │  Content (contentEditable div)       │ │
│ │  Shows outline OR draft              │ │
│ │  User can edit inline                │ │
│ └──────────────────────────────────────┘ │
│                                          │
│ Feedback: [________________] [Regenerate]│
│           [Approve outline/draft]        │
│                                          │
│ (After approval:)                        │
│ ┌──────────────────────────────────────┐ │
│ │  Quality Panel (scores + issues)     │ │
│ └──────────────────────────────────────┘ │
│ [Copy] [Download] [Edit Draft]          │
│ [Send to Calendar]                      │
└──────────────────────────────────────────┘
```

### 3-Stage Pipeline

**Stage 1: Generate Outline**

When user clicks "Generate Outline":
1. KB retrieval runs (`retrieve(accountId, query, 'generation')`)
2. `api.studio.generateOutline()` → `POST /api/generate-content` with `task: 'outline'`
3. LLM generates structured outline (title, format, sections with headings/points, CTA, SEO keywords)
4. `formatOutline()` converts JSON to readable markdown displayed in the editor

**Outline LLM Prompt (excerpt):**
```
Create a detailed content outline for this specific content opportunity.
The outline must be publication-ready — specific section headings,
concrete talking points, and a clear narrative arc.

Requirements:
- Each section heading must be a specific, descriptive claim — NOT a
  generic label like "Introduction" or "Benefits"
- Key points must be concrete talking points a writer can expand
```

**Outline Output Schema:**
```json
{
  "title": "5 Times SIP Investors Laughed at Market Crashes",
  "format": "LinkedIn carousel",
  "estimated_word_count": 1200,
  "target_persona": "HNI Investor",
  "sections": [
    {
      "heading": "Every Market Crash Made SIP Investors Richer",
      "purpose": "Hook with counter-intuitive data",
      "key_points": [
        "2008 crash: SIP investors who continued saw 22% CAGR over 5 years",
        "2020 COVID crash: 6-month SIP returns averaged 45%"
      ],
      "estimated_words": 200
    }
  ],
  "suggested_cta": "Start your SIP with Right Horizons",
  "key_messages": ["SIP is a crash-proof wealth builder"],
  "seo_keywords": ["SIP investing", "market crash SIP", "rupee cost averaging"]
}
```

**Stage 2: Generate Draft**

User can:
- **Edit the outline** inline (contentEditable div)
- **Enter feedback** and click "Regenerate" to revise with AI
- **Click "Approve outline"** to advance to draft generation

On approve:
1. `api.studio.generateDraft()` → `POST /api/generate-content` with `task: 'draft'`
2. The outline text is sent as `existing_content`
3. LLM writes a complete, publication-ready draft in markdown

**Draft Output Schema:**
```json
{
  "title": "5 Times SIP Investors Laughed at Market Crashes",
  "content": "# 5 Times SIP Investors Laughed at Market Crashes\n\nEvery market crash...",
  "meta_description": "Data-backed proof that SIP investing thrives during market crashes",
  "excerpt": "Every crash since 2008 made SIP investors richer. Here's the data.",
  "estimated_read_time_minutes": 5,
  "cta": {
    "text": "Start Your SIP Today",
    "context": "Links to the Right Horizons SIP calculator"
  },
  "citations": ["[Source: Anil weekly reflection]", "[KB: chunk-123]"]
}
```

**Stage 3: Approve Draft + Quality Review**

User can:
- **Edit the draft** inline
- **Enter feedback** and click "Regenerate" to revise
- **Click "Approve draft"** → triggers quality review

On approve:
1. `api.studio.qualityReview()` → `POST /api/generate-content` with `task: 'quality_review'`
2. LLM scores the draft on 8 dimensions
3. Stage advances to `'approved'`

**Quality Review Output Schema:**
```json
{
  "scores": {
    "language": 0.92,
    "readability": 0.88,
    "india_context": 0.95,
    "brand_tone": 0.85,
    "persona_tone": 0.90,
    "sales_pressure": 0.78,
    "jargon_level": 0.82,
    "source_support": 0.91
  },
  "issues": [
    {
      "severity": "medium",
      "category": "brand_voice",
      "description": "Opening paragraph uses 'we' instead of brand voice",
      "location": "First paragraph: 'We believe that...'",
      "suggestion": "Replace with 'Right Horizons believes that...'"
    }
  ],
  "visual_recommendation": {
    "concept": "Bar chart comparing SIP vs lumpsum returns across 5 market crashes",
    "format": "data_visualization",
    "data_callout": "SIP investors earned 22% CAGR vs 8% for lumpsum during 2008-2013"
  }
}
```

**Approved View:**

After approval, the draft renders as formatted HTML (via `renderMarkdown()`). The Quality Panel displays:
- Score indicators (green ≥0.8, yellow ≥0.5, red <0.5)
- Issues list with severity badges and suggestions
- Visual recommendation (concept + format)

Action buttons: Copy, Download (.md), Edit Draft (revert to draft stage), Send to Calendar.

### Buttons and Actions

| Button | Stage | What It Does |
|--------|-------|--------------|
| `← All opportunities` | Any | Returns to opportunity list |
| `Generate Outline` | No asset | Runs KB retrieval + outline generation |
| `Regenerate` | Outline/Draft | Sends content + feedback to LLM for revision |
| `Approve outline` | Outline | Runs draft generation |
| `Approve draft` | Draft | Runs quality review, advances to approved |
| `Copy` | Approved | Copies draft markdown to clipboard |
| `Download` | Approved | Downloads as .md file |
| `Edit Draft` | Approved | Reverts to draft stage for further editing |
| `Send to Calendar` | Approved | Creates calendar item with title, format, body |

### LLM Settings

| Task | Temperature | Max Tokens |
|------|-------------|------------|
| Outline | 0.45 | 8192 |
| Draft | 0.45 | 8192 |
| Regenerate | 0.45 | 8192 |
| Quality Review | 0.1 | 8192 |

---

## 11. Section 4: Knowledge Base

**Page:** `src/pages/KnowledgeBasePage.tsx`
**API Endpoint:** `POST /api/extract-knowledge` (structured extraction + embedding)
**API Endpoint:** `POST /api/backfill-embeddings` (index rebuild)
**Purpose:** Upload, manage, and index the knowledge files that ground all AI operations.

### UI Layout

```
┌──────────────────────────────────────────┐
│ Header: "Knowledge Base"                  │
│                                          │
│ Category filters: [All] [Persona] [Brand]│
│  [Compliance] [Expert] [Guidelines] ...  │
│                                          │
│ ┌──────────────────────────────────────┐ │
│ │ Agent Readiness (4-column grid)      │ │
│ │  persona: ●  brand: ●  compliance: ● │ │
│ │  expert: ○  guidelines: ●  ...       │ │
│ └──────────────────────────────────────┘ │
│                                          │
│ ┌──────────────────────────────────────┐ │
│ │ Semantic Search Index                │ │
│ │ [████████████░░░] 85% embedded       │ │
│ │ 170/200 chunks | 30 missing          │ │
│ │ [Rebuild search index]               │ │
│ └──────────────────────────────────────┘ │
│                                          │
│ [Upload File]                            │
│                                          │
│ File List:                               │
│ ┌──────────────────────────────────────┐ │
│ │ 📄 brand-voice.pdf  v1  ready       │ │
│ │   persona | standard | ☑ active     │ │
│ │   [Details] [Delete]                │ │
│ ├──────────────────────────────────────┤ │
│ │ 📄 compliance-rules.docx  v1  ready │ │
│ │   compliance | critical | ☑ active  │ │
│ │   [Details] [Delete]                │ │
│ └──────────────────────────────────────┘ │
└──────────────────────────────────────────┘
```

### 9 Knowledge Base Categories

| Category | Label | Purpose |
|----------|-------|---------|
| `persona` | Target Personas | Audience profiles, ICPs, demographics |
| `brand` | Brand Voice | Tone, style, guidelines |
| `compliance` | Compliance | Legal, regulatory rules (e.g., SEBI disclaimers) |
| `terminology` | Terminology | Domain-specific terms and definitions |
| `expert` | Expert Notes | SME references, expert transcripts |
| `guidelines` | Guidelines | Content creation standards |
| `raw_notes` | Raw Notes | Meeting transcripts, unstructured notes |
| `data` | Data | Datasets, statistics, research |
| `idea` | Ideas | Content ideas, brainstorming notes |

### File Upload Flow

**Step 1: Click "Upload File"** → Opens upload modal

**Step 2: Select file**
- Drag-and-drop or click to browse
- Accepted types: `.pdf, .docx, .xlsx, .xls, .csv, .tsv, .json, .html, .htm, .xml, .rtf, .txt, .md, .log, .markdown`
- Max file size: 20 MB

**Step 3: Choose category and priority** → Select from dropdowns

**Step 4: Click "Upload"** → Processing begins:

```
1. api.kb.upload(accountId, file, { category, priority })
   │
   ├─→ Upload file to Supabase Storage
   │   bucket: "knowledge-files"
   │   path: "{accountId}/{timestamp}_{filename}"
   │
   ├─→ Insert knowledge_files row (ingest_status: 'processing')
   │
   ├─→ parseFile(file) — detect format, extract text
   │   Supports: PDF (pdfjs-dist), DOCX (mammoth), XLSX (SheetJS),
   │   CSV/TSV, JSON, HTML, XML, RTF, plain text
   │
   ├─→ chunkText(text, targetTokens=600, overlapPct=0.15)
   │   Splits into ~2400-char chunks with 15% overlap
   │   Sanitizes for Postgres (strips null bytes, surrogates)
   │
   ├─→ Insert knowledge_chunks rows (one per chunk)
   │
   ├─→ Update file status to 'ready'
   │
   └─→ [NON-BLOCKING] POST /api/extract-knowledge
       ├─→ LLM extracts structured metadata:
       │   { detected_source_type, summary, main_topics,
       │     key_messages, audience, tone_of_voice,
       │     products_services, important_facts }
       │
       └─→ Batch-embed all chunks via Voyage/OpenAI/OpenRouter
           (1024-dim vectors stored in knowledge_chunks.embedding)
```

### Agent Readiness Indicator

A 4-column grid showing which categories have at least one ready + active file. Green dot = ready, gray dot = missing. This tells the user which "agents" (categories of knowledge) are available for grounding.

### Semantic Search Index Card

Shows:
- Progress bar: `{embedded}/{total}` chunks
- Missing count (chunks without embeddings)
- Skipped count (chunks that failed embedding)
- **"Reprocess files" button** — appears when `total === 0 && files > 0`. Re-parses all files and recreates chunks.
- **"Rebuild search index" button** — appears when `missing > 0`. Calls `api.kb.rebuildIndexStep()` in a loop until all chunks are embedded.

The rebuild loop calls `POST /api/backfill-embeddings` repeatedly. Each call processes up to 400 chunks in batches of 100. For Voyage AI (free tier), there's a 21-second sleep between batches to respect the 3 RPM rate limit.

### Buttons and Actions

| Button | What It Does |
|--------|--------------|
| Category filter badges | Filter displayed files by category |
| `Upload File` | Opens upload modal |
| `Reprocess files` | Re-parses all files and recreates chunks |
| `Rebuild search index` | Batch-embeds unembedded chunks |
| Active checkbox (per file) | Toggles file inclusion in KB retrieval |
| `Details` (per file) | Opens detail modal showing metadata, structured data |
| `Delete` (per file) | Opens confirmation, then deletes file + storage + chunks |

### Extract-Knowledge API: Structured Metadata Extraction

**System Prompt:**
```
You are a knowledge extraction engine.
CRITICAL OUTPUT RULE: respond with ONLY raw JSON.
```

**Output Schema:**
```json
{
  "detected_source_type": "brand_guidelines",
  "summary": "Brand guidelines defining Right Horizons' tone as authoritative yet approachable",
  "main_topics": ["brand voice", "content tone", "visual identity"],
  "key_messages": ["Trust through transparency", "Data over opinions"],
  "audience": "Marketing team and content creators",
  "tone_of_voice": "professional",
  "products_services": ["PMS", "SIP Advisory"],
  "important_facts": ["Founded 2009", "SEBI registered"]
}
```

---

## 12. Section 5: Ideas Lab

**Page:** `src/pages/IdeasLabPage.tsx`
**API Endpoint:** `POST /api/ideas-lab`
**Purpose:** AI-powered content ideation across 5 modes.

### UI Layout

```
┌──────────────────────────────────────────┐
│ Header: "Ideas Lab"                       │
│ Sub-tabs: [Generate] [Saved Library (3)] │
│           [Seasonal] [Webinar] [SEO]     │
│                                          │
│ ┌──────────────────────────────────────┐ │
│ │ Brief Form:                          │ │
│ │ Core Topic: [________________]       │ │
│ │ Target Audience: [____________]      │ │
│ │ Content Type: [LinkedIn carousel ▼]  │ │
│ │ Goal: [Awareness ▼]                 │ │
│ │ Idea Source: [Manual topic ▼]        │ │
│ │ Extra direction: [______________]    │ │
│ │                                      │ │
│ │ [  Generate Ideas  ]                │ │
│ └──────────────────────────────────────┘ │
│                                          │
│ Group filters: [All] [Social] [Video]   │
│               [Blog] [Email] [Seasonal] │
│                                          │
│ 3-column idea card grid:                 │
│ ┌────────┐ ┌────────┐ ┌────────┐       │
│ │ Idea 1 │ │ Idea 2 │ │ Idea 3 │       │
│ │ Score  │ │ Score  │ │ Score  │       │
│ │[Save]  │ │[Save]  │ │[Save]  │       │
│ │[View]  │ │[View]  │ │[View]  │       │
│ └────────┘ └────────┘ └────────┘       │
└──────────────────────────────────────────┘
```

### 5 Sub-Tabs

**Tab 1: Generate** — General content ideation from a brief
**Tab 2: Saved Library** — Ideas saved to localStorage (persisted per account)
**Tab 3: Seasonal** — Seasonal/timely ideas for the next 3 months
**Tab 4: Webinar** — Repurpose webinar content into 15-18 pieces
**Tab 5: SEO** — SEO-focused ideas from target keywords

### Generate Tab Flow

**Step 1: Fill brief form**
- Core Topic (required): e.g., "Mutual fund SIP for millennials"
- Target Audience: e.g., "Young professionals aged 25-35"
- Content Type: dropdown (LinkedIn carousel, Instagram Reel, Blog post, etc.)
- Goal: dropdown (Awareness, Engagement, Lead Generation, Education, Conversion)
- Idea Source: dropdown (Manual topic, Trend, Client request, Competitor gap, Data insight)
- Extra direction: free text

**Step 2: Click "Generate Ideas"**

```
1. IdeasLabPage.handleGenerate()
   │
   ├─→ [OPTIONAL] KB retrieval: retrieve(accountId, topic, 'ideas')
   │   Silently fails if no KB — ideas still generate
   │
   ├─→ api.ideas.generate({
   │     accountLabel, topic, audience, contentType,
   │     goal, source, context, avoidTitles, knowledgeChunks
   │   })
   │
   │   → POST /api/ideas-lab { task: 'generate', ... }
   │
   │   [SERVER-SIDE]
   │   ├─→ Build brief with all parameters
   │   ├─→ Trim KB chunks (max 10, 1500 chars each)
   │   ├─→ Include avoid_titles (up to 40 past titles) for dedup
   │   ├─→ callLLM(IDEAS_SYSTEM_PROMPT, prompt)
   │   │   → maxTokens: 5000, temperature: 0.85
   │   │   → 90-second AbortController timeout
   │   ├─→ Parse JSON response
   │   └─→ Return { success: true, task: 'generate', ideas: [...] }
   │
   ├─→ On success: display 6 idea cards
   │
   └─→ On failure: fallbackIdeas() generates 6 template ideas client-side
```

### Ideas Lab System Prompt

```
You are a senior content strategist and ideation engine for a marketing team.
You turn a brief into specific, production-ready content ideas that a team
can execute immediately.

HOW YOU WORK:
- Every idea must be specific and concrete — a real headline, a real angle,
  a real hook. Never generic templates.
- Vary format, angle, funnel stage, and audience segment across the batch —
  no two ideas should feel like the same idea reworded.
- Write hooks that lead with a specific number, tension, or insight —
  not a vague promise.
```

### Idea Card Schema (what the LLM returns for each idea)

```json
{
  "title": "The ₹500/Month SIP That Outperformed Gold in 5 Crashes",
  "format": "LinkedIn carousel",
  "group": "Social",
  "audience": "Young professionals aged 25-35",
  "hook": "Your parents' FD earned 6%. This ₹500/month SIP earned 18% through 5 market crashes.",
  "structure": ["Hook slide with crash timeline", "Slide per crash with SIP data", "Gold vs SIP comparison", "CTA slide"],
  "slide_flow": ["Slide 1: Cover with crash timeline graphic", "Slide 2: 2008 crash — SIP earned 22%", "..."],
  "angle": "Data-backed",
  "why_it_works": "Concrete data destroys the 'markets are risky' objection millennials have",
  "cta": "Start your ₹500 SIP → link in bio",
  "visual_direction": "Dark background, neon green growth line through red crash zones",
  "compliance_reminder": "SEBI disclaimer: Past performance does not guarantee future returns",
  "effort": "half-day",
  "sequence_rank": 1,
  "kpi": "Carousel saves > 500",
  "prerequisites": [],
  "content_pillar": "Investment Education",
  "platform_notes": "Best posted Tuesday 8-9am IST. Use 8-10 slides for LinkedIn algorithm boost.",
  "score": 88,
  "scores": {
    "audience_fit": 92,
    "clarity": 90,
    "platform_fit": 85,
    "conversion_potential": 80,
    "compliance_safety": 88
  }
}
```

### Idea Detail Drawer

Clicking "View" on an idea opens a side drawer showing:
- Full idea details (all fields above)
- **Save** button — toggles save to localStorage library
- **Copy** button — copies idea details to clipboard
- **Send to Calendar** button — creates a calendar item
- **Expand buttons:** `[Brief]` `[Carousel]` `[Blog]` `[Caption]`

### AI Expansion

Clicking an expand button sends the idea to the LLM for expansion into a specific format:

| Output Type | What It Generates |
|-------------|------------------|
| `brief` | Overview, target audience, key messages, content structure, visual mood, distribution plan, success metrics, SEO notes |
| `carousel` | Caption, per-slide content (headline, body, visual note, speaker note), design system |
| `blog` | Meta title, meta description, full outline (headings + subpoints), FAQ schema, internal links, featured snippet target |
| `caption` | LinkedIn caption, Instagram caption, Twitter caption, email subject lines |

### Webinar Tab

Paste webinar transcript → Click "Repurpose into 15-18 pieces" → Generates a diverse content repurposing plan spanning TOFU/MOFU/BOFU funnel stages:
- ~4 LinkedIn posts
- ~3 carousels
- ~3 short videos
- ~2 blog articles
- ~2 email sequences
- ~2 quote cards

### SEO Tab

Paste target keywords (one per line) → Click "Generate SEO Ideas" → Generates one idea per keyword/cluster with search intent, difficulty tier, long-tail keywords, meta description.

### Seasonal Tab

Click "Generate Seasonal Ideas" → Generates 10 ideas for the next 3 months with India-relevant timing (festivals, tax deadlines, etc.), occasion name, timing, and urgency level.

### Fallback System

If the AI API fails (network error, timeout, rate limit), the client generates 6 template ideas using the user's topic/audience, each with a base score of 70. A warning toast appears.

### Trend → Ideas Lab Integration

When a user clicks "Ideas Lab" on a trend card in the Trends page, the trend data is passed via `ideasSeed` in the Zustand store. The Ideas Lab detects this seed, prefills the brief form (topic, audience, context), switches to the Generate tab, and shows a confirmation toast.

---

## 13. Section 6: Trends & Alerts

**Page:** `src/pages/TrendsPage.tsx`
**API Endpoints:** `POST /api/trend-scan`, `POST /api/trend-supervisor`, `POST /api/auto-profile`
**Purpose:** Discover, classify, and route industry trends for content opportunities.

### UI Layout

```
┌──────────────────────────────────────────┐
│ Header: "Trends & Alerts"                │
│                                          │
│ [Run Live Scan] [AI-suggest] [Paste]    │
│ [Domain Profile]                         │
│                                          │
│ Filter: [All] [Domain] [Supertrend]     │
│         [Monitor] [Rejected] [Actioned] │
│                                          │
│ Trend Record Cards:                      │
│ ┌──────────────────────────────────────┐ │
│ │ 🟢 DOMAIN TREND | high | emerging   │ │
│ │ "AI-Powered Portfolio Rebalancing"   │ │
│ │ Summary text here...                 │ │
│ │ Relevance: 78 | Impact: 85 | Risk:12│ │
│ │ Connection: "Link to RH's quant..."  │ │
│ │ [Ideas Lab] [+ Opportunity]          │ │
│ │ [+ Calendar] [Dismiss]               │ │
│ └──────────────────────────────────────┘ │
│                                          │
│ ┌──────────────────────────────────────┐ │
│ │ 🟡 MONITOR | medium | growing       │ │
│ │ "Green Bond Market Expansion"        │ │
│ │ [Promote] [Dismiss]                  │ │
│ └──────────────────────────────────────┘ │
└──────────────────────────────────────────┘
```

### Domain Profile Configuration

Clicking "Domain Profile" reveals a configuration panel with 10 fields:

| Field | Example Value |
|-------|---------------|
| Business Name | Right Horizons |
| Industry | Financial Services, Wealth Management |
| Core Topics | SIP, Mutual Funds, Portfolio Management, Tax Planning |
| Target Keywords | best SIP plans 2026, wealth management India |
| Target Locations | India, Bangalore |
| Target Audience | HNIs, Young professionals, NRIs |
| Competitors | Kotak Wealth, ICICI Prudential |
| Restricted Topics | Politics, Religion, Crypto speculation |
| Brand Tone | Authoritative, data-driven, trustworthy |
| Max Recommendations | 8 |
| ☑ Enable automated daily scan | |

When an account has a URL but no profile, the system auto-detects the profile via `POST /api/auto-profile`:
1. Fetches website content (direct HTTP + Tavily search)
2. LLM extracts business metadata (industry, topics, audience, etc.)
3. Saves profile and runs initial suggestion scan

### Trend Scanning Modes

**Mode 1: Live Scan** (`mode: 'live'`)
```
1. Build search queries from profile:
   - core_topics (up to 4) + location + "latest news trends"
   - target_keywords (up to 3) + "2026 trend"
   - industry + "industry trends this week"
   - competitors (up to 2) + "news announcement"
   Max 6 queries

2. Query Tavily Search API for each:
   - topic: 'news'
   - search_depth: 'basic'
   - max_results: 5 per query
   - days: 14 (last 2 weeks)

3. Deduplicate by URL/title

4. Run through Trend Supervisor LLM
```

**Mode 2: AI-Suggest** (`mode: 'suggest'`)
```
1. LLM generates 12 candidate topics based on profile:
   - Mix of on-domain topics + 2-3 broader cultural/seasonal candidates
   - Temperature: 0.8

2. Run through Trend Supervisor LLM
```

**Mode 3: Paste Topics**
```
1. User pastes topics (one per line) in a text area
2. Sends to POST /api/trend-supervisor as signals
3. Supervisor classifies and scores them
```

### Trend Supervisor: AI Classification

The Trend Supervisor LLM receives:
- Domain profile (business, industry, topics, audience, competitors, etc.)
- Raw trend signals (title, source, date, summary)
- Today's date

It applies these routing rules:

| Classification | Rule | Action |
|---------------|------|--------|
| `domain_trend` | relevance ≥ 60 AND impact ≥ 40 AND risk ≤ 60 | Auto-accepted, routed to action |
| `supertrend_exception` | relevance < 60 AND impact ≥ 90 AND adaptability ≥ 65 AND risk ≤ 40 | Accepted only with natural brand connection |
| `monitor` | Relevant but weak, emerging, or incomplete evidence | Worth watching |
| `reject` | Low impact AND low relevance, or too risky | Not relevant |

**Supervisor System Prompt (key excerpt):**
```
You are an AI Trend Supervisor. You sit between raw trend signals and a
content Action Layer. You do NOT forward every topic — you classify, score,
filter, prioritise, and route.

GUARDRAILS: never invent trend data, never treat popularity as relevance,
never force a brand connection. If a topic touches politics, health, finance,
law, tragedy, or controversy, raise its risk and set needs_human_review = true.
```

### Trend Record Card Display

Each trend card shows:
- Classification badge (Domain Trend=green, Supertrend=purple, Monitor=yellow, Rejected=gray)
- Priority badge and trend stage badge
- Confidence score
- Title and summary
- Score pills: Relevance, Impact, Adaptability (supertrends only), Risk (inverted — lower is better)
- Suggested connection to brand
- Reason for classification
- Estimated lifespan

### Buttons and Actions

| Button | Classification | What It Does |
|--------|---------------|--------------|
| `Ideas Lab` | domain_trend, supertrend | Routes trend to Ideas Lab via `ideasSeed` (prefills brief) |
| `+ Opportunity` | domain_trend, supertrend | Creates an opportunity with trend data |
| `+ Calendar` | domain_trend, supertrend | Adds trend directly to calendar |
| `Promote` | monitor | Changes status to `'accepted'` |
| `Dismiss` | any | Deletes the trend record |

### Automated Daily Scan (Cron)

`vercel.json` schedules `GET /api/trend-scan` at 6:00 AM UTC daily. The cron handler:
1. Verifies `CRON_SECRET` authorization
2. Queries all accounts with `profile.trend_profile.enabled === true`
3. For each account (up to 10): runs live scan → supervisor → saves results to DB
4. Returns summary of all accounts processed

---

## 14. Section 7: Calendar

**Page:** `src/pages/CalendarPage.tsx`
**Purpose:** Schedule, track, and export all generated content.

### UI Layout

```
┌──────────────────────────────────────────┐
│ Header: "Content Calendar"               │
│                                          │
│ Filter: [All] [Scheduled] [Published]   │
│         [Cancelled]                      │
│                                          │
│ ┌──────────────────────────────────────┐ │
│ │ "5 Times SIP Investors..."           │ │
│ │ LinkedIn carousel | Jul 15, 2026     │ │
│ │ ● scheduled                          │ │
│ │ [Export] [Reschedule] [Cancel]       │ │
│ │  ┌─────────────────────────────┐     │ │
│ │  │ Date: [2026-07-15T09:00]    │     │ │
│ │  │ [Confirm] [Cancel]          │     │ │
│ │  └─────────────────────────────┘     │ │
│ ├──────────────────────────────────────┤ │
│ │ "Green Bond Market Analysis"         │ │
│ │ Blog post | Not scheduled            │ │
│ │ [Export] [Set Date]                  │ │
│ └──────────────────────────────────────┘ │
└──────────────────────────────────────────┘
```

### How Items Enter the Calendar

Calendar items are created from 3 sources:
1. **Studio** — "Send to Calendar" button on approved drafts
2. **Ideas Lab** — "Send to Calendar" on ideas or expanded outputs
3. **Trends** — "+ Calendar" button on trend cards

### Buttons and Actions

| Button | What It Does |
|--------|--------------|
| Status filter badges | Filter by scheduled/published/cancelled |
| `Export` | Downloads calendar item as `.txt` file with title, format, date, status, content |
| `Set Date` / `Reschedule` | Expands scheduling row with datetime picker |
| `Confirm` (schedule row) | Sets `scheduled_for` date, status to `'scheduled'` |
| `Cancel` (filter) | Closes scheduling row |
| `Cancel` (status) | Sets status to `'cancelled'` |

### Sorting

Items are sorted: scheduled items first (by date ascending), then unscheduled items (by created_at descending).

---

## 15. Section 8: Settings

**Page:** `src/pages/SettingsPage.tsx`
**Purpose:** Configure external integrations and view platform status.

### UI Layout

```
┌──────────────────────────────────────────┐
│ Header: "Settings & Integrations"        │
│                                          │
│ ┌──────────────────────────────────────┐ │
│ │ Platform Status                      │ │
│ │ Database: ● Connected                │ │
│ │ Account: Right Horizons              │ │
│ │ User: user@example.com              │ │
│ │ Account ID: 00000000-...-01          │ │
│ └──────────────────────────────────────┘ │
│                                          │
│ Integrations (2-column grid):            │
│ ┌───────────┐ ┌───────────┐             │
│ │ WordPress │ │ LinkedIn  │             │
│ │ ● config  │ │ ○ not     │             │
│ │ _required │ │  connected│             │
│ │[Configure]│ │[Configure]│             │
│ │[Test]     │ │[Test]     │             │
│ └───────────┘ └───────────┘             │
└──────────────────────────────────────────┘
```

### Default Integrations

| Type | Provider | Label | Description |
|------|----------|-------|-------------|
| CMS | WordPress | WordPress | Publish content directly to WordPress sites |
| Social | LinkedIn | LinkedIn | Schedule and publish LinkedIn posts |
| Social | Twitter | Twitter / X | Schedule and publish tweets and threads |
| Email | Mailchimp | Mailchimp | Push newsletter content to Mailchimp campaigns |
| Analytics | Google Analytics | Google Analytics | Track content performance metrics |
| Storage | Google Drive | Google Drive | Import and export content from Google Drive |

### Configuration Flow

1. Click "Configure" on an integration
2. Modal opens with form fields (auto-detected from config keys):
   - Fields containing `key`, `secret`, `token`, or `password` use password input type
   - If no predefined fields, shows a JSON textarea
3. Click "Save" → `api.integrations.configure(accountId, id, configValues)`
4. Click "Test" → checks if config has keys → sets status to `'connected'` or `'configuration_required'`

---

## 16. Knowledge Base Retrieval System

**File:** `src/lib/retrieval.ts`
**Purpose:** Powers all AI operations by fetching relevant KB content for grounding.

### Retrieval Pipeline

```
retrieve(accountId, queryText, taskType)
│
├─→ 1. Check if Supabase is configured
│
├─→ 2. checkReadiness(accountId)
│   Query active, ready knowledge_files
│   Check which categories exist
│   Determine if all REQUIRED_CATEGORIES have files
│   (Default required: ['brand'])
│
├─→ 3. Fetch CONSTRAINT chunks (always included in full)
│   Categories: ['compliance', 'brand', 'guidelines']
│   These are never filtered by relevance — always sent to the LLM
│
├─→ 4. Fetch context file IDs (all non-constraint active files)
│
├─→ 5. Try SEMANTIC search:
│   ├─→ embedQuery(queryText)
│   │   → POST /api/embed-query → returns 1024-dim vector
│   │
│   └─→ scoreBySemantic(accountId, embedding, excludeFileIds)
│       → Supabase RPC: match_chunks(p_account_id, p_query_embedding,
│         p_match_count=8, p_exclude_file_ids)
│       → Returns chunks sorted by cosine similarity
│       → MIN_SIMILARITY threshold: 0.25
│
├─→ 6. If semantic fails or low scores, KEYWORD fallback:
│   ├─→ Split query into words (lowercase, >2 chars, max 120)
│   ├─→ Fetch up to 120 chunks from context files
│   ├─→ Score each chunk by keyword overlap count
│   └─→ Return top 8 sorted by score
│
├─→ 7. Collect structured metadata for all used files (KBFileContext)
│
├─→ 8. GROUNDING GATE:
│   If ZERO chunks from both constraint and context sources:
│     → Return { refused: true, reason: "Add relevant knowledge files" }
│   Otherwise:
│     → Return all chunks, sources, scores, retrieval mode
│
└─→ Return RetrievalResult
```

### RetrievalResult Shape

```typescript
{
  refused: boolean;           // true = no KB content found
  reason?: string;            // why it was refused
  chunks: RetrievalChunk[];   // top-K context chunks (max 8)
  constraintChunks: RetrievalChunk[]; // all brand/compliance/guidelines chunks
  sourcesUsed: KBFileContext[];       // metadata for files that contributed chunks
  topScore: number;           // highest similarity/keyword score
  readiness: {
    ready: boolean;           // true if all required categories have files
    categories: Record<string, boolean>; // which categories exist
    missingRequired: string[];           // required categories without files
  };
  retrievalMode?: 'semantic' | 'keyword' | 'none';
}
```

### Configuration Constants

| Constant | Default | Env Var | Description |
|----------|---------|---------|-------------|
| `CONSTRAINT_CATEGORIES` | `['compliance', 'brand', 'guidelines']` | `VITE_CONSTRAINT_CATEGORIES` | Always-included categories |
| `REQUIRED_CATEGORIES` | `['brand']` | `VITE_GENERATION_REQUIRED_CATEGORIES` | Must have files for readiness |
| `TOP_K` | `8` | `VITE_RETRIEVAL_TOP_K` | Max context chunks returned |
| `MIN_SIMILARITY` | `0.25` | `VITE_RETRIEVAL_MIN_SIMILARITY` | Minimum cosine similarity threshold |
| `FETCH_LIMIT` | `120` | (hardcoded) | Max chunks fetched for keyword scoring |

---

## 17. Embedding System

### Multi-Provider Architecture

The system supports 3 embedding providers with automatic fallback:

| Priority | Provider | API Key Env Var | Model | Dimensions |
|----------|----------|----------------|-------|------------|
| 1 | Voyage AI | `VOYAGE_API_KEY` | `voyage-3` | 1024 |
| 2 | OpenAI | `OPENAI_API_KEY` | `text-embedding-3-small` | 1024 |
| 3 | OpenRouter | `OPENROUTER_API_KEY` | `openai/text-embedding-3-small` | 1024 |

Override: `EMBED_PROVIDER` env var forces a specific provider.

### Two Embedding Contexts

**Document embedding** (at upload/backfill time via `extract-knowledge.ts` and `backfill-embeddings.ts`):
- Input type: `document` (for Voyage)
- Batch processing: up to 100 chunks per API call
- Stored in `knowledge_chunks.embedding` as `vector(1024)`

**Query embedding** (at search time via `embed-query.ts`):
- Input type: `query` (for Voyage — different from document!)
- Single text input
- Returns embedding vector to client for `match_chunks` RPC

### Rate Limiting

- Voyage AI free tier: 3 RPM → 21-second sleep between batches in backfill
- Retry on 429: up to 4 attempts with exponential backoff (15s × 2^attempt)
- Retry-After header respected (capped at 60s)

---

## 18. Text Chunking System

**File:** `src/lib/chunker.ts`

### Algorithm

```
chunkText(text, targetTokens=600, overlapPct=0.15)

1. Sanitize text (strip null bytes, C0 controls, lone surrogates)
2. Calculate targetChars = 600 × 4 = 2400 chars
3. Calculate overlapChars = round(2400 × 0.15) = 360 chars
4. Split by double newlines → paragraphs
5. For each paragraph:
   - If fits in targetChars → use as block
   - If too long → split by sentence boundaries
6. Accumulate blocks into buffer
7. When buffer exceeds targetChars:
   - Flush buffer as a chunk
   - Keep last 360 chars as overlap for next chunk
8. Each chunk records: content, index, charStart, charEnd
```

### Output

```typescript
{
  content: string;   // chunk text (sanitized)
  index: number;     // sequential position (0-based)
  charStart: number; // start position in original text
  charEnd: number;   // end position in original text
}
```

### Example

For a 10,000-character document:
- ~4-5 chunks of ~2,400 characters each
- Each chunk overlaps with the previous by ~360 characters
- This overlap ensures context isn't lost at chunk boundaries

---

## 19. File Parsing System

**File:** `src/lib/fileParser.ts`

### Supported Formats

| Extension | Parser | Library |
|-----------|--------|---------|
| `.txt`, `.md`, `.log`, `.markdown` | `parsePlainText` | Native |
| `.csv` | `parseCsvLike` (comma) | Native |
| `.tsv` | `parseCsvLike` (tab) | Native |
| `.json` | `parseJson` | Native |
| `.html`, `.htm` | `parseHtml` | Native (tag stripping) |
| `.xml` | `parseXml` | Native (tag stripping) |
| `.rtf` | `parseRtf` | Native (control word stripping) |
| `.pdf` | `parsePdf` | `pdfjs-dist` (lazy-loaded) |
| `.docx` | `parseDocx` | `mammoth` (lazy-loaded) |
| `.xlsx`, `.xls` | `parseSpreadsheet` | `xlsx/SheetJS` (lazy-loaded) |
| `.doc` | ❌ | Error: "Re-save as .docx" |

### Limits

- Max file size: 20 MB
- Max output: 500,000 characters (~125k tokens)
- PDF/DOCX have primitive fallback parsers if main library fails

---

## 20. Source Archetype System

**Server:** `api/analyze-content.ts` (inline)
**Client:** `src/lib/archetype-hint.ts`

The archetype system detects the type of source content being analyzed and applies archetype-specific rules to shape the analysis.

### 12 Archetypes

| Archetype | Regex Pattern | Focus | Insight Style |
|-----------|--------------|-------|---------------|
| `weekly_expert_reflection` | `/weekly[_ -]?anil\|weekly[_ -]?rachana\|...` | Expert authority, personal brand | Personal + data; no buzzwords |
| `interview` | `/interview\|testimonial\|customer[_ -]story\|...` | Customer voice, direct quotes | Quote-first; social proof |
| `webinar` | `/webinar\|masterclass\|workshop/` | Educational takeaways | Teaching framework |
| `event` | `/event\|conference\|summit\|panel\|...` | Networking insights, themes | Curated highlights |
| `launch` | `/launch\|announcement\|release\|...` | Product value, news angle | Feature→benefit bridge |
| `competitor` | `/competitor\|rival\|alternative/` | Positioning, differentiation | Objective comparison |
| `research` | `/research\|report\|whitepaper\|...` | Data credibility | Data-first, citations |
| `trending` | `/trend\|news\|breaking\|...` | Speed, timely take | Quick reaction |
| `recurring` | `/weekly\|monthly\|daily\|newsletter\|...` | Consistency, loyalty | Serialized, linked |
| `video` | `/video\|podcast\|transcript\|...` | Visual moments, quotables | Quote + timestamp |
| `blog` | `/blog\|article\|op[_ -]ed\|...` | Thought leadership | Author voice amplification |
| `generic` | (fallback) | General analysis | Standard extraction |

Each archetype defines 4 rule fields:
- **focus**: What the strategist should prioritize
- **insight_style**: How to extract and present insights
- **format_bias**: Which output formats to prefer
- **gotchas**: Common mistakes to avoid

---

## 21. Weekly Anil & Rachana Content Playbook

The `weekly_expert_reflection` archetype includes a comprehensive playbook that is appended to the analysis prompt when source type matches "Weekly Anil/Rachana" patterns.

### Format Eligibility Matrix

| Format | When Eligible | Typical Effort |
|--------|--------------|----------------|
| Single-image post | Always | Quick |
| Carousel (multi-slide) | At least 3 distinct points/steps | Half-day |
| Short-form video script | Strong narrative hook + visual potential | Half-day |
| Quote card | Memorable one-liner from expert | Quick |
| Blog post | Deep topic with 4+ substantive points | Full-day |
| Newsletter snippet | Any non-trivial reflection | Quick |
| Infographic brief | Data-heavy or process-oriented content | Half-day |

### Carousel Slide Structure Rules

- Cover slide: headline (≤10 words, declarative), sub-headline, visual direction
- Body slides (4-8): one claim per slide, evidence or example, visual note
- CTA slide: specific next step, branded sign-off

### Mandatory Rules

1. **Banned words**: Revolutionize, Unlock, Boost, Harness, Elevate, Enhance, Deep Dive, Explore, Delve, Unparalleled, Game changer, Say goodbye
2. **Tone**: Plain Indian/British English, conversational authority
3. **Headlines**: Declarative only — no questions, no "How to..."
4. **Formatting**: No em-dashes (—), use commas or full stops
5. **SEBI compliance**: Every piece mentioning returns/performance MUST include disclaimer
6. **Decision flow**: If expert said something memorable → quote card first, then consider carousel

---

## 22. Cross-Page Data Flow

### Complete Content Pipeline

```
                    ┌─────────────┐
                    │ Knowledge   │  Upload files → parse → chunk → embed
                    │ Base        │  (personas, brand, compliance, etc.)
                    └──────┬──────┘
                           │ grounding
           ┌───────────────┼───────────────┐
           ▼               ▼               ▼
    ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
    │ New Analysis │ │ Ideas Lab   │ │ Trends      │
    │ (source→opps)│ │ (ideas)     │ │ (signals)   │
    └──────┬──────┘ └──────┬──────┘ └──────┬──────┘
           │               │               │
           │ opportunities │ ideas/assets   │ trends
           ▼               │               │
    ┌─────────────┐        │     ┌─────────┘
    │Opportunities│←───────┘     │
    │ Pipeline    │              │
    └──────┬──────┘              │
           │ send to studio      │
           ▼                     │
    ┌─────────────┐              │
    │ Studio      │              │
    │ Outline →   │              │
    │ Draft →     │              │
    │ Quality →   │              │
    │ Approve     │              │
    └──────┬──────┘              │
           │ send to calendar    │
           ▼                     ▼
    ┌─────────────────────────────────┐
    │        Content Calendar          │
    │  Schedule → Export → Publish     │
    └─────────────────────────────────┘
```

### State Flow Between Pages

| From | To | Mechanism | Data Passed |
|------|----|-----------|-------------|
| Analysis → Opportunities | `api.opportunities.createFromAnalysis()` | Opportunities auto-created from analysis results |
| Opportunities → Studio | `setActiveStudioOpp(id)` + `setActiveTab('studio')` | Opportunity ID in Zustand store |
| Studio → Calendar | `api.calendar.add()` | Title, format, body from approved draft |
| Ideas Lab → Calendar | `api.calendar.add()` | Title, format from idea or expanded output |
| Trends → Ideas Lab | `setIdeasSeed({topic, audience, context})` + `setActiveTab('ideas')` | Trend data in Zustand store |
| Trends → Opportunities | `api.opportunities.createFromAnalysis()` | Trend converted to opportunity |
| Trends → Calendar | `api.calendar.add()` | Trend data as calendar entry |

### Account Switching Reset

When switching accounts via `AccountSwitcher`:
1. `resetAccountState()` clears: `activeStudioOpp`, `studioAsset`, `ideasSeed`
2. Each page's `useEffect([], [accountId])` refetches data for the new account
3. KB, analyses, opportunities, trends, calendar — all scoped to the new account

---

## 23. Complete API Reference

### All 9 Serverless Endpoints

| # | Endpoint | Method | Max Duration | Purpose |
|---|----------|--------|-------------|---------|
| 1 | `/api/analyze-content` | POST | 120s | Source content analysis |
| 2 | `/api/generate-content` | POST | 120s | Content generation (outline/draft/regenerate/quality) |
| 3 | `/api/ideas-lab` | POST | 120s | Content ideation (5 modes) |
| 4 | `/api/trend-scan` | POST/GET | 300s | Trend collection + supervision (POST=manual, GET=cron) |
| 5 | `/api/trend-supervisor` | POST | 120s | Standalone trend classification |
| 6 | `/api/auto-profile` | POST | 120s | Auto-detect business profile from URL |
| 7 | `/api/extract-knowledge` | POST | 120s | Structured extraction + batch embedding |
| 8 | `/api/embed-query` | POST | 30s | Single query embedding |
| 9 | `/api/backfill-embeddings` | POST | 300s | Batch re-embed for index rebuild |

### Common Patterns Across All Endpoints

1. **CORS**: All set `Access-Control-Allow-Origin: *` and handle OPTIONS preflight
2. **LLM Model**: `process.env.LLM_MODEL ?? 'anthropic/claude-sonnet-4-5'`
3. **LLM Provider**: OpenRouter (`https://openrouter.ai/api/v1/chat/completions`)
4. **JSON Extraction**: All use `extractJSON()` — strips markdown fences, tries JSON.parse, falls back to brace extraction
5. **Retry Logic**: MAX_RETRIES=2, exponential backoff (1000ms × 2^attempt), retries on HTTP 429
6. **Error Messages**: Specific messages for 401 (invalid key), 402 (no credits), 404 (model not found)
7. **Self-contained**: No cross-file imports (Vercel serverless requirement)

### API 1: POST /api/analyze-content

**Request:**
```json
{
  "source_text": "This week, Anil discussed market volatility...",
  "source_type": "weekly_anil_rachana",
  "source_type_context": {
    "name": "Weekly Anil/Rachana",
    "slug": "weekly_anil_rachana",
    "description": "Weekly expert reflections",
    "formats": ["LinkedIn carousel", "Quote card", "Blog post"],
    "analysis_guidance": "Focus on actionable advice"
  },
  "source_title": "Weekly Reflection — Market Volatility",
  "source_owner": "Anil Rego",
  "marketing_notes": "Target HNI investors",
  "knowledge_chunks": [
    { "id": "chunk-uuid-1", "content": "HNI Investor persona: Age 45-65, portfolio >1Cr..." }
  ],
  "file_context": [
    { "file_id": "file-uuid", "file_name": "brand-voice.pdf", "category": "brand" }
  ],
  "personas": [
    { "name": "HNI Investor", "description": "High-net-worth individual...", "pain_points": ["Market volatility"], "goals": ["Wealth preservation"] }
  ],
  "account_id": "00000000-0000-0000-0000-000000000001"
}
```

**Response:**
```json
{
  "success": true,
  "analysis": {
    "summary": "Anil's weekly reflection covers...",
    "topics": ["Market Volatility", "SIP Strategy", "Portfolio Rebalancing"],
    "insights": [...],
    "persona_matches": [...],
    "depth_analysis": [...],
    "opportunities": [...],
    "quality_check": {...},
    "warnings": [...]
  },
  "id": null
}
```

**LLM**: maxTokens=8192, temperature=0.35

### API 2: POST /api/generate-content

**Request (outline):**
```json
{
  "task": "outline",
  "opportunity": {
    "title": "5 Times SIP Investors Laughed at Market Crashes",
    "content_angle": "Data-backed SIP resilience story",
    "recommended_format": "LinkedIn carousel",
    "persona_match": "HNI Investor",
    "suggested_cta": "Start SIP with Right Horizons"
  },
  "knowledge_chunks": [...],
  "persona": { "name": "HNI Investor", "description": "..." }
}
```

**Response:**
```json
{
  "success": true,
  "task": "outline",
  "output": {
    "title": "...",
    "format": "LinkedIn carousel",
    "estimated_word_count": 1200,
    "sections": [...],
    "suggested_cta": "...",
    "key_messages": [...],
    "seo_keywords": [...]
  }
}
```

**LLM settings per task:**
- outline: temperature=0.45, maxTokens=8192
- draft: temperature=0.45, maxTokens=8192
- regenerate: temperature=0.45, maxTokens=8192
- quality_review: temperature=0.1, maxTokens=8192

### API 3: POST /api/ideas-lab

**Request (generate):**
```json
{
  "task": "generate",
  "account_label": "Right Horizons",
  "topic": "SIP investing for millennials",
  "audience": "Young professionals aged 25-35",
  "content_type": "LinkedIn carousel",
  "goal": "Awareness",
  "source": "Manual topic",
  "context": "Focus on data-backed claims",
  "avoid_titles": ["Previous idea title 1", "..."],
  "knowledge_chunks": [...]
}
```

**Response:**
```json
{
  "success": true,
  "task": "generate",
  "ideas": [
    {
      "title": "The ₹500/Month SIP That Outperformed Gold",
      "format": "LinkedIn carousel",
      "group": "Social",
      "hook": "Your parents' FD earned 6%...",
      "score": 88,
      "scores": { "audience_fit": 92, "clarity": 90, "..." }
    }
  ]
}
```

**LLM settings per task:**
- generate: temperature=0.85, maxTokens=5000
- webinar: temperature=0.75, maxTokens=6000
- seo: temperature=0.7, maxTokens=7000
- seasonal: temperature=0.8, maxTokens=5000
- expand: temperature=0.6, maxTokens=6000

### API 4: POST /api/trend-scan

**Request:**
```json
{
  "account_label": "Right Horizons",
  "account_id": "00000000-...-01",
  "profile": {
    "business_name": "Right Horizons",
    "industry": "Financial Services",
    "core_topics": "SIP, Mutual Funds, Tax Planning",
    "target_keywords": "best SIP plans 2026",
    "target_locations": "India"
  },
  "mode": "live"
}
```

**Response:**
```json
{
  "success": true,
  "topics": [
    {
      "topic": "AI-Powered Portfolio Rebalancing",
      "classification": "domain_trend",
      "domain_relevance_score": 78,
      "trend_impact_score": 85,
      "risk_score": 12,
      "reason": "Direct alignment with wealth management..."
    }
  ],
  "summary": { "total_topics_reviewed": 15, "domain_trends_sent": 3, "..." },
  "source": "tavily",
  "saved": true
}
```

### API 5: POST /api/trend-supervisor

Takes pre-collected signals and classifies them. Same supervisor logic as trend-scan but without signal collection or persistence.

### API 6: POST /api/auto-profile

**Request:**
```json
{
  "url": "https://righthorizons.com",
  "account_name": "Right Horizons"
}
```

**Response:**
```json
{
  "success": true,
  "profile": {
    "business_name": "Right Horizons",
    "industry": "Financial Services, Wealth Management",
    "core_topics": "SIP, Mutual Funds, PMS, Tax Planning, Estate Planning",
    "target_audience": "HNIs, Young Professionals, NRIs",
    "brand_tone": "authoritative, data-driven, trustworthy"
  },
  "source": "website"
}
```

### API 7: POST /api/extract-knowledge

**Request:**
```json
{
  "file_name": "brand-voice-guidelines.pdf",
  "category": "brand",
  "sample_text": "Right Horizons brand voice is authoritative yet approachable...",
  "file_id": "file-uuid",
  "account_id": "account-uuid"
}
```

**Response:**
```json
{
  "success": true,
  "structured": {
    "detected_source_type": "brand_guidelines",
    "summary": "Brand guidelines defining tone as authoritative yet approachable",
    "main_topics": ["brand voice", "content tone"],
    "key_messages": ["Trust through transparency"],
    "tone_of_voice": "professional"
  },
  "embedded_count": 15,
  "embed_note": null
}
```

### API 8: POST /api/embed-query

**Request:**
```json
{ "text": "SIP investing during market crashes" }
```

**Response:**
```json
{
  "embedding": [0.0123, -0.0456, ...],
  "provider": "voyage",
  "model": "voyage-3",
  "dims": 1024
}
```

### API 9: POST /api/backfill-embeddings

**Request:**
```json
{ "account_id": "00000000-0000-0000-0000-000000000001" }
```

**Response:**
```json
{
  "embedded": 100,
  "skipped": 2,
  "remaining": 50,
  "total": 152,
  "done": false
}
```

Client loops calling this until `done: true` or `remaining <= 0`.

---

## 24. Environment Variables

### Required

| Variable | Used By | Description |
|----------|---------|-------------|
| `OPENROUTER_API_KEY` | All LLM endpoints | OpenRouter API key for Claude access |
| `VITE_SUPABASE_URL` | Frontend | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Frontend | Supabase anonymous/public key |

### Recommended

| Variable | Used By | Description |
|----------|---------|-------------|
| `SUPABASE_URL` | Backend APIs | Supabase URL (server-side, same as VITE_ version) |
| `SUPABASE_SERVICE_ROLE_KEY` | Backend APIs | Supabase service role key (bypasses RLS) |
| `SUPABASE_ANON_KEY` | Backend APIs | Supabase anon key (server-side) |

### Optional

| Variable | Default | Used By | Description |
|----------|---------|---------|-------------|
| `LLM_MODEL` | `anthropic/claude-sonnet-4-5` | All LLM endpoints | Override LLM model |
| `SITE_URL` | `https://content-intelligence-ebon.vercel.app` | All LLM endpoints | HTTP-Referer header |
| `TAVILY_API_KEY` | (none) | trend-scan, auto-profile | Tavily search API |
| `VOYAGE_API_KEY` | (none) | embed-query, extract-knowledge, backfill | Voyage AI embeddings (preferred) |
| `OPENAI_API_KEY` | (none) | embed-query, extract-knowledge, backfill | OpenAI embeddings (fallback) |
| `EMBED_PROVIDER` | (auto-detect) | Embedding endpoints | Force: `voyage`, `openai`, or `openrouter` |
| `OPENROUTER_EMBED_MODEL` | `openai/text-embedding-3-small` | Embedding via OpenRouter | Override embedding model |
| `CRON_SECRET` | (none) | trend-scan GET | Auth for cron endpoint |

### Security Rules

- `.env` is `.gitignored` — never committed
- `OPENROUTER_API_KEY` set only in Vercel Environment Variables
- `SUPABASE_SERVICE_ROLE_KEY` server-side only — never exposed to browser
- `VITE_` prefix variables are embedded in the frontend build — only public keys

---

## 25. Deployment & Infrastructure

### Vercel Configuration (`vercel.json`)

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "framework": "vite",
  "functions": {
    "api/analyze-content.ts": { "maxDuration": 120 },
    "api/generate-content.ts": { "maxDuration": 120 },
    "api/ideas-lab.ts": { "maxDuration": 120 },
    "api/trend-supervisor.ts": { "maxDuration": 120 },
    "api/trend-scan.ts": { "maxDuration": 300 },
    "api/extract-knowledge.ts": { "maxDuration": 120 },
    "api/embed-query.ts": { "maxDuration": 30 },
    "api/backfill-embeddings.ts": { "maxDuration": 300 },
    "api/auto-profile.ts": { "maxDuration": 120 }
  },
  "crons": [
    { "path": "/api/trend-scan", "schedule": "0 6 * * *" }
  ],
  "rewrites": [
    { "source": "/api/(.*)", "destination": "/api/$1" },
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

### Key Infrastructure Details

- **Build**: `npm run build` → Vite produces `dist/` with optimized React bundle
- **Frontend**: Served as static files with SPA fallback (`/(.*) → /index.html`)
- **API**: Each `api/*.ts` file becomes a Vercel serverless function
- **Cron**: Daily at 6:00 AM UTC, `GET /api/trend-scan` runs automated trend scanning for all enabled accounts
- **Database**: Supabase PostgreSQL with pgvector extension, Row-Level Security, and auto-update triggers
- **Storage**: Supabase Storage bucket `knowledge-files` for uploaded KB files

### Build Requirements

- Node.js 18+
- TypeScript strict mode with `noUnusedLocals: true` (unused imports = build failure)
- Path aliases: `@/` maps to `src/`

---

*This document covers the complete Content Intelligence Platform — every page, every API endpoint, every button, every flow, every prompt, every output schema. It is designed to serve as a comprehensive reference for developers, LLMs, and stakeholders who need to understand the full system end to end.*

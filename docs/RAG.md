# How the RAG System Works

A plain-English guide to the Retrieval-Augmented Generation (RAG) pipeline inside Content Intelligence — what it is, how a document becomes searchable knowledge, how a query finds the right evidence, and how multiple client accounts stay completely separated.

---

## 1. What is RAG, and why do we use it?

A language model on its own knows nothing about your clients — their brand voice, compliance rules, products, or past content. If you ask it to "write a LinkedIn post for Right Horizons," it will invent plausible-sounding generic content.

RAG fixes this by splitting the job in two:

1. **Retrieval** — before generating anything, the system searches the client's Knowledge Base (KB) for the passages most relevant to the request.
2. **Generation** — the LLM writes the content *grounded in those retrieved passages*, plus the account's brand/compliance constraints.

The result: output that uses the client's real facts, tone, and rules — and a system that **refuses to generate** when it has no evidence to work from, instead of hallucinating.

Every feature that produces content uses this pipeline: **Analyze**, **Studio (generation)**, and **Ideas Lab** (as optional grounding).

---

## 2. The Ingestion Pipeline — how a file becomes knowledge

When someone uploads a file on the Knowledge Base page, this happens:

```
Upload (PDF / DOCX / XLSX / TXT / URL)
   │
   ├─ 1. Parse ──────── extract raw text (pdf.js, mammoth, xlsx, …)
   ├─ 2. Sanitize ───── strip characters Postgres can't store
   ├─ 3. Chunk ──────── split by meaning: paragraphs first, then sentences,
   │                    ~600 tokens per chunk with 15% overlap so no idea
   │                    is cut in half at a boundary
   ├─ 4. Deduplicate ── identical chunks (normalized text) are dropped —
   │                    repeated boilerplate would otherwise fill several
   │                    top-K retrieval slots with the same passage
   ├─ 5. Store ──────── rows in `knowledge_chunks`, each tagged with
   │                    account_id, file_id, position, token estimate
   ├─ 6. Extract ────── an LLM reads a sample and produces structured
   │                    metadata (summary, topics, audience, tone) stored
   │                    on the file row
   └─ 7. Embed ──────── every chunk is converted to a 1024-dim vector
                        (OpenRouter → text-embedding-3-small) and stored
                        in a pgvector column with an HNSW index
```

Steps 6–7 run server-side (Vercel function `api/extract-knowledge`) with the service-role key, in batches of 100, with rate-limit backoff. If embedding fails (missing key, rate limit), chunks are stored anyway and the KB page offers **"Rebuild search index"** to retry later — ingestion never loses data because embedding hiccuped.

### Where things live

| Table | What it holds |
|---|---|
| `knowledge_files` | One row per upload: name, category, ingest status, structured metadata |
| `knowledge_chunks` | The chunks: text, embedding vector, account_id, file_id, position |
| `match_chunks` (RPC) | Postgres function that does the vector similarity search |

### Categories matter

Files are tagged with a category (`brand`, `compliance`, `guidelines`, `persona`, `expert content`, …). Three of them — **brand, compliance, guidelines** — are treated as **constraint categories**: they are *always* loaded in full during retrieval, not searched. Brand voice and compliance rules apply to every piece of content, so they never depend on whether the query happened to match them.

---

## 3. Query Serving — how a request finds its evidence

When you run an analysis or generate content, `retrieve()` (in `src/lib/retrieval.ts`) executes this sequence:

### Step 1 — Readiness check
Does this account have active, ready files? Which required categories (e.g. `brand`) are missing? Missing categories don't block retrieval, but the result carries a warning so the UI can tell you output may be less grounded.

### Step 2 — Load constraints
All chunks from brand/compliance/guidelines files are fetched directly (deduplicated, capped at 200). These become non-negotiable instructions in the prompt.

### Step 3 — Smart routing: long context vs RAG

The system first measures the total text in the account's non-constraint KB files. This decides the retrieval strategy:

#### Path A — Long context (small KBs, ≤ 500 chunks)
If the account has fewer than `VITE_LONG_CONTEXT_MAX_CHUNKS` (default 500) non-constraint chunks, the system **skips retrieval entirely** and sends all chunks to the model ordered by file then position. This eliminates the "retrieval lottery" — the model sees the complete knowledge base, can reason across documents, compare information, and spot gaps between files. No embedding lookup, no semantic search, no risk of silent failure. Long-context mode uses a higher budget (`VITE_LONG_CONTEXT_BUDGET`, default 120k chars) so most of the KB actually reaches the model.

#### Path B — Hybrid RAG (large KBs, > 60k chars)
For accounts with more data than the context window can hold, two search strategies run **in parallel**:

- **Semantic search** — the query is embedded into a vector (via `/api/embed-query`), and pgvector's `match_chunks` returns the nearest chunks by cosine similarity (fetches 3x candidates for diversity). Good at paraphrases: "retirement corpus planning" finds a chunk about "building a nest egg for your 60s."
- **Keyword search** — chunks are scored by how many distinctive query words they contain (also fetches 3x candidates). Good at exact names and jargon that embeddings blur: "ELSS", "Section 80C", a product name.

The two ranked lists are merged with **Reciprocal Rank Fusion (RRF)**: each chunk earns `1/(60 + rank)` from every list it appears in. A chunk both retrievers liked beats a chunk only one liked.

### Step 4 — Confidence gates (RAG mode only)
- Semantic results only count if the best similarity ≥ **0.25** (`VITE_RETRIEVAL_MIN_SIMILARITY`) — below that, the "matches" are noise.
- Keyword results only count if at least one real term matched.

### Step 5 — Fallback chain (RAG mode only)

```
hybrid result ──empty?──▶ rewrite query to its distinctive terms,
                          retry keyword search
        │                        │
        │                 still empty?
        │                        ▼
        │                 use below-threshold semantic hits
        │                 (weak evidence beats none)
        │                        │
        │                 still empty AND no constraints?
        ▼                        ▼
     use it                REFUSE — the UI shows "I don't have that
                           in the knowledge base" instead of letting
                           the LLM invent an answer
```

### Step 6 — File diversity + dedup + context budget
In RAG mode, results are **diversified across files** using round-robin interleaving — no single document can monopolize all context slots. Then near-identical passages are collapsed, and the chunk list is trimmed so total text stays under **24,000 characters** (`VITE_RETRIEVAL_CONTEXT_BUDGET`). In long-context mode, the budget is **120,000 characters** (`VITE_LONG_CONTEXT_BUDGET`) to let the model see most of the KB.

### What the LLM finally receives

```
[system prompt for the task]
[constraint chunks]        ← brand voice, compliance, guidelines (always)
[context chunks]           ← ALL chunks (long context) or top fused evidence (RAG)
[the user's actual request]
```

The response also reports **which files were used** (`sourcesUsed`) so the UI can show citations, and a `retrievalMode` diagnostic (`long_context` / `hybrid` / `semantic` / `keyword` / `rewritten` / `none`).

---

## 4. Multi-Account Handling — how clients stay separated

The platform is multi-tenant: one deployment, many client accounts (Right Horizons, and any others you add). Separation is enforced at **three independent layers**, so a bug in one layer doesn't leak data.

### Layer 1 — Every row is tagged
Every KB file, chunk, analysis, opportunity, trend record, and calendar item carries an `account_id` column. There is no shared or global knowledge — a chunk belongs to exactly one account.

### Layer 2 — Every query filters
The client always passes the active account's ID: retrieval calls `match_chunks(p_account_id, …)`, list queries filter `.eq('account_id', …)`. Switching accounts in the top bar swaps this ID and resets in-memory state (`resetAccountState()`), so nothing from the previous account lingers in the UI.

### Layer 3 — The database enforces it anyway (Row-Level Security)
Even if a client-side filter were forgotten or a request hand-crafted, Postgres RLS policies check every row against the signed-in user:

```sql
USING (has_account_access(account_id) OR is_org_admin_for_account(account_id))
```

- `account_access` maps users → accounts with a role (**manager / editor / viewer**).
- Org admins can access all accounts in the organization.
- The `match_chunks` search function runs as the *caller* (SECURITY INVOKER), so RLS applies inside vector search too — passing another account's ID returns zero rows, not their chunks.
- Storage (the uploaded files themselves) has the same account-scoped policies.

### What "per-account" means for RAG quality

Each account has its own:

| Per-account asset | Effect |
|---|---|
| Knowledge files + chunks + embeddings | Retrieval only ever searches this account's evidence |
| Constraint files (brand/compliance) | Its own voice and rules injected into every generation |
| Source types (Analyze page) | Its own definitions of what content it analyzes |
| Trend/domain profile | Its own industry, topics, keywords, preferred news outlets |
| Readiness state | Warnings are computed per account (e.g. "no brand file uploaded") |

Server-side ingestion routes (embedding, extraction) use the **service-role key** — they bypass RLS by design but always write with the explicit `account_id` the request was scoped to.

---

## 5. Failure Handling — the silent failure modes, covered

| Failure mode | What this system does |
|---|---|
| **Empty retrieval** | Fallback chain: hybrid → query rewrite → weak semantic → explicit refusal. The LLM never generates from an empty context. |
| **Low-confidence retrieval** | Similarity threshold (0.25) + keyword-match requirement; below-threshold results are only used as a last resort, never presented as strong evidence. |
| **LLM timeout** | Hard timeout (90s) → automatic retry on a smaller, faster fallback model (`LLM_FALLBACK_MODEL`, default Claude Haiku) instead of failing the request. |
| **Rate limits (429)** | Exponential backoff 2s → 4s → 8s, max 3 retries; then one attempt on the fallback model (different capacity pool). Same for transient 5xx/529 errors. |
| **Context too long** | 24k-char retrieval budget + per-page caps on constraint chunks; token counts estimated at ingestion. |
| **Duplicate pollution** | Dedup at ingestion (identical chunks never stored) and at retrieval (near-identical passages collapsed before the prompt). |
| **Embedding failures** | Chunks stored regardless; per-item rate-limit backoff honoring `Retry-After`; "Rebuild search index" button retries later; keyword search keeps working meanwhile. |
| **Ungrounded output** | Analyze responses carry a `refused` flag the UI honors; generations always cite `sourcesUsed`. |

---

## 6. Tuning knobs (environment variables)

| Variable | Default | What it controls |
|---|---|---|
| `VITE_RETRIEVAL_TOP_K` | `8` | How many context chunks reach the LLM |
| `VITE_RETRIEVAL_MIN_SIMILARITY` | `0.25` | Semantic confidence floor (cosine similarity) |
| `VITE_RETRIEVAL_CONTEXT_BUDGET` | `24000` | Max characters of retrieved context |
| `VITE_CONSTRAINT_CATEGORIES` | `compliance,brand,guidelines` | Categories always loaded in full |
| `VITE_GENERATION_REQUIRED_CATEGORIES` | `brand` | Categories that trigger "missing" warnings |
| `EMBED_PROVIDER` | auto-detect | `openrouter` / `openai` / `voyage` |
| `OPENROUTER_EMBED_MODEL` | `openai/text-embedding-3-small` | Embedding model (1024 dims) |
| `LLM_MODEL` | `anthropic/claude-sonnet-4-5` | Primary generation model |
| `LLM_FALLBACK_MODEL` | `anthropic/claude-haiku-4.5` | Timeout / rate-limit fallback model |

---

## 7. A worked example

**You ask Studio to generate:** *"LinkedIn post about tax-saving investment options for salaried professionals"* for the Right Horizons account.

1. Readiness: account has brand + expert-content files → ready.
2. Constraints: all brand-voice and compliance chunks load (e.g. "never promise guaranteed returns").
3. The query is embedded; semantic search finds chunks about ELSS, 80C, and PPF from an uploaded tax guide. Keyword search independently finds the chunk containing the literal phrase "Section 80C".
4. RRF fusion ranks the 80C chunk first (both retrievers found it), the top 8 survive, duplicates collapse, budget applied.
5. The LLM writes the post using those facts, in the brand voice, respecting compliance — and the UI lists the tax guide under "Sources used."
6. If you'd asked about, say, cryptocurrency and the KB had nothing on it: retrieval would come up empty through the whole fallback chain and the system would **tell you to upload relevant knowledge first**, rather than inventing crypto advice under a wealth-management brand.

---

*Key files: `src/lib/retrieval.ts` (query serving), `src/lib/chunker.ts` (chunking + dedup), `src/lib/api.ts` → `kb.*` (ingestion), `api/extract-knowledge.ts` (metadata + embedding), `api/_lib/embedding.ts` (providers), `api/_lib/llm.ts` (LLM hardening), `supabase/migrations/00009_pgvector.sql` + `00020_account_scoped_rls_on_data_tables.sql` (search index + isolation).*

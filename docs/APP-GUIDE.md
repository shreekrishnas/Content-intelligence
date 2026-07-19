# Content Intelligence — What It Is & How Every Section Works

A plain-English tour of the whole app. Read top-to-bottom the first time; after that, jump to a section when you need to remember how it works.

---

## What is Content Intelligence?

Content Intelligence is a workspace for turning what a client already publishes, plus what's happening in their world, into a steady flow of on-brand content. Think of it as a strategist, researcher, and writer wired together — with one file of truth per client (the Knowledge Base) that keeps every output grounded in facts you approved.

The pipeline top-to-bottom:

```
Sources (webinars, blogs, reports, transcripts)
    │        ▲                                    Trends (live news for your niche)
    ▼        │                                             │
  Analyze ──► Opportunities ──► Studio ──► Calendar        │
    │                                                     │
    └────────── Knowledge Base ◄──────────────────── Ideas Lab
```

Everything is **per client account**. Each account has its own knowledge, its own opportunities, its own trends, its own calendar. Switch accounts in the top-right and the whole workspace swaps to that client.

---

## The top bar & sidebar

**Top bar** — active account (click to switch), your name, theme toggle, sign-out.
**Sidebar** — one icon per section. Admins also see a purple **Admin** icon pinned at the bottom.

Only people whose Google account ends in the allowed org domain can sign in. Your permissions on each account depend on your role: **manager** / **editor** / **viewer** for regular users, or **org admin** who sees every account.

---

## 1. Analyze — the New Analysis wizard

**What it is.** A five-step wizard that takes one piece of source material (a transcript, article, script, report) and produces a ranked list of *content opportunities* — specific things worth writing, with an angle, format, and priority.

**When to use it.** After a webinar, when a client publishes a long article, when you receive a research report — anything long-form you can chop into multiple short-form pieces.

**The five steps:**

1. **Source** — pick a source type (e.g. *ET Video*, *Wealth Manager Blog*). Each source type stores a description and preferred output formats for that kind of material, and the engine adapts its reading to it.
   - **Add Source Type** — the "+" button. Give it a name, a one-line description, comma-separated formats (Blog, Carousel, Reel…), and optional analysis guidance. It's saved to the current account only.
   - **Delete** — the small × on any source type. Confirmation modal first.

2. **Details** — title, owner/author, and optionally a URL if the source lives on the web.

3. **Content** — paste the raw text (transcript, article body, script). No length cap. Word count shows live.

4. **Context** — optional. Any campaign goal, seasonal moment, or push you want the opportunities biased toward.

5. **Review** — a summary of what you've entered. Hit **Run Analysis**.

The engine reads the source alongside the client's Knowledge Base (brand voice, compliance rules, personas) and returns a set of opportunities on the same page. Each opportunity carries a title, content angle, best format, priority, matched persona, and a "why this works" note. Save the ones you like — they go straight to the **Opportunities** section.

**"New Analysis" button** (top right of the results). Wipes the wizard and starts fresh.

---

## 2. Opportunities — the shortlist you actually work

**What it is.** Every opportunity saved from any analysis, per account. It's your working shortlist between raw research and the writer's chair.

**Status lifecycle:** `open` → `in_studio` → (content produced) or → `dropped`. Dropped items can be reopened.

**Filters at the top.** *All / Open / In Studio / Dropped* with counts. Click any to narrow the grid.

**Drop all** *(top-right, red outline)*. Bulk-drops every currently-open opportunity for this account. Two-step: a confirmation modal shows the exact count and reminds you nothing is deleted — dropped items stay under the *Dropped* filter and can be reopened one by one. Items already in Studio are not touched.

**Per-card actions.**
- **Send to Studio →** on open cards moves the item to Studio and jumps you there.
- **Open in Studio →** on in-Studio cards jumps back to where you left off.
- **Drop** on open cards, **Reopen** on dropped cards.

Each card shows priority, status, format, matched persona (with relevance score), the content angle, and a short recommendation reason.

---

## 3. Studio — where content actually gets written

**What it is.** The writer's cockpit. You point Studio at one opportunity and it produces a real draft in the chosen format, grounded in the KB.

**Entering Studio.** Either from an opportunity card ("Send to Studio →") or by clicking Studio in the sidebar and picking an item.

**What you see.** The opportunity title at the top, then format controls, then the generated draft. Studio can produce multiple drafts per opportunity — an "asset" list keeps them side by side.

**Post-generation controls.** Copy the draft, download it as markdown, request another format, regenerate, or add the draft to the Calendar for scheduling. Every draft cites the KB files it used ("Sources used") so you can trace any claim back.

**What it can and can't do.** Grounded generation — it will refuse to write about a topic the KB has no evidence for, rather than inventing facts. If you get a refusal, upload the relevant knowledge file first, then retry.

---

## 4. Ideas Lab — divergent ideation

**What it is.** When Analyze/Opportunities is *convergent* (one source → a shortlist), Ideas Lab is *divergent*: give it a topic and audience and it returns many angles you might not have thought of.

**Five sub-tabs across the top.**

- **Generate** — the main workflow. Enter a topic, audience, content type (LinkedIn carousel, blog, reel…), goal (Awareness / Consideration / Conversion / Retention), source (Manual topic, or seed from a Trend), and optional context. It pulls KB grounding in the background if available. Click *Generate* and you get a grid of idea cards.
- **Seasonal** — ideas tied to an upcoming season or event window. Same drawer, different lens.
- **Webinar** — paste an outline or a rough brief, and the engine converts it into a set of concrete ideas.
- **SEO** — paste target keywords or a topic cluster, get SEO-oriented angles.
- **Library** *(the bookmark tab)* — every idea you've saved from any of the above. Stored locally under `idea_lab_saved_<account>`, so it's per account.

**Idea card actions.** *Save* (adds to the library), *Open* (opens a drawer with full detail — hook, body concept, format, hashtags, why-it-works, success metrics, SEO notes).

**Ideas seeded from a Trend** *(see next section)*. Clicking "Ideas Lab →" on a trend card pre-fills the Generate form with the trend's topic, audience, and context. You review and hit Generate.

---

## 5. Trends & Alerts — the daily radar

**What it is.** A live scan of news and viral culture, filtered to what's genuinely worth writing about for *this* client — with two lanes (niche news + bridged viral trends), one clean feed per refresh.

**How the pipeline works** (short version):

1. **Reactive niche** — Tavily searches your preferred news outlets for stories in the client's industry/topics (last 14 days). Falls back to open-web + 21-day window, then a broadest-possible safety net, before ever falling to AI-suggested candidates.
2. **Viral bridged** — pulls broad cultural buzz, runs it through a safety classifier (blocks tragedies/politics/violence), and asks the LLM to bridge each survivor to the brand's niche. Only *natural fits* survive — no forced trend-jacks.
3. **Supervisor** — one LLM call scores every clustered topic on domain relevance, trend impact, adaptability, and risk. Applies caps: max 3 domain trends, max 2 monitor items per scan. Deterministic backstops kill generic titles and near-duplicates.
4. **Guaranteed floor** — if real signals came in but the supervisor rejected everything, the top-2 raw topics are auto-promoted to *monitor* with a review flag. The feed is never empty when there's real news.

**Top-right Refresh** — re-runs the scan for the current account. Every refresh replaces the previous feed — history is not kept in the section (it's still in the DB for audit).

**Buttons above the feed.**
- **⚡ Run Live Scan** — the main action.
- **AI-suggest candidates** — skip Tavily; ask the LLM for hypothesis-based ideas. Lower confidence — for when you need something to react to.
- **Paste topics** — supervise topics you already have in mind. Paste one per line and the supervisor scores them.
- **Domain Profile** — the account's tuning knobs. See below.
- *(Toggle)* **Daily scan on** — appears when the domain profile is enabled for the daily cron.

**Filters.**
- *Class:* Strong / Domain / Supertrend / Watch / Actioned.
- *Type:* All / 🎯 Niche / 🌉 Trend-jacked.

**Per-card.** Class + priority + stage badges; four score pills (relevance, impact, adaptability, risk); content angle; connection/reason; lifespan.
- **Ideas Lab →** seeds the Ideas Lab Generate form with this trend.
- **+ Opportunity** creates an Opportunity from the trend.
- **+ Calendar** adds it directly to the calendar for scheduling.
- **Dismiss** removes it from the feed.

**Domain Profile.** Business name, industry, core topics, target keywords, target locations, target audience, brand tone, competitors, restricted topics, max recommendations (1–5), preferred news domains, and an "Enable daily scan" checkbox.
- **✨ Suggest news sources for this brand** — LLM proposes 6–12 outlets based on the account's URL + industry + location. Review, then Save Profile.

---

## 6. Knowledge Base — the source of truth

**What it is.** The library of files that grounds every generation. Everything Studio and Ideas Lab produce is anchored in what's here.

**Categories.** Files are tagged — `brand`, `compliance`, `guidelines`, `persona`, `expert content`, and any custom category you choose. Three of them (`brand`, `compliance`, `guidelines`) are **constraint files**: they're always loaded in full into every generation, not just when a query matches them, so voice and rules apply universally.

**Uploading.**
1. Click **Upload files**, pick a file (PDF, DOCX, XLSX, TXT), choose a category.
2. Text is parsed in the browser, chunked (~600 tokens each with 15% overlap, duplicates dropped), stored.
3. Server generates structured metadata and embeddings in the background — usually 10–60 seconds after upload for a normal file.
4. Status flips to *ready* → keyword search works immediately, semantic search kicks in when embedding completes.

**Per-file actions.**
- **Reindex** — re-parses the stored file, re-chunks with the current chunker, replaces the old chunks. Useful after a chunker/dedup improvement.
- **Rebuild search index** — retries embedding for any chunk missing one (e.g. after a rate-limit hiccup).
- **Deactivate / Delete** — deactivated files are ignored by retrieval without losing the underlying storage.
- **Structured metadata** — the summary/topics/tone the engine extracted; useful for a quick sanity check.

**Embedding status line.** Tells you *"All N chunks embedded — semantic retrieval active"* or how many are pending.

---

## 7. Calendar — the pipeline of things you'll ship

**What it is.** Every draft you've queued for publication and every trend/opportunity you sent straight to scheduling.

**Adding items.** From an opportunity, a Studio draft, or a trend card ("+ Calendar"). Items include a title, body/summary, chosen format, scheduled date (optional), and a status.

**Status lifecycle.** *scheduled* → *published* / *cancelled*. Filter by status at the top.

Per-item you can edit the schedule, update status, or delete.

---

## 8. Settings — external connections

**What it is.** Where API keys and integrations for this account live. Right now it's a stub for the account-level integrations map — a place to record client-owned service connections (analytics, publishing platforms). Server-side keys (OpenRouter, Tavily, Supabase) belong in Vercel Environment Variables, not here.

---

## 9. Admin *(only visible to org admins)*

**What it is.** The organization-wide control room. A regular user never sees this icon.

**Three tabs.**

- **Team** — every user in your org, grouped by role (leadership, strategist, editor, analyst, intern, admin). Search by name/email/role. Shows each person's account access.
- **Accounts** — every client account in the org. Status, active flag, high-level info.
- **Trend Setup** — the readiness dashboard for the daily trend cron. For each account it shows whether a `trend_profile` is saved and whether daily scan is enabled. Bulk-seed missing profiles from a URL in one click.

---

## Cross-cutting behaviours worth knowing

**Account isolation.** Every table row is tagged with `account_id`, every query filters by it, *and* Postgres Row-Level Security enforces it independently. A user only sees data on accounts they've been granted access to; switching accounts wipes in-memory state so nothing bleeds across.

**Auto-recovery on new deploys.** If the browser is on an old build when a new one deploys, the app detects the stale-chunk error and reloads once automatically (guarded against loops).

**Keep-alive tabs.** Switching between sidebar tabs doesn't unmount the previous page — it stays in memory, so scroll position, wizard progress, and unsaved form fields survive the round trip.

**No silent failures.** Every write (upload, add-source-type, save-profile, drop, embed, save-scan) checks the database's error return value and either surfaces the message in-modal or toasts it. If something didn't happen, you'll be told why.

**Grounded refusal, not hallucination.** When retrieval finds no evidence, the app refuses to generate rather than making things up. If you see a refusal, upload the relevant knowledge and retry.

---

## Quick pointers

| Section | Reads from | Writes to | Runs against |
|---|---|---|---|
| Analyze | Knowledge Base (KB) | Opportunities | current account |
| Opportunities | itself | Studio / Calendar | current account |
| Studio | Opportunities + KB | Calendar (drafts) | current account |
| Ideas Lab | Trends (seed) + KB | Local library | current account |
| Trends | Tavily + KB + Trend Profile | Opportunities / Calendar | current account (+ daily cron for enabled accounts) |
| Knowledge Base | uploaded files | KB (chunks + embeddings) | current account |
| Calendar | itself | itself | current account |
| Admin | org-wide user + account tables | user/account/profile config | whole org |

---

*Related reading: `docs/RAG.md` for the retrieval + multi-account internals.*

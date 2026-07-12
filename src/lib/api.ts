import { supabase } from '@/lib/supabase';
import { chunkText } from '@/lib/chunker';
import { parseFile } from '@/lib/fileParser';
import type {
  KnowledgeFile,
  KnowledgeChunk,
  Analysis,
  Opportunity,
  CalendarItem,
  Integration,
  SourceType,
  TrendProfile,
  TrendRecord,
} from '@/types';
import type { KBFileContext } from '@/lib/retrieval';

type Result<T> = { data: T | null; error: string | null };

function err(msg: string): Result<never> {
  return { data: null, error: msg };
}

function ok<T>(data: T): Result<T> {
  return { data, error: null };
}

function pgError(e: { message?: string } | null): string {
  return e?.message ?? 'Unknown database error';
}

export const api = {
  // --------------------------------------------------------------------------
  // Auth
  // --------------------------------------------------------------------------
  auth: {
    async signUp(
      email: string,
      password: string,
      name: string,
    ): Promise<Result<{ user: any; session: any }>> {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { name } },
      });
      if (error) return err(error.message);
      return ok({ user: data.user, session: data.session });
    },

    async signIn(
      email: string,
      password: string,
    ): Promise<Result<{ user: any; session: any }>> {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) return err(error.message);
      return ok({ user: data.user, session: data.session });
    },

    async signOut(): Promise<Result<void>> {
      const { error } = await supabase.auth.signOut();
      if (error) return err(error.message);
      return ok(undefined as void);
    },

    async getSession(): Promise<Result<any>> {
      const { data, error } = await supabase.auth.getSession();
      if (error) return err(error.message);
      return ok(data.session);
    },

    onAuthStateChange(callback: (event: string, session: any) => void) {
      return supabase.auth.onAuthStateChange(callback);
    },
  },

  // --------------------------------------------------------------------------
  // Knowledge Base
  // --------------------------------------------------------------------------
  kb: {
    async list(accountId: string): Promise<Result<KnowledgeFile[]>> {
      const { data, error } = await supabase
        .from('knowledge_files')
        .select('*')
        .eq('account_id', accountId)
        .order('created_at', { ascending: false });
      if (error) return err(pgError(error));
      return ok(data as KnowledgeFile[]);
    },

    async upload(
      accountId: string,
      file: File,
      metadata: {
        category: KnowledgeFile['category'];
        priority: KnowledgeFile['priority'];
        structured?: Record<string, any>;
      },
    ): Promise<Result<KnowledgeFile>> {
      const storagePath = `${accountId}/${Date.now()}_${file.name}`;

      const { error: uploadErr } = await supabase.storage
        .from('knowledge-files')
        .upload(storagePath, file);
      if (uploadErr) return err(uploadErr.message);

      const { data: urlData } = supabase.storage
        .from('knowledge-files')
        .getPublicUrl(storagePath);

      const { data: row, error: insertErr } = await supabase
        .from('knowledge_files')
        .insert({
          account_id: accountId,
          file_name: file.name,
          category: metadata.category,
          priority: metadata.priority,
          source_type: 'file' as const,
          storage_url: urlData.publicUrl,
          active: true,
          version: 1,
          structured: metadata.structured ?? {},
          ingest_status: 'processing' as const,
        })
        .select()
        .single();
      if (insertErr) return err(pgError(insertErr));

      const fileRow = row as KnowledgeFile;

      parseFile(file)
        .then(async (text) => {
          const chunks = chunkText(text);
          if (chunks.length === 0) return;

          const rows = chunks.map((c) => ({
            file_id: fileRow.id,
            account_id: accountId,
            chunk_text: c.content,
            embed_model: 'none',
            token_count: Math.ceil(c.content.length / 4),
            position: c.index,
          }));

          await supabase.from('knowledge_chunks').insert(rows);
          await supabase
            .from('knowledge_files')
            .update({ ingest_status: 'ready' })
            .eq('id', fileRow.id);

          // Non-blocking: extract structured metadata AND embed chunks.
          const sampleText = chunks.slice(0, 3).map(c => c.content).join('\n\n');
          fetch('/api/extract-knowledge', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              file_name: file.name,
              category: metadata.category,
              sample_text: sampleText,
              file_id: fileRow.id,
              account_id: accountId,
            }),
          })
            .then(r => r.json())
            .then(({ structured }) => {
              if (structured) {
                supabase
                  .from('knowledge_files')
                  .update({ structured })
                  .eq('id', fileRow.id)
                  .then(() => {});
              }
            })
            .catch(() => {});
        })
        .catch(() =>
          supabase
            .from('knowledge_files')
            .update({ ingest_status: 'failed' })
            .eq('id', fileRow.id),
        );

      return ok(fileRow);
    },

    async toggleActive(
      accountId: string,
      fileId: string,
      active: boolean,
    ): Promise<Result<void>> {
      const { error } = await supabase
        .from('knowledge_files')
        .update({ active })
        .eq('id', fileId)
        .eq('account_id', accountId);
      if (error) return err(pgError(error));
      return ok(undefined as void);
    },

    /**
     * Return counts used by the semantic-index panel.
     *   total     = total chunks in this account
     *   embedded  = chunks with a non-null embedding
     *   missing   = chunks awaiting an embedding
     *   files     = knowledge_files rows in this account (for diagnostic UI)
     */
    async indexStatus(accountId: string): Promise<Result<{ total: number; embedded: number; missing: number; skipped: number; files: number }>> {
      const totalRes = await supabase
        .from('knowledge_chunks')
        .select('id', { count: 'exact' })
        .eq('account_id', accountId)
        .limit(1);
      if (totalRes.error) return err(pgError(totalRes.error));

      // Chunks awaiting embedding (excludes those marked as skipped after
      // repeated provider failures).
      const missingRes = await supabase
        .from('knowledge_chunks')
        .select('id', { count: 'exact' })
        .eq('account_id', accountId)
        .is('embedding', null)
        .neq('embed_model', 'skipped_provider_error')
        .limit(1);
      if (missingRes.error) return err(pgError(missingRes.error));

      const skippedRes = await supabase
        .from('knowledge_chunks')
        .select('id', { count: 'exact' })
        .eq('account_id', accountId)
        .is('embedding', null)
        .eq('embed_model', 'skipped_provider_error')
        .limit(1);
      if (skippedRes.error) return err(pgError(skippedRes.error));

      const filesRes = await supabase
        .from('knowledge_files')
        .select('id', { count: 'exact' })
        .eq('account_id', accountId)
        .limit(1);
      if (filesRes.error) return err(pgError(filesRes.error));

      const total = totalRes.count ?? 0;
      const missing = missingRes.count ?? 0;
      const skipped = skippedRes.count ?? 0;
      const files = filesRes.count ?? 0;
      return ok({ total, embedded: total - missing - skipped, missing, skipped, files });
    },

    /**
     * Reprocess a file: parse + chunk from storage, re-insert chunks,
     * trigger structured extraction + embedding. Used when uploads
     * completed but their chunks never made it into the DB.
     */
    async reprocessFile(accountId: string, fileId: string): Promise<Result<{ chunks: number }>> {
      const { data: fileRow, error: fetchErr } = await supabase
        .from('knowledge_files')
        .select('id, file_name, category, storage_url')
        .eq('id', fileId)
        .eq('account_id', accountId)
        .single();
      if (fetchErr || !fileRow) return err(pgError(fetchErr) || 'File not found');

      if (!(fileRow as any).storage_url) return err('File has no storage URL — re-upload instead.');

      // Extract the object path AFTER the bucket name so this works for both
      // public and signed URLs. The delete() flow uses the same pattern.
      let path: string | undefined;
      try {
        const url = new URL((fileRow as any).storage_url);
        const parts = url.pathname.split('/knowledge-files/');
        path = parts[1] ? decodeURIComponent(parts[1].split('?')[0] ?? '') : undefined;
      } catch { /* fall through */ }
      if (!path) return err('Could not parse storage path from URL — re-upload instead.');

      const { data: blob, error: dlErr } = await supabase.storage
        .from('knowledge-files')
        .download(path);
      if (dlErr || !blob) return err(`Storage download failed: ${dlErr?.message ?? 'no data'}`);
      const fakeFile = new File([blob], (fileRow as any).file_name);

      let text: string;
      try { text = await parseFile(fakeFile); } catch (e) {
        return err(e instanceof Error ? e.message : 'Failed to parse file');
      }
      const chunks = chunkText(text);
      if (chunks.length === 0) return err('Parsed file produced zero chunks — content may be empty.');

      // Delete any orphan chunks for this file first.
      await supabase.from('knowledge_chunks').delete().eq('file_id', fileId).eq('account_id', accountId);

      const rows = chunks.map((c) => ({
        file_id: fileId,
        account_id: accountId,
        chunk_text: c.content,
        embed_model: 'pending',
        token_count: Math.ceil(c.content.length / 4),
        position: c.index,
      }));
      const { error: insertErr } = await supabase.from('knowledge_chunks').insert(rows);
      if (insertErr) return err(pgError(insertErr));

      await supabase.from('knowledge_files').update({ ingest_status: 'ready' }).eq('id', fileId);

      // Fire-and-forget: structured + embeddings.
      const sampleText = chunks.slice(0, 3).map((c) => c.content).join('\n\n');
      fetch('/api/extract-knowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file_name: (fileRow as any).file_name,
          category: (fileRow as any).category,
          sample_text: sampleText,
          file_id: fileId,
          account_id: accountId,
        }),
      })
        .then((r) => r.json())
        .then(({ structured }) => {
          if (structured) {
            supabase.from('knowledge_files').update({ structured }).eq('id', fileId).then(() => {});
          }
        })
        .catch(() => {});

      return ok({ chunks: chunks.length });
    },

    /**
     * Backfill embeddings for chunks without one. Server processes up to 500
     * chunks per call and returns { embedded, remaining, total, done }. Caller
     * loops until done. Requires OPENAI_API_KEY + SUPABASE_SERVICE_ROLE_KEY
     * on the server; without those the request 503s and the client should
     * surface the reason.
     */
    async rebuildIndexStep(accountId: string): Promise<Result<{ embedded: number; remaining: number; total: number; done: boolean; error?: string }>> {
      try {
        // JWT is optional server-side. Send it if we have one so the endpoint
        // can enforce viewer-can't-write; skip cleanly if not.
        let jwt: string | undefined;
        try {
          const { data: sess } = await supabase.auth.getSession();
          jwt = sess?.session?.access_token;
        } catch { /* ignore */ }
        if (!jwt) {
          try {
            const { useAuthStore } = await import('@/stores/authStore');
            jwt = useAuthStore.getState().session?.access_token;
          } catch { /* ignore */ }
        }

        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (jwt) headers['Authorization'] = `Bearer ${jwt}`;

        const resp = await fetch('/api/backfill-embeddings', {
          method: 'POST',
          headers,
          body: JSON.stringify({ account_id: accountId }),
        });
        const raw = await resp.text();
        let data: any;
        try { data = JSON.parse(raw); } catch {
          return err(`Server error (${resp.status}): ${raw.slice(0, 300) || 'Unexpected response format'}`);
        }
        if (!resp.ok || data.error && data.done !== true) return err(data.error || 'Backfill failed');
        return ok(data);
      } catch (e) {
        return err(e instanceof Error ? e.message : 'Network error during backfill');
      }
    },

    async delete(accountId: string, fileId: string): Promise<Result<void>> {
      const { data: file } = await supabase
        .from('knowledge_files')
        .select('storage_url')
        .eq('id', fileId)
        .eq('account_id', accountId)
        .single();

      if (file?.storage_url) {
        const path = new URL(file.storage_url).pathname.split(
          '/storage/v1/object/public/knowledge-files/',
        )[1];
        if (path) {
          await supabase.storage.from('knowledge-files').remove([path]);
        }
      }

      await supabase
        .from('knowledge_chunks')
        .delete()
        .eq('file_id', fileId);

      const { error } = await supabase
        .from('knowledge_files')
        .delete()
        .eq('id', fileId);
      if (error) return err(pgError(error));
      return ok(undefined as void);
    },

    async getChunks(fileId: string): Promise<Result<KnowledgeChunk[]>> {
      const { data, error } = await supabase
        .from('knowledge_chunks')
        .select('*')
        .eq('file_id', fileId)
        .order('position', { ascending: true });
      if (error) return err(pgError(error));
      return ok(data as KnowledgeChunk[]);
    },
  },

  // --------------------------------------------------------------------------
  // Analysis — calls analyze-content Edge Function
  // --------------------------------------------------------------------------
  analysis: {
    async run(params: {
      accountId: string;
      sourceText: string;
      sourceType: string;
      sourceTypeContext?: {
        name?: string;
        slug?: string;
        description?: string;
        formats?: string[];
        analysis_guidance?: string;
      };
      sourceTitle: string;
      sourceOwner?: string;
      sourceUrl?: string;
      marketingNotes?: string;
      knowledgeChunks?: string[];
      fileContext?: KBFileContext[];
      personas?: Array<{ name: string; description: string; pain_points?: string[]; goals?: string[] }>;
    }): Promise<Result<Analysis>> {
      try {
        const response = await fetch('/api/analyze-content', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            source_text: params.sourceText.slice(0, 15000),
            source_type: params.sourceType,
            source_type_context: params.sourceTypeContext,
            source_title: params.sourceTitle || 'Untitled Source',
            source_owner: params.sourceOwner,
            source_url: params.sourceUrl,
            marketing_notes: params.marketingNotes,
            personas: params.personas,
            knowledge_chunks: params.knowledgeChunks?.slice(0, 25).map((text, i) => ({
              id: `chunk-${i}`,
              content: text.slice(0, 500),
            })),
            file_context: params.fileContext,
            account_id: params.accountId,
          }),
        });
        const rawText = await response.text();
        let data: any;
        try { data = JSON.parse(rawText); } catch {
          return err(`Server error (${response.status}): ${rawText.slice(0, 300) || 'Unexpected response format'}`);
        }
        if (!response.ok || data.error) return err(data.error || 'Analysis failed');
        return ok(data as Analysis);
      } catch (e) {
        return err(e instanceof Error ? e.message : 'Network error during analysis');
      }
    },

    async list(accountId: string): Promise<Result<Analysis[]>> {
      const { data, error } = await supabase
        .from('analyses')
        .select('*')
        .eq('account_id', accountId)
        .order('created_at', { ascending: false });
      if (error) return err(pgError(error));
      return ok(data as Analysis[]);
    },
  },

  // --------------------------------------------------------------------------
  // Studio — calls generate-content Edge Function
  // --------------------------------------------------------------------------
  studio: {
    async generateOutline(
      _accountId: string,
      opportunity: Opportunity,
      kbChunks: string[],
      fileContext?: KBFileContext[],
    ): Promise<Result<any>> {
      return this._callGenerate({
        task: 'outline',
        opportunity: {
          title: opportunity.title,
          content_angle: opportunity.content_angle || '',
          recommended_format: opportunity.format || 'blog_post',
          priority: opportunity.priority,
          persona_match: opportunity.persona_name || 'General',
          suggested_cta: opportunity.suggested_cta,
          source_context: opportunity.source_context,
        },
        knowledge_chunks: kbChunks.slice(0, 25).map((text, i) => ({ id: `chunk-${i}`, content: text.slice(0, 500) })),
        file_context: fileContext,
      });
    },

    async generateDraft(
      _accountId: string,
      opportunity: Opportunity,
      outline: string,
      kbChunks: string[],
      fileContext?: KBFileContext[],
    ): Promise<Result<any>> {
      return this._callGenerate({
        task: 'draft',
        opportunity: {
          title: opportunity.title,
          content_angle: opportunity.content_angle || '',
          recommended_format: opportunity.format || 'blog_post',
          priority: opportunity.priority,
          persona_match: opportunity.persona_name || 'General',
          suggested_cta: opportunity.suggested_cta,
          source_context: opportunity.source_context,
        },
        existing_content: outline,
        knowledge_chunks: kbChunks.slice(0, 25).map((text, i) => ({ id: `chunk-${i}`, content: text.slice(0, 500) })),
        file_context: fileContext,
      });
    },

    async regenerate(
      _accountId: string,
      opportunity: Opportunity,
      content: string,
      feedback: string,
      kbChunks: string[],
      fileContext?: KBFileContext[],
    ): Promise<Result<any>> {
      return this._callGenerate({
        task: 'regenerate',
        opportunity: {
          title: opportunity.title,
          content_angle: opportunity.content_angle || '',
          recommended_format: opportunity.format || 'blog_post',
        },
        existing_content: content,
        feedback,
        knowledge_chunks: kbChunks.slice(0, 25).map((text, i) => ({ id: `chunk-${i}`, content: text.slice(0, 500) })),
        file_context: fileContext,
      });
    },

    async qualityReview(
      _accountId: string,
      opportunity: Opportunity,
      draft: string,
      kbChunks: string[],
      fileContext?: KBFileContext[],
    ): Promise<Result<any>> {
      return this._callGenerate({
        task: 'quality_review',
        opportunity: {
          title: opportunity.title,
          content_angle: opportunity.content_angle || '',
          recommended_format: opportunity.format || 'blog_post',
          persona_match: opportunity.persona_name || 'General',
        },
        existing_content: draft,
        knowledge_chunks: kbChunks.slice(0, 25).map((text, i) => ({ id: `chunk-${i}`, content: text.slice(0, 500) })),
        file_context: fileContext,
      });
    },

    async _callGenerate(body: Record<string, any>): Promise<Result<any>> {
      try {
        const response = await fetch('/api/generate-content', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const rawText = await response.text();
        let data: any;
        try { data = JSON.parse(rawText); } catch {
          return err(`Server error (${response.status}): ${rawText.slice(0, 300) || 'Unexpected response format'}`);
        }
        if (!response.ok || data.error) return err(data.error || 'Generation failed');
        return ok(data.output);
      } catch (e) {
        return err(e instanceof Error ? e.message : 'Network error during generation');
      }
    },
  },

  // --------------------------------------------------------------------------
  // Ideas Lab — calls ideas-lab Edge Function
  // --------------------------------------------------------------------------
  ideas: {
    async _call(body: Record<string, any>): Promise<Result<any>> {
      try {
        const response = await fetch('/api/ideas-lab', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...body,
            knowledge_chunks: (body.knowledge_chunks as string[] | undefined)
              ?.slice(0, 25)
              .map((text, i) => ({ id: `chunk-${i}`, content: String(text).slice(0, 500) })),
          }),
        });
        const rawText = await response.text();
        let data: any;
        try { data = JSON.parse(rawText); } catch {
          return err(`Server error (${response.status}): ${rawText.slice(0, 300) || 'Unexpected response format'}`);
        }
        if (!response.ok || data.error) return err(data.error || 'Idea generation failed');
        return ok(data);
      } catch (e) {
        return err(e instanceof Error ? e.message : 'Network error during idea generation');
      }
    },

    async generate(params: {
      accountLabel?: string;
      topic?: string;
      audience?: string;
      contentType?: string;
      goal?: string;
      source?: string;
      context?: string;
      avoidTitles?: string[];
      knowledgeChunks?: string[];
    }): Promise<Result<any[]>> {
      const res = await this._call({
        task: 'generate',
        account_label: params.accountLabel,
        topic: params.topic,
        audience: params.audience,
        content_type: params.contentType,
        goal: params.goal,
        source: params.source,
        context: params.context,
        avoid_titles: params.avoidTitles,
        knowledge_chunks: params.knowledgeChunks,
      });
      if (res.error) return err(res.error);
      return ok((res.data?.ideas as any[]) || []);
    },

    async webinar(text: string, knowledgeChunks?: string[]): Promise<Result<any[]>> {
      const res = await this._call({ task: 'webinar', text, knowledge_chunks: knowledgeChunks });
      if (res.error) return err(res.error);
      return ok((res.data?.ideas as any[]) || []);
    },

    async seo(keywords: string, knowledgeChunks?: string[]): Promise<Result<any[]>> {
      const res = await this._call({ task: 'seo', keywords, knowledge_chunks: knowledgeChunks });
      if (res.error) return err(res.error);
      return ok((res.data?.ideas as any[]) || []);
    },

    async seasonal(params: { accountLabel?: string; month?: string; context?: string; knowledgeChunks?: string[] }): Promise<Result<any[]>> {
      const res = await this._call({
        task: 'seasonal',
        account_label: params.accountLabel,
        month: params.month,
        context: params.context,
        knowledge_chunks: params.knowledgeChunks,
      });
      if (res.error) return err(res.error);
      return ok((res.data?.ideas as any[]) || []);
    },

    async expand(idea: Record<string, any>, outputType: 'brief' | 'carousel' | 'blog' | 'caption', knowledgeChunks?: string[]): Promise<Result<any>> {
      const res = await this._call({ task: 'expand', idea, output_type: outputType, knowledge_chunks: knowledgeChunks });
      if (res.error) return err(res.error);
      return ok(res.data?.output);
    },
  },

  // --------------------------------------------------------------------------
  // Trend Supervisor
  // --------------------------------------------------------------------------
  trends: {
    // Domain profile lives in accounts.profile.trend_profile
    async getProfile(accountId: string): Promise<Result<TrendProfile>> {
      const { data, error } = await supabase
        .from('accounts')
        .select('profile')
        .eq('id', accountId)
        .single();
      if (error) return err(pgError(error));
      return ok(((data as any)?.profile?.trend_profile ?? {}) as TrendProfile);
    },

    async saveProfile(accountId: string, profile: TrendProfile): Promise<Result<void>> {
      const { data: row } = await supabase.from('accounts').select('profile').eq('id', accountId).single();
      const nextProfile = { ...((row as any)?.profile ?? {}), trend_profile: profile };
      const { error } = await supabase.from('accounts').update({ profile: nextProfile }).eq('id', accountId);
      if (error) return err(pgError(error));
      return ok(undefined as void);
    },

    // Run a live scan on the server (collect signals + supervise). Returns the
    // supervised topics; the caller persists them via saveScan().
    async runScan(params: { accountLabel?: string; profile: TrendProfile; mode?: 'live' | 'suggest' }): Promise<Result<{ topics: any[]; summary: any; source: string; note?: string; signals_reviewed?: number }>> {
      try {
        const response = await fetch('/api/trend-scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ account_label: params.accountLabel, profile: params.profile, mode: params.mode ?? 'live' }),
        });
        const rawText = await response.text();
        let data: any;
        try { data = JSON.parse(rawText); } catch {
          return err(`Server error (${response.status}): ${rawText.slice(0, 300) || 'Unexpected response format'}`);
        }
        if (!response.ok || data.error) return err(data.error || 'Scan failed');
        return ok(data);
      } catch (e) {
        return err(e instanceof Error ? e.message : 'Network error during scan');
      }
    },

    // Supervise a list of manually-pasted candidate topics.
    async superviseManual(params: { accountLabel?: string; profile: TrendProfile; signals: Array<{ topic: string; summary?: string; source?: string; url?: string }> }): Promise<Result<{ topics: any[]; summary: any }>> {
      try {
        const response = await fetch('/api/trend-supervisor', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ account_label: params.accountLabel, domain_profile: params.profile, signals: params.signals }),
        });
        const rawText = await response.text();
        let data: any;
        try { data = JSON.parse(rawText); } catch {
          return err(`Server error (${response.status}): ${rawText.slice(0, 300) || 'Unexpected response format'}`);
        }
        if (!response.ok || data.error) return err(data.error || 'Supervisor failed');
        return ok(data);
      } catch (e) {
        return err(e instanceof Error ? e.message : 'Network error during supervision');
      }
    },

    // Persist a scan + its topics under the signed-in user's session (RLS).
    async saveScan(accountId: string, source: string, topics: any[]): Promise<Result<TrendRecord[]>> {
      const counts = { domain: 0, superts: 0, mon: 0, rej: 0 };
      topics.forEach((t) => {
        if (t.classification === 'domain_trend') counts.domain++;
        else if (t.classification === 'supertrend_exception') counts.superts++;
        else if (t.classification === 'reject') counts.rej++;
        else counts.mon++;
      });

      const { data: scan, error: scanErr } = await supabase
        .from('trend_scans')
        .insert({
          account_id: accountId,
          source,
          total_reviewed: topics.length,
          domain_sent: counts.domain,
          supertrends_sent: counts.superts,
          monitored: counts.mon,
          rejected: counts.rej,
        })
        .select('id')
        .single();
      if (scanErr) return err(pgError(scanErr));

      const num = (v: unknown) => Math.max(0, Math.min(100, Math.round(Number(v) || 0)));
      const rows = topics.map((t) => {
        const classification = String(t.classification || 'monitor');
        const status = classification === 'domain_trend' || classification === 'supertrend_exception'
          ? 'accepted' : classification === 'reject' ? 'rejected' : 'monitoring';
        return {
          account_id: accountId,
          scan_id: (scan as any)?.id ?? null,
          topic: String(t.topic || 'Untitled'),
          summary: String(t.summary || ''),
          classification,
          domain_relevance_score: num(t.domain_relevance_score),
          trend_impact_score: num(t.trend_impact_score),
          adaptability_score: num(t.adaptability_score),
          risk_score: num(t.risk_score),
          confidence_score: num(t.confidence_score),
          priority: String(t.priority || 'low'),
          trend_stage: String(t.trend_stage || 'emerging'),
          estimated_lifespan: String(t.estimated_lifespan || ''),
          recommended_route: String(t.recommended_route || 'monitor'),
          reason: String(t.reason || ''),
          suggested_connection: String(t.suggested_connection || ''),
          recommended_formats: Array.isArray(t.recommended_formats) ? t.recommended_formats : [],
          related_keywords: Array.isArray(t.related_keywords) ? t.related_keywords : [],
          source_signals: Array.isArray(t.source_signals) ? t.source_signals : [],
          status,
        };
      });

      const { data, error } = await supabase.from('trend_records').insert(rows).select();
      if (error) return err(pgError(error));
      return ok(data as TrendRecord[]);
    },

    async list(accountId: string): Promise<Result<TrendRecord[]>> {
      const { data, error } = await supabase
        .from('trend_records')
        .select('*')
        .eq('account_id', accountId)
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) return err(pgError(error));
      return ok(data as TrendRecord[]);
    },

    async updateStatus(accountId: string, id: string, status: TrendRecord['status']): Promise<Result<void>> {
      const { error } = await supabase
        .from('trend_records')
        .update({ status })
        .eq('id', id)
        .eq('account_id', accountId);
      if (error) return err(pgError(error));
      return ok(undefined as void);
    },

    async remove(accountId: string, id: string): Promise<Result<void>> {
      const { error } = await supabase.from('trend_records').delete().eq('id', id).eq('account_id', accountId);
      if (error) return err(pgError(error));
      return ok(undefined as void);
    },
  },

  // --------------------------------------------------------------------------
  // Calendar
  // --------------------------------------------------------------------------
  calendar: {
    async list(accountId: string): Promise<Result<CalendarItem[]>> {
      const { data, error } = await supabase
        .from('calendar_items')
        .select('*')
        .eq('account_id', accountId)
        .order('scheduled_for', { ascending: true });
      if (error) return err(pgError(error));
      return ok(data as CalendarItem[]);
    },

    async add(
      entry: Omit<CalendarItem, 'id' | 'created_at'>,
    ): Promise<Result<CalendarItem>> {
      const { data, error } = await supabase
        .from('calendar_items')
        .insert(entry)
        .select()
        .single();
      if (error) return err(pgError(error));
      return ok(data as CalendarItem);
    },

    async schedule(
      accountId: string,
      id: string,
      scheduledDate: string,
    ): Promise<Result<void>> {
      const { error } = await supabase
        .from('calendar_items')
        .update({ scheduled_for: scheduledDate, status: 'scheduled' })
        .eq('id', id)
        .eq('account_id', accountId);
      if (error) return err(pgError(error));
      return ok(undefined as void);
    },

    async export(accountId: string, id: string): Promise<Result<string>> {
      const { data, error } = await supabase
        .from('calendar_items')
        .select('*, assets(*)')
        .eq('id', id)
        .eq('account_id', accountId)
        .single();
      if (error) return err(pgError(error));

      const item = data as CalendarItem & { assets?: { body: string } };
      const lines = [
        `Title: ${item.title ?? 'Untitled'}`,
        `Format: ${item.format ?? 'N/A'}`,
        `Scheduled: ${item.scheduled_for ?? 'Not scheduled'}`,
        `Status: ${item.status}`,
        '',
        '--- Content ---',
        item.body ?? (item as any).assets?.body ?? '(no content)',
      ];
      return ok(lines.join('\n'));
    },

    async updateStatus(
      accountId: string,
      id: string,
      status: CalendarItem['status'],
    ): Promise<Result<void>> {
      const { error } = await supabase
        .from('calendar_items')
        .update({ status })
        .eq('id', id)
        .eq('account_id', accountId);
      if (error) return err(pgError(error));
      return ok(undefined as void);
    },
  },

  // --------------------------------------------------------------------------
  // Integrations
  // --------------------------------------------------------------------------
  integrations: {
    async list(accountId: string): Promise<Result<Integration[]>> {
      const { data, error } = await supabase
        .from('integrations')
        .select('*')
        .eq('account_id', accountId);
      if (error) return err(pgError(error));
      return ok(data as Integration[]);
    },

    async configure(
      accountId: string,
      integrationId: string,
      config: Record<string, any>,
    ): Promise<Result<void>> {
      const { error } = await supabase
        .from('integrations')
        .update({ config })
        .eq('id', integrationId)
        .eq('account_id', accountId);
      if (error) return err(pgError(error));
      return ok(undefined as void);
    },

    async updateStatus(
      accountId: string,
      integrationId: string,
      status: string,
    ): Promise<Result<void>> {
      const { error } = await supabase
        .from('integrations')
        .update({ status })
        .eq('id', integrationId)
        .eq('account_id', accountId);
      if (error) return err(pgError(error));
      return ok(undefined as void);
    },
  },

  // --------------------------------------------------------------------------
  // Opportunities — save from analysis
  // --------------------------------------------------------------------------
  opportunities: {
    async list(accountId: string): Promise<Result<Opportunity[]>> {
      const { data, error } = await supabase
        .from('opportunities')
        .select('*')
        .eq('account_id', accountId)
        .order('created_at', { ascending: false });
      if (error) return err(pgError(error));
      return ok(data as Opportunity[]);
    },

    async updateStatus(
      accountId: string,
      id: string,
      status: Opportunity['status'],
    ): Promise<Result<void>> {
      const { error } = await supabase
        .from('opportunities')
        .update({ status })
        .eq('id', id)
        .eq('account_id', accountId);
      if (error) return err(pgError(error));
      return ok(undefined as void);
    },

    async createFromAnalysis(
      accountId: string,
      analysisId: string,
      opps: Array<{
        title: string;
        content_angle: string;
        format: string;
        priority?: string;
        persona_name?: string;
        persona_relevance_score?: number;
        recommendation_reason?: string;
        suggested_cta?: string;
        source_context?: string;
        timeliness?: string;
      }>,
    ): Promise<Result<Opportunity[]>> {
      const rows = opps.map((o) => ({
        account_id: accountId,
        analysis_id: analysisId || null,
        title: o.title,
        content_angle: o.content_angle,
        format: o.format,
        priority: o.priority || 'standard',
        persona_name: o.persona_name,
        persona_relevance_score: o.persona_relevance_score,
        recommendation_reason: o.recommendation_reason,
        suggested_cta: o.suggested_cta,
        source_context: o.source_context,
        timeliness: o.timeliness || 'standard',
        status: 'open' as const,
      }));

      const { data, error } = await supabase
        .from('opportunities')
        .insert(rows)
        .select();
      if (error) return err(pgError(error));
      return ok(data as Opportunity[]);
    },
  },

  // --------------------------------------------------------------------------
  // Source Types — per-account source type management
  // --------------------------------------------------------------------------
  sourceTypes: {
    async list(accountId: string): Promise<Result<SourceType[]>> {
      const { data, error } = await supabase
        .from('source_types')
        .select('*')
        .eq('account_id', accountId)
        .order('created_at', { ascending: true });
      if (error) return err(pgError(error));
      return ok(data as SourceType[]);
    },

    async create(
      accountId: string,
      name: string,
      description: string,
      formats: string[],
      analysisGuidance?: string,
    ): Promise<Result<SourceType>> {
      const slug = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '');

      const { data, error } = await supabase
        .from('source_types')
        .insert({
          account_id: accountId,
          name,
          slug,
          description,
          formats,
          analysis_guidance: analysisGuidance ?? '',
        })
        .select()
        .single();
      if (error) return err(pgError(error));
      return ok(data as SourceType);
    },

    async update(
      accountId: string,
      id: string,
      patch: Partial<Pick<SourceType, 'description' | 'formats' | 'analysis_guidance'>>,
    ): Promise<Result<void>> {
      const { error } = await supabase
        .from('source_types')
        .update(patch)
        .eq('id', id)
        .eq('account_id', accountId);
      if (error) return err(pgError(error));
      return ok(undefined as void);
    },

    async delete(accountId: string, id: string): Promise<Result<void>> {
      const { error } = await supabase
        .from('source_types')
        .delete()
        .eq('id', id)
        .eq('account_id', accountId);
      if (error) return err(pgError(error));
      return ok(undefined as void);
    },
  },

  // --------------------------------------------------------------------------
  // Accounts — profile updates (domain URL, etc.)
  // --------------------------------------------------------------------------
  accounts: {
    async updateProfile(
      accountId: string,
      profile: Record<string, any>,
    ): Promise<Result<void>> {
      const { error } = await supabase
        .from('accounts')
        .update({ profile })
        .eq('id', accountId);
      if (error) return err(pgError(error));
      return ok(undefined as void);
    },
  },
};

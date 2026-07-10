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

          // Non-blocking: extract structured metadata from first chunk
          const sampleText = chunks.slice(0, 3).map(c => c.content).join('\n\n');
          fetch('/api/extract-knowledge', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              file_name: file.name,
              category: metadata.category,
              sample_text: sampleText,
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
      sourceTitle: string;
      sourceOwner?: string;
      sourceUrl?: string;
      marketingNotes?: string;
      knowledgeChunks?: string[];
      fileContext?: KBFileContext[];
    }): Promise<Result<Analysis>> {
      try {
        const response = await fetch('/api/analyze-content', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            source_text: params.sourceText.slice(0, 15000),
            source_type: params.sourceType,
            source_title: params.sourceTitle || 'Untitled Source',
            source_owner: params.sourceOwner,
            source_url: params.sourceUrl,
            marketing_notes: params.marketingNotes,
            knowledge_chunks: params.knowledgeChunks?.map((text, i) => ({
              id: `chunk-${i}`,
              content: text,
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
        knowledge_chunks: kbChunks.map((text, i) => ({ id: `chunk-${i}`, content: text })),
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
        knowledge_chunks: kbChunks.map((text, i) => ({ id: `chunk-${i}`, content: text })),
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
        knowledge_chunks: kbChunks.map((text, i) => ({ id: `chunk-${i}`, content: text })),
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
        knowledge_chunks: kbChunks.map((text, i) => ({ id: `chunk-${i}`, content: text })),
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
        analysis_id: analysisId,
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
        })
        .select()
        .single();
      if (error) return err(pgError(error));
      return ok(data as SourceType);
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

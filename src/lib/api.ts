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
} from '@/types';

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

      // Chunk and store asynchronously, but don't block the upload response
      parseFile(file)
        .then((text) => {
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

          return supabase.from('knowledge_chunks').insert(rows);
        })
        .then(() =>
          supabase
            .from('knowledge_files')
            .update({ ingest_status: 'ready' })
            .eq('id', fileRow.id),
        )
        .catch(() =>
          supabase
            .from('knowledge_files')
            .update({ ingest_status: 'failed' })
            .eq('id', fileRow.id),
        );

      return ok(fileRow);
    },

    async toggleActive(
      fileId: string,
      active: boolean,
    ): Promise<Result<void>> {
      const { error } = await supabase
        .from('knowledge_files')
        .update({ active })
        .eq('id', fileId);
      if (error) return err(pgError(error));
      return ok(undefined as void);
    },

    async delete(fileId: string): Promise<Result<void>> {
      const { data: file } = await supabase
        .from('knowledge_files')
        .select('storage_url')
        .eq('id', fileId)
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
  // Analysis
  // --------------------------------------------------------------------------
  analysis: {
    async run(params: {
      accountId: string;
      sourceText: string;
      sourceType: string;
      knowledgeChunks?: string[];
    }): Promise<Result<Analysis>> {
      const { data, error } = await supabase.functions.invoke(
        'analyze-content',
        { body: params },
      );
      if (error) return err(error.message);
      return ok(data as Analysis);
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
  // Opportunities
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
      id: string,
      status: Opportunity['status'],
    ): Promise<Result<void>> {
      const { error } = await supabase
        .from('opportunities')
        .update({ status })
        .eq('id', id);
      if (error) return err(pgError(error));
      return ok(undefined as void);
    },
  },

  // --------------------------------------------------------------------------
  // Studio (content generation via Edge Functions)
  // --------------------------------------------------------------------------
  studio: {
    async generateOutline(
      opportunityId: string,
      kbChunks: string[],
    ): Promise<Result<string>> {
      const { data, error } = await supabase.functions.invoke(
        'generate-content',
        {
          body: {
            action: 'outline',
            opportunityId,
            knowledgeChunks: kbChunks,
          },
        },
      );
      if (error) return err(error.message);
      return ok(data.outline as string);
    },

    async generateDraft(
      opportunityId: string,
      outline: string,
      kbChunks: string[],
    ): Promise<Result<string>> {
      const { data, error } = await supabase.functions.invoke(
        'generate-content',
        {
          body: {
            action: 'draft',
            opportunityId,
            outline,
            knowledgeChunks: kbChunks,
          },
        },
      );
      if (error) return err(error.message);
      return ok(data.draft as string);
    },

    async regenerate(
      content: string,
      feedback: string,
      kbChunks: string[],
    ): Promise<Result<string>> {
      const { data, error } = await supabase.functions.invoke(
        'generate-content',
        {
          body: {
            action: 'regenerate',
            content,
            feedback,
            knowledgeChunks: kbChunks,
          },
        },
      );
      if (error) return err(error.message);
      return ok(data.content as string);
    },

    async qualityReview(
      draft: string,
      kbChunks: string[],
    ): Promise<Result<Record<string, any>>> {
      const { data, error } = await supabase.functions.invoke(
        'generate-content',
        {
          body: {
            action: 'quality-review',
            draft,
            knowledgeChunks: kbChunks,
          },
        },
      );
      if (error) return err(error.message);
      return ok(data.quality as Record<string, any>);
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
      id: string,
      scheduledDate: string,
    ): Promise<Result<void>> {
      const { error } = await supabase
        .from('calendar_items')
        .update({ scheduled_for: scheduledDate, status: 'scheduled' })
        .eq('id', id);
      if (error) return err(pgError(error));
      return ok(undefined as void);
    },

    async export(id: string): Promise<Result<string>> {
      const { data, error } = await supabase
        .from('calendar_items')
        .select('*, assets(*)')
        .eq('id', id)
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
        (item as any).assets?.body ?? '(no content)',
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

    async test(integrationId: string): Promise<Result<{ ok: boolean }>> {
      const { data, error } = await supabase.functions.invoke(
        'test-integration',
        { body: { integrationId } },
      );
      if (error) return err(error.message);
      return ok(data as { ok: boolean });
    },

    async configure(
      integrationId: string,
      config: Record<string, any>,
    ): Promise<Result<void>> {
      const { error } = await supabase
        .from('integrations')
        .update({ config })
        .eq('id', integrationId);
      if (error) return err(pgError(error));
      return ok(undefined as void);
    },
  },
};

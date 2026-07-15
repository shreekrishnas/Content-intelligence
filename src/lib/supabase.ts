import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabaseConfigured = !!(supabaseUrl && supabaseAnonKey);

let _client: SupabaseClient | null = null;

export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    if (!supabaseConfigured) {
      if (prop === 'auth') {
        return {
          getSession: () => Promise.resolve({ data: { session: null }, error: null }),
          onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
          signUp: () => Promise.resolve({ data: {}, error: { message: 'Supabase not configured' } }),
          signInWithPassword: () => Promise.resolve({ data: {}, error: { message: 'Supabase not configured' } }),
          signInWithOAuth: () => Promise.resolve({ data: {}, error: { message: 'Supabase not configured' } }),
          signOut: () => Promise.resolve({ error: null }),
          getUser: () => Promise.resolve({ data: { user: null }, error: null }),
        };
      }
      if (prop === 'from') {
        return () => ({
          select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: [], error: null }), single: () => Promise.resolve({ data: null, error: null }) }), single: () => Promise.resolve({ data: null, error: null }) }),
          insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }),
          update: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }),
          delete: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }),
        });
      }
      if (prop === 'storage') {
        return { from: () => ({ upload: () => Promise.resolve({ error: { message: 'Supabase not configured' } }), getPublicUrl: () => ({ data: { publicUrl: '' } }), remove: () => Promise.resolve({}) }) };
      }
      if (prop === 'functions') {
        return { invoke: () => Promise.resolve({ data: null, error: { message: 'Supabase not configured' } }) };
      }
      return undefined;
    }

    if (!_client) {
      _client = createClient(supabaseUrl!, supabaseAnonKey!);
    }
    return (_client as any)[prop];
  },
});

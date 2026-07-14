import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { supabase, supabaseConfigured } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useAppStore } from '@/store';
import type { Account } from '@/types';

interface AccountListItem {
  id: string;
  name: string;
  role: 'manager' | 'editor' | 'viewer';
}

type AccountError = 'no_account' | 'access_denied' | 'not_found' | 'not_configured' | null;

interface AccountContextValue {
  accountId: string | null;
  account: Account | null;
  loading: boolean;
  error: AccountError;
  accounts: AccountListItem[];
  switchAccount: (id: string) => void;
}

const AccountContext = createContext<AccountContextValue>({
  accountId: null,
  account: null,
  loading: true,
  error: null,
  accounts: [],
  switchAccount: () => {},
});

export function useAccount() {
  return useContext(AccountContext);
}

export function AccountProvider({ children }: { children: ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [accounts, setAccounts] = useState<AccountListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<AccountError>(null);

  const loadAccounts = useCallback(async () => {
    if (!supabaseConfigured) {
      setLoading(false);
      setError('not_configured');
      return [];
    }

    if (user) {
      const { data, error: dbErr } = await supabase
        .from('account_access')
        .select('role, account_id, accounts(id, name)')
        .eq('user_id', user.id);

      if (!dbErr && data?.length) {
        const list: AccountListItem[] = data.map((row: any) => ({
          id: row.account_id,
          name: (row.accounts as any)?.name || row.account_id,
          role: row.role,
        }));
        setAccounts(list);
        return list;
      }
    }

    const { data: allAccounts, error: accErr } = await supabase
      .from('accounts')
      .select('id, name')
      .limit(50);

    if (accErr || !allAccounts?.length) {
      setError('no_account');
      setLoading(false);
      return [];
    }

    const list: AccountListItem[] = allAccounts.map((row: any) => ({
      id: row.id,
      name: row.name || row.id,
      role: 'manager' as const,
    }));
    setAccounts(list);
    return list;
  }, [user]);

  const fetchAccount = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);

    if (!supabaseConfigured) {
      setAccountId(id);
      setAccount(null);
      setError('not_configured');
      setLoading(false);
      return;
    }

    try {
      const { data, error: dbErr } = await supabase
        .from('accounts')
        .select('*')
        .eq('id', id)
        .single();

      if (dbErr || !data) {
        setAccountId(id);
        setAccount(null);
        setError('not_found');
        setLoading(false);
        return;
      }

      setAccountId(id);
      setAccount(data as Account);
      setLoading(false);
    } catch {
      setAccountId(id);
      setAccount(null);
      setError('not_found');
      setLoading(false);
    }
  }, []);

  const switchAccount = useCallback((id: string) => {
    localStorage.setItem('ci_account_id', id);
    useAppStore.getState().resetAccountState();
    fetchAccount(id);
  }, [fetchAccount]);

  useEffect(() => {
    (async () => {
      const list = await loadAccounts();
      if (!list.length) return;

      const storedId = localStorage.getItem('ci_account_id');
      const params = new URLSearchParams(window.location.search);
      const urlId = params.get('account_id');

      const preferred = urlId || storedId;
      const hasAccess = preferred && list.some((a) => a.id === preferred);
      const id = hasAccess ? preferred! : list[0].id;

      localStorage.setItem('ci_account_id', id);
      await fetchAccount(id);
    })();
  }, [loadAccounts, fetchAccount]);

  return (
    <AccountContext.Provider value={{ accountId, account, loading, error, accounts, switchAccount }}>
      {children}
    </AccountContext.Provider>
  );
}

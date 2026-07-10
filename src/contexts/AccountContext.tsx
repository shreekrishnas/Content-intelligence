import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { supabase, supabaseConfigured } from '@/lib/supabase';
import { useAppStore } from '@/store';
import type { Account } from '@/types';

export const ACCOUNTS = [
  { id: '00000000-0000-0000-0000-000000000001', name: 'Right Horizons' },
  { id: '00000000-0000-0000-0000-000000000002', name: 'Hoya Vision' },
  { id: '00000000-0000-0000-0000-000000000003', name: 'Wipro 3D' },
  { id: '00000000-0000-0000-0000-000000000004', name: 'Wipro Water' },
  { id: '00000000-0000-0000-0000-000000000005', name: 'Wepsol' },
] as const;

type AccountError = 'no_account' | 'access_denied' | 'not_found' | 'not_configured' | null;

interface AccountContextValue {
  accountId: string | null;
  account: Account | null;
  loading: boolean;
  error: AccountError;
  accounts: typeof ACCOUNTS;
  switchAccount: (id: string) => void;
}

const AccountContext = createContext<AccountContextValue>({
  accountId: null,
  account: null,
  loading: true,
  error: null,
  accounts: ACCOUNTS,
  switchAccount: () => {},
});

export function useAccount() {
  return useContext(AccountContext);
}

export function AccountProvider({ children }: { children: ReactNode }) {
  const [accountId, setAccountId] = useState<string | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<AccountError>(null);

  const fetchAccount = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);

    if (!supabaseConfigured) {
      const fallback = ACCOUNTS.find((a) => a.id === id);
      setAccountId(id);
      setAccount(fallback ? { id: fallback.id, org_id: '00000000-0000-0000-0000-000000000001', name: fallback.name, status: 'active', profile: {}, created_at: '' } as Account : null);
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
        const fallback = ACCOUNTS.find((a) => a.id === id);
        setAccountId(id);
        setAccount(fallback ? { id: fallback.id, org_id: '00000000-0000-0000-0000-000000000001', name: fallback.name, status: 'active', profile: {}, created_at: '' } as Account : null);
        setError(fallback ? null : 'not_found');
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
    const params = new URLSearchParams(window.location.search);
    const urlId = params.get('account_id');
    const storedId = localStorage.getItem('ci_account_id');
    const id = urlId || storedId || ACCOUNTS[0].id;

    if (!storedId || urlId) {
      localStorage.setItem('ci_account_id', id);
    }

    fetchAccount(id);
  }, [fetchAccount]);

  return (
    <AccountContext.Provider value={{ accountId, account, loading, error, accounts: ACCOUNTS, switchAccount }}>
      {children}
    </AccountContext.Provider>
  );
}

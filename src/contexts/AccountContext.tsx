import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { supabase, supabaseConfigured } from '@/lib/supabase';
import type { Account } from '@/types';

type AccountError = 'no_account' | 'access_denied' | 'not_found' | 'not_configured' | null;

interface AccountContextValue {
  accountId: string | null;
  account: Account | null;
  loading: boolean;
  error: AccountError;
}

const AccountContext = createContext<AccountContextValue>({
  accountId: null,
  account: null,
  loading: true,
  error: null,
});

export function useAccount() {
  return useContext(AccountContext);
}

export function AccountProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AccountContextValue>({
    accountId: null,
    account: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('account_id');

    if (!id) {
      setState({ accountId: null, account: null, loading: false, error: 'no_account' });
      return;
    }

    if (!supabaseConfigured) {
      setState({ accountId: id, account: null, loading: false, error: 'not_configured' });
      return;
    }

    (async () => {
      try {
        const { data, error } = await supabase
          .from('accounts')
          .select('*')
          .eq('id', id)
          .single();

        if (error || !data) {
          setState({
            accountId: id,
            account: null,
            loading: false,
            error: 'access_denied',
          });
          return;
        }

        setState({ accountId: id, account: data as Account, loading: false, error: null });
      } catch {
        setState({ accountId: id, account: null, loading: false, error: 'not_found' });
      }
    })();
  }, []);

  return (
    <AccountContext.Provider value={state}>
      {children}
    </AccountContext.Provider>
  );
}

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { supabase, supabaseConfigured } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useAppStore } from '@/store';
import type { Account } from '@/types';

const ORG_ID = '00000000-0000-0000-0000-000000000001';

export interface AccountListItem {
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
  isAdmin: boolean;
  userRole: string | null;
  switchAccount: (id: string) => void;
  refreshAccounts: () => Promise<void>;
}

const AccountContext = createContext<AccountContextValue>({
  accountId: null,
  account: null,
  loading: true,
  error: null,
  accounts: [],
  isAdmin: false,
  userRole: null,
  switchAccount: () => {},
  refreshAccounts: async () => {},
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
  const [isAdmin, setIsAdmin] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);

  const loadAccounts = useCallback(async (): Promise<AccountListItem[]> => {
    if (!supabaseConfigured) {
      setLoading(false);
      setError('not_configured');
      return [];
    }

    if (!user) return [];

    // Fetch user profile to check admin status and td_role
    const { data: profile } = await supabase
      .from('users')
      .select('is_org_admin, td_role')
      .eq('id', user.id)
      .single();

    const admin = profile?.is_org_admin ?? false;
    const role = profile?.td_role ?? null;
    setIsAdmin(admin);
    setUserRole(role);

    if (admin) {
      // Org admins see all accounts in the org
      const { data: allAccounts, error: accErr } = await supabase
        .from('accounts')
        .select('id, name')
        .eq('org_id', ORG_ID)
        .eq('status', 'active')
        .order('name', { ascending: true });

      if (accErr || !allAccounts?.length) {
        setError('no_account');
        setLoading(false);
        return [];
      }

      const list: AccountListItem[] = allAccounts.map((row: any) => ({
        id: row.id,
        name: row.name,
        role: 'manager' as const,
      }));
      setAccounts(list);
      return list;
    }

    // Regular users: only their assigned accounts
    const { data, error: dbErr } = await supabase
      .from('account_access')
      .select('role, account_id, accounts!inner(id, name, status)')
      .eq('user_id', user.id);

    if (dbErr) {
      setError('no_account');
      setLoading(false);
      return [];
    }

    const active = (data || []).filter((row: any) => row.accounts?.status === 'active');

    if (!active.length) {
      setError('no_account');
      setLoading(false);
      return [];
    }

    const list: AccountListItem[] = active.map((row: any) => ({
      id: row.account_id,
      name: (row.accounts as any)?.name || row.account_id,
      role: row.role as 'manager' | 'editor' | 'viewer',
    }));

    // Sort alphabetically
    list.sort((a, b) => a.name.localeCompare(b.name));
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

  const refreshAccounts = useCallback(async () => {
    await loadAccounts();
  }, [loadAccounts]);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

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
  }, [user, loadAccounts, fetchAccount]);

  return (
    <AccountContext.Provider value={{
      accountId,
      account,
      loading,
      error,
      accounts,
      isAdmin,
      userRole,
      switchAccount,
      refreshAccounts,
    }}>
      {children}
    </AccountContext.Provider>
  );
}

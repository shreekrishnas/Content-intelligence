import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { supabase, supabaseConfigured } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useAppStore } from '@/store';
import type { Account } from '@/types';

const ORG_ID = '00000000-0000-0000-0000-000000000001';

// Master admin: only this login sees the Admin/Personal view toggle and the
// feedback inbox. Change here if the master account ever moves.
export const MASTER_ADMIN_EMAIL = 'shreekrishna.basri@trilliantdigital.com';

export type ViewMode = 'admin' | 'personal';
const VIEW_MODE_KEY = 'ci_view_mode';

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
  /** True only for the master admin email — controls the view toggle + feedback inbox visibility. */
  isMasterAdmin: boolean;
  /** Current view mode. Only ever 'personal' for non-master-admin users. */
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
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
  isMasterAdmin: false,
  viewMode: 'personal',
  setViewMode: () => {},
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

  const isMasterAdmin = (user?.email || '').toLowerCase() === MASTER_ADMIN_EMAIL.toLowerCase();

  // Master admin defaults to admin view unless they've switched. Non-admins
  // are always locked to personal view — the setter is a no-op for them.
  const [viewMode, setViewModeInternal] = useState<ViewMode>(() => {
    if (typeof window === 'undefined') return 'personal';
    const stored = localStorage.getItem(VIEW_MODE_KEY);
    return stored === 'admin' || stored === 'personal' ? stored : 'admin';
  });

  const effectiveViewMode: ViewMode = isMasterAdmin ? viewMode : 'personal';

  const setViewMode = useCallback((mode: ViewMode) => {
    if (!isMasterAdmin) return;
    localStorage.setItem(VIEW_MODE_KEY, mode);
    setViewModeInternal(mode);
  }, [isMasterAdmin]);

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

    const dbAdmin = profile?.is_org_admin ?? false;
    const role = profile?.td_role ?? null;
    // The master admin is always treated as admin for downstream permission
    // checks (e.g. role gates in the UI) regardless of the users.is_org_admin
    // flag — so a missing/false DB row can't lock them out.
    const admin = dbAdmin || isMasterAdmin;
    setIsAdmin(admin);
    setUserRole(role);

    // Load ALL accounts in org (admin pool) — only used when in admin view.
    async function loadAllInOrg(): Promise<AccountListItem[]> {
      const { data } = await supabase
        .from('accounts')
        .select('id, name')
        .eq('org_id', ORG_ID)
        .eq('status', 'active')
        .order('name', { ascending: true });
      return (data || []).map((row: any) => ({
        id: row.id,
        name: row.name,
        role: 'manager' as const,
      }));
    }

    // Load only accounts the user has explicit access to (personal pool).
    async function loadPersonal(): Promise<AccountListItem[]> {
      const { data } = await supabase
        .from('account_access')
        .select('role, account_id, accounts!inner(id, name, status)')
        .eq('user_id', user!.id);
      const active = (data || []).filter((row: any) => row.accounts?.status === 'active');
      const list: AccountListItem[] = active.map((row: any) => ({
        id: row.account_id,
        name: (row.accounts as any)?.name || row.account_id,
        role: row.role as 'manager' | 'editor' | 'viewer',
      }));
      list.sort((a, b) => a.name.localeCompare(b.name));
      return list;
    }

    const list = admin && effectiveViewMode === 'admin'
      ? await loadAllInOrg()
      : await loadPersonal();

    if (!list.length) {
      setAccounts([]);
      setError('no_account');
      setLoading(false);
      return [];
    }

    setAccounts(list);
    setError(null);
    return list;
  }, [user, isMasterAdmin, effectiveViewMode]);

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
      isMasterAdmin,
      viewMode: effectiveViewMode,
      setViewMode,
      switchAccount,
      refreshAccounts,
    }}>
      {children}
    </AccountContext.Provider>
  );
}

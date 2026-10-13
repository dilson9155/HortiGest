import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { api, setToken, getToken } from '../lib/api';

export type User = {
  id: string;
  username: string;
  name: string;
  email?: string | null;
  role?: { id: string; kind: 'ADMIN' | 'SUPERVISOR' | 'OPERADOR'; name: string } | null;
  permissions: Record<string, Record<string, boolean>>;
};

type AuthCtx = {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => void;
  refresh: () => Promise<void>;
  can: (module: string, action: string) => boolean;
  canAny: (module: string, actions: string[]) => boolean;
};

const AuthContext = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setUser(null);
      setLoading(false);
      return;
    }
    const r = await api.get<User>('/auth/me');
    if (r.ok) setUser(r.data);
    else setUser(null);
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const login: AuthCtx['login'] = async (username, password) => {
    const r = await api.post<{ token: string; user: User }>('/auth/login', { username, password });
    if (!r.ok) return { ok: false, error: r.error?.message || 'Falha no login.' };
    setToken(r.data.token);
    setUser(r.data.user);
    return { ok: true };
  };

  const logout = () => {
    setToken(null);
    setUser(null);
  };

  const can = (module: string, action: string) => {
    if (!user) return false;
    if (user.role?.kind === 'ADMIN') return true;
    return !!user.permissions?.[module]?.[action];
  };

  const canAny = (module: string, actions: string[]) => {
    if (!user) return false;
    if (user.role?.kind === 'ADMIN') return true;
    const m = user.permissions?.[module] ?? {};
    return actions.some((a) => m[a]);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refresh, can, canAny }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de <AuthProvider>.');
  return ctx;
}

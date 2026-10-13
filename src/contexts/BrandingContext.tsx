import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { api, setToken } from '../lib/api';

type Branding = {
  /** URL/data da logo da empresa (data URL ou URL absoluta). null = usar padrão. */
  logo: string | null;
  /** Nome da empresa (exibido em alguns lugares). */
  companyName: string;
  /** Atualiza o estado a partir dos dados lidos do servidor. */
  refresh: () => Promise<void>;
  /** Define a logo imediatamente (usado após salvar em Configurações). */
  setLogo: (logo: string | null) => void;
  /** Define o nome da empresa imediatamente. */
  setCompanyName: (name: string) => void;
};

const BrandingContext = createContext<Branding | null>(null);

export function BrandingProvider({ children }: { children: ReactNode }) {
  const [logo, setLogo] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState<string>('');

  const refresh = useCallback(async () => {
    try {
      const tk = localStorage.getItem('hf_token');
      if (!tk) return;
      setToken(tk);
      const r = await api.get('/settings');
      if (r.ok) {
        setLogo(r.data['company.logo'] ?? null);
        setCompanyName(r.data['company.name'] ?? '');
      }
    } catch {
      // sem permissão — fica com padrão
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <BrandingContext.Provider value={{ logo, companyName, refresh, setLogo, setCompanyName }}>
      {children}
    </BrandingContext.Provider>
  );
}

export function useBranding() {
  const ctx = useContext(BrandingContext);
  if (!ctx) throw new Error('useBranding deve estar dentro de <BrandingProvider>.');
  return ctx;
}

/** Versão segura (não quebra se fora do provider) — usa logo padrão. */
export function useBrandingSafe(): Branding {
  const ctx = useContext(BrandingContext);
  return (
    ctx ?? {
      logo: null,
      companyName: '',
      refresh: async () => {},
      setLogo: () => {},
      setCompanyName: () => {},
    }
  );
}

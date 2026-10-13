// Cliente HTTP centralizado.
// Em Next.js, tudo é same-origin — as rotas ficam em /api/...
const BASE = '';

let token: string | null = null;

export function setToken(t: string | null) {
  token = t;
  if (t) localStorage.setItem('hf_token', t);
  else localStorage.removeItem('hf_token');
}

export function getToken(): string | null {
  if (token) return token;
  token = localStorage.getItem('hf_token');
  return token;
}

export type ApiOk<T> = { ok: true; data: T };
export type ApiErr = { ok: false; error: { code: string; message: string; details?: any } };
export type ApiResult<T> = ApiOk<T> | ApiErr;

type RawResult<T> =
  | (ApiOk<T> & { _type: 'json' })
  | (ApiErr & { _type: 'json' })
  | (Blob & { _type: 'blob' });

async function request<T>(
  method: string,
  path: string,
  body?: any,
  responseType: 'json' | 'blob' = 'json',
): Promise<ApiResult<T> | { ok: true; blob: Blob }> {
  const headers: Record<string, string> = {};
  if (body && !(body instanceof FormData)) headers['Content-Type'] = 'application/json';
  const tk = getToken();
  if (tk) headers['Authorization'] = `Bearer ${tk}`;

  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers,
    body: body && !(body instanceof FormData) ? JSON.stringify(body) : body,
    credentials: 'include',
  });

  if (responseType === 'blob') {
    if (!res.ok) {
      return { ok: false, error: { code: 'HTTP_ERROR', message: `Erro ${res.status}` } };
    }
    const blob = await res.blob();
    return { ok: true, blob };
  }

  let json: any = null;
  try { json = await res.json(); } catch { /* empty */ }

  if (!res.ok) {
    if (res.status === 401 && path !== '/auth/login') {
      setToken(null);
    }
    return {
      ok: false,
      error: json?.error ?? { code: 'HTTP_ERROR', message: `Erro ${res.status}` },
    };
  }
  return { ok: true, data: (json?.data ?? json) as T };
}

export const api = {
  get: async <T = any>(p: string): Promise<ApiResult<T>> => {
    const r = await request<T>('GET', p, undefined, 'json');
    return r as ApiResult<T>;
  },
  post: async <T = any>(p: string, body?: any): Promise<ApiResult<T>> => {
    const r = await request<T>('POST', p, body, 'json');
    return r as ApiResult<T>;
  },
  put: async <T = any>(p: string, body?: any): Promise<ApiResult<T>> => {
    const r = await request<T>('PUT', p, body, 'json');
    return r as ApiResult<T>;
  },
  del: async <T = any>(p: string): Promise<ApiResult<T>> => {
    const r = await request<T>('DELETE', p, undefined, 'json');
    return r as ApiResult<T>;
  },
  download: async (p: string): Promise<{ ok: true; blob: Blob } | ApiErr> => {
    return (await request('GET', p, undefined, 'blob')) as { ok: true; blob: Blob } | ApiErr;
  },
};

export function errorMessage(err: any, fallback = 'Ocorreu um erro.'): string {
  return err?.error?.message || err?.message || fallback;
}

// Helper para detectar retorno com Blob.
export function isBlobResult(r: any): r is { ok: true; blob: Blob } {
  return r && typeof r === 'object' && 'blob' in r && r.blob instanceof Blob;
}

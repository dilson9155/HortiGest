// Helpers para extrair usuário autenticado (App Router do Next.js).

import { cookies } from 'next/headers';
import { verifyToken } from './auth';
import { prisma } from './prisma';
import type { Module, Actions, PermMap } from './permissions';

export type SessionUser = {
  id: string;
  username: string;
  name: string;
  email: string | null;
  role: { id: string; kind: 'ADMIN' | 'SUPERVISOR' | 'OPERADOR'; name: string } | null;
  permissions: PermMap;
};

export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
}

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string; details?: unknown } };

export const apiOk = <T,>(data: T): ApiResult<T> => ({ ok: true, data });

export const apiErr = (status: number, code: string, message: string, details?: unknown) => ({
  status,
  body: { ok: false, error: { code, message, details } } as ApiResult<never>,
});

/** Lê cookie/header Authorization e devolve usuário (ou null). */
export async function getSession(req?: Request): Promise<SessionUser | null> {
  let token: string | null = null;

  if (req?.headers) {
    const auth = req.headers.get('authorization');
    if (auth?.startsWith('Bearer ')) token = auth.substring(7);
  }

  if (!token) {
    const ck = await cookies();
    token = ck.get('hf_token')?.value ?? null;
  }

  if (!token) return null;
  const decoded = verifyToken(token);
  if (!decoded) return null;

  const user = await prisma.user.findUnique({
    where: { id: decoded.sub },
    include: { role: { include: { permissions: true } } },
  });

  if (!user || !user.active) return null;

  const permissions: PermMap = (Object.fromEntries(
    (user.role?.permissions ?? []).map((p) => [p.module, p.actions as Record<Actions, boolean>]),
  )) as unknown as PermMap;

  return {
    id: user.id,
    username: user.username,
    name: user.name,
    email: user.email,
    role: user.role
      ? { id: user.role.id, kind: user.role.kind, name: user.role.name }
      : null,
    permissions,
  };
}

/** Lança HttpError se faltar permissão. */
export function requirePerm(session: SessionUser | null, module: Module, action: Actions) {
  if (!session) throw new HttpError(401, 'UNAUTHORIZED', 'Autenticação necessária.');
  if (session.role?.kind === 'ADMIN') return;
  if (!session.permissions?.[module]?.[action]) {
    throw new HttpError(403, 'FORBIDDEN', `Sem permissão para "${action}" em "${module}".`);
  }
}

import { prisma } from '../../../lib/prisma';
import { handler } from '../../../lib/api-handler';
import { getSession, requirePerm, HttpError } from '../../../lib/session';

export const runtime = 'nodejs';

export const GET = handler(async (req) => {
  const session = await getSession(req);
  if (!session) throw new HttpError(401, 'UNAUTHORIZED', 'Autenticação necessária.');
  requirePerm(session, 'settings', 'view');

  const list = await prisma.systemSetting.findMany();
  return Object.fromEntries(list.map((s) => [s.key, s.value ?? s.jsonValue ?? null]));
});

export const PUT = handler(async (req) => {
  const session = await getSession(req);
  if (!session) throw new HttpError(401, 'UNAUTHORIZED', 'Autenticação necessária.');
  requirePerm(session, 'settings', 'edit');

  const map = (await req.json()) as Record<string, unknown>;
  if (!map || typeof map !== 'object') throw new HttpError(400, 'INVALID', 'Corpo inválido.');

  // Remove chaves com valores vazios
  const cleaned: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(map)) {
    if (v !== '' && v !== null && v !== undefined) cleaned[k] = v;
  }

  await prisma.$transaction(
    Object.entries(cleaned).map(([key, value]) => {
      const isJson = typeof value === 'object' && value !== null;
      return prisma.systemSetting.upsert({
        where: { key },
        update: {
          value: isJson ? null : String(value),
          jsonValue: isJson ? (value as any) : undefined,
        },
        create: {
          key,
          value: isJson ? null : String(value),
          jsonValue: isJson ? (value as any) : undefined,
          category: 'GERAL',
        },
      });
    }),
  );

  await prisma.auditLog.create({
    data: {
      userId: session.id,
      userName: session.name,
      entity: 'settings',
      entityId: 'settings',
      operation: 'UPDATE',
      description: `Configurações atualizadas (${Object.keys(cleaned).length} chaves).`,
    },
  });

  return { ok: true, count: Object.keys(cleaned).length };
});

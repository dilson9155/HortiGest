import { prisma } from '../../../../lib/prisma';
import { handler } from '../../../../lib/api-handler';
import { getSession, requirePerm, routeId, HttpError } from '../../../../lib/session';

export const runtime = 'nodejs';

export const GET = handler(async (req, ctx) => {
  const session = await getSession(req);
  if (!session) throw new HttpError(401, 'UNAUTHORIZED', 'Autenticação necessária.');
  requirePerm(session, 'launches', 'view');

  const id = await routeId(ctx);
  const launch = await prisma.launch.findUnique({
    where: { id },
    include: { items: true, user: { select: { id: true, name: true, username: true } } },
  });
  if (!launch) throw new HttpError(404, 'NAO_ENCONTRADO', 'Lançamento não encontrado.');
  return launch;
});

export const DELETE = handler(async (req, ctx) => {
  const session = await getSession(req);
  if (!session) throw new HttpError(401, 'UNAUTHORIZED', 'Autenticação necessária.');
  requirePerm(session, 'launches', 'delete');

  const id = await routeId(ctx);
  const before = await prisma.launch.findUnique({ where: { id }, include: { items: true } });
  if (!before) throw new HttpError(404, 'NAO_ENCONTRADO', 'Lançamento não encontrado.');

  await prisma.$transaction([
    prisma.launchItem.deleteMany({ where: { launchId: id } }),
    prisma.launch.delete({ where: { id } }),
  ]);
  await prisma.auditLog.create({
    data: {
      userId: session.id,
      userName: session.name,
      entity: 'launch',
      entityId: id,
      operation: 'DELETE',
      description: `Lançamento de ${before.referenceDate?.toISOString?.()?.slice(0, 10)} excluído (${before.items.length} item(ns)).`,
    },
  });
  return { ok: true };
});

import { prisma } from '../../../../lib/prisma';
import { handler } from '../../../../lib/api-handler';
import { getSession, requirePerm, routeId, HttpError } from '../../../../lib/session';
import {
  assertNoDuplicateReceived,
  launchInclude,
  launchSchema,
  launchStatusFor,
  normalizeLaunch,
  resolveReceivingRefs,
  writeItems,
} from '../../../../lib/launch-service';

export const runtime = 'nodejs';

export const GET = handler(async (req, ctx) => {
  const session = await getSession(req);
  if (!session) throw new HttpError(401, 'UNAUTHORIZED', 'Autenticação necessária.');
  requirePerm(session, 'launches', 'view');

  const id = await routeId(ctx);
  const launch = await prisma.launch.findUnique({ where: { id }, include: launchInclude });
  if (!launch) throw new HttpError(404, 'NAO_ENCONTRADO', 'Lançamento não encontrado.');
  return launch;
});

export const PUT = handler(async (req, ctx) => {
  const session = await getSession(req);
  if (!session) throw new HttpError(401, 'UNAUTHORIZED', 'Autenticação necessária.');
  requirePerm(session, 'launches', 'edit');

  const id = await routeId(ctx);
  const payload = launchSchema.parse(await req.json());
  const { refDate, items, received } = normalizeLaunch(payload);

  const before = await prisma.launch.findUnique({ where: { id }, include: { items: true } });
  if (!before) throw new HttpError(404, 'NAO_ENCONTRADO', 'Lançamento não encontrado.');

  await assertNoDuplicateReceived(refDate, received, id);

  const updated = await prisma.$transaction(async (tx) => {
    const refs = await resolveReceivingRefs(tx, payload, items);
    await tx.launchItem.deleteMany({ where: { launchId: id } });
    await tx.launch.update({
      where: { id },
      data: {
        referenceDate: refDate,
        status: launchStatusFor(items),
        notes: payload.notes ?? null,
        dockId: refs.dockId,
        dockName: refs.dockName,
        conferenteId: refs.conferenteId,
        conferenteName: refs.conferenteName,
        compradorId: refs.compradorId,
        compradorName: refs.compradorName,
      },
    });
    await writeItems(tx, id, items);
    return tx.launch.findUnique({ where: { id }, include: launchInclude });
  });

  await prisma.auditLog.create({
    data: {
      userId: session.id,
      userName: session.name,
      entity: 'launch',
      entityId: id,
      operation: 'UPDATE',
      description: `Lançamento de ${payload.referenceDate} atualizado (${received.length} recebido(s), ${items.length - received.length} previsão(ões)).`,
    },
  });

  return updated;
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

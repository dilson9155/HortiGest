import { z } from 'zod';
import { prisma } from '../../../../../lib/prisma';
import { handler } from '../../../../../lib/api-handler';
import { getSession, requirePerm, routeId, HttpError } from '../../../../../lib/session';

export const runtime = 'nodejs';

const bodySchema = z.object({ active: z.boolean() });

export const POST = handler(async (req, ctx) => {
  const session = await getSession(req);
  if (!session) throw new HttpError(401, 'UNAUTHORIZED', 'Autenticação necessária.');
  requirePerm(session, 'suppliers', 'edit');

  const id = await routeId(ctx);
  const { active } = bodySchema.parse(await req.json());

  const before = await prisma.supplier.findUnique({ where: { id } });
  if (!before) throw new HttpError(404, 'NAO_ENCONTRADO', 'Fornecedor não encontrado.');

  const after = await prisma.supplier.update({ where: { id }, data: { active } });
  await prisma.auditLog.create({
    data: {
      userId: session.id,
      userName: session.name,
      entity: 'supplier',
      entityId: id,
      operation: 'UPDATE',
      description: `Fornecedor "${before.name}" ${active ? 'ativado' : 'inativado'}.`,
      oldValues: { id: before.id, name: before.name, active: before.active },
      newValues: { id: after.id, name: after.name, active: after.active },
    },
  });
  return after;
});

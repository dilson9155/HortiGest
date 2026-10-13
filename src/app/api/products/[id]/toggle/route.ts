import { z } from 'zod';
import { prisma } from '../../../../../lib/prisma';
import { handler } from '../../../../../lib/api-handler';
import { getSession, requirePerm, routeId, HttpError } from '../../../../../lib/session';

export const runtime = 'nodejs';

const bodySchema = z.object({ active: z.boolean() });

export const POST = handler(async (req, ctx) => {
  const session = await getSession(req);
  if (!session) throw new HttpError(401, 'UNAUTHORIZED', 'Autenticação necessária.');
  requirePerm(session, 'products', 'edit');

  const id = await routeId(ctx);
  const { active } = bodySchema.parse(await req.json());

  const before = await prisma.product.findUnique({ where: { id } });
  if (!before) throw new HttpError(404, 'NAO_ENCONTRADO', 'Produto não encontrado.');

  const after = await prisma.product.update({ where: { id }, data: { active } });
  await prisma.auditLog.create({
    data: {
      userId: session.id,
      userName: session.name,
      entity: 'product',
      entityId: id,
      operation: 'UPDATE',
      description: `Produto "${before.name}" ${active ? 'ativado' : 'inativado'}.`,
      oldValues: { id: before.id, name: before.name, active: before.active },
      newValues: { id: after.id, name: after.name, active: after.active },
    },
  });
  return after;
});

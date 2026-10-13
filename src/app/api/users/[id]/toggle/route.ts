import { z } from 'zod';
import { prisma } from '../../../../../lib/prisma';
import { handler } from '../../../../../lib/api-handler';
import { getSession, requirePerm, routeId, HttpError } from '../../../../../lib/session';

export const runtime = 'nodejs';

const bodySchema = z.object({ active: z.boolean() });

export const POST = handler(async (req, ctx) => {
  const session = await getSession(req);
  if (!session) throw new HttpError(401, 'UNAUTHORIZED', 'Autenticação necessária.');
  requirePerm(session, 'users', 'edit');

  const id = await routeId(ctx);
  const { active } = bodySchema.parse(await req.json());

  const before = await prisma.user.findUnique({ where: { id } });
  if (!before) throw new HttpError(404, 'NAO_ENCONTRADO', 'Usuário não encontrado.');
  if (before.id === session.id && !active) {
    throw new HttpError(400, 'INVALIDO', 'Você não pode inativar o próprio usuário.');
  }

  const after = await prisma.user.update({ where: { id }, data: { active }, include: { role: true } });
  await prisma.auditLog.create({
    data: {
      userId: session.id,
      userName: session.name,
      entity: 'user',
      entityId: id,
      operation: 'UPDATE',
      description: `Usuário "${before.username}" ${active ? 'ativado' : 'inativado'}.`,
    },
  });
  return after;
});

import { z } from 'zod';
import { prisma } from '../../../../../lib/prisma';
import { hashPassword } from '../../../../../lib/auth';
import { handler } from '../../../../../lib/api-handler';
import { getSession, requirePerm, routeId, HttpError } from '../../../../../lib/session';

export const runtime = 'nodejs';

const bodySchema = z.object({ newPassword: z.string().min(8, 'Senha mínima de 8 caracteres.') });

export const POST = handler(async (req, ctx) => {
  const session = await getSession(req);
  if (!session) throw new HttpError(401, 'UNAUTHORIZED', 'Autenticação necessária.');
  requirePerm(session, 'users', 'edit');

  const id = await routeId(ctx);
  const { newPassword } = bodySchema.parse(await req.json());

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) throw new HttpError(404, 'NAO_ENCONTRADO', 'Usuário não encontrado.');

  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({ where: { id }, data: { passwordHash } });
  await prisma.auditLog.create({
    data: {
      userId: session.id,
      userName: session.name,
      entity: 'user',
      entityId: id,
      operation: 'PASSWORD_RESET',
      description: `Senha de ${target.username} redefinida.`,
    },
  });
  return { ok: true };
});

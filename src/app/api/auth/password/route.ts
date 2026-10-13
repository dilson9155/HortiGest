import { z } from 'zod';
import { prisma } from '../../../../lib/prisma';
import { hashPassword, verifyPassword } from '../../../../lib/auth';
import { handler } from '../../../../lib/api-handler';
import { getSession, HttpError } from '../../../../lib/session';

export const runtime = 'nodejs';

const schema = z
  .object({
    currentPassword: z.string().min(1, 'Informe a senha atual.'),
    newPassword: z.string().min(8, 'A nova senha deve ter pelo menos 8 caracteres.'),
    confirmPassword: z.string().min(1, 'Confirme a nova senha.'),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: 'A confirmação não confere com a nova senha.',
    path: ['confirmPassword'],
  });

export const POST = handler(async (req) => {
  const session = await getSession(req);
  if (!session) throw new HttpError(401, 'UNAUTHORIZED', 'Autenticação necessária.');

  const { currentPassword, newPassword } = schema.parse(await req.json());
  const user = await prisma.user.findUnique({ where: { id: session.id } });
  if (!user) throw new HttpError(404, 'NAO_ENCONTRADO', 'Usuário não encontrado.');

  const okPw = await verifyPassword(user.passwordHash, currentPassword);
  if (!okPw) throw new HttpError(400, 'CREDENTIALS_INVALID', 'Senha atual incorreta.');

  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({ where: { id: session.id }, data: { passwordHash } });

  await prisma.auditLog.create({
    data: {
      userId: session.id,
      userName: session.name,
      entity: 'user',
      entityId: session.id,
      operation: 'PASSWORD_CHANGE',
      description: 'Senha alterada.',
    },
  });

  return { ok: true };
});

import { z } from 'zod';
import { prisma } from '../../../../lib/prisma';
import { hashPassword } from '../../../../lib/auth';
import { handler } from '../../../../lib/api-handler';
import { getSession, requirePerm, routeId, HttpError } from '../../../../lib/session';

export const runtime = 'nodejs';

const updateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  email: z.string().email().optional().nullable().or(z.literal('')),
  password: z.string().min(8, 'Senha mínima de 8 caracteres.').optional(),
  roleKind: z.enum(['ADMIN', 'SUPERVISOR', 'OPERADOR']).optional(),
  active: z.boolean().optional(),
});

export const PUT = handler(async (req, ctx) => {
  const session = await getSession(req);
  if (!session) throw new HttpError(401, 'UNAUTHORIZED', 'Autenticação necessária.');
  requirePerm(session, 'users', 'edit');

  const id = await routeId(ctx);
  const data = updateSchema.parse(await req.json());

  const before = await prisma.user.findUnique({ where: { id } });
  if (!before) throw new HttpError(404, 'NAO_ENCONTRADO', 'Usuário não encontrado.');

  const updateData: any = {};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.email !== undefined) updateData.email = data.email || null;
  if (data.active !== undefined) updateData.active = data.active;
  if (data.password) updateData.passwordHash = await hashPassword(data.password);
  if (data.roleKind) {
    const role = await prisma.role.findUnique({ where: { kind: data.roleKind } });
    if (!role) throw new HttpError(400, 'INVALIDO', 'Perfil inválido.');
    updateData.roleId = role.id;
  }

  const after = await prisma.user.update({ where: { id }, data: updateData, include: { role: true } });
  await prisma.auditLog.create({
    data: {
      userId: session.id,
      userName: session.name,
      entity: 'user',
      entityId: id,
      operation: 'UPDATE',
      description: `Usuário "${before.username}" atualizado.`,
    },
  });
  return after;
});

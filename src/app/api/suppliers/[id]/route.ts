import { z } from 'zod';
import { prisma } from '../../../../lib/prisma';
import { handler } from '../../../../lib/api-handler';
import { getSession, requirePerm, routeId, HttpError } from '../../../../lib/session';

export const runtime = 'nodejs';

const updateSchema = z.object({
  name: z.string().min(1, 'Informe o nome.').max(120).optional(),
  active: z.boolean().optional(),
});

export const PUT = handler(async (req, ctx) => {
  const session = await getSession(req);
  if (!session) throw new HttpError(401, 'UNAUTHORIZED', 'Autenticação necessária.');
  requirePerm(session, 'suppliers', 'edit');

  const id = await routeId(ctx);
  const data = updateSchema.parse(await req.json());

  const before = await prisma.supplier.findUnique({ where: { id } });
  if (!before) throw new HttpError(404, 'NAO_ENCONTRADO', 'Fornecedor não encontrado.');

  if (data.name && data.name !== before.name) {
    const dup = await prisma.supplier.findUnique({ where: { name: data.name } });
    if (dup) throw new HttpError(409, 'DUPLICADO', 'Já existe um fornecedor com esse nome.');
  }

  const after = await prisma.supplier.update({ where: { id }, data });
  await prisma.auditLog.create({
    data: {
      userId: session.id,
      userName: session.name,
      entity: 'supplier',
      entityId: id,
      operation: 'UPDATE',
      description: `Fornecedor "${before.name}" atualizado.`,
      oldValues: { id: before.id, name: before.name, active: before.active },
      newValues: { id: after.id, name: after.name, active: after.active },
    },
  });
  return after;
});

export const DELETE = handler(async (req, ctx) => {
  const session = await getSession(req);
  if (!session) throw new HttpError(401, 'UNAUTHORIZED', 'Autenticação necessária.');
  requirePerm(session, 'suppliers', 'delete');

  const id = await routeId(ctx);
  const before = await prisma.supplier.findUnique({ where: { id } });
  if (!before) throw new HttpError(404, 'NAO_ENCONTRADO', 'Fornecedor não encontrado.');

  await prisma.supplier.delete({ where: { id } });
  await prisma.auditLog.create({
    data: {
      userId: session.id,
      userName: session.name,
      entity: 'supplier',
      entityId: id,
      operation: 'DELETE',
      description: `Fornecedor "${before.name}" excluído.`,
    },
  });
  return { ok: true };
});

import { z } from 'zod';
import { prisma } from '../../../../lib/prisma';
import { handler } from '../../../../lib/api-handler';
import { getSession, requirePerm, routeId, HttpError } from '../../../../lib/session';

export const runtime = 'nodejs';

const updateSchema = z.object({
  name: z.string().min(1, 'Informe o nome.').max(120).optional(),
  defaultBoxKg: z.number().positive('O peso da caixa deve ser maior que zero.').max(1000).optional(),
  active: z.boolean().optional(),
});

export const PUT = handler(async (req, ctx) => {
  const session = await getSession(req);
  if (!session) throw new HttpError(401, 'UNAUTHORIZED', 'Autenticação necessária.');
  requirePerm(session, 'products', 'edit');

  const id = await routeId(ctx);
  const data = updateSchema.parse(await req.json());

  const before = await prisma.product.findUnique({ where: { id } });
  if (!before) throw new HttpError(404, 'NAO_ENCONTRADO', 'Produto não encontrado.');

  if (data.name && data.name !== before.name) {
    const dup = await prisma.product.findUnique({ where: { name: data.name } });
    if (dup) throw new HttpError(409, 'DUPLICADO', 'Já existe um produto com esse nome.');
  }

  const after = await prisma.product.update({ where: { id }, data });
  await prisma.auditLog.create({
    data: {
      userId: session.id,
      userName: session.name,
      entity: 'product',
      entityId: id,
      operation: 'UPDATE',
      description: `Produto "${before.name}" atualizado.`,
      oldValues: { id: before.id, name: before.name, defaultBoxKg: Number(before.defaultBoxKg), active: before.active },
      newValues: { id: after.id, name: after.name, defaultBoxKg: Number(after.defaultBoxKg), active: after.active },
    },
  });
  return after;
});

export const DELETE = handler(async (req, ctx) => {
  const session = await getSession(req);
  if (!session) throw new HttpError(401, 'UNAUTHORIZED', 'Autenticação necessária.');
  requirePerm(session, 'products', 'delete');

  const id = await routeId(ctx);
  const before = await prisma.product.findUnique({ where: { id } });
  if (!before) throw new HttpError(404, 'NAO_ENCONTRADO', 'Produto não encontrado.');

  await prisma.product.delete({ where: { id } });
  await prisma.auditLog.create({
    data: {
      userId: session.id,
      userName: session.name,
      entity: 'product',
      entityId: id,
      operation: 'DELETE',
      description: `Produto "${before.name}" excluído.`,
    },
  });
  return { ok: true };
});

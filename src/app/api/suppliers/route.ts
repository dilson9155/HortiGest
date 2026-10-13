import { z } from 'zod';
import { prisma } from '../../../lib/prisma';
import { handler } from '../../../lib/api-handler';
import { getSession, requirePerm, HttpError } from '../../../lib/session';

export const runtime = 'nodejs';

const schema = z.object({
  name: z.string().min(1, 'Informe o nome.').max(120),
  active: z.boolean().optional().default(true),
});

const updateSchema = schema.partial();

export const GET = handler(async (req) => {
  const session = await getSession(req);
  if (!session) throw new HttpError(401, 'UNAUTHORIZED', 'Autenticação necessária.');
  requirePerm(session, 'suppliers', 'view');

  const url = new URL(req.url);
  const q = url.searchParams.get('q') ?? '';
  const includeInactive = url.searchParams.get('includeInactive') === '1' || url.searchParams.get('includeInactive') === 'true';
  const page = Math.max(1, Number(url.searchParams.get('page') ?? 1));
  const pageSize = Math.min(200, Math.max(5, Number(url.searchParams.get('pageSize') ?? 50)));

  const where: any = {};
  if (!includeInactive) where.active = true;
  if (q) where.name = { contains: q, mode: 'insensitive' };

  const [items, total] = await Promise.all([
    prisma.supplier.findMany({
      where,
      orderBy: { name: 'asc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.supplier.count({ where }),
  ]);

  return { items, total, page, pageSize };
});

export const POST = handler(async (req) => {
  const session = await getSession(req);
  if (!session) throw new HttpError(401, 'UNAUTHORIZED', 'Autenticação necessária.');
  requirePerm(session, 'suppliers', 'create');

  const data = schema.parse(await req.json());

  const existing = await prisma.supplier.findUnique({ where: { name: data.name } });
  if (existing) throw new HttpError(409, 'DUPLICADO', 'Já existe um fornecedor com esse nome.', { name: data.name });

  const created = await prisma.supplier.create({ data });
  await prisma.auditLog.create({
    data: {
      userId: session.id,
      userName: session.name,
      entity: 'supplier',
      entityId: created.id,
      operation: 'CREATE',
      description: `Fornecedor "${created.name}" criado.`,
      newValues: { id: created.id, name: created.name, active: created.active },
    },
  });
  return created;
});

export const PUT = handler(async (req) => {
  const session = await getSession(req);
  if (!session) throw new HttpError(401, 'UNAUTHORIZED', 'Autenticação necessária.');
  requirePerm(session, 'suppliers', 'edit');

  const url = new URL(req.url);
  const id = url.pathname.split('/').pop();
  if (!id) throw new HttpError(400, 'INVALID', 'ID obrigatório.');

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

export const DELETE = handler(async (req) => {
  const session = await getSession(req);
  if (!session) throw new HttpError(401, 'UNAUTHORIZED', 'Autenticação necessária.');
  requirePerm(session, 'suppliers', 'delete');

  const url = new URL(req.url);
  const id = url.pathname.split('/').pop();
  if (!id) throw new HttpError(400, 'INVALID', 'ID obrigatório.');

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

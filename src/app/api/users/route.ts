import { z } from 'zod';
import { prisma } from '../../../lib/prisma';
import { hashPassword } from '../../../lib/auth';
import { handler } from '../../../lib/api-handler';
import { getSession, requirePerm, HttpError } from '../../../lib/session';

export const runtime = 'nodejs';

const createSchema = z.object({
  username: z
    .string()
    .min(3, 'Mínimo de 3 caracteres.')
    .max(40)
    .regex(/^[a-zA-Z0-9._-]+$/, 'Use apenas letras, números, ., _ ou -.'),
  name: z.string().min(1).max(120),
  email: z.string().email().optional().nullable().or(z.literal('')),
  password: z.string().min(8, 'Senha mínima de 8 caracteres.'),
  roleKind: z.enum(['ADMIN', 'SUPERVISOR', 'OPERADOR']),
  active: z.boolean().optional().default(true),
});

const updateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  email: z.string().email().optional().nullable().or(z.literal('')),
  password: z.string().min(8).optional(),
  roleKind: z.enum(['ADMIN', 'SUPERVISOR', 'OPERADOR']).optional(),
  active: z.boolean().optional(),
});

export const GET = handler(async (req) => {
  const session = await getSession(req);
  if (!session) throw new HttpError(401, 'UNAUTHORIZED', 'Autenticação necessária.');
  requirePerm(session, 'users', 'view');

  const url = new URL(req.url);
  const q = url.searchParams.get('q') ?? '';
  const page = Math.max(1, Number(url.searchParams.get('page') ?? 1));
  const pageSize = Math.min(200, Math.max(5, Number(url.searchParams.get('pageSize') ?? 25)));

  const where: any = {};
  if (q) {
    where.OR = [
      { name: { contains: q, mode: 'insensitive' } },
      { username: { contains: q, mode: 'insensitive' } },
      { email: { contains: q, mode: 'insensitive' } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { name: 'asc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { role: { select: { id: true, name: true, kind: true } } },
    }),
    prisma.user.count({ where }),
  ]);
  return { items, total, page, pageSize };
});

export const POST = handler(async (req) => {
  const session = await getSession(req);
  if (!session) throw new HttpError(401, 'UNAUTHORIZED', 'Autenticação necessária.');
  requirePerm(session, 'users', 'create');

  const data = createSchema.parse(await req.json());
  const existing = await prisma.user.findUnique({ where: { username: data.username } });
  if (existing) throw new HttpError(409, 'DUPLICADO', 'Já existe um usuário com esse login.');

  const role = await prisma.role.findUnique({ where: { kind: data.roleKind } });
  if (!role) throw new HttpError(400, 'INVALIDO', 'Perfil inválido.');

  const passwordHash = await hashPassword(data.password);
  const created = await prisma.user.create({
    data: {
      username: data.username,
      name: data.name,
      email: data.email || null,
      passwordHash,
      roleId: role.id,
      active: data.active ?? true,
    },
    include: { role: true },
  });
  await prisma.auditLog.create({
    data: {
      userId: session.id,
      userName: session.name,
      entity: 'user',
      entityId: created.id,
      operation: 'CREATE',
      description: `Usuário "${created.username}" criado.`,
    },
  });
  return created;
});

export const PUT = handler(async (req) => {
  const session = await getSession(req);
  if (!session) throw new HttpError(401, 'UNAUTHORIZED', 'Autenticação necessária.');
  requirePerm(session, 'users', 'edit');

  const url = new URL(req.url);
  const id = url.pathname.split('/').pop();
  if (!id) throw new HttpError(400, 'INVALID', 'ID obrigatório.');

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

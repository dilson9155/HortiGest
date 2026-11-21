import { z } from 'zod';
import { prisma } from './prisma';
import { handler } from './api-handler';
import { getSession, requirePerm, routeId, HttpError } from './session';

/**
 * Cadastros simples usados no recebimento (docas, conferentes e compradores).
 * Todos usam o módulo de permissão `products`, para não criar novos perfis no banco.
 */
export const REGISTRIES = {
  docks: { model: 'dock', label: 'Docа', entity: 'dock' },
  conferentes: { model: 'conferente', label: 'Conferente', entity: 'conferente' },
  compradores: { model: 'comprador', label: 'Comprador', entity: 'comprador' },
} as const;

export type RegistryKind = keyof typeof REGISTRIES;

export function registryConfig(kind: string | undefined) {
  const cfg = kind ? REGISTRIES[kind as RegistryKind] : undefined;
  if (!cfg) throw new HttpError(404, 'NAO_ENCONTRADO', 'Cadastro não encontrado.');
  return { kind: kind as RegistryKind, ...cfg };
}

const createSchema = z.object({
  name: z.string().min(1, 'Informe o nome.').max(120),
  active: z.boolean().optional().default(true),
});
const updateSchema = createSchema.partial();

const delegate = (model: string) => (prisma as any)[model];

export function registryListHandler(kind: RegistryKind) {
  return handler(async (req) => {
    const session = await getSession(req);
    if (!session) throw new HttpError(401, 'UNAUTHORIZED', 'Autenticação necessária.');
    requirePerm(session, 'products', 'view');

    const cfg = registryConfig(kind);
    const url = new URL(req.url);
    const q = url.searchParams.get('q') ?? '';
    const includeInactive = url.searchParams.get('includeInactive') === '1';
    const page = Math.max(1, Number(url.searchParams.get('page') ?? 1));
    const pageSize = Math.min(200, Math.max(5, Number(url.searchParams.get('pageSize') ?? 50)));

    const where: any = {};
    if (!includeInactive) where.active = true;
    if (q) where.name = { contains: q, mode: 'insensitive' };

    const db = delegate(cfg.model);
    const [items, total] = await Promise.all([
      db.findMany({ where, orderBy: { name: 'asc' }, skip: (page - 1) * pageSize, take: pageSize }),
      db.count({ where }),
    ]);
    return { items, total, page, pageSize };
  });
}

export function registryCreateHandler(kind: RegistryKind) {
  return handler(async (req) => {
    const session = await getSession(req);
    if (!session) throw new HttpError(401, 'UNAUTHORIZED', 'Autenticação necessária.');
    requirePerm(session, 'products', 'create');

    const cfg = registryConfig(kind);
    const data = createSchema.parse(await req.json());
    const db = delegate(cfg.model);
    const existing = await db.findUnique({ where: { name: data.name } });
    if (existing) throw new HttpError(409, 'DUPLICADO', `Já existe ${cfg.label.toLowerCase()} com esse nome.`);

    const created = await db.create({ data });
    await prisma.auditLog.create({
      data: {
        userId: session.id,
        userName: session.name,
        entity: cfg.entity,
        entityId: created.id,
        operation: 'CREATE',
        description: `${cfg.label} "${created.name}" criado.`,
        newValues: { id: created.id, name: created.name, active: created.active },
      },
    });
    return created;
  });
}

export function registryUpdateHandler(kind: RegistryKind) {
  return handler(async (req, ctx) => {
    const session = await getSession(req);
    if (!session) throw new HttpError(401, 'UNAUTHORIZED', 'Autenticação necessária.');
    requirePerm(session, 'products', 'edit');

    const cfg = registryConfig(kind);
    const id = await routeId(ctx);
    const data = updateSchema.parse(await req.json());
    const db = delegate(cfg.model);

    const before = await db.findUnique({ where: { id } });
    if (!before) throw new HttpError(404, 'NAO_ENCONTRADO', `${cfg.label} não encontrado.`);

    if (data.name && data.name !== before.name) {
      const dup = await db.findUnique({ where: { name: data.name } });
      if (dup) throw new HttpError(409, 'DUPLICADO', `Já existe ${cfg.label.toLowerCase()} com esse nome.`);
    }

    const after = await db.update({ where: { id }, data });
    await prisma.auditLog.create({
      data: {
        userId: session.id,
        userName: session.name,
        entity: cfg.entity,
        entityId: id,
        operation: 'UPDATE',
        description: `${cfg.label} "${before.name}" atualizado.`,
        oldValues: { id: before.id, name: before.name, active: before.active },
        newValues: { id: after.id, name: after.name, active: after.active },
      },
    });
    return after;
  });
}

export function registryDeleteHandler(kind: RegistryKind) {
  return handler(async (req, ctx) => {
    const session = await getSession(req);
    if (!session) throw new HttpError(401, 'UNAUTHORIZED', 'Autenticação necessária.');
    requirePerm(session, 'products', 'delete');

    const cfg = registryConfig(kind);
    const id = await routeId(ctx);
    const db = delegate(cfg.model);
    const before = await db.findUnique({ where: { id } });
    if (!before) throw new HttpError(404, 'NAO_ENCONTRADO', `${cfg.label} não encontrado.`);

    await db.delete({ where: { id } });
    await prisma.auditLog.create({
      data: {
        userId: session.id,
        userName: session.name,
        entity: cfg.entity,
        entityId: id,
        operation: 'DELETE',
        description: `${cfg.label} "${before.name}" excluído.`,
      },
    });
    return { ok: true };
  });
}

export function registryToggleHandler(kind: RegistryKind) {
  return handler(async (req, ctx) => {
    const session = await getSession(req);
    if (!session) throw new HttpError(401, 'UNAUTHORIZED', 'Autenticação necessária.');
    requirePerm(session, 'products', 'edit');

    const cfg = registryConfig(kind);
    const id = await routeId(ctx);
    const { active } = z.object({ active: z.boolean() }).parse(await req.json());
    const db = delegate(cfg.model);

    const before = await db.findUnique({ where: { id } });
    if (!before) throw new HttpError(404, 'NAO_ENCONTRADO', `${cfg.label} não encontrado.`);

    const after = await db.update({ where: { id }, data: { active } });
    await prisma.auditLog.create({
      data: {
        userId: session.id,
        userName: session.name,
        entity: cfg.entity,
        entityId: id,
        operation: 'UPDATE',
        description: `${cfg.label} "${before.name}" ${active ? 'ativado' : 'inativado'}.`,
        oldValues: { id: before.id, name: before.name, active: before.active },
        newValues: { id: after.id, name: after.name, active: after.active },
      },
    });
    return after;
  });
}

export function registryOptionsHandler(kind: RegistryKind) {
  return handler(async (req) => {
    const session = await getSession(req);
    if (!session) throw new HttpError(401, 'UNAUTHORIZED', 'Autenticação necessária.');

    const cfg = registryConfig(kind);
    const url = new URL(req.url);
    const includeInactive = url.searchParams.get('includeInactive') === '1';
    return delegate(cfg.model).findMany({
      where: includeInactive ? {} : { active: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, active: true },
    });
  });
}

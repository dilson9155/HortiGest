import { z } from 'zod';
import { prisma } from '../../../lib/prisma';
import { calcMissing, parseDateOnly } from '../../../lib/calc';
import { handler } from '../../../lib/api-handler';
import { getSession, requirePerm, HttpError } from '../../../lib/session';

export const runtime = 'nodejs';

const launchSchema = z.object({
  referenceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida (use AAAA-MM-DD).'),
  notes: z.string().max(500).optional().nullable(),
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        supplierId: z.string().min(1),
        received: z.number().nonnegative(),
        produced: z.number().nonnegative(),
        broken: z.number().nonnegative(),
        notes: z.string().max(500).optional().nullable(),
      }),
    )
    .min(1, 'Adicione pelo menos um produto.'),
});

export const GET = handler(async (req) => {
  const session = await getSession(req);
  if (!session) throw new HttpError(401, 'UNAUTHORIZED', 'Autenticação necessária.');
  requirePerm(session, 'launches', 'view');

  const url = new URL(req.url);
  const startDate = url.searchParams.get('startDate');
  const endDate = url.searchParams.get('endDate');
  const userId = url.searchParams.get('userId') ?? undefined;
  const q = url.searchParams.get('q') ?? '';
  const page = Math.max(1, Number(url.searchParams.get('page') ?? 1));
  const pageSize = Math.min(500, Math.max(5, Number(url.searchParams.get('pageSize') ?? 10)));

  const where: any = {};
  if (startDate || endDate) {
    where.referenceDate = {};
    const ds = parseDateOnly(startDate);
    if (ds) where.referenceDate.gte = ds;
    const de = parseDateOnly(endDate);
    if (de) where.referenceDate.lte = de;
  }
  if (userId) where.userId = userId;
  if (q) {
    where.OR = [
      { notes: { contains: q, mode: 'insensitive' } },
      { items: { some: { productName: { contains: q, mode: 'insensitive' } } } },
      { items: { some: { supplierName: { contains: q, mode: 'insensitive' } } } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.launch.findMany({
      where,
      orderBy: [{ referenceDate: 'desc' }, { createdAt: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { items: true, user: { select: { id: true, name: true, username: true } } },
    }),
    prisma.launch.count({ where }),
  ]);
  return { items, total, page, pageSize };
});

export const POST = handler(async (req) => {
  const session = await getSession(req);
  if (!session) throw new HttpError(401, 'UNAUTHORIZED', 'Autenticação necessária.');
  requirePerm(session, 'launches', 'create');

  const payload = launchSchema.parse(await req.json());
  const refDate = parseDateOnly(payload.referenceDate);
  if (!refDate) throw new HttpError(400, 'DATA_INVALIDA', 'Data inválida.');

  // Validar itens
  for (const it of payload.items) {
    if (it.produced + it.broken > it.received) {
      throw new HttpError(
        400,
        'EXCESSO_PRODUCAO',
        `Produzido + quebra excede recebido.`,
        { received: it.received, produced: it.produced, broken: it.broken },
      );
    }
  }

  // Validar duplicidade (data + produto + fornecedor)
  const keys = new Map<string, string>();
  for (const i of payload.items) {
    const k = `${i.productId}_${i.supplierId}`;
    keys.set(k, k);
  }
  if (keys.size !== payload.items.length) {
    throw new HttpError(409, 'DUPLICADO_FORMULARIO', 'O formulário tem linhas duplicadas (mesmo produto + fornecedor).');
  }

  const existing = await prisma.launchItem.findMany({
    where: {
      launch: { referenceDate: refDate },
      productId: { in: payload.items.map((i) => i.productId) },
      supplierId: { in: payload.items.map((i) => i.supplierId) },
    },
  });
  const have = new Set(existing.map((e) => `${e.productId}_${e.supplierId}`));
  const clashes: string[] = [];
  for (const k of keys.keys()) {
    if (have.has(k)) clashes.push(k);
  }
  if (clashes.length) {
    throw new HttpError(409, 'DUPLICADO', `Já existe lançamento nesta data para ${clashes.length} combinação(ões).`);
  }

  // Criar transação
  const created = await prisma.$transaction(async (tx) => {
    const launch = await tx.launch.create({
      data: {
        referenceDate: refDate,
        notes: payload.notes ?? null,
        userId: session.id,
      },
    });
    for (const it of payload.items) {
      const product = await tx.product.findUnique({ where: { id: it.productId } });
      const supplier = await tx.supplier.findUnique({ where: { id: it.supplierId } });
      if (!product || !product.active) throw new HttpError(400, 'PRODUTO_INATIVO', `Produto inativo.`);
      if (!supplier || !supplier.active) throw new HttpError(400, 'FORNECEDOR_INATIVO', `Fornecedor inativo.`);
      await tx.launchItem.create({
        data: {
          launchId: launch.id,
          productId: product.id,
          supplierId: supplier.id,
          productName: product.name,
          supplierName: supplier.name,
          boxKg: product.defaultBoxKg,
          received: it.received,
          produced: it.produced,
          broken: it.broken,
          missing: calcMissing(it.received, it.produced, it.broken),
          notes: it.notes ?? null,
        },
      });
    }
    return tx.launch.findUnique({
      where: { id: launch.id },
      include: { items: true, user: { select: { id: true, name: true, username: true } } },
    });
  });

  await prisma.auditLog.create({
    data: {
      userId: session.id,
      userName: session.name,
      entity: 'launch',
      entityId: (created as any).id,
      operation: 'CREATE',
      description: `Lançamento criado para ${payload.referenceDate} com ${(created as any).items.length} item(ns).`,
    },
  });

  return created;
});

export const DELETE = handler(async (req) => {
  const session = await getSession(req);
  if (!session) throw new HttpError(401, 'UNAUTHORIZED', 'Autenticação necessária.');
  requirePerm(session, 'launches', 'delete');

  const url = new URL(req.url);
  const id = url.pathname.split('/').pop();
  if (!id) throw new HttpError(400, 'INVALID', 'ID obrigatório.');

  const before = await prisma.launch.findUnique({ where: { id }, include: { items: true } });
  if (!before) throw new HttpError(404, 'NAO_ENCONTRADO', 'Lançamento não encontrado.');

  await prisma.$transaction([
    prisma.launchItem.deleteMany({ where: { launchId: id } }),
    prisma.launch.delete({ where: { id } }),
  ]);
  await prisma.auditLog.create({
    data: {
      userId: session.id,
      userName: session.name,
      entity: 'launch',
      entityId: id,
      operation: 'DELETE',
      description: `Lançamento de ${before.referenceDate?.toISOString?.()?.slice(0, 10)} excluído (${before.items.length} item(ns)).`,
    },
  });
  return { ok: true };
});

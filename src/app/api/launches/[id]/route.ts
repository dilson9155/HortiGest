import { z } from 'zod';
import { prisma } from '../../../../lib/prisma';
import { calcMissing, parseDateOnly } from '../../../../lib/calc';
import { handler } from '../../../../lib/api-handler';
import { getSession, requirePerm, routeId, HttpError } from '../../../../lib/session';

export const runtime = 'nodejs';

const launchSchema = z.object({
  referenceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida (use AAAA-MM-DD).'),
  status: z.enum(['PREVISTO', 'CONFIRMADO']).optional().default('CONFIRMADO'),
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

export const GET = handler(async (req, ctx) => {
  const session = await getSession(req);
  if (!session) throw new HttpError(401, 'UNAUTHORIZED', 'Autenticação necessária.');
  requirePerm(session, 'launches', 'view');

  const id = await routeId(ctx);
  const launch = await prisma.launch.findUnique({
    where: { id },
    include: { items: true, user: { select: { id: true, name: true, username: true } } },
  });
  if (!launch) throw new HttpError(404, 'NAO_ENCONTRADO', 'Lançamento não encontrado.');
  return launch;
});

export const PUT = handler(async (req, ctx) => {
  const session = await getSession(req);
  if (!session) throw new HttpError(401, 'UNAUTHORIZED', 'Autenticação necessária.');
  requirePerm(session, 'launches', 'edit');

  const id = await routeId(ctx);
  const payload = launchSchema.parse(await req.json());
  const refDate = parseDateOnly(payload.referenceDate);
  if (!refDate) throw new HttpError(400, 'DATA_INVALIDA', 'Data inválida.');

  const before = await prisma.launch.findUnique({ where: { id }, include: { items: true } });
  if (!before) throw new HttpError(404, 'NAO_ENCONTRADO', 'Lançamento não encontrado.');

  for (const it of payload.items) {
    if (it.produced + it.broken > it.received) {
      throw new HttpError(400, 'EXCESSO_PRODUCAO', 'Produzido + quebra excede recebido.', {
        received: it.received,
        produced: it.produced,
        broken: it.broken,
      });
    }
  }

  // Duplicidade (data + produto + fornecedor), ignorando os itens do próprio lançamento.
  // Só vale para CONFIRMADO — "previsões" (PREVISTO) não bloqueiam.
  if (payload.status === 'CONFIRMADO') {
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
        launchId: { not: id },
        launch: { referenceDate: refDate, status: 'CONFIRMADO' },
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
      throw new HttpError(
        409,
        'DUPLICADO',
        `Outro lançamento nesta data já usa ${clashes.length} combinação(ões) de mercadoria + fornecedor. ` +
          `Ajuste a data ou os itens para continuar.`,
      );
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.launchItem.deleteMany({ where: { launchId: id } });
    await tx.launch.update({
      where: { id },
      data: { referenceDate: refDate, status: payload.status, notes: payload.notes ?? null },
    });
    for (const it of payload.items) {
      const product = await tx.product.findUnique({ where: { id: it.productId } });
      const supplier = await tx.supplier.findUnique({ where: { id: it.supplierId } });
      if (!product) throw new HttpError(400, 'PRODUTO_INVALIDO', 'Produto não encontrado.');
      if (!supplier) throw new HttpError(400, 'FORNECEDOR_INVALIDO', 'Fornecedor não encontrado.');
      await tx.launchItem.create({
        data: {
          launchId: id,
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
      where: { id },
      include: { items: true, user: { select: { id: true, name: true, username: true } } },
    });
  });

  await prisma.auditLog.create({
    data: {
      userId: session.id,
      userName: session.name,
      entity: 'launch',
      entityId: id,
      operation: 'UPDATE',
      description: `${payload.status === 'PREVISTO' ? 'Previsão de chegada' : 'Lançamento'} de ${payload.referenceDate} atualizado(a) (${payload.items.length} item(ns)).`,
    },
  });

  return updated;
});

export const DELETE = handler(async (req, ctx) => {
  const session = await getSession(req);
  if (!session) throw new HttpError(401, 'UNAUTHORIZED', 'Autenticação necessária.');
  requirePerm(session, 'launches', 'delete');

  const id = await routeId(ctx);
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

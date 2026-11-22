import { prisma } from '../../../lib/prisma';
import { applyBuyerGuard } from '../../../lib/launch-guard';
import { handler } from '../../../lib/api-handler';
import { getSession, requirePerm, HttpError } from '../../../lib/session';
import {
  assertNoDuplicateReceived,
  launchInclude,
  launchSchema,
  launchStatusFor,
  normalizeLaunch,
  resolveReceivingRefs,
  writeItems,
} from '../../../lib/launch-service';

export const runtime = 'nodejs';

export const GET = handler(async (req) => {
  const session = await getSession(req);
  if (!session) throw new HttpError(401, 'UNAUTHORIZED', 'Autenticação necessária.');
  requirePerm(session, 'launches', 'view');

  const url = new URL(req.url);
  const startDate = url.searchParams.get('startDate');
  const endDate = url.searchParams.get('endDate');
  const userId = url.searchParams.get('userId') ?? undefined;
  const dockId = url.searchParams.get('dockId') ?? undefined;
  const conferenteId = url.searchParams.get('conferenteId') ?? undefined;
  const compradorId = url.searchParams.get('compradorId') ?? undefined;
  const productId = url.searchParams.get('productId') ?? undefined;
  const supplierId = url.searchParams.get('supplierId') ?? undefined;
  const q = url.searchParams.get('q') ?? '';
  const page = Math.max(1, Number(url.searchParams.get('page') ?? 1));
  const pageSize = Math.min(500, Math.max(5, Number(url.searchParams.get('pageSize') ?? 10)));

  // view=pending -> lançamentos ainda não concluídos; todos os itens ficam juntos
  // enquanto o conferente não termina a parte dele.
  // view=received -> lançamentos concluídos (estoque real).
  const view = url.searchParams.get('view');
  const legacyStatus = url.searchParams.get('status');
  const itemStatus =
    legacyStatus === 'PREVISTO' ? 'PREVISTO' : legacyStatus === 'CONFIRMADO' ? 'RECEBIDO' : undefined;

  const where: any = {};
  if (view === 'pending') where.status = 'PREVISTO';
  if (view === 'received') where.status = 'CONFIRMADO';
  if (startDate || endDate) {
    where.referenceDate = {};
    if (startDate) where.referenceDate.gte = new Date(`${startDate}T00:00:00.000Z`);
    if (endDate) where.referenceDate.lte = new Date(`${endDate}T00:00:00.000Z`);
  }
  if (userId) where.userId = userId;

  const itemWhere: any = {};
  if (itemStatus) itemWhere.status = itemStatus;
  if (productId) itemWhere.productId = productId;
  if (supplierId) itemWhere.supplierId = supplierId;
  // Filtros por responsável/doca usam o dado gravado no ITEM, com fallback
  // para o lançamento (histórico migrado).
  const itemAnds: any[] = [];
  if (dockId) itemAnds.push({ OR: [{ dockId }, { launch: { dockId } }] });
  if (conferenteId) itemAnds.push({ OR: [{ conferenteId }, { launch: { conferenteId } }] });
  if (compradorId) itemAnds.push({ OR: [{ compradorId }, { launch: { compradorId } }] });
  if (itemAnds.length) itemWhere.AND = itemAnds;
  if (Object.keys(itemWhere).length) where.items = { some: itemWhere };

  if (q) {
    where.OR = [
      { notes: { contains: q, mode: 'insensitive' } },
      { dockName: { contains: q, mode: 'insensitive' } },
      { items: { some: { productName: { contains: q, mode: 'insensitive' } } } },
      { items: { some: { supplierName: { contains: q, mode: 'insensitive' } } } },
      { items: { some: { notes: { contains: q, mode: 'insensitive' } } } },
      { items: { some: { compradorName: { contains: q, mode: 'insensitive' } } } },
      { items: { some: { conferenteName: { contains: q, mode: 'insensitive' } } } },
      { items: { some: { dockName: { contains: q, mode: 'insensitive' } } } },
    ];
  }

  const include: any = { ...launchInclude };
  if (Object.keys(itemWhere).length) {
    include.items = { where: itemWhere, orderBy: { productName: 'asc' } };
  }

  const [items, total] = await Promise.all([
    prisma.launch.findMany({
      where,
      orderBy: [{ referenceDate: 'desc' }, { createdAt: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include,
    }),
    prisma.launch.count({ where }),
  ]);
  return { items, total, page, pageSize };
});

export const POST = handler(async (req) => {
  const session = await getSession(req);
  if (!session) throw new HttpError(401, 'UNAUTHORIZED', 'Autenticação necessária.');
  requirePerm(session, 'launches', 'create');

  const parsed = launchSchema.parse(await req.json());
  const payload = applyBuyerGuard(parsed, session);
  const { refDate, items, received } = normalizeLaunch(payload);
  await assertNoDuplicateReceived(refDate, received);

  const created = await prisma.$transaction(async (tx) => {
    const refs = await resolveReceivingRefs(tx, payload, items);
    const launch = await tx.launch.create({
      data: {
        referenceDate: refDate,
        status: launchStatusFor(items),
        notes: payload.notes ?? null,
        dockId: refs.dockId,
        dockName: refs.dockName,
        conferenteId: refs.conferenteId,
        conferenteName: refs.conferenteName,
        compradorId: refs.compradorId,
        compradorName: refs.compradorName,
        userId: session.id,
      },
    });
    await writeItems(tx, launch.id, items);
    return tx.launch.findUnique({ where: { id: launch.id }, include: launchInclude });
  });

  await prisma.auditLog.create({
    data: {
      userId: session.id,
      userName: session.name,
      entity: 'launch',
      entityId: (created as any).id,
      operation: 'CREATE',
      description: `Lançamento de ${payload.referenceDate} criado com ${received.length} produto(s) recebido(s) e ${items.length - received.length} previsão(ões).`,
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

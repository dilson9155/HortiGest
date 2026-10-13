import { prisma } from '../../../lib/prisma';
import { handler } from '../../../lib/api-handler';
import { getSession, requirePerm, HttpError } from '../../../lib/session';

export const runtime = 'nodejs';

export const GET = handler(async (req) => {
  const session = await getSession(req);
  if (!session) throw new HttpError(401, 'UNAUTHORIZED', 'Autenticação necessária.');
  requirePerm(session, 'dashboard', 'view');

  const url = new URL(req.url);
  const startDate = url.searchParams.get('startDate');
  const endDate = url.searchParams.get('endDate');
  const productId = url.searchParams.get('productId');
  const supplierId = url.searchParams.get('supplierId');

  const launchWhere: any = {};
  if (startDate || endDate) {
    launchWhere.referenceDate = {};
    if (startDate) {
      const d = new Date(startDate + 'T00:00:00.000Z');
      if (!isNaN(d.getTime())) launchWhere.referenceDate.gte = d;
    }
    if (endDate) {
      const d = new Date(endDate + 'T00:00:00.000Z');
      if (!isNaN(d.getTime())) launchWhere.referenceDate.lte = d;
    }
  }
  const itemWhere: any = { launch: launchWhere };
  if (productId) itemWhere.productId = productId;
  if (supplierId) itemWhere.supplierId = supplierId;

  const [agg, launchesCount] = await Promise.all([
    prisma.launchItem.aggregate({
      _sum: { received: true, produced: true, broken: true, missing: true },
      _count: { id: true },
      where: itemWhere,
    }),
    prisma.launch.count({ where: launchWhere }),
  ]);

  const received = Number(agg._sum.received ?? 0);
  const produced = Number(agg._sum.produced ?? 0);
  const broken = Number(agg._sum.broken ?? 0);
  const missing = Number(agg._sum.missing ?? 0);
  const items = agg._count.id;

  const percent = (a: number, b: number) => (b > 0 ? (a / b) * 100 : 0);

  const cards = {
    totalReceivedBoxes: Number(received.toFixed(3)),
    totalProducedBoxes: Number(produced.toFixed(3)),
    totalBrokenBoxes: Number(broken.toFixed(3)),
    totalMissingBoxes: Number(missing.toFixed(3)),
    totalLaunchItems: items,
    totalLaunches: launchesCount,
    aproveitamentoPercent: Number(percent(produced, received).toFixed(2)),
    quebraPercent: Number(percent(broken, received).toFixed(2)),
    faltaPercent: Number(percent(missing, received).toFixed(2)),
  };

  // Produção por dia
  const grouped = await prisma.launchItem.groupBy({
    by: ['launchId'],
    where: itemWhere,
    _sum: { received: true, produced: true, broken: true, missing: true },
  });
  const launches = await prisma.launch.findMany({ where: launchWhere, select: { id: true, referenceDate: true } });
  const launchMap = new Map(launches.map((l) => [l.id, l.referenceDate]));
  const dailyMap = new Map<string, any>();
  for (const g of grouped) {
    const date = launchMap.get(g.launchId);
    if (!date) continue;
    const k = date.toISOString().slice(0, 10);
    const cur = dailyMap.get(k) ?? { date: k, received: 0, produced: 0, broken: 0, missing: 0 };
    cur.received += Number(g._sum.received ?? 0);
    cur.produced += Number(g._sum.produced ?? 0);
    cur.broken += Number(g._sum.broken ?? 0);
    cur.missing += Number(g._sum.missing ?? 0);
    dailyMap.set(k, cur);
  }
  const productionDaily = [...dailyMap.values()].sort((a, b) => a.date.localeCompare(b.date));

  // Por produto
  const byProduct = await prisma.launchItem.groupBy({
    by: ['productId'],
    where: itemWhere,
    _sum: { received: true, produced: true, broken: true, missing: true },
    orderBy: { _sum: { broken: 'desc' } },
    take: 20,
  });
  const products = await prisma.product.findMany({
    where: { id: { in: byProduct.map((p) => p.productId) } },
    select: { id: true, name: true },
  });
  const pMap = new Map(products.map((p) => [p.id, p.name]));
  const productChart = byProduct.map((p) => ({
    productId: p.productId,
    productName: pMap.get(p.productId) ?? '—',
    received: Number(p._sum.received ?? 0),
    produced: Number(p._sum.produced ?? 0),
    broken: Number(p._sum.broken ?? 0),
    missing: Number(p._sum.missing ?? 0),
  }));

  // Por fornecedor
  const bySupplier = await prisma.launchItem.groupBy({
    by: ['supplierId'],
    where: itemWhere,
    _sum: { received: true, produced: true, broken: true, missing: true },
    orderBy: { _sum: { received: 'desc' } },
    take: 20,
  });
  const suppliers = await prisma.supplier.findMany({
    where: { id: { in: bySupplier.map((p) => p.supplierId) } },
    select: { id: true, name: true },
  });
  const sMap = new Map(suppliers.map((p) => [p.id, p.name]));
  const supplierChart = bySupplier.map((p) => ({
    supplierId: p.supplierId,
    supplierName: sMap.get(p.supplierId) ?? '—',
    received: Number(p._sum.received ?? 0),
    produced: Number(p._sum.produced ?? 0),
    broken: Number(p._sum.broken ?? 0),
    missing: Number(p._sum.missing ?? 0),
  }));

  // Lançamentos recentes
  const recent = await prisma.launch.findMany({
    where: launchWhere,
    orderBy: { createdAt: 'desc' },
    take: 10,
    include: { items: true, user: { select: { id: true, name: true, username: true } } },
  });

  return { cards, productionDaily, productChart, supplierChart, recent };
});

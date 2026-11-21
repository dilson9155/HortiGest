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

  const launchWhere: any = {
    items: { some: { status: 'RECEBIDO' } },
  };
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
  const itemWhere: any = { launch: launchWhere, status: 'RECEBIDO' };
  if (productId) itemWhere.productId = productId;
  if (supplierId) itemWhere.supplierId = supplierId;

  const [agg, launchesCount] = await Promise.all([
    prisma.launchItem.aggregate({
      _sum: { forecast: true, received: true },
      _count: { id: true },
      where: itemWhere,
    }),
    prisma.launch.count({ where: launchWhere }),
  ]);

  const forecast = Number(agg._sum.forecast ?? 0);
  const received = Number(agg._sum.received ?? 0);
  // Delta = previsão - recebido.
  const delta = forecast - received;
  const items = agg._count.id;

  const percent = (a: number, b: number) => (b > 0 ? (a / b) * 100 : 0);

  const cards = {
    totalForecastBoxes: Number(forecast.toFixed(3)),
    totalReceivedBoxes: Number(received.toFixed(3)),
    totalDeltaBoxes: Number(delta.toFixed(3)),
    totalLaunchItems: items,
    totalLaunches: launchesCount,
    atendimentoPercent: Number(percent(received, forecast).toFixed(2)),
    deltaPercent: Number(percent(delta, forecast).toFixed(2)),
  };

  // Recebimento por dia
  const grouped = await prisma.launchItem.groupBy({
    by: ['launchId'],
    where: itemWhere,
    _sum: { forecast: true, received: true },
  });
  const launches = await prisma.launch.findMany({ where: launchWhere, select: { id: true, referenceDate: true } });
  const launchMap = new Map(launches.map((l) => [l.id, l.referenceDate]));
  const dailyMap = new Map<string, any>();
  for (const g of grouped) {
    const date = launchMap.get(g.launchId);
    if (!date) continue;
    const k = date.toISOString().slice(0, 10);
    const cur = dailyMap.get(k) ?? { date: k, forecast: 0, received: 0, delta: 0 };
    cur.forecast += Number(g._sum.forecast ?? 0);
    cur.received += Number(g._sum.received ?? 0);
    cur.delta += Number(g._sum.forecast ?? 0) - Number(g._sum.received ?? 0);
    dailyMap.set(k, cur);
  }
  const productionDaily = [...dailyMap.values()].sort((a, b) => a.date.localeCompare(b.date));

  // Por produto
  const byProduct = await prisma.launchItem.groupBy({
    by: ['productId'],
    where: itemWhere,
    _sum: { forecast: true, received: true },
    orderBy: { _sum: { received: 'desc' } },
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
    forecast: Number(p._sum.forecast ?? 0),
    received: Number(p._sum.received ?? 0),
    delta: Number(p._sum.forecast ?? 0) - Number(p._sum.received ?? 0),
  }));

  // Por fornecedor
  const bySupplier = await prisma.launchItem.groupBy({
    by: ['supplierId'],
    where: itemWhere,
    _sum: { forecast: true, received: true },
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
    forecast: Number(p._sum.forecast ?? 0),
    received: Number(p._sum.received ?? 0),
    delta: Number(p._sum.forecast ?? 0) - Number(p._sum.received ?? 0),
  }));

  const recent = await prisma.launch.findMany({
    where: launchWhere,
    orderBy: { createdAt: 'desc' },
    take: 10,
    include: {
      items: { where: { status: 'RECEBIDO' } },
      user: { select: { id: true, name: true, username: true } },
      dock: { select: { name: true } },
    },
  });

  return { cards, productionDaily, productChart, supplierChart, recent };
});

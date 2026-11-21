import { prisma } from '../../../../lib/prisma';
import { parseDateOnly } from '../../../../lib/calc';
import { handler } from '../../../../lib/api-handler';
import { getSession, requirePerm, HttpError } from '../../../../lib/session';

export const runtime = 'nodejs';

export const GET = handler(async (req) => {
  const session = await getSession(req);
  if (!session) throw new HttpError(401, 'UNAUTHORIZED', 'Autenticação necessária.');
  requirePerm(session, 'reports', 'view');

  const url = new URL(req.url);
  const startDate = url.searchParams.get('startDate');
  const endDate = url.searchParams.get('endDate');
  const productId = url.searchParams.get('productId');
  const supplierId = url.searchParams.get('supplierId');
  const userId = url.searchParams.get('userId');
  const dockId = url.searchParams.get('dockId');
  const conferenteId = url.searchParams.get('conferenteId');
  const compradorId = url.searchParams.get('compradorId');
  const deltaFilter = url.searchParams.get('delta');

  const where: any = { status: 'RECEBIDO' };
  if (startDate || endDate) {
    where.launch = where.launch ?? {};
    where.launch.referenceDate = {};
    const ds = parseDateOnly(startDate);
    if (ds) where.launch.referenceDate.gte = ds;
    const de = parseDateOnly(endDate);
    if (de) where.launch.referenceDate.lte = de;
  }
  if (userId) {
    where.launch = where.launch ?? {};
    where.launch.userId = userId;
  }
  if (dockId) {
    where.launch = where.launch ?? {};
    where.launch.dockId = dockId;
  }
  if (conferenteId) {
    where.launch = where.launch ?? {};
    where.launch.conferenteId = conferenteId;
  }
  if (compradorId) {
    where.launch = where.launch ?? {};
    where.launch.compradorId = compradorId;
  }
  if (productId) where.productId = productId;
  if (supplierId) where.supplierId = supplierId;

  const rows = await prisma.launchItem.findMany({
    where,
    include: {
      launch: {
        select: {
          referenceDate: true,
          dockName: true,
          conferenteName: true,
          compradorName: true,
          user: { select: { name: true, username: true } },
        },
      },
    },
    orderBy: [{ launch: { referenceDate: 'desc' } }, { entryTime: 'asc' }, { productName: 'asc' }],
  });

  const items = rows
    .map((it) => ({
      id: it.id,
      referenceDate: (it.launch as any).referenceDate,
      productName: it.productName,
      supplierName: it.supplierName,
      boxKg: String(it.boxKg),
      forecast: String(it.forecast),
      received: String(it.received),
      delta: Number(it.received) - Number(it.forecast),
      entryTime: it.entryTime,
      notes: it.notes,
      dockName: (it.launch as any).dockName ?? '—',
      conferenteName: (it.launch as any).conferenteName ?? '—',
      compradorName: (it.launch as any).compradorName ?? '—',
      launch: {
        referenceDate: (it.launch as any).referenceDate,
        user: (it.launch as any).user,
      },
    }))
    .filter((it) => {
      if (deltaFilter === 'MAIS') return it.delta > 0;
      if (deltaFilter === 'MENOS') return it.delta < 0;
      if (deltaFilter === 'OK') return it.delta === 0;
      return true;
    });

  const totals = items.reduce(
    (acc, it) => {
      const forecast = Number(it.forecast);
      const received = Number(it.received);
      const kg = Number(it.boxKg);
      acc.forecast += forecast;
      acc.received += received;
      acc.delta += it.delta;
      acc.forecastKg += forecast * kg;
      acc.receivedKg += received * kg;
      acc.deltaKg += it.delta * kg;
      return acc;
    },
    { forecast: 0, received: 0, delta: 0, forecastKg: 0, receivedKg: 0, deltaKg: 0 },
  );

  return { items, totals };
});

import { prisma } from '../../../../lib/prisma';
import { parseDateOnly } from '../../../../lib/calc';
import { handler } from '../../../../lib/api-handler';
import { getSession, requireAnyPerm, HttpError } from '../../../../lib/session';

export const runtime = 'nodejs';

export const GET = handler(async (req) => {
  const session = await getSession(req);
  if (!session) throw new HttpError(401, 'UNAUTHORIZED', 'Autenticação necessária.');
  // O módulo "Produtos recebidos" usa a permissão de lançamentos;
  // relatórios continuam acessíveis para quem tem permissão de relatórios.
  requireAnyPerm(session, [
    { module: 'reports', action: 'view' },
    { module: 'launches', action: 'view' },
  ]);

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
  const q = (url.searchParams.get('q') ?? '').trim();
  const timeFrom = url.searchParams.get('timeFrom');
  const timeTo = url.searchParams.get('timeTo');

  // Só entram no estoque real os lançamentos concluídos pelo conferente.
  const where: any = { status: 'RECEBIDO', launch: { status: 'CONFIRMADO' } };
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
  // Responsáveis/doca são gravados por item; mantemos fallback do lançamento.
  if (dockId) where.AND = [...(where.AND ?? []), { OR: [{ dockId }, { launch: { dockId } }] }];
  if (conferenteId) where.AND = [...(where.AND ?? []), { OR: [{ conferenteId }, { launch: { conferenteId } }] }];
  if (compradorId) where.AND = [...(where.AND ?? []), { OR: [{ compradorId }, { launch: { compradorId } }] }];
  if (productId) where.productId = productId;
  if (supplierId) where.supplierId = supplierId;
  if (timeFrom || timeTo) {
    where.entryTime = where.entryTime ?? {};
    if (timeFrom) where.entryTime.gte = timeFrom;
    if (timeTo) where.entryTime.lte = timeTo;
  }
  if (q) {
    where.OR = [
      { productName: { contains: q, mode: 'insensitive' } },
      { supplierName: { contains: q, mode: 'insensitive' } },
      { notes: { contains: q, mode: 'insensitive' } },
      { dockName: { contains: q, mode: 'insensitive' } },
      { conferenteName: { contains: q, mode: 'insensitive' } },
      { compradorName: { contains: q, mode: 'insensitive' } },
      { launch: { dockName: { contains: q, mode: 'insensitive' } } },
      { launch: { conferenteName: { contains: q, mode: 'insensitive' } } },
      { launch: { compradorName: { contains: q, mode: 'insensitive' } } },
    ];
  }

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
      launchId: it.launchId,
      referenceDate: (it.launch as any).referenceDate,
      productName: it.productName,
      supplierName: it.supplierName,
      boxKg: String(it.boxKg),
      forecast: String(it.forecast),
      received: String(it.received),
      rendimento: String(it.rendimento),
      delta: Number(it.received) - Number(it.forecast),
      // Dois horários por item: previsão do comprador e lançamento do conferente.
      forecastTime: it.forecastTime,
      entryTime: it.entryTime,
      notes: it.notes,
      dockName: it.dockName || (it.launch as any).dockName || '—',
      conferenteName: it.conferenteName || (it.launch as any).conferenteName || '—',
      compradorName: it.compradorName || (it.launch as any).compradorName || '—',
      launch: {
        referenceDate: (it.launch as any).referenceDate,
        user: (it.launch as any).user,
      },
    }))
    .filter((it) => {
      // delta = recebido - previsão: veio a mais => positivo; veio a menos => negativo.
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
      acc.rendimento += Number(it.rendimento);
      acc.delta += it.delta;
      acc.forecastKg += forecast * kg;
      acc.receivedKg += received * kg;
      acc.deltaKg += it.delta * kg;
      return acc;
    },
    { forecast: 0, received: 0, rendimento: 0, delta: 0, forecastKg: 0, receivedKg: 0, deltaKg: 0 },
  );

  return { items, totals };
});

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
  const entity = url.searchParams.get('entity');

  const where: any = {};
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
  if (productId) where.productId = productId;
  if (supplierId) where.supplierId = supplierId;
  if (entity === 'BREAK') where.broken = { gt: 0 };
  if (entity === 'MISSING') where.missing = { gt: 0 };
  // Relatórios consideram apenas lançamentos confirmados (previsões ficam de fora).
  where.launch = { ...(where.launch ?? {}), status: 'CONFIRMADO' };

  const items = await prisma.launchItem.findMany({
    where,
    include: { launch: { select: { referenceDate: true, user: { select: { name: true, username: true } } } } },
    orderBy: [{ launch: { referenceDate: 'desc' } }, { launch: { createdAt: 'desc' } }],
  });

  const totals = items.reduce(
    (acc, it) => {
      acc.received += Number(it.received);
      acc.produced += Number(it.produced);
      acc.broken += Number(it.broken);
      acc.missing += Number(it.missing);
      acc.receivedKg += Number(it.received) * Number(it.boxKg);
      acc.producedKg += Number(it.produced) * Number(it.boxKg);
      acc.brokenKg += Number(it.broken) * Number(it.boxKg);
      acc.missingKg += Number(it.missing) * Number(it.boxKg);
      return acc;
    },
    { received: 0, produced: 0, broken: 0, missing: 0, receivedKg: 0, producedKg: 0, brokenKg: 0, missingKg: 0 },
  );

  return { items, totals };
});

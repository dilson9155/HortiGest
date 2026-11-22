import { handler } from '../../../../lib/api-handler';
import { getSession, requireAnyPerm, HttpError } from '../../../../lib/session';
import { queryReport } from '../../../../lib/report-query';

export const runtime = 'nodejs';

export const GET = handler(async (req) => {
  const session = await getSession(req);
  if (!session) throw new HttpError(401, 'UNAUTHORIZED', 'Autenticação necessária.');
  // O histórico de entradas usa a permissão de lançamentos;
  // relatórios continuam acessíveis para quem tem permissão de relatórios.
  requireAnyPerm(session, [
    { module: 'reports', action: 'view' },
    { module: 'launches', action: 'view' },
  ]);

  const { items, totals } = await queryReport(new URL(req.url));

  // Formato consumido pelas telas: números como string preservam casas decimais.
  return {
    items: items.map((it) => ({
      id: it.id,
      launchId: it.launchId,
      status: it.status,
      referenceDate: it.referenceDate,
      productName: it.productName,
      supplierName: it.supplierName,
      boxKg: String(it.boxKg),
      forecast: String(it.forecast),
      received: String(it.received),
      rendimento: String(it.rendimento),
      delta: it.delta,
      forecastTime: it.forecastTime,
      entryTime: it.entryTime,
      notes: it.notes,
      dockName: it.dockName,
      conferenteName: it.conferenteName,
      compradorName: it.compradorName,
      launch: {
        referenceDate: it.referenceDate,
        user: { name: it.userName, username: it.userUsername },
      },
    })),
    totals,
  };
});

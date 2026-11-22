import { prisma } from './prisma';
import { parseDateOnly } from './calc';

/**
 * Filtros e consulta compartilhados entre a tela de relatórios, o PDF e as
 * exportações (XLSX/CSV). Assim os quatro formatos nunca divergem.
 */
export type ReportParams = {
  startDate: string | null;
  endDate: string | null;
  productId: string | null;
  supplierId: string | null;
  userId: string | null;
  dockId: string | null;
  conferenteId: string | null;
  compradorId: string | null;
  delta: string | null;
  q: string;
  timeFrom: string | null;
  timeTo: string | null;
  history: boolean;
  status: string | null;
};

export type ReportRow = {
  id: string;
  launchId: string;
  status: string;
  referenceDate: Date;
  productName: string;
  supplierName: string;
  boxKg: number;
  forecast: number;
  received: number;
  rendimento: number;
  delta: number;
  forecastTime: string | null;
  entryTime: string | null;
  notes: string | null;
  dockName: string;
  conferenteName: string;
  compradorName: string;
  userName: string;
  userUsername: string;
};

export type ReportTotals = {
  forecast: number;
  received: number;
  rendimento: number;
  delta: number;
  forecastKg: number;
  receivedKg: number;
  deltaKg: number;
};

export function readReportParams(url: URL): ReportParams {
  const g = (key: string) => url.searchParams.get(key);
  return {
    startDate: g('startDate'),
    endDate: g('endDate'),
    productId: g('productId'),
    supplierId: g('supplierId'),
    userId: g('userId'),
    dockId: g('dockId'),
    conferenteId: g('conferenteId'),
    compradorId: g('compradorId'),
    delta: g('delta'),
    q: (g('q') ?? '').trim(),
    timeFrom: g('timeFrom'),
    timeTo: g('timeTo'),
    history: g('scope') === 'history',
    status: g('status'),
  };
}

function dateBR(value: unknown): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : (value as Date);
  if (isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}

export function reportPeriod(params: ReportParams): string {
  return `${params.startDate ? dateBR(params.startDate) : 'início'} a ${params.endDate ? dateBR(params.endDate) : 'hoje'}`;
}

/** Descrição legível dos filtros ativos, usada no cabeçalho dos arquivos exportados. */
export function reportFilterLabels(params: ReportParams): string {
  const labels: string[] = [];
  if (params.startDate || params.endDate) labels.push(`Período: ${reportPeriod(params)}`);
  if (params.productId || params.supplierId) {
    // Os nomes são resolvidos na tela; aqui mantemos apenas o que foi filtrado.
    if (params.productId) labels.push('Produto específico');
    if (params.supplierId) labels.push('Fornecedor específico');
  }
  if (params.dockId) labels.push('Docа específica');
  if (params.conferenteId) labels.push('Conferente específico');
  if (params.compradorId) labels.push('Comprador específico');
  if (params.delta === 'MAIS') labels.push('Veio a mais');
  if (params.delta === 'MENOS') labels.push('Veio a menos');
  if (params.delta === 'OK') labels.push('Sem diferença');
  if (params.q) labels.push(`Busca: "${params.q}"`);
  return labels.length ? labels.join('  •  ') : 'Todos os registros';
}

export async function queryReport(url: URL): Promise<{
  items: ReportRow[];
  totals: ReportTotals;
  params: ReportParams;
  period: string;
  companyName: string;
  emittedAt: string;
}> {
  const params = readReportParams(url);

  // Relatórios = estoque real (concluídos). Histórico = todos os registros.
  const where: any = params.history
    ? {}
    : { status: 'RECEBIDO', launch: { status: 'CONFIRMADO' } };
  if (params.status) where.status = params.status;
  if (params.startDate || params.endDate) {
    where.launch = where.launch ?? {};
    where.launch.referenceDate = {};
    const ds = parseDateOnly(params.startDate);
    if (ds) where.launch.referenceDate.gte = ds;
    const de = parseDateOnly(params.endDate);
    if (de) where.launch.referenceDate.lte = de;
  }
  if (params.userId) {
    where.launch = where.launch ?? {};
    where.launch.userId = params.userId;
  }
  // Responsáveis/doca são gravados por item; mantemos fallback do lançamento.
  if (params.dockId) where.AND = [...(where.AND ?? []), { OR: [{ dockId: params.dockId }, { launch: { dockId: params.dockId } }] }];
  if (params.conferenteId) where.AND = [...(where.AND ?? []), { OR: [{ conferenteId: params.conferenteId }, { launch: { conferenteId: params.conferenteId } }] }];
  if (params.compradorId) where.AND = [...(where.AND ?? []), { OR: [{ compradorId: params.compradorId }, { launch: { compradorId: params.compradorId } }] }];
  if (params.productId) where.productId = params.productId;
  if (params.supplierId) where.supplierId = params.supplierId;
  if (params.timeFrom || params.timeTo) {
    where.entryTime = where.entryTime ?? {};
    if (params.timeFrom) where.entryTime.gte = params.timeFrom;
    if (params.timeTo) where.entryTime.lte = params.timeTo;
  }
  if (params.q) {
    const contains = { contains: params.q, mode: 'insensitive' as const };
    where.OR = [
      { productName: contains },
      { supplierName: contains },
      { notes: contains },
      { dockName: contains },
      { conferenteName: contains },
      { compradorName: contains },
      { launch: { dockName: contains } },
      { launch: { conferenteName: contains } },
      { launch: { compradorName: contains } },
    ];
  }

  const rows = await prisma.launchItem.findMany({
    where,
    include: {
      launch: {
        select: {
          referenceDate: true,
          status: true,
          dockName: true,
          conferenteName: true,
          compradorName: true,
          user: { select: { name: true, username: true } },
        },
      },
    },
    orderBy: [{ launch: { referenceDate: 'desc' } }, { entryTime: 'asc' }, { productName: 'asc' }],
  });

  const items: ReportRow[] = rows
    .map((it) => {
      const launch = it.launch as any;
      return {
        id: it.id,
        launchId: it.launchId,
        status: it.status,
        referenceDate: launch?.referenceDate,
        productName: it.productName,
        supplierName: it.supplierName,
        boxKg: Number(it.boxKg),
        forecast: Number(it.forecast),
        received: Number(it.received),
        rendimento: Number(it.rendimento),
        delta: Number(it.received) - Number(it.forecast),
        forecastTime: it.forecastTime,
        entryTime: it.entryTime,
        notes: it.notes,
        dockName: it.dockName || launch?.dockName || '—',
        conferenteName: it.conferenteName || launch?.conferenteName || '—',
        compradorName: it.compradorName || launch?.compradorName || '—',
        userName: launch?.user?.name || '—',
        userUsername: launch?.user?.username || '',
      };
    })
    .filter((it) => {
      // delta = recebido - previsão: veio a mais => positivo; veio a menos => negativo.
      if (params.delta === 'MAIS') return it.delta > 0;
      if (params.delta === 'MENOS') return it.delta < 0;
      if (params.delta === 'OK') return it.delta === 0;
      return true;
    });

  const totals = items.reduce<ReportTotals>(
    (acc, it) => {
      acc.forecast += it.forecast;
      acc.received += it.received;
      acc.rendimento += it.rendimento;
      acc.delta += it.delta;
      acc.forecastKg += it.forecast * it.boxKg;
      acc.receivedKg += it.received * it.boxKg;
      acc.deltaKg += it.delta * it.boxKg;
      return acc;
    },
    { forecast: 0, received: 0, rendimento: 0, delta: 0, forecastKg: 0, receivedKg: 0, deltaKg: 0 },
  );

  const company = await prisma.systemSetting.findFirst({ where: { key: 'company.name' } });

  return {
    items,
    totals,
    params,
    period: reportPeriod(params),
    companyName: company?.value || 'HortiGest',
    emittedAt: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
  };
}

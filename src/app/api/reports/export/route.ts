import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { getSession, requireAnyPerm, HttpError } from '../../../../lib/session';
import {
  queryReport,
  reportFilterLabels,
  type ReportRow,
  type ReportTotals,
} from '../../../../lib/report-query';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TEAL = 'FF0F766E';
const TEAL_DARK = 'FF134E4A';
const TEAL_MID = 'FF115E59';
const GREEN = 'FF15803D';
const WHITE = 'FFFFFFFF';
const STRIPE = 'FFF1F5F9';
const BORDER = 'FFD6DEE6';
const RED_TEXT = 'FFB91C1C';
const GREEN_TEXT = 'FF047857';
const SLATE = 'FF334155';

const HEADERS = [
  'Data',
  'Hora prevista',
  'Hora lançamento',
  'Produto',
  'Fornecedor',
  'Previsão (cx)',
  'Recebido (cx)',
  'Rendimento',
  'Delta (cx)',
  'Docа',
  'Conferente',
  'Comprador',
  'Observações',
  'Situação',
  'Lançado por',
];

const WIDTHS = [14, 14, 16, 30, 28, 14, 14, 13, 13, 14, 20, 20, 48, 13, 20];

function isoBR(d: unknown): string {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : (d as Date);
  if (isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}

function num(v: number, decimals = 3): string {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: decimals });
}

function deltaText(v: number): string {
  return v === 0 ? '0' : `${v > 0 ? '+' : ''}${num(v)}`;
}

function cellValues(it: ReportRow): (string | number)[] {
  return [
    isoBR(it.referenceDate),
    it.forecastTime || '—',
    it.entryTime || '—',
    it.productName,
    it.supplierName,
    it.forecast,
    it.received,
    it.rendimento,
    it.delta,
    it.dockName,
    it.conferenteName,
    it.compradorName,
    it.notes || '—',
    it.status === 'RECEBIDO' ? 'Recebido' : 'Previsão',
    it.userName,
  ];
}

function styleTitle(sheet: ExcelJS.Worksheet, lastCol: number, title: string, subtitle: string) {
  sheet.mergeCells(1, 1, 1, lastCol);
  const t = sheet.getCell(1, 1);
  t.value = title;
  t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TEAL } };
  t.font = { name: 'Calibri', size: 17, bold: true, color: { argb: WHITE } };
  t.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  sheet.getRow(1).height = 34;

  sheet.mergeCells(2, 1, 2, lastCol);
  const s = sheet.getCell(2, 1);
  s.value = subtitle;
  s.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TEAL_DARK } };
  s.font = { name: 'Calibri', size: 10, color: { argb: 'FFCCFBF1' } };
  s.alignment = { vertical: 'middle', horizontal: 'left', indent: 1, wrapText: true };
  sheet.getRow(2).height = 24;

  // Linha 3 é preenchida pela rota com os filtros aplicados.
}

function kpi(
  sheet: ExcelJS.Worksheet,
  row: number,
  from: number,
  to: number,
  label: string,
  value: string,
  color: string,
) {
  sheet.mergeCells(row, from, row, to);
  sheet.mergeCells(row + 1, from, row + 1, to);
  const l = sheet.getCell(row, from);
  l.value = label;
  l.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
  l.font = { name: 'Calibri', size: 9, bold: true, color: { argb: WHITE } };
  l.alignment = { vertical: 'middle', horizontal: 'center' };
  const v = sheet.getCell(row + 1, from);
  v.value = value;
  v.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
  v.font = { name: 'Calibri', size: 15, bold: true, color: { argb: WHITE } };
  v.alignment = { vertical: 'middle', horizontal: 'center' };
  sheet.getRow(row).height = 20;
  sheet.getRow(row + 1).height = 28;
}

async function buildXlsx(
  ctx: Awaited<ReturnType<typeof queryReport>>,
  sessionName: string,
): Promise<Buffer> {
  const { items, totals, params, companyName, emittedAt } = ctx;
  const history = params.history;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'HortiGest';
  workbook.lastModifiedBy = sessionName;
  workbook.created = new Date();
  workbook.modified = new Date();

  const sheet = workbook.addWorksheet(history ? 'Histórico de Entradas' : 'Relatório de Recebimento', {
    properties: { defaultRowHeight: 20 },
    views: [{ state: 'frozen', xSplit: 2, ySplit: 6 }],
    pageSetup: {
      paperSize: 9, // A4
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      horizontalCentered: true,
      margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
    },
  });

  sheet.columns = WIDTHS.map((width) => ({ width }));

  styleTitle(
    sheet,
    HEADERS.length,
    `${companyName}  |  ${history ? 'HISTÓRICO DE ENTRADAS' : 'RELATÓRIO DE RECEBIMENTO'}`,
    `Período: ${ctx.period}    •    Emissão: ${emittedAt}    •    Usuário: ${sessionName}`,
  );
  sheet.mergeCells(3, 1, 3, HEADERS.length);
  const filterCell = sheet.getCell(3, 1);
  filterCell.value = `Filtros: ${reportFilterLabels(params)}`;
  filterCell.font = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FF475569' } };
  filterCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1, wrapText: true };

  kpi(sheet, 4, 1, 3, 'PREVISÃO', `${num(totals.forecast, 0)} cx`, 'FF1D4ED8');
  kpi(sheet, 4, 4, 6, 'RECEBIDO', `${num(totals.received, 0)} cx`, TEAL);
  kpi(sheet, 4, 7, 9, 'DELTA', deltaText(totals.delta), totals.delta < 0 ? RED_TEXT : 'FFB45309');
  kpi(sheet, 4, 10, 11, 'PRODUTOS', String(items.length), 'FF4338CA');
  kpi(sheet, 4, 12, 15, 'PESO TOTAL RECEBIDO', `${num(totals.receivedKg, 1)} kg`, GREEN);

  const headerRow = 7;
  const header = sheet.getRow(headerRow);
  header.values = HEADERS;
  header.height = 28;
  header.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TEAL_MID } };
    cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: WHITE } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = {
      top: { style: 'thin', color: { argb: TEAL_DARK } },
      left: { style: 'thin', color: { argb: TEAL_DARK } },
      bottom: { style: 'thin', color: { argb: TEAL_DARK } },
      right: { style: 'thin', color: { argb: TEAL_DARK } },
    };
  });

  items.forEach((it, index) => {
    const r = sheet.getRow(headerRow + 1 + index);
    r.values = cellValues(it) as any;
    r.height = it.notes && it.notes.length > 60 ? 38 : 22;
    r.eachCell((cell, colNumber) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: index % 2 === 1 ? STRIPE : WHITE },
      };
      cell.font = { name: 'Calibri', size: 10, color: { argb: SLATE } };
      cell.alignment = {
        vertical: 'middle',
        horizontal: colNumber >= 6 && colNumber <= 9 ? 'right' : 'left',
        wrapText: true,
      };
      cell.border = {
        bottom: { style: 'hair', color: { argb: BORDER } },
      };
      if (colNumber >= 6 && colNumber <= 9) cell.numFmt = '#,##0.###';
      if (colNumber === 4 || colNumber === 5) cell.font = { ...cell.font, bold: true };
      if (colNumber === 9) {
        cell.font = {
          name: 'Calibri',
          size: 10,
          bold: true,
          color: { argb: it.delta < 0 ? RED_TEXT : it.delta > 0 ? GREEN_TEXT : 'FF64748B' },
        };
      }
      if (colNumber === 14) {
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.font = {
          name: 'Calibri',
          size: 9,
          bold: true,
          color: { argb: it.status === 'RECEBIDO' ? GREEN_TEXT : 'FF64748B' },
        };
      }
    });
  });

  const totalsRow = headerRow + 1 + items.length;
  const tr = sheet.getRow(totalsRow);
  tr.values = [
    'TOTAIS', '', '', `${items.length} produto(s)`, '',
    totals.forecast, totals.received, totals.rendimento, totals.delta,
    '', '', '', '', '', '',
  ] as any;
  tr.height = 26;
  tr.eachCell((cell, colNumber) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TEAL_DARK } };
    cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: WHITE } };
    cell.alignment = { vertical: 'middle', horizontal: colNumber >= 6 && colNumber <= 9 ? 'right' : 'left' };
    cell.border = { top: { style: 'medium', color: { argb: GREEN } } };
    if (colNumber >= 6 && colNumber <= 9) cell.numFmt = '#,##0.###';
  });

  sheet.mergeCells(totalsRow + 1, 1, totalsRow + 1, HEADERS.length);
  const kg = sheet.getCell(totalsRow + 1, 1);
  kg.value = `Peso total (kg) — Previsão: ${num(totals.forecastKg, 1)}   •   Recebido: ${num(totals.receivedKg, 1)}   •   Delta: ${num(totals.deltaKg, 1)}`;
  kg.font = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FF475569' } };
  kg.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };

  if (items.length) {
    sheet.autoFilter = {
      from: { row: headerRow, column: 1 },
      to: { row: totalsRow - 1, column: HEADERS.length },
    };
  }

  // ---------- Segunda aba: resumo agregado por produto ----------
  const summary = workbook.addWorksheet('Resumo por Produto', {
    properties: { defaultRowHeight: 20 },
    views: [{ state: 'frozen', ySplit: 3 }],
  });
  summary.columns = [{ width: 36 }, { width: 12 }, { width: 14 }, { width: 14 }, { width: 13 }, { width: 15 }];
  summary.mergeCells(1, 1, 1, 6);
  const st = summary.getCell(1, 1);
  st.value = `${companyName}  |  RESUMO POR PRODUTO`;
  st.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TEAL } };
  st.font = { name: 'Calibri', size: 14, bold: true, color: { argb: WHITE } };
  st.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  summary.getRow(1).height = 30;
  summary.mergeCells(2, 1, 2, 6);
  const ss = summary.getCell(2, 1);
  ss.value = `Período: ${ctx.period}    •    ${items.length} item(ns)`;
  ss.font = { name: 'Calibri', size: 9, color: { argb: 'FF475569' } };
  summary.getRow(2).height = 20;

  const sumHeader = summary.getRow(3);
  sumHeader.values = ['Produto', 'Itens', 'Previsão (cx)', 'Recebido (cx)', 'Delta (cx)', 'Recebido (kg)'] as any;
  sumHeader.height = 24;
  sumHeader.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TEAL_MID } };
    cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: WHITE } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });

  const grouped = new Map<string, { count: number; forecast: number; received: number; delta: number; kg: number }>();
  for (const it of items) {
    const g = grouped.get(it.productName) ?? { count: 0, forecast: 0, received: 0, delta: 0, kg: 0 };
    g.count += 1;
    g.forecast += it.forecast;
    g.received += it.received;
    g.delta += it.delta;
    g.kg += it.received * it.boxKg;
    grouped.set(it.productName, g);
  }
  const groups = [...grouped.entries()].sort((a, b) => b[1].received - a[1].received);
  groups.forEach(([name, g], index) => {
    const r = summary.getRow(4 + index);
    r.values = [name, g.count, g.forecast, g.received, g.delta, g.kg] as any;
    r.eachCell((cell, col) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: index % 2 === 1 ? STRIPE : WHITE } };
      cell.font = { name: 'Calibri', size: 10, color: { argb: SLATE } };
      cell.alignment = { vertical: 'middle', horizontal: col === 1 ? 'left' : 'right', wrapText: true };
      if (col >= 3) cell.numFmt = '#,##0.###';
      if (col === 5) cell.font = { ...cell.font, bold: true, color: { argb: g.delta < 0 ? RED_TEXT : g.delta > 0 ? GREEN_TEXT : 'FF64748B' } };
    });
  });

  return Buffer.from((await workbook.xlsx.writeBuffer()) as any);
}

function buildCsv(ctx: Awaited<ReturnType<typeof queryReport>>): Buffer {
  const quote = (value: unknown) => {
    const s = value === null || value === undefined ? '' : String(value);
    return `"${s.replace(/"/g, '""')}"`;
  };
  const numeric = (value: number) => String(value).replace('.', ',');

  const lines: string[] = [];
  lines.push(HEADERS.map(quote).join(';'));
  for (const it of ctx.items) {
    const values = cellValues(it);
    lines.push(
      values
        .map((v, index) => {
          if (typeof v === 'number' && index >= 5 && index <= 8) return numeric(v);
          return quote(v);
        })
        .join(';'),
    );
  }
  lines.push(
    ['TOTAIS', '', '', `${ctx.items.length} produto(s)`, '',
      numeric(ctx.totals.forecast), numeric(ctx.totals.received), numeric(ctx.totals.rendimento),
      numeric(ctx.totals.delta), '', '', '', '', '', '']
      .map((v) => (v === '' ? '""' : /^-?\d+,\d+$/.test(v) ? v : quote(v)))
      .join(';'),
  );
  lines.push(quote(`Peso total (kg) — Previsão: ${numeric(ctx.totals.forecastKg)} | Recebido: ${numeric(ctx.totals.receivedKg)} | Delta: ${numeric(ctx.totals.deltaKg)}`));

  // BOM garante acentos corretos ao abrir no Excel em português.
  return Buffer.from(`\uFEFF${lines.join('\r\n')}`, 'utf8');
}

export async function GET(req: Request) {
  const session = await getSession(req);
  if (!session) throw new HttpError(401, 'UNAUTHORIZED', 'Autenticação necessária.');
  requireAnyPerm(session, [
    { module: 'reports', action: 'export' },
    { module: 'launches', action: 'view' },
    { module: 'launches_buyers', action: 'view' },
    { module: 'launches_reviewers', action: 'view' },
  ]);

  const url = new URL(req.url);
  const format = (url.searchParams.get('format') || 'xlsx').toLowerCase() === 'csv' ? 'csv' : 'xlsx';
  const ctx = await queryReport(url);
  const base = ctx.params.history ? 'historico-entradas' : 'relatorio-recebimento';
  const date = new Date().toISOString().slice(0, 10);
  const filename = `${base}-${date}.${format}`;

  const buffer = format === 'csv' ? buildCsv(ctx) : await buildXlsx(ctx, session.name);
  const contentType =
    format === 'csv'
      ? 'text/csv; charset=utf-8'
      : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

  return new NextResponse(buffer as any, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}

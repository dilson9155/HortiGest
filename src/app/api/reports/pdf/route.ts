import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import PDFDocument from 'pdfkit';
import { parseDateOnly } from '../../../../lib/calc';
import { getSession, requirePerm, HttpError } from '../../../../lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ===================== Formatação =====================

function numberBR(v: unknown, decimals = 3): string {
  const n = Number(v ?? 0);
  if (!isFinite(n) || n === 0) return '0';
  return n.toLocaleString('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}
const fmtInt = (v: unknown) => numberBR(v, 0);
const fmtDec = (v: unknown, d = 1) => numberBR(v, d);

function dateBR(d: unknown): string {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : (d as Date);
  if (isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}

function toBuffer(v: unknown): Buffer | null {
  if (!v) return null;
  try {
    const s = String(v);
    const base64 = s.includes('base64,') ? s.split('base64,')[1] : s;
    return Buffer.from(base64, 'base64');
  } catch {
    return null;
  }
}

async function getCompanyLogoBuffer(): Promise<Buffer | null> {
  try {
    const setting = await prisma.systemSetting.findFirst({ where: { key: 'company.logo' } });
    return setting?.value ? toBuffer(setting.value) : null;
  } catch {
    return null;
  }
}

// ===================== Rota =====================

export async function GET(req: Request) {
  const session = await getSession(req);
  if (!session) throw new HttpError(401, 'UNAUTHORIZED', 'Autenticação necessária.');
  requirePerm(session, 'reports', 'export');

  const url = new URL(req.url);
  const startDate = url.searchParams.get('startDate');
  const endDate = url.searchParams.get('endDate');
  const productId = url.searchParams.get('productId');
  const supplierId = url.searchParams.get('supplierId');
  const userId = url.searchParams.get('userId');
  const dockId = url.searchParams.get('dockId');
  const deltaFilter = url.searchParams.get('delta');

  // ---------- 1) Buscar dados ----------
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
  if (productId) where.productId = productId;
  if (supplierId) where.supplierId = supplierId;

  const rows = await prisma.launchItem.findMany({
    where,
    include: {
      launch: {
        select: { referenceDate: true, dockName: true, user: { select: { name: true } } },
      },
    },
    orderBy: [{ launch: { referenceDate: 'desc' } }, { entryTime: 'asc' }, { productName: 'asc' }],
  });

  const items = rows
    .map((it) => ({
      date: dateBR((it.launch as any)?.referenceDate),
      time: it.entryTime ?? '—',
      product: it.productName,
      supplier: it.supplierName,
      forecast: Number(it.forecast),
      received: Number(it.received),
      delta: Number(it.received) - Number(it.forecast),
      dock: (it.launch as any)?.dockName ?? '—',
      notes: it.notes ?? '',
      kg: Number(it.boxKg),
    }))
    .filter((it) => {
      if (deltaFilter === 'MAIS') return it.delta > 0;
      if (deltaFilter === 'MENOS') return it.delta < 0;
      if (deltaFilter === 'OK') return it.delta === 0;
      return true;
    });

  const totals = items.reduce(
    (acc, it) => {
      acc.forecast += it.forecast;
      acc.received += it.received;
      acc.delta += it.delta;
      acc.forecastKg += it.forecast * it.kg;
      acc.receivedKg += it.received * it.kg;
      acc.deltaKg += it.delta * it.kg;
      return acc;
    },
    { forecast: 0, received: 0, delta: 0, forecastKg: 0, receivedKg: 0, deltaKg: 0 },
  );

  // ---------- 2) Empresa / logo ----------
  const nameRow = await prisma.systemSetting.findFirst({ where: { key: 'company.name' } });
  const companyName = nameRow?.value ?? 'HortiGest';
  const logoBuffer = await getCompanyLogoBuffer();

  const period = `${startDate ? dateBR(startDate) : 'início'} a ${endDate ? dateBR(endDate) : 'hoje'}`;
  const emittedAt = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const sessionName = session.name;

  // ---------- 3) Gerar PDF ----------
  const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        layout: 'landscape',
        margin: 28,
        bufferPages: true,
        info: {
          Title: `Relatório de Recebimento — ${companyName}`,
          Author: companyName,
          Subject: 'Relatório de Recebimento Hortifrúti',
          Creator: 'HortiGest',
        },
      });
      const chunks: Buffer[] = [];
      doc.on('data', (c) => chunks.push(c as Buffer));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const MARGIN = 28;
      const pageW = doc.page.width;
      const pageH = doc.page.height;
      const contentW = pageW - MARGIN * 2;

      // Colunas (larguras somam exatamente contentW).
      type Col = { label: string; w: number; align: 'left' | 'right' };
      let productW = 150;
      let supplierW = 140;
      let notesW = 185;
      let fixed = 62 + 48 + 62 + 62 + 62 + 76; // data, hora, previsão, recebido, delta, docа
      const diff = contentW - (fixed + productW + supplierW + notesW);
      notesW += diff;

      const cols: Col[] = [
        { label: 'Data', w: 62, align: 'left' },
        { label: 'Horário', w: 48, align: 'left' },
        { label: 'Produto', w: productW, align: 'left' },
        { label: 'Fornecedor', w: supplierW, align: 'left' },
        { label: 'Previsão', w: 62, align: 'right' },
        { label: 'Recebido', w: 62, align: 'right' },
        { label: 'Delta', w: 62, align: 'right' },
        { label: 'Docа', w: 76, align: 'left' },
        { label: 'Observações', w: notesW, align: 'left' },
      ];
      const colX: number[] = [];
      {
        let x = MARGIN;
        for (const c of cols) {
          colX.push(x);
          x += c.w;
        }
      }
      const tableRight = colX[cols.length - 1] + cols[cols.length - 1].w;

      const ROW_H = 19;
      const padX = 5;
      const maxY = pageH - 54;

      function fitText(text: unknown, maxW: number): string {
        let s = String(text ?? '').trim();
        if (!s) return '';
        if (doc.widthOfString(s) <= maxW) return s;
        while (s.length > 1 && doc.widthOfString(s + '…') > maxW) s = s.slice(0, -1);
        return s + '…';
      }

      function drawHeader() {
        const hH = 62;
        doc.rect(MARGIN, MARGIN, contentW, hH).fill('#0f766e');
        doc.rect(MARGIN, MARGIN, 5, hH).fill('#15803d');
        doc.rect(MARGIN, MARGIN + hH - 2.5, contentW, 2.5).fill('#134e4a');

        const logoX = MARGIN + 16;
        const textX = logoBuffer ? MARGIN + 200 : MARGIN + 20;
        if (logoBuffer) {
          try {
            doc.image(logoBuffer, logoX, MARGIN + 8, { fit: [170, 46] });
          } catch {
            /* sem logo */
          }
        }
        doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(16).text(companyName, textX, MARGIN + 11, { width: 320, lineBreak: false, ellipsis: true });
        doc.fillColor('#ccfbf1').font('Helvetica').fontSize(9).text('Controle de Recebimento de Hortifrúti', textX, MARGIN + 34, { width: 340, lineBreak: false });

        const rightX = pageW - MARGIN - 280;
        doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(11).text('RELATÓRIO DE RECEBIMENTO', rightX, MARGIN + 9, { width: 280, align: 'right', lineBreak: false });
        doc.fillColor('#ccfbf1').font('Helvetica').fontSize(8.5)
          .text(`Emissão: ${emittedAt}`, rightX, MARGIN + 28, { width: 280, align: 'right', lineBreak: false })
          .text(`Usuário: ${sessionName}`, rightX, MARGIN + 41, { width: 280, align: 'right', lineBreak: false });
      }

      function drawTableHeader(y: number): number {
        doc.rect(MARGIN, y, contentW, 22).fill('#115e59');
        doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(9.5);
        cols.forEach((c, i) => {
          doc.text(c.label, colX[i] + padX, y + 6, { width: c.w - padX * 2, align: c.align, lineBreak: false });
        });
        return y + 22;
      }

      function drawRow(y: number, values: string[], striped: boolean, deltaValue: number) {
        if (striped) doc.rect(MARGIN, y, contentW, ROW_H).fill('#f1f5f9');
        doc.font('Helvetica').fontSize(9.5);
        cols.forEach((c, i) => {
          if (i === 6) {
            doc.fillColor(deltaValue > 0 ? '#047857' : deltaValue < 0 ? '#b91c1c' : '#475569');
            doc.font('Helvetica-Bold');
          } else {
            doc.fillColor('#0f172a');
            doc.font('Helvetica');
          }
          const maxW = c.w - padX * 2;
          doc.text(fitText(values[i], maxW), colX[i] + padX, y + 5, { width: maxW, align: c.align, lineBreak: false });
        });
        doc.moveTo(MARGIN, y + ROW_H).lineTo(tableRight, y + ROW_H).lineWidth(0.4).strokeColor('#e2e8f0').stroke();
      }

      function newPage(): number {
        doc.addPage({ size: 'A4', layout: 'landscape', margin: MARGIN });
        drawHeader();
        doc.fillColor('#475569').font('Helvetica').fontSize(9).text(`Continuação — Período: ${period}`, MARGIN, MARGIN + 66, { width: contentW, lineBreak: false });
        return MARGIN + 78;
      }

      drawHeader();

      let y = MARGIN + 62 + 12;
      doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(14).text('Relatório Geral de Recebimento', MARGIN, y, { lineBreak: false });
      y += 20;
      doc.fillColor('#475569').font('Helvetica').fontSize(10).text(`Período: ${period}`, MARGIN, y, { lineBreak: false });
      y += 16;
      doc.fillColor('#475569').font('Helvetica').fontSize(9.5).text(
        `Registros: ${items.length}   •   Previsão: ${fmtInt(totals.forecast)} cx   •   Recebido: ${fmtInt(totals.received)} cx   •   Delta: ${deltaLabelBR(totals.delta)} cx   •   (valores em caixas)`,
        MARGIN, y, { width: contentW, lineBreak: false, ellipsis: true, height: 14 },
      );

      const cardY = y + 18;
      const cardH = 46;
      const gap = 10;
      const cardW = (contentW - gap * 3) / 4;
      const cards = [
        { label: 'PREVISÃO', cx: totals.forecast, kg: totals.forecastKg, color: '#1d4ed8' },
        { label: 'RECEBIDO', cx: totals.received, kg: totals.receivedKg, color: '#0f766e' },
        { label: 'DELTA', cx: totals.delta, kg: totals.deltaKg, color: '#b45309' },
        { label: 'PRODUTOS', cx: items.length, kg: 0, color: '#4338ca' },
      ];
      cards.forEach((c, i) => {
        const x = MARGIN + i * (cardW + gap);
        doc.roundedRect(x, cardY, cardW, cardH, 5).fill(c.color);
        doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(9).text(c.label, x + 10, cardY + 6, { width: cardW - 20, lineBreak: false });
        doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(16).text(`${fmtInt(c.cx)} ${c.label === 'PRODUTOS' ? '' : 'cx'}`, x + 10, cardY + 18, { width: cardW - 20, lineBreak: false });
        if (c.label !== 'PRODUTOS') {
          doc.fillColor('#e6fffa').font('Helvetica').fontSize(9).text(`${fmtDec(c.kg, 1)} kg`, x + 10, cardY + 35, { width: cardW - 20, lineBreak: false });
        }
      });

      y = cardY + cardH + 12;
      y = drawTableHeader(y);

      if (items.length === 0) {
        doc.fillColor('#94a3b8').font('Helvetica-Oblique').fontSize(11).text(
          'Nenhum produto recebido encontrado para os filtros selecionados.',
          MARGIN, y + 26, { width: contentW, align: 'center', lineBreak: false },
        );
      } else {
        items.forEach((it, idx) => {
          if (y + ROW_H > maxY) {
            y = newPage();
            y = drawTableHeader(y);
          }
          const values = [
            it.date, it.time, it.product, it.supplier,
            fmtInt(it.forecast), fmtInt(it.received), deltaLabelBR(it.delta), it.dock, it.notes,
          ];
          drawRow(y, values, idx % 2 === 1, it.delta);
          y += ROW_H;
        });

        if (y + 46 > maxY) {
          y = newPage();
          y = drawTableHeader(y);
        }
        doc.rect(MARGIN, y, contentW, 26).fill('#134e4a');
        doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(10);
        doc.text('TOTAIS', MARGIN + 8, y + 8, { width: colX[4] - MARGIN - 12, lineBreak: false });
        const totVals = [totals.forecast, totals.received, totals.delta];
        totVals.forEach((v, i) => {
          const c = cols[4 + i];
          doc.text(deltaLabelBR(v), colX[4 + i] + padX, y + 8, { width: c.w - padX * 2, align: 'right', lineBreak: false });
        });
        y += 30;
        doc.fillColor('#334155').font('Helvetica').fontSize(9).text(
          `Peso total (kg) — Previsão: ${fmtDec(totals.forecastKg, 1)}   •   Recebido: ${fmtDec(totals.receivedKg, 1)}   •   Delta: ${fmtDec(totals.deltaKg, 1)}`,
          MARGIN, y, { width: contentW, lineBreak: false, ellipsis: true, height: 12 },
        );
      }

      const range = doc.bufferedPageRange();
      for (let i = 0; i < range.count; i++) {
        doc.switchToPage(range.start + i);
        doc.page.margins.bottom = 0;
        const yy = pageH - 28;
        doc.moveTo(MARGIN, yy - 6).lineTo(tableRight, yy - 6).lineWidth(0.5).strokeColor('#cbd5e1').stroke();
        doc.fillColor('#64748b').font('Helvetica').fontSize(8.5);
        doc.text(`HortiGest  •  ${companyName}  •  Emitido em ${emittedAt}`, MARGIN, yy, { width: contentW - 120, lineBreak: false });
        doc.text(`Página ${i + 1} de ${range.count}`, MARGIN, yy, { width: contentW, align: 'right', lineBreak: false });
      }

      doc.end();
    } catch (e) {
      reject(e);
    }
  });

  return new NextResponse(pdfBuffer as any, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="relatorio-recebimento-${Date.now()}.pdf"`,
      'Cache-Control': 'no-store',
    },
  });
}

function deltaLabelBR(v: number): string {
  const n = Number(v ?? 0);
  if (!isFinite(n) || n === 0) return '0';
  return `${n > 0 ? '+' : ''}${fmtInt(n)}`;
}

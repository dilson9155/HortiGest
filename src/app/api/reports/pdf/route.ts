import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import PDFDocument from 'pdfkit';
import { getSession, requireAnyPerm, HttpError } from '../../../../lib/session';
import { queryReport, type ReportRow } from '../../../../lib/report-query';

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

function deltaLabelBR(v: number): string {
  const n = Number(v ?? 0);
  if (!isFinite(n) || n === 0) return '0';
  return `${n > 0 ? '+' : ''}${fmtInt(n)}`;
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
  requireAnyPerm(session, [
    { module: 'reports', action: 'export' },
    { module: 'launches', action: 'view' },
  ]);

  const ctx = await queryReport(new URL(req.url));
  const { items, totals, params, companyName, emittedAt } = ctx;
  const history = params.history;
  const logoBuffer = await getCompanyLogoBuffer();
  const period = ctx.period;
  const sessionName = session.name;

  const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        layout: 'landscape',
        margin: 28,
        bufferPages: true,
        info: {
          Title: `${history ? 'Histórico de Entradas' : 'Relatório de Recebimento'} — ${companyName}`,
          Author: companyName,
          Subject: history ? 'Histórico de Entradas Hortifrúti' : 'Relatório de Recebimento Hortifrúti',
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

      // Larguras fixas; as observações recebem o espaço restante.
      type Col = { label: string; w: number; align: 'left' | 'right' };
      const cols: Col[] = [
        { label: 'Data', w: 52, align: 'left' },
        { label: 'Horários', w: 70, align: 'left' },
        { label: 'Produto', w: 128, align: 'left' },
        { label: 'Fornecedor', w: 118, align: 'left' },
        { label: 'Previsão', w: 52, align: 'right' },
        { label: 'Recebido', w: 52, align: 'right' },
        { label: 'Rendim.', w: 56, align: 'right' },
        { label: 'Delta', w: 50, align: 'right' },
        { label: 'Docа', w: 62, align: 'left' },
        { label: 'Observações / Responsáveis', w: 0, align: 'left' },
      ];
      cols[cols.length - 1].w = contentW - cols.slice(0, -1).reduce((s, c) => s + c.w, 0);

      const colX: number[] = [];
      {
        let x = MARGIN;
        for (const c of cols) {
          colX.push(x);
          x += c.w;
        }
      }
      const tableRight = colX[cols.length - 1] + cols[cols.length - 1].w;

      const padX = 5;
      const maxY = pageH - 54;

      /** Quebra texto em linhas dentro da largura — nunca usa reticências. */
      function textHeight(text: unknown, maxW: number, font = 'Helvetica', size = 9.5): number {
        const s = String(text ?? '').trim();
        if (!s) return 0;
        doc.font(font).fontSize(size);
        return doc.heightOfString(s, { width: maxW });
      }

      /** Reduz a fonte até o texto caber por inteiro, sem cortar. */
      function fitFont(text: string, maxW: number, font: string, start: number, min: number): number {
        let size = start;
        doc.font(font).fontSize(size);
        while (size > min && doc.widthOfString(text) > maxW) {
          size -= 0.5;
          doc.font(font).fontSize(size);
        }
        return size;
      }

      function drawHeader() {
        const hH = 62;
        doc.rect(MARGIN, MARGIN, contentW, hH).fill('#0f766e');
        doc.rect(MARGIN, MARGIN, 5, hH).fill('#15803d');
        doc.rect(MARGIN, MARGIN + hH - 2.5, contentW, 2.5).fill('#134e4a');

        const rightX = pageW - MARGIN - 300;
        const logoX = MARGIN + 16;
        const textX = logoBuffer ? MARGIN + 200 : MARGIN + 20;
        if (logoBuffer) {
          try {
            doc.image(logoBuffer, logoX, MARGIN + 8, { fit: [170, 46] });
          } catch {
            /* sem logo */
          }
        }
        const companyFont = fitFont(companyName, rightX - textX - 12, 'Helvetica-Bold', 16, 10);
        doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(companyFont)
          .text(companyName, textX, MARGIN + 11, { width: rightX - textX - 12, lineBreak: false });
        doc.fillColor('#ccfbf1').font('Helvetica').fontSize(9)
          .text('Controle de Recebimento de Hortifrúti', textX, MARGIN + 34, { width: rightX - textX - 12, lineBreak: false });

        const reportTitle = history ? 'HISTÓRICO DE ENTRADAS' : 'RELATÓRIO DE RECEBIMENTO';
        const titleFont = fitFont(reportTitle, 300, 'Helvetica-Bold', 11, 8);
        doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(titleFont)
          .text(reportTitle, rightX, MARGIN + 9, { width: 300, align: 'right', lineBreak: false });
        doc.fillColor('#ccfbf1').font('Helvetica').fontSize(8.5)
          .text(`Emissão: ${emittedAt}`, rightX, MARGIN + 28, { width: 300, align: 'right', lineBreak: false })
          .text(`Usuário: ${sessionName}`, rightX, MARGIN + 41, { width: 300, align: 'right', lineBreak: false });
      }

      function drawTableHeader(y: number): number {
        doc.rect(MARGIN, y, contentW, 22).fill('#115e59');
        cols.forEach((c, i) => {
          const maxW = c.w - padX * 2;
          const labelFont = fitFont(c.label, maxW, 'Helvetica-Bold', 9.5, 7);
          doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(labelFont)
            .text(c.label, colX[i] + padX, y + 6, { width: maxW, align: c.align, lineBreak: false });
        });
        return y + 22;
      }

      function drawRow(y: number, it: ReportRow, striped: boolean): number {
        const values = [
          dateBR(it.referenceDate),
          `${it.forecastTime ?? '—'}/${it.entryTime ?? '—'}`,
          it.productName,
          it.supplierName,
          fmtInt(it.forecast),
          fmtInt(it.received),
          fmtDec(it.rendimento, 2),
          deltaLabelBR(it.delta),
          it.dockName,
          it.notes || '—',
        ];
        const responsaveis = `C: ${it.compradorName}  •  F: ${it.conferenteName}`;

        const heights = cols.map((c, i) => {
          const maxW = c.w - padX * 2;
          if (i === 9) {
            return textHeight(responsaveis, maxW, 'Helvetica-Bold', 8) +
              textHeight(values[i], maxW, 'Helvetica', 8) + 3;
          }
          return textHeight(values[i], maxW, i === 7 ? 'Helvetica-Bold' : 'Helvetica', 9.5);
        });
        const rowH = Math.max(26, Math.max(...heights) + 10);

        if (striped) doc.rect(MARGIN, y, contentW, rowH).fill('#f1f5f9');

        cols.forEach((c, i) => {
          const maxW = c.w - padX * 2;
          const x = colX[i] + padX;
          if (i === 9) {
            const hResp = textHeight(responsaveis, maxW, 'Helvetica-Bold', 8);
            doc.fillColor('#1d4ed8').font('Helvetica-Bold').fontSize(8)
              .text(responsaveis, x, y + 5, { width: maxW, align: c.align });
            doc.fillColor('#0f172a').font('Helvetica').fontSize(8)
              .text(values[i], x, y + 5 + hResp + 2, { width: maxW, align: c.align });
            return;
          }
          const top = y + 5 + Math.max(0, (rowH - 10 - heights[i]) / 2);
          const isDelta = i === 7;
          doc.fillColor(isDelta ? (it.delta < 0 ? '#b91c1c' : it.delta > 0 ? '#047857' : '#475569') : '#0f172a')
            .font(isDelta ? 'Helvetica-Bold' : 'Helvetica')
            .fontSize(9.5)
            .text(values[i], x, top, { width: maxW, align: c.align });
        });

        doc.moveTo(MARGIN, y + rowH).lineTo(tableRight, y + rowH)
          .lineWidth(0.4).strokeColor('#e2e8f0').stroke();
        return rowH;
      }

      function newPage(): number {
        doc.addPage({ size: 'A4', layout: 'landscape', margin: MARGIN });
        drawHeader();
        doc.fillColor('#475569').font('Helvetica').fontSize(9)
          .text(`Continuação — Período: ${period}`, MARGIN, MARGIN + 66, { width: contentW, lineBreak: false });
        return MARGIN + 78;
      }

      drawHeader();

      let y = MARGIN + 62 + 12;
      const pageTitle = history ? 'Histórico Geral de Entradas' : 'Relatório Geral de Recebimento';
      doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(14).text(pageTitle, MARGIN, y, { lineBreak: false });
      y += 20;
      doc.fillColor('#475569').font('Helvetica').fontSize(10).text(`Período: ${period}`, MARGIN, y, { lineBreak: false });
      y += 16;

      const summary =
        `Registros: ${items.length}   •   Previsão: ${fmtInt(totals.forecast)} cx   •   ` +
        `Recebido: ${fmtInt(totals.received)} cx   •   Rendimento: ${fmtDec(totals.rendimento, 2)}   •   ` +
        `Delta: ${deltaLabelBR(totals.delta)} cx   •   (valores em caixas)`;
      doc.fillColor('#475569').font('Helvetica').fontSize(9.5);
      const summaryH = doc.heightOfString(summary, { width: contentW });
      doc.text(summary, MARGIN, y, { width: contentW });
      y += summaryH + 8;

      const cardY = y;
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
        doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(9)
          .text(c.label, x + 10, cardY + 6, { width: cardW - 20, lineBreak: false });
        const value = `${fmtInt(c.cx)}${c.label === 'PRODUTOS' ? '' : ' cx'}`;
        const valueFont = fitFont(value, cardW - 20, 'Helvetica-Bold', 16, 10);
        doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(valueFont)
          .text(value, x + 10, cardY + 18, { width: cardW - 20, lineBreak: false });
        if (c.label !== 'PRODUTOS') {
          doc.fillColor('#e6fffa').font('Helvetica').fontSize(9)
            .text(`${fmtDec(c.kg, 1)} kg`, x + 10, cardY + 35, { width: cardW - 20, lineBreak: false });
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
        let rowIndex = 0;
        for (const it of items) {
          const probeH = Math.max(
            textHeight(it.notes || '—', cols[9].w - padX * 2, 'Helvetica', 8) + 24,
            26,
          );
          if (y + probeH > maxY) {
            y = newPage();
            y = drawTableHeader(y);
          }
          y += drawRow(y, it, rowIndex % 2 === 1);
          rowIndex += 1;
        }

        if (y + 46 > maxY) {
          y = newPage();
          y = drawTableHeader(y);
        }
        doc.rect(MARGIN, y, contentW, 26).fill('#134e4a');
        doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(10)
          .text('TOTAIS', MARGIN + 8, y + 8, { width: colX[4] - MARGIN - 12, lineBreak: false });
        const totVals: Array<{ value: number; format: (v: number) => string }> = [
          { value: totals.forecast, format: fmtInt },
          { value: totals.received, format: fmtInt },
          { value: totals.rendimento, format: (v) => fmtDec(v, 2) },
          { value: totals.delta, format: deltaLabelBR },
        ];
        totVals.forEach(({ value, format }, i) => {
          const c = cols[4 + i];
          doc.text(format(value), colX[4 + i] + padX, y + 8, { width: c.w - padX * 2, align: 'right', lineBreak: false });
        });
        y += 30;
        const weight = `Peso total (kg) — Previsão: ${fmtDec(totals.forecastKg, 1)}   •   Recebido: ${fmtDec(totals.receivedKg, 1)}   •   Delta: ${fmtDec(totals.deltaKg, 1)}`;
        doc.fillColor('#334155').font('Helvetica').fontSize(9);
        const weightH = doc.heightOfString(weight, { width: contentW });
        doc.text(weight, MARGIN, y, { width: contentW });
        y += weightH;
      }

      const range = doc.bufferedPageRange();
      for (let i = 0; i < range.count; i++) {
        doc.switchToPage(range.start + i);
        doc.page.margins.bottom = 0;
        const yy = pageH - 28;
        doc.moveTo(MARGIN, yy - 6).lineTo(tableRight, yy - 6).lineWidth(0.5).strokeColor('#cbd5e1').stroke();
        const footer = `HortiGest  •  ${companyName}  •  Emitido em ${emittedAt}`;
        const footerFont = fitFont(footer, contentW - 130, 'Helvetica', 8.5, 7);
        doc.fillColor('#64748b').font('Helvetica').fontSize(footerFont)
          .text(footer, MARGIN, yy, { width: contentW - 130, lineBreak: false });
        doc.text(`Página ${i + 1} de ${range.count}`, MARGIN, yy, { width: contentW, align: 'right', lineBreak: false });
      }

      doc.end();
    } catch (e) {
      reject(e);
    }
  });

  const base = history ? 'historico-entradas' : 'relatorio-recebimento';
  return new NextResponse(pdfBuffer as any, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${base}-${Date.now()}.pdf"`,
      'Cache-Control': 'no-store',
    },
  });
}

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
  // referenceDate é "date only" (UTC). Formatar em UTC evita deslocar um dia.
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
  const entity = url.searchParams.get('entity');

  // ---------- 1) Buscar dados ----------
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
    include: { launch: { select: { referenceDate: true } } },
    orderBy: [{ launch: { referenceDate: 'desc' } }, { productName: 'asc' }],
  });

  const totals = items.reduce(
    (acc, it) => {
      const rec = Number(it.received);
      const pro = Number(it.produced);
      const brk = Number(it.broken);
      const mis = Number(it.missing);
      const kg = Number(it.boxKg);
      acc.received += rec;
      acc.produced += pro;
      acc.broken += brk;
      acc.missing += mis;
      acc.receivedKg += rec * kg;
      acc.producedKg += pro * kg;
      acc.brokenKg += brk * kg;
      acc.missingKg += mis * kg;
      return acc;
    },
    { received: 0, produced: 0, broken: 0, missing: 0, receivedKg: 0, producedKg: 0, brokenKg: 0, missingKg: 0 },
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
          Title: `Relatório de Produção — ${companyName}`,
          Author: companyName,
          Subject: 'Relatório de Produção Hortifrúti',
          Creator: 'HortiGest',
        },
      });
      const chunks: Buffer[] = [];
      doc.on('data', (c) => chunks.push(c as Buffer));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const MARGIN = 28;
      const pageW = doc.page.width; // ~841.89 (A4 landscape)
      const pageH = doc.page.height; // ~595.28
      const contentW = pageW - MARGIN * 2;

      // ----- Colunas (larguras somam exatamente contentW) -----
      type Col = { label: string; w: number; align: 'left' | 'right' };
      const fixedData = 70;
      const fixedNums = { received: 72, produced: 74, broken: 64, missing: 64 };
      const flex = contentW - (fixedData + fixedNums.received + fixedNums.produced + fixedNums.broken + fixedNums.missing);
      let productW = Math.round(flex * 0.56);
      let supplierW = Math.round(flex - productW);
      // Ajusta arredondamento para fechar exatamente na margem direita.
      const used = fixedData + productW + supplierW + fixedNums.received + fixedNums.produced + fixedNums.broken + fixedNums.missing;
      supplierW += contentW - used;

      const cols: Col[] = [
        { label: 'Data', w: fixedData, align: 'left' },
        { label: 'Produto', w: productW, align: 'left' },
        { label: 'Fornecedor', w: supplierW, align: 'left' },
        { label: 'Recebido', w: fixedNums.received, align: 'right' },
        { label: 'Produzido', w: fixedNums.produced, align: 'right' },
        { label: 'Quebra', w: fixedNums.broken, align: 'right' },
        { label: 'Falta', w: fixedNums.missing, align: 'right' },
      ];
      const colX: number[] = [];
      {
        let x = MARGIN;
        for (const c of cols) {
          colX.push(x);
          x += c.w;
        }
      }
      const tableRight = colX[cols.length - 1] + cols[cols.length - 1].w; // = pageW - MARGIN

      const ROW_H = 17;
      const padX = 5;
      const maxY = pageH - 54; // deixa espaço para o rodapé

      // Trunca pelo tamanho REAL (medido), garantindo que nada vaze da coluna.
      function fitText(text: unknown, maxW: number): string {
        let s = String(text ?? '').trim();
        if (!s) return '';
        if (doc.widthOfString(s) <= maxW) return s;
        while (s.length > 1 && doc.widthOfString(s + '…') > maxW) s = s.slice(0, -1);
        return s + '…';
      }

      // ----- Cabeçalho -----
      function drawHeader() {
        const hH = 60;
        doc.rect(MARGIN, MARGIN, contentW, hH).fill('#0f766e');
        doc.rect(MARGIN, MARGIN, 5, hH).fill('#15803d');
        doc.rect(MARGIN, MARGIN + hH - 2.5, contentW, 2.5).fill('#134e4a');

        const logoX = MARGIN + 16;
        const textX = logoBuffer ? MARGIN + 200 : MARGIN + 20;
        if (logoBuffer) {
          try {
            doc.image(logoBuffer, logoX, MARGIN + 8, { fit: [170, 44] });
          } catch {
            /* fallback: sem logo */
          }
        }
        doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(15).text(companyName, textX, MARGIN + 12, { width: 320, lineBreak: false, ellipsis: true });
        doc.fillColor('#ccfbf1').font('Helvetica').fontSize(8).text('Controle e Produção de Hortifrúti', textX, MARGIN + 33, { width: 320, lineBreak: false });

        const rightX = pageW - MARGIN - 260;
        doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(10.5).text('RELATÓRIO DE PRODUÇÃO', rightX, MARGIN + 10, { width: 260, align: 'right', lineBreak: false });
        doc.fillColor('#ccfbf1').font('Helvetica').fontSize(7.5)
          .text(`Emissão: ${emittedAt}`, rightX, MARGIN + 27, { width: 260, align: 'right', lineBreak: false })
          .text(`Usuário: ${sessionName}`, rightX, MARGIN + 38, { width: 260, align: 'right', lineBreak: false });
      }

      // ----- Cabeçalho da tabela -----
      function drawTableHeader(y: number): number {
        doc.rect(MARGIN, y, contentW, 20).fill('#115e59');
        doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8.5);
        cols.forEach((c, i) => {
          doc.text(c.label, colX[i] + padX, y + 6, { width: c.w - padX * 2, align: c.align, lineBreak: false });
        });
        return y + 20;
      }

      // ----- Linha da tabela -----
      function drawRow(y: number, values: string[], striped: boolean) {
        if (striped) doc.rect(MARGIN, y, contentW, ROW_H).fill('#f1f5f9');
        doc.fillColor('#0f172a').font('Helvetica').fontSize(8.5);
        cols.forEach((c, i) => {
          const maxW = c.w - padX * 2;
          const txt = fitText(values[i], maxW);
          doc.text(txt, colX[i] + padX, y + 5, { width: maxW, align: c.align, lineBreak: false });
        });
        // separador
        doc.moveTo(MARGIN, y + ROW_H).lineTo(tableRight, y + ROW_H).lineWidth(0.4).strokeColor('#e2e8f0').stroke();
      }

      // ----- Nova página (com cabeçalho) -----
      function newPage(): number {
        doc.addPage({ size: 'A4', layout: 'landscape', margin: MARGIN });
        drawHeader();
        doc.fillColor('#64748b').font('Helvetica').fontSize(7.5).text(`Continuação do relatório — Período: ${period}`, MARGIN, MARGIN + 64, { width: contentW, lineBreak: false });
        return MARGIN + 76;
      }

      drawHeader();

      // ----- Título / resumo -----
      let y = MARGIN + 60 + 12; // 100
      doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(13).text('Relatório Geral de Produção', MARGIN, y, { lineBreak: false });
      y += 19;
      doc.fillColor('#475569').font('Helvetica').fontSize(9).text(`Período: ${period}`, MARGIN, y, { lineBreak: false });
      y += 13;
      doc.fillColor('#475569').font('Helvetica').fontSize(8.5).text(
        `Registros: ${items.length}   •   Recebido: ${fmtInt(totals.received)} cx   •   Produzido: ${fmtInt(totals.produced)} cx   •   Quebra: ${fmtInt(totals.broken)} cx   •   Falta: ${fmtInt(totals.missing)} cx   •   (valores em caixas)`,
        MARGIN,
        y,
        { width: contentW, lineBreak: false, ellipsis: true, height: 12 },
      );

      // ----- Cards resumo -----
      const cardY = y + 16;
      const cardH = 42;
      const gap = 10;
      const cardW = (contentW - gap * 3) / 4;
      const cards = [
        { label: 'RECEBIDO', cx: totals.received, kg: totals.receivedKg, color: '#0f766e' },
        { label: 'PRODUZIDO', cx: totals.produced, kg: totals.producedKg, color: '#16a34a' },
        { label: 'QUEBRA', cx: totals.broken, kg: totals.brokenKg, color: '#d97706' },
        { label: 'FALTA', cx: totals.missing, kg: totals.missingKg, color: '#dc2626' },
      ];
      cards.forEach((c, i) => {
        const x = MARGIN + i * (cardW + gap);
        doc.roundedRect(x, cardY, cardW, cardH, 5).fill(c.color);
        doc.fillColor('#e6fffa').font('Helvetica-Bold').fontSize(7.5).text(c.label, x + 10, cardY + 6, { width: cardW - 20, lineBreak: false });
        doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(14).text(`${fmtInt(c.cx)} cx`, x + 10, cardY + 16, { width: cardW - 20, lineBreak: false });
        doc.fillColor('#e6fffa').font('Helvetica').fontSize(7.5).text(`${fmtDec(c.kg, 1)} kg`, x + 10, cardY + 31, { width: cardW - 20, lineBreak: false });
      });

      // ----- Tabela -----
      y = cardY + cardH + 12;
      y = drawTableHeader(y);

      if (items.length === 0) {
        doc.fillColor('#94a3b8').font('Helvetica-Oblique').fontSize(10).text(
          'Nenhum registro encontrado para os filtros selecionados.',
          MARGIN,
          y + 24,
          { width: contentW, align: 'center', lineBreak: false },
        );
      } else {
        items.forEach((it, idx) => {
          if (y + ROW_H > maxY) {
            y = newPage();
            y = drawTableHeader(y);
          }
          const values = [
            dateBR((it.launch as any)?.referenceDate),
            it.productName,
            it.supplierName,
            fmtInt(it.received),
            fmtInt(it.produced),
            fmtInt(it.broken),
            fmtInt(it.missing),
          ];
          drawRow(y, values, idx % 2 === 1);
          y += ROW_H;
        });

        // ----- Linha de totais -----
        if (y + 44 > maxY) {
          y = newPage();
          y = drawTableHeader(y);
        }
        doc.rect(MARGIN, y, contentW, 24).fill('#134e4a');
        doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(9);
        doc.text('TOTAIS', MARGIN + 8, y + 8, { width: cols[0].w + cols[1].w + cols[2].w - 12, lineBreak: false });
        const totVals = [totals.received, totals.produced, totals.broken, totals.missing];
        totVals.forEach((v, i) => {
          const c = cols[3 + i];
          doc.text(fmtInt(v), colX[3 + i] + padX, y + 8, { width: c.w - padX * 2, align: 'right', lineBreak: false });
        });
        y += 26;
        doc.fillColor('#334155').font('Helvetica').fontSize(8).text(
          `Peso total (kg) — Recebido: ${fmtDec(totals.receivedKg, 1)}   •   Produzido: ${fmtDec(totals.producedKg, 1)}   •   Quebra: ${fmtDec(totals.brokenKg, 1)}   •   Falta: ${fmtDec(totals.missingKg, 1)}`,
          MARGIN,
          y,
          { width: contentW, lineBreak: false, ellipsis: true, height: 11 },
        );
      }

      // ----- Rodapé + paginação (todas as páginas) -----
      const range = doc.bufferedPageRange();
      for (let i = 0; i < range.count; i++) {
        doc.switchToPage(range.start + i);
        // Zera a margem inferior: o rodapé fica abaixo da área de conteúdo e, sem
        // isso, o pdfkit acha que o texto "não cabe" e cria páginas fantasmas.
        doc.page.margins.bottom = 0;
        const yy = pageH - 30;
        doc.moveTo(MARGIN, yy - 6).lineTo(tableRight, yy - 6).lineWidth(0.5).strokeColor('#cbd5e1').stroke();
        doc.fillColor('#94a3b8').font('Helvetica').fontSize(7);
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
      'Content-Disposition': `inline; filename="relatorio-producao-${Date.now()}.pdf"`,
      'Cache-Control': 'no-store',
    },
  });
}

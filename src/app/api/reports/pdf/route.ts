import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import PDFDocument from 'pdfkit';
import { parseDateOnly } from '../../../../lib/calc';
import { getSession, requirePerm, HttpError } from '../../../../lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function numberBR(v: unknown, decimals = 3): string {
  const n = Number(v ?? 0);
  if (n === 0) return '0';
  return n.toLocaleString('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}
const fmtInt = (v: unknown) => numberBR(v, 0);
const fmtDec = (v: unknown, d: number) => numberBR(v, d);
function dateBR(d: unknown): string {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : (d as Date);
  return date.toLocaleDateString('pt-BR');
}

async function getCompanyLogoBuffer(): Promise<Buffer | null> {
  try {
    const setting = await prisma.systemSetting.findFirst({
      where: { key: 'company.logo' },
    });
    if (setting?.value) {
      const base64 = setting.value.includes('base64,') ? setting.value.split('base64,')[1] : setting.value;
      return Buffer.from(base64, 'base64');
    }
  } catch {
    // ignora
  }
  return null;
}

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

  // 1) Buscar dados
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
  // PDF considera apenas lançamentos confirmados (previsões ficam de fora).
  where.launch = { ...(where.launch ?? {}), status: 'CONFIRMADO' };

  const items = await prisma.launchItem.findMany({
    where,
    include: { launch: { select: { referenceDate: true } } },
    orderBy: [{ launch: { referenceDate: 'desc' } }],
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

  // 2) Buscar nome da empresa
  const nameRow = await prisma.systemSetting.findFirst({ where: { key: 'company.name' } });
  const companyName = nameRow?.value ?? 'HortiGest';

  // 3) Logo
  const logoBuffer = await getCompanyLogoBuffer();

  // 4) Gerar PDF
  const sessionName = session.name;
  const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 30 });
      const chunks: Buffer[] = [];
      doc.on('data', (c) => chunks.push(c as Buffer));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const w = doc.page.width;
      const h = doc.page.height;
      const margin = 30;

      // Header
      function drawHeader() {
        doc.rect(margin, margin, w - margin * 2, 72).fill('#0d9488');
        doc.rect(margin, margin, 6, 72).fill('#15803d');
        if (logoBuffer) {
          try {
            doc.image(logoBuffer, margin + 14, margin + 8, { height: 56, fit: [220, 56] });
          } catch {
            /* fallback */
          }
        }
        doc.fillColor('#fff').fontSize(16).text(companyName, margin + 240, margin + 18);
        doc.fontSize(8).text('Controle e Produção de Hortifrúti', margin + 240, margin + 38);
        doc.fontSize(9).text(`Emissão: ${new Date().toLocaleString('pt-BR')}`, w - margin - 240, margin + 22, { width: 230, align: 'right' });
        doc.text(`Usuário: ${sessionName}`, w - margin - 240, margin + 38, { width: 230, align: 'right' });
        doc.font('Helvetica-Bold').fontSize(9).text('RELATÓRIO DE PRODUÇÃO', w - margin - 240, margin + 54, { width: 230, align: 'right' });
      }
      drawHeader();

      // Filtros
      let infoY = margin + 90;
      doc.fillColor('#111').fontSize(14).font('Helvetica-Bold').text('Relatório Geral de Produção', margin, infoY);
      infoY += 22;
      const period =
        (startDate ? dateBR(startDate) : 'início') + ' a ' + (endDate ? dateBR(endDate) : 'hoje');
      doc.fontSize(9).font('Helvetica').fillColor('#555').text(`Período: ${period}`, margin, infoY);
      infoY += 16;
      doc.text(
        `Registros: ${items.length}  |  Recebido: ${fmtInt(totals.received)} cx  |  Produzido: ${fmtInt(totals.produced)} cx  |  Quebra: ${fmtInt(totals.broken)} cx  |  Falta: ${fmtInt(totals.missing)} cx`,
        margin,
        infoY,
      );

      // Cards resumo
      const cardY = infoY + 6;
      const cardH = 30;
      const cardW = (w - margin * 2 - 12) / 4;
      const drawCard = (i: number, label: string, val: string, bg: string) => {
        const x = margin + i * (cardW + 4);
        doc.rect(x, cardY, cardW, cardH).fill(bg).fillColor('#fff');
        doc.font('Helvetica').fontSize(8).fillColor('#fff');
        doc.text(label, x + 8, cardY + 6, { width: cardW - 16 });
        doc.font('Helvetica-Bold').fontSize(12).fillColor('#fff');
        doc.text(val, x + 8, cardY + 17, { width: cardW - 16 });
      };
      drawCard(0, 'CAIXAS RECEBIDAS', `${fmtInt(totals.received)} cx`, '#0d9488');
      drawCard(1, 'CAIXAS PRODUZIDAS', `${fmtInt(totals.produced)} cx`, '#16a34a');
      drawCard(2, 'CAIXAS QUEBRADAS', `${fmtInt(totals.broken)} cx`, '#d97706');
      drawCard(3, 'CAIXAS EM FALTA', `${fmtInt(totals.missing)} cx`, '#dc2626');

      // Tabela
      const tableTop = cardY + cardH + 10;
      function truncateCol(s: string, n: number) {
        const v = String(s ?? '');
        return v.length > n ? v.slice(0, n - 2) + '…' : v;
      }

      const colX = [margin, margin + 75, margin + 175, margin + 335, margin + 445, margin + 555, margin + 665, margin + 800];
      const headers = ['Data', 'Produto', 'Fornecedor', 'Recebido', 'Produzido', 'Quebra', 'Falta'];

      function drawTableHeader(yPos: number) {
        doc.rect(margin, yPos - 4, w - margin * 2, 18).fill('#15803d');
        doc.fillColor('#fff').font('Helvetica-Bold').fontSize(9);
        headers.forEach((h, i) => {
          const align = i >= 3 ? 'right' : 'left';
          doc.text(h, colX[i] + 4, yPos + 2, { width: (colX[i + 1] ?? w - margin) - colX[i] - 8, align });
        });
        return yPos + 20;
      }

      doc.font('Helvetica').fillColor('#0f172a').fontSize(9);
      let y = drawTableHeader(tableTop);
      const lineH = 16;

      const ellipsis = (s: string, n: number) => {
        const v = String(s ?? '');
        return v.length > n ? v.slice(0, n - 2) + '…' : v;
      };

      items.forEach((it, idx) => {
        if (y > h - 70) {
          doc.addPage({ size: 'A4', layout: 'landscape', margin: 30 });
          drawHeader();
          y = margin + 130;
          y = drawTableHeader(y);
        }
        if (idx % 2 === 0) {
          doc.rect(margin, y - 4, w - margin * 2, lineH).fill('#f1f5f9');
        }
        const row = [
          dateBR((it.launch as any)?.referenceDate),
          ellipsis(it.productName, 28),
          ellipsis(it.supplierName, 28),
          fmtInt(it.received),
          fmtInt(it.produced),
          fmtInt(it.broken),
          fmtInt(it.missing),
        ];
        doc.fillColor('#0f172a').font('Helvetica').fontSize(9);
        row.forEach((c, i) => {
          const wcol = (colX[i + 1] ?? w - margin) - colX[i] - 8;
          const align = i >= 3 ? 'right' : 'left';
          doc.text(String(c), colX[i] + 4, y + 2, { width: wcol, align, ellipsis: true });
        });
        y += lineH;
      });

      // Total
      const totY = Math.min(y + 6, h - 60);
      doc.rect(margin, totY, w - margin * 2, 22).fill('#0f766e');
      doc.fillColor('#fff').font('Helvetica-Bold').fontSize(9);
      doc.text('TOTAIS', margin + 8, totY + 6);
      doc.font('Helvetica').fontSize(8);
      const labels = [
        `Recebido: ${fmtInt(totals.received)} cx`,
        `Produzido: ${fmtInt(totals.produced)} cx`,
        `Quebra: ${fmtInt(totals.broken)} cx`,
        `Falta: ${fmtInt(totals.missing)} cx`,
      ];
      const wT = (w - margin * 2 - 100) / 4;
      labels.forEach((t, i) => {
        doc.text(t, margin + 100 + i * wT, totY + 6, { width: wT - 8 });
      });

      // Footer com paginação
      const pages = doc.bufferedPageRange();
      for (let i = 0; i < pages.count; i++) {
        doc.switchToPage(i);
        const bottom = h - 22;
        doc.fontSize(7).fillColor('#666').font('Helvetica')
          .text(`HortiGest — Controle e Produção de Hortifrúti   •   Página ${i + 1} de ${pages.count}`,
            margin, bottom, { width: w - margin * 2, align: 'center' });
      }
      doc.end();
    } catch (e) {
      reject(e);
    }
  });

  return new NextResponse(pdfBuffer as any, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="relatorio-hortigest-${Date.now()}.pdf"`,
      'Cache-Control': 'no-store',
    },
  });
}

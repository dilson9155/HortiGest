import { z } from 'zod';
import { prisma } from './prisma';
import { parseDateOnly } from './calc';
import { HttpError } from './session';

const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Horário do conferente no momento do lançamento (fuso de São Paulo). */
function nowHHmm() {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date());
}

export const launchSchema = z.object({
  referenceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida (use AAAA-MM-DD).'),
  // Mantido por compatibilidade; o status real é por item.
  status: z.enum(['PREVISTO', 'CONFIRMADO']).optional(),
  notes: z.string().max(1000).optional().nullable(),
  dockId: z.string().min(1).optional().nullable(),
  conferenteId: z.string().min(1).optional().nullable(),
  compradorId: z.string().min(1).optional().nullable(),
  // Nomes informados diretamente no lançamento (prevalecem sobre o cadastro).
  conferenteName: z.string().trim().max(120).optional().nullable(),
  compradorName: z.string().trim().max(120).optional().nullable(),
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        supplierId: z.string().min(1),
        forecast: z.number().nonnegative().default(0),
        received: z.number().nonnegative().default(0),
        rendimento: z.number().nonnegative().default(0),
        // Detalhes por item — podem ser preenchidos depois, na edição.
        // O mínimo para salvar é produto + fornecedor.
        compradorId: z.string().min(1).optional().nullable(),
        compradorName: z.string().trim().max(120).optional().nullable(),
        conferenteId: z.string().min(1).optional().nullable(),
        conferenteName: z.string().trim().max(120).optional().nullable(),
        dockId: z.string().min(1).optional().nullable(),
        // Horário previsto pelo comprador e horário do lançamento do conferente.
        forecastTime: z
          .string()
          .refine((v) => !v || timeRegex.test(v), 'Horário previsto inválido (use HH:mm).')
          .optional()
          .nullable(),
        entryTime: z
          .string()
          .refine((v) => !v || timeRegex.test(v), 'Horário inválido (use HH:mm).')
          .optional()
          .nullable(),
        notes: z.string().max(1000).optional().nullable(),
        status: z.enum(['PREVISTO', 'RECEBIDO']).optional(),
      }),
    )
    .min(1, 'Adicione pelo menos um produto.'),
});

export type LaunchPayload = z.infer<typeof launchSchema>;
export type ItemStatus = 'PREVISTO' | 'RECEBIDO';

export type NormalizedItem = {
  productId: string;
  supplierId: string;
  forecast: number;
  received: number;
  rendimento: number;
  compradorId: string | null;
  compradorName: string | null;
  conferenteId: string | null;
  conferenteName: string | null;
  dockId: string | null;
  forecastTime: string | null;
  entryTime: string | null;
  notes: string | null;
  itemStatus: ItemStatus;
};

export const launchInclude = {
  items: { orderBy: [{ status: 'asc' }, { productName: 'asc' }] as any },
  user: { select: { id: true, name: true, username: true } },
  dock: { select: { id: true, name: true } },
  conferente: { select: { id: true, name: true } },
  comprador: { select: { id: true, name: true } },
};

export function normalizeLaunch(payload: LaunchPayload) {
  const refDate = parseDateOnly(payload.referenceDate);
  if (!refDate) throw new HttpError(400, 'DATA_INVALIDA', 'Data inválida.');

  const items: NormalizedItem[] = payload.items.map((it) => {
    const itemStatus: ItemStatus =
      it.status === 'RECEBIDO' || !!it.entryTime || Number(it.received) > 0
        ? 'RECEBIDO'
        : 'PREVISTO';
    // Horário do conferente nunca depende de digitação: registrado ao receber.
    const entryTime = itemStatus === 'RECEBIDO' ? it.entryTime || nowHHmm() : null;

    if (itemStatus === 'RECEBIDO' && !it.conferenteName?.trim()) {
      throw new HttpError(
        400,
        'CONFERENTE_ITEM_OBRIGATORIO',
        'Informe o conferente de cada produto recebido.',
      );
    }

    return {
      productId: it.productId,
      supplierId: it.supplierId,
      forecast: Number(it.forecast ?? 0),
      received: Number(it.received ?? 0),
      rendimento: Number(it.rendimento ?? 0),
      compradorId: it.compradorId || null,
      compradorName: it.compradorName?.trim() || null,
      conferenteId: it.conferenteId || null,
      conferenteName: it.conferenteName?.trim() || null,
      dockId: it.dockId || null,
      forecastTime: it.forecastTime || null,
      entryTime,
      notes: it.notes ?? null,
      itemStatus,
    };
  });

  const received = items.filter((i) => i.itemStatus === 'RECEBIDO');
  const keys = new Set(received.map((i) => `${i.productId}_${i.supplierId}`));
  if (keys.size !== received.length) {
    throw new HttpError(
      409,
      'DUPLICADO_FORMULARIO',
      'Existem produtos recebidos duplicados (mesmo produto + fornecedor) no formulário.',
    );
  }

  return { refDate, items, received };
}

export async function assertNoDuplicateReceived(
  refDate: Date,
  received: NormalizedItem[],
  ignoreLaunchId?: string,
) {
  if (!received.length) return;
  const existing = await prisma.launchItem.findMany({
    where: {
      status: 'RECEBIDO',
      launch: {
        referenceDate: refDate,
        ...(ignoreLaunchId ? { id: { not: ignoreLaunchId } } : {}),
      },
      productId: { in: received.map((i) => i.productId) },
      supplierId: { in: received.map((i) => i.supplierId) },
    },
    select: { productId: true, supplierId: true },
  });
  const have = new Set(existing.map((e) => `${e.productId}_${e.supplierId}`));
  const clashes = [...new Set(received.map((i) => `${i.productId}_${i.supplierId}`))].filter((k) =>
    have.has(k),
  );
  if (clashes.length) {
    throw new HttpError(
      409,
      'DUPLICADO',
      `Já existe ${clashes.length} produto(s) recebido(s) nesta data com o mesmo produto e fornecedor. ` +
        'Edite o lançamento existente em vez de criar outro.',
    );
  }
}

/** Valida um cadastro e devolve o nome gravado (para snapshot histórico). */
async function checkRef(tx: any, id: string | null | undefined, model: 'dock' | 'conferente' | 'comprador', label: string) {
  if (!id) return null;
  const row = await tx[model].findUnique({ where: { id } });
  if (!row) throw new HttpError(400, 'CADASTRO_INVALIDO', `${label} não encontrado.`);
  if (!row.active) throw new HttpError(400, 'CADASTRO_INATIVO', `${label} inativo.`);
  return row.name as string;
}

/** Snapshots do lançamento (compatibilidade) espelham o primeiro item. */
export async function resolveReceivingRefs(tx: any, payload: LaunchPayload, items: NormalizedItem[]) {
  const first = items[0];
  const compradorId = payload.compradorId || first?.compradorId || null;
  const conferenteId = payload.conferenteId || first?.conferenteId || null;
  const dockId = payload.dockId || first?.dockId || null;

  const compradorName =
    payload.compradorName?.trim() ||
    first?.compradorName?.trim() ||
    (await checkRef(tx, compradorId, 'comprador', 'Comprador'));
  const conferenteName =
    payload.conferenteName?.trim() ||
    first?.conferenteName?.trim() ||
    (await checkRef(tx, conferenteId, 'conferente', 'Conferente'));
  const dockName = (await checkRef(tx, dockId, 'dock', 'Docа')) || null;

  return { compradorId, compradorName, conferenteId, conferenteName, dockId, dockName };
}

/** Valida e resolve os responsáveis/doca gravados em cada item. */
async function resolveItemRefs(tx: any, it: NormalizedItem) {
  const compradorCadastrado = await checkRef(tx, it.compradorId, 'comprador', 'Comprador');
  const conferenteCadastrado = await checkRef(tx, it.conferenteId, 'conferente', 'Conferente');
  const dockCadastrada = await checkRef(tx, it.dockId, 'dock', 'Docа');

  return {
    compradorId: it.compradorId,
    // Nome digitado no lançamento prevalece sobre o cadastro (decisão anterior).
    compradorName: it.compradorName?.trim() || compradorCadastrado || null,
    conferenteId: it.conferenteId,
    conferenteName: it.conferenteName?.trim() || conferenteCadastrado || null,
    dockId: it.dockId,
    dockName: dockCadastrada,
    forecastTime: it.forecastTime,
  };
}

/** Grava todos os itens de um lançamento (chamado dentro de uma transação). */
export async function writeItems(tx: any, launchId: string, items: NormalizedItem[]) {
  for (const it of items) {
    const product = await tx.product.findUnique({ where: { id: it.productId } });
    const supplier = await tx.supplier.findUnique({ where: { id: it.supplierId } });
    if (!product || !product.active) throw new HttpError(400, 'PRODUTO_INATIVO', 'Produto inativo.');
    if (!supplier || !supplier.active) throw new HttpError(400, 'FORNECEDOR_INATIVO', 'Fornecedor inativo.');

    const refs = await resolveItemRefs(tx, it);

    await tx.launchItem.create({
      data: {
        launchId,
        productId: product.id,
        supplierId: supplier.id,
        productName: product.name,
        supplierName: supplier.name,
        boxKg: product.defaultBoxKg,
        status: it.itemStatus,
        forecast: it.forecast,
        received: it.received,
        rendimento: it.rendimento,
        ...refs,
        entryTime: it.entryTime,
        notes: it.notes,
        // Colunas legadas: mantidas zeradas para não quebrar dados antigos.
        produced: 0,
        broken: 0,
        missing: 0,
      },
    });
  }
}

export function launchStatusFor(items: NormalizedItem[]): 'PREVISTO' | 'CONFIRMADO' {
  return items.length > 0 && items.every((i) => i.itemStatus === 'RECEBIDO')
    ? 'CONFIRMADO'
    : 'PREVISTO';
}

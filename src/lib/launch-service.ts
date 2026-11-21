import { z } from 'zod';
import { prisma } from './prisma';
import { parseDateOnly } from './calc';
import { HttpError } from './session';

const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;

export const launchSchema = z.object({
  referenceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida (use AAAA-MM-DD).'),
  // Mantido por compatibilidade; o status real é por item.
  status: z.enum(['PREVISTO', 'CONFIRMADO']).optional(),
  notes: z.string().max(1000).optional().nullable(),
  dockId: z.string().min(1).optional().nullable(),
  conferenteId: z.string().min(1).optional().nullable(),
  compradorId: z.string().min(1).optional().nullable(),
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        supplierId: z.string().min(1),
        forecast: z.number().nonnegative().default(0),
        received: z.number().nonnegative().default(0),
        rendimento: z.number().nonnegative().default(0),
        entryTime: z.string().regex(timeRegex, 'Horário inválido (use HH:mm).').optional().nullable(),
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
      it.status === 'RECEBIDO' ||
      (!it.status && (!!it.entryTime || Number(it.received) > 0))
        ? 'RECEBIDO'
        : 'PREVISTO';

    if (itemStatus === 'RECEBIDO' && !it.entryTime) {
      throw new HttpError(
        400,
        'HORARIO_OBRIGATORIO',
        'O horário de entrada é obrigatório para todo produto recebido.',
      );
    }

    return {
      productId: it.productId,
      supplierId: it.supplierId,
      forecast: Number(it.forecast ?? 0),
      received: Number(it.received ?? 0),
      rendimento: Number(it.rendimento ?? 0),
      entryTime: it.entryTime ?? null,
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

/** Valida doca/conferente/comprador e devolve os snapshots para histórico. */
export async function resolveReceivingRefs(tx: any, payload: LaunchPayload) {
  const check = async (id: string | null | undefined, model: 'dock' | 'conferente' | 'comprador', label: string) => {
    if (!id) return null;
    const row = await tx[model].findUnique({ where: { id } });
    if (!row) throw new HttpError(400, 'CADASTRO_INVALIDO', `${label} não encontrado.`);
    if (!row.active) throw new HttpError(400, 'CADASTRO_INATIVO', `${label} inativo.`);
    return row.name as string;
  };

  return {
    dockName: await check(payload.dockId, 'dock', 'Docа'),
    conferenteName: await check(payload.conferenteId, 'conferente', 'Conferente'),
    compradorName: await check(payload.compradorId, 'comprador', 'Comprador'),
  };
}

/** Grava todos os itens de um lançamento (chamado dentro de uma transação). */
export async function writeItems(tx: any, launchId: string, items: NormalizedItem[]) {
  for (const it of items) {
    const product = await tx.product.findUnique({ where: { id: it.productId } });
    const supplier = await tx.supplier.findUnique({ where: { id: it.supplierId } });
    if (!product || !product.active) throw new HttpError(400, 'PRODUTO_INATIVO', 'Produto inativo.');
    if (!supplier || !supplier.active) throw new HttpError(400, 'FORNECEDOR_INATIVO', 'Fornecedor inativo.');

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

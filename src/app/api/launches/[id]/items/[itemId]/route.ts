import { z } from 'zod';
import { prisma } from '../../../../../../lib/prisma';
import { handler } from '../../../../../../lib/api-handler';
import { getSession, requireAnyPerm, HttpError } from '../../../../../../lib/session';

export const runtime = 'nodejs';

const patchSchema = z.object({
  // Rendimento e observação são informados à mão e podem ser ajustados após a conferência.
  rendimento: z.number().nonnegative('Rendimento não pode ser negativo.'),
  notes: z.string().max(1000).optional().nullable(),
});

/** Edição isolada do rendimento de um item já conferido. */
export const PATCH = handler(async (req, ctx) => {
  const session = await getSession(req);
  if (!session) throw new HttpError(401, 'UNAUTHORIZED', 'Autenticação necessária.');
  requireAnyPerm(session, [
    { module: 'launches', action: 'edit' },
    { module: 'reports', action: 'view' },
    { module: 'launches', action: 'view' },
  ]);

  const params = await ctx?.params;
  const launchId = params?.id;
  const itemId = params?.itemId;
  if (!launchId || !itemId) throw new HttpError(400, 'INVALID', 'IDs obrigatórios.');

  const { rendimento, notes } = patchSchema.parse(await req.json());

  const item = await prisma.launchItem.findFirst({
    where: { id: itemId, launchId },
  });
  if (!item) throw new HttpError(404, 'NAO_ENCONTRADO', 'Item de lançamento não encontrado.');

  const updated = await prisma.launchItem.update({
    where: { id: itemId },
    data: {
      rendimento,
      ...(notes === undefined ? {} : { notes: notes || null }),
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: session.id,
      userName: session.name,
      entity: 'launch_item',
      entityId: itemId,
      operation: 'UPDATE',
      description: `Ajuste do item ${item.productName}: rendimento ${item.rendimento} → ${rendimento}${notes === undefined ? '' : `, observação: ${notes || '(vazia)'}`}.`,
    },
  });

  return updated;
});

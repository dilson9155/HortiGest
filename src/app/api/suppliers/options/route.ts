import { prisma } from '../../../../lib/prisma';
import { handler } from '../../../../lib/api-handler';
import { getSession, HttpError } from '../../../../lib/session';

export const runtime = 'nodejs';

/**
 * Lista enxuta de fornecedores ativos para alimentar os combobox
 * (lançamentos e relatórios). Igual ao backend original: só exige autenticação.
 */
export const GET = handler(async (req) => {
  const session = await getSession(req);
  if (!session) throw new HttpError(401, 'UNAUTHORIZED', 'Autenticação necessária.');

  return prisma.supplier.findMany({
    where: { active: true },
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  });
});

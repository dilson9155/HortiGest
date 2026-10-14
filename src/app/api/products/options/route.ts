import { prisma } from '../../../../lib/prisma';
import { handler } from '../../../../lib/api-handler';
import { getSession, HttpError } from '../../../../lib/session';

export const runtime = 'nodejs';

/**
 * Lista enxuta de produtos para alimentar os combobox (lançamentos e relatórios).
 * Por padrão devolve só os ativos. Com `?includeInactive=1` devolve também os
 * inativos (útil ao editar lançamentos antigos, para exibir o nome do produto).
 */
export const GET = handler(async (req) => {
  const session = await getSession(req);
  if (!session) throw new HttpError(401, 'UNAUTHORIZED', 'Autenticação necessária.');

  const url = new URL(req.url);
  const includeInactive = url.searchParams.get('includeInactive') === '1';

  return prisma.product.findMany({
    where: includeInactive ? {} : { active: true },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, defaultBoxKg: true, active: true },
  });
});

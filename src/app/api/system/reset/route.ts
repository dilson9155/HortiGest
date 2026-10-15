import { prisma } from '../../../../lib/prisma';
import { handler } from '../../../../lib/api-handler';
import { getSession, HttpError } from '../../../../lib/session';

export const runtime = 'nodejs';

/**
 * Zera dados do sistema (uso administrativo / limpeza de dados de teste).
 *
 * Somente ADMIN. Exige confirmação explícita (confirm: "ZERAR").
 *
 * Escopos aceitos em `scopes`:
 *   - "launches" → apaga lançamentos e seus itens
 *   - "catalog"  → apaga produtos e fornecedores (implica limpar lançamentos)
 *   - "users"    → apaga usuários, exceto o próprio (implica limpar lançamentos)
 *   - "audit"    → apaga o log de auditoria
 *
 * Nunca apaga perfis/permissões nem as configurações da empresa.
 */

const ALLOWED = ['launches', 'catalog', 'users', 'audit'] as const;

export const POST = handler(async (req) => {
  const session = await getSession(req);
  if (!session) throw new HttpError(401, 'UNAUTHORIZED', 'Autenticação necessária.');
  if (session.role?.kind !== 'ADMIN') {
    throw new HttpError(403, 'FORBIDDEN', 'Apenas o administrador pode zerar o sistema.');
  }

  const body = (await req.json().catch(() => ({}))) as {
    confirm?: string;
    scopes?: string[];
  };

  if (body.confirm !== 'ZERAR') {
    throw new HttpError(400, 'CONFIRMACAO', 'Confirmação inválida. Digite exatamente ZERAR.');
  }

  const requested = new Set((body.scopes ?? []).filter((s): s is any => (ALLOWED as readonly string[]).includes(s)));
  if (requested.size === 0) {
    throw new HttpError(400, 'ESCOPO', 'Selecione ao menos uma opção para apagar.');
  }

  // Dependências: produtos/fornecedores e usuários são referenciados por lançamentos.
  if (requested.has('catalog') || requested.has('users')) requested.add('launches');

  const result = {
    launches: 0,
    launchItems: 0,
    products: 0,
    suppliers: 0,
    users: 0,
    auditLogs: 0,
  };

  await prisma.$transaction(async (tx) => {
    if (requested.has('launches')) {
      const items = await tx.launchItem.deleteMany({});
      const launches = await tx.launch.deleteMany({});
      result.launchItems = items.count;
      result.launches = launches.count;
    }
    if (requested.has('catalog')) {
      const products = await tx.product.deleteMany({});
      const suppliers = await tx.supplier.deleteMany({});
      result.products = products.count;
      result.suppliers = suppliers.count;
    }
    if (requested.has('users')) {
      const users = await tx.user.deleteMany({ where: { id: { not: session.id } } });
      result.users = users.count;
    }
    if (requested.has('audit')) {
      const logs = await tx.auditLog.deleteMany({});
      result.auditLogs = logs.count;
    }
  });

  // Registra a ação (sempre, mesmo que o log tenha sido limpo).
  await prisma.auditLog.create({
    data: {
      userId: session.id,
      userName: session.name,
      entity: 'system',
      entityId: null,
      operation: 'RESET',
      description: `Sistema zerado. Lançamentos: ${result.launches} (${result.launchItems} itens), Produtos: ${result.products}, Fornecedores: ${result.suppliers}, Usuários: ${result.users}, Logs: ${result.auditLogs}.`,
    },
  });

  return result;
});

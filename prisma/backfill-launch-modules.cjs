// Copia as permissões do módulo legado `launches` para os dois módulos novos.
// Assim perfis já existentes continuam com acesso antes do seed ser executado.
require('dotenv').config({ path: '.env.local' });

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const TARGET_MODULES = ['launches_buyers', 'launches_reviewers'];

async function main() {
  const legacy = await prisma.rolePermission.findMany({
    where: { module: 'launches' },
    select: { roleId: true, actions: true },
  });

  for (const permission of legacy) {
    for (const module of TARGET_MODULES) {
      await prisma.rolePermission.upsert({
        where: { roleId_module: { roleId: permission.roleId, module } },
        update: { actions: permission.actions },
        create: { roleId: permission.roleId, module, actions: permission.actions },
      });
    }
  }

  console.log(`[BACKFILL] ${legacy.length} perfil(is) com módulos de lançamento atualizados.`);
}

main()
  .catch((e) => {
    console.error('[BACKFILL] Falha ao atualizar módulos de lançamento:', e.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

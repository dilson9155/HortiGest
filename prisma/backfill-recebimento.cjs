// Backfill único: lançamentos antigos CONFIRMADO viram itens RECEBIDO.
// Como não existia previsão no modelo antigo, consideramos forecast = received
// para não gerar um delta artificial no histórico.
require('dotenv').config({ path: '.env.local' });

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const afetados = await prisma.$executeRaw`
    UPDATE launch_items
       SET status = 'RECEBIDO'::"LaunchItemStatus",
           forecast = received
     WHERE status = 'PREVISTO'::"LaunchItemStatus"
       AND launch_id IN (
         SELECT id FROM launches WHERE status = 'CONFIRMADO'::"LaunchStatus"
       )
  `;
  console.log(`[BACKFILL] ${afetados} item(ns) antigo(s) marcado(s) como recebido(s).`);
}

main()
  .catch((e) => {
    console.error('[BACKFILL] Falha ao migrar histórico:', e.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

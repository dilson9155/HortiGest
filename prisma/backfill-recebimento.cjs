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
       AND "launchId" IN (
         SELECT id FROM launches WHERE status = 'CONFIRMADO'::"LaunchStatus"
       )
  `;
  console.log(`[BACKFILL] ${afetados} item(ns) antigo(s) marcado(s) como recebido(s).`);

  // Copia os responsáveis/doca do lançamento para os itens que ainda não têm
  // esses detalhes gravados por item (histórico anterior a esta versão).
  const copiados = await prisma.$executeRaw`
    UPDATE launch_items li
       SET "compradorId" = l."compradorId",
           "compradorName" = COALESCE(li."compradorName", l."compradorName"),
           "conferenteId" = l."conferenteId",
           "conferenteName" = COALESCE(li."conferenteName", l."conferenteName"),
           "dockId" = l."dockId",
           "dockName" = COALESCE(li."dockName", l."dockName")
      FROM launches l
     WHERE li."launchId" = l.id
       AND li."compradorName" IS NULL
  `;
  console.log(`[BACKFILL] ${copiados} item(ns) com responsáveis/doca copiados do lançamento.`);
}

main()
  .catch((e) => {
    console.error('[BACKFILL] Falha ao migrar histórico:', e.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

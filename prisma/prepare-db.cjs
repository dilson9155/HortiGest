// Preparação do banco executada antes do build.
// A Hostinger roda `npm run build`; sem este passo o schema novo não era aplicado.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function loadEnv(file) {
  if (fs.existsSync(file)) require('dotenv').config({ path: file });
}

if (!process.env.DATABASE_URL) loadEnv(path.resolve(process.cwd(), '.env.local'));
if (!process.env.DATABASE_URL) loadEnv(path.resolve(process.cwd(), '.env'));

if (!process.env.DATABASE_URL) {
  console.log('[PREPARE-DB] DATABASE_URL não definida; pulando preparação do banco.');
  process.exit(0);
}

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: true,
    env: process.env,
  });
  if (result.status !== 0) {
    console.error(`[PREPARE-DB] Falha ao executar: ${command} ${args.join(' ')}`);
    process.exit(result.status ?? 1);
  }
}

console.log('[PREPARE-DB] Aplicando schema no banco...');
run('npx', ['prisma', 'db', 'push', '--skip-generate']);

console.log('[PREPARE-DB] Atualizando módulos de lançamento dos perfis...');
run('node', ['prisma/backfill-launch-modules.cjs']);

console.log('[PREPARE-DB] Migrando histórico de recebimentos...');
run('node', ['prisma/backfill-recebimento.cjs']);

console.log('[PREPARE-DB] Banco pronto.');

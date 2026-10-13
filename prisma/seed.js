// Carrega .env mesmo quando rodando fora do Next.js
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';

const prisma = new PrismaClient();

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_NAME = process.env.ADMIN_NAME || 'Administrador';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@hortifruti.local';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'TroqueEstaSenha123!';

import { buildDefaultPermissions } from '../src/lib/permissions.js';

async function ensureRole(kind, name, description) {
  const existing = await prisma.role.findUnique({ where: { kind } });
  if (existing) return existing;
  const created = await prisma.role.create({
    data: { kind, name, description, system: true },
  });
  return created;
}

async function ensurePermission(roleId, module, actions) {
  const existing = await prisma.rolePermission.findUnique({
    where: { roleId_module: { roleId, module } },
  });
  if (existing) {
    await prisma.rolePermission.update({
      where: { id: existing.id },
      data: { actions },
    });
    return existing;
  }
  return prisma.rolePermission.create({
    data: { roleId, module, actions },
  });
}

async function ensureAdmin() {
  const exists = await prisma.user.findUnique({ where: { username: ADMIN_USERNAME } });
  if (exists) {
    console.log(`[seed] Admin "${ADMIN_USERNAME}" já existe — pulando.`);
    return exists;
  }
  const role = await prisma.role.findUnique({ where: { kind: 'ADMIN' } });
  const passwordHash = await argon2.hash(ADMIN_PASSWORD, { type: argon2.argon2id });
  const created = await prisma.user.create({
    data: {
      username: ADMIN_USERNAME,
      name: ADMIN_NAME,
      email: ADMIN_EMAIL,
      passwordHash,
      roleId: role.id,
      active: true,
    },
  });
  console.log(`[seed] Admin criado: usuário="${ADMIN_USERNAME}", senha="${ADMIN_PASSWORD}"`);
  return created;
}

async function ensureSettings() {
  const defaults = [
    { key: 'company.name', value: 'Hortifrúti LTDA' },
    { key: 'company.cnpj', value: '' },
    { key: 'company.address', value: '' },
    { key: 'company.phone', value: '' },
    { key: 'company.email', value: '' },
    { key: 'preferences.unit', value: 'CAIXA' },
    { key: 'preferences.decimals', value: '3' },
    { key: 'preferences.dateFormat', value: 'dd/MM/yyyy' },
  ];
  for (const d of defaults) {
    await prisma.systemSetting.upsert({
      where: { key: d.key },
      update: { value: d.value },
      create: { key: d.key, value: d.value, category: 'GERAL' },
    });
  }
}

async function ensureSampleSuppliers() {
  const list = [
    { name: 'Hortifrúti Central', active: true },
    { name: 'CEASA São Paulo', active: true },
    { name: 'Cooperativa Vale Verde', active: true },
    { name: 'Distribuidora Bons Frutos', active: true },
  ];
  for (const s of list) {
    const exists = await prisma.supplier.findUnique({ where: { name: s.name } });
    if (!exists) await prisma.supplier.create({ data: s });
  }
}

async function ensureSampleProducts() {
  const list = [
    { name: 'Tomate Caqui', defaultBoxKg: 20, active: true },
    { name: 'Banana Nanica', defaultBoxKg: 18, active: true },
    { name: 'Alface Crespa', defaultBoxKg: 4, active: true },
    { name: 'Cenoura', defaultBoxKg: 22, active: true },
    { name: 'Batata Inglesa', defaultBoxKg: 25, active: true },
    { name: 'Cebola', defaultBoxKg: 20, active: true },
    { name: 'Maçã Gala', defaultBoxKg: 18, active: true },
    { name: 'Mamão Formosa', defaultBoxKg: 25, active: true },
  ];
  for (const p of list) {
    const exists = await prisma.product.findUnique({ where: { name: p.name } });
    if (!exists) await prisma.product.create({ data: p });
  }
}

async function main() {
  console.log('[seed] Iniciando...');

  const admin = await ensureRole('ADMIN', 'Administrador', 'Acesso total ao sistema.');
  const sup = await ensureRole(
    'SUPERVISOR',
    'Supervisor',
    'Acesso a lançamentos, cadastros e relatórios.',
  );
  const op = await ensureRole('OPERADOR', 'Operador', 'Acesso restrito aos lançamentos.');

  for (const role of [admin, sup, op]) {
    const perms = buildDefaultPermissions(role.kind);
    for (const [mod, actions] of Object.entries(perms)) {
      await ensurePermission(role.id, mod, actions);
    }
  }
  console.log('[seed] Perfis e permissões configurados.');

  await ensureAdmin();
  await ensureSettings();
  await ensureSampleSuppliers();
  await ensureSampleProducts();

  console.log('[seed] Concluído.');
}

main()
  .catch((e) => {
    console.error('[seed] Erro:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

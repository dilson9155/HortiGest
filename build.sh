#!/bin/bash
# Script de build auxiliar para Hostinger Cloud.
# O Next.js geralmente é detectado automaticamente, mas se a Hostinger
# pedir root directory, este script garante o build.

set -e

echo "[BUILD] Instalando dependências..."
npm install --omit=dev

echo "[BUILD] Gerando Prisma Client..."
npx prisma generate

echo "[BUILD] Aplicando schema no banco..."
# Não existem migrations versionadas neste projeto. O `migrate deploy` termina
# com sucesso sem aplicar nada quando a pasta não existe, por isso usamos db push.
npx prisma db push --skip-generate

echo "[BUILD] Migrando histórico de recebimentos..."
node prisma/backfill-recebimento.cjs || echo "[BUILD] Aviso: backfill não executado."

echo "[BUILD] Construindo aplicação Next.js..."
npm run build

echo "[BUILD] Concluído."

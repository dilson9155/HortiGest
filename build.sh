#!/bin/bash
# Script de build auxiliar para Hostinger Cloud.
# O Next.js geralmente é detectado automaticamente, mas se a Hostinger
# pedir root directory, este script garante o build.

set -e

echo "[BUILD] Instalando dependências..."
npm install --omit=dev

echo "[BUILD] Gerando Prisma Client..."
npx prisma generate

echo "[BUILD] Aplicando migrations..."
npx prisma migrate deploy || npx prisma db push

echo "[BUILD] Construindo aplicação Next.js..."
npm run build

echo "[BUILD] Concluído."

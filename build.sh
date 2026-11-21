#!/bin/bash
# Script de build auxiliar para Hostinger Cloud.
# O Next.js geralmente é detectado automaticamente, mas se a Hostinger
# pedir root directory, este script garante o build.

set -e

echo "[BUILD] Instalando dependências..."
npm install

echo "[BUILD] Preparando banco e construindo aplicação Next.js..."
npm run build

echo "[BUILD] Concluído."

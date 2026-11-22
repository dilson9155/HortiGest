# HortiGest Next — Versão modernizada (Next.js 15)

> Versão do HortiGest migrada para Next.js 15 (App Router) — mesmo padrão dos sistemas `financy-pro` e `ppr`.
> Hospedagem: Hostinger Cloud com auto-deploy em cada `git push`.

## 🚀 Quick start (local)

```bash
# 1) Instalar
npm install

# 2) Configurar .env.local
cp .env.example .env.local
# Edite DATABASE_URL e JWT_SECRET

# 3) Migrar banco
npx prisma migrate deploy

# 4) Seed inicial
node run-seed.cjs

# 5) Build
npm run build

# 6) Iniciar
npm start
# Acesse: http://localhost:3000
```

Login padrão: `admin` / senha definida em `ADMIN_PASSWORD`.

## 📁 Estrutura

```
hortifruti-next/
├── src/
│   ├── app/                   # Next.js App Router
│   │   ├── api/               # API Routes (substitui Express)
│   │   │   ├── auth/
│   │   │   ├── suppliers/
│   │   │   ├── products/
│   │   │   ├── launches/
│   │   │   ├── dashboard/
│   │   │   ├── reports/{items,pdf}/
│   │   │   ├── settings/
│   │   │   ├── users/
│   │   │   ├── audit/
│   │   │   └── health/
│   │   ├── page.tsx           # SPA principal (catch-all)
│   │   ├── layout.tsx
│   │   └── globals.css
│   ├── views/                 # Páginas React (cliente)
│   ├── components/            # Componentes reutilizáveis
│   ├── contexts/              # Auth, Branding
│   ├── hooks/                 # useToast
│   ├── layout/                # Sidebar, header
│   └── lib/                   # prisma, auth, calc, permissions, session, api-handler, api client, utils
├── prisma/
│   ├── schema.prisma
│   ├── seed.js
│   └── migrations/
├── public/
│   ├── logo.png
│   └── manifest.webmanifest
├── scripts/
│   └── fix-imports.cjs
├── next.config.js
├── tailwind.config.js
├── postcss.config.js
├── tsconfig.json
├── package.json
└── .env.example
```

## ⚡ Deploy na Hostinger Cloud

1. **Suba o código** para um repositório GitHub (separado ou este mesmo).
2. No painel **Hostinger Cloud Deploy** → **New deployment**.
3. **Configurações:**
   - **Framework:** Next.js (detectado automático)
   - **Branch:** `main`
   - **Build command:** `npm run build` (padrão)
   - **Output directory:** `.next` (padrão)
   - **Node version:** 20 ou 22
4. **Variáveis de ambiente** (painel → Variables):
   - `DATABASE_URL` (string pooled do Neon, com `sslmode=require`)
   - `JWT_SECRET` (chave forte)
   - `JWT_EXPIRES_IN=8h`
   - `NODE_ENV=production`
   - `ADMIN_USERNAME=admin`
   - `ADMIN_PASSWORD=<senha forte>`
   - `APP_URL=https://hortigest.elitesistemas.io` (link dos e-mails de recuperação)
   - `RESEND_API_KEY=<chave do Resend>`
   - `EMAIL_FROM=HortiGest <no-reply@seudominio.com.br>` (domínio verificado no Resend)
5. **Build command override (se pedir):** `npx prisma generate && npx prisma migrate deploy && npm run build`
6. Adicione um script ao `package.json` (`db:setup`):
   ```json
   "db:setup": "npx prisma generate && npx prisma migrate deploy && node run-seed.cjs"
   ```
7. **Domínio:** aponte `hortigest.elitesistemas.io` para o deployment.
8. **SSL:** ativado automaticamente pela Hostinger Cloud.

Em cada push, a Hostinger detecta o commit e reimplanta automaticamente. 🎉

## 🔐 Login padrão

| | |
|--|--|
| URL | `https://hortigest.elitesistemas.io/` |
| Usuário | `admin` |
| Senha | a definida em `ADMIN_PASSWORD` |

⚠️ **Troque a senha** no primeiro acesso.

## 🔑 Recuperação de senha

1. Na tela de login, clique em **Esqueci minha senha** e informe o e-mail cadastrado.
2. O sistema envia (via [Resend](https://resend.com)) um link para `/redefinir-senha?token=...` com validade de 30 minutos e uso único.
3. Defina a nova senha (mínimo de 8 caracteres, com letras e números) e entre normalmente.

Configuração:

| Variável | Obrigatória | Descrição |
|----------|-------------|-----------|
| `APP_URL` (ou `NEXT_PUBLIC_APP_URL`) | sim | URL pública usada no link do e-mail |
| `RESEND_API_KEY` | não | API key do Resend; sem ela o link aparece no console do servidor |
| `EMAIL_FROM` | não | Remetente verificado, ex.: `HortiGest <no-reply@seudominio.com.br>` |
| `PASSWORD_RESET_DEV_LINK` | não | `true` exibe o link na tela **apenas fora de produção** |

O usuário só recebe o e-mail se tiver `email` cadastrado e estiver ativo. A resposta da API é sempre a mesma (genérica), inclusive para e-mails desconhecidos ou limite de solicitações excedido — limite de 3 por usuário e 10 por IP a cada 15 minutos. O token original nunca é gravado: o banco guarda apenas o hash SHA-256 em `password_reset_tokens`.

## 🛠️ Comandos úteis

| Comando | O que faz |
|---------|-----------|
| `npm run dev` | Inicia dev server (porta 3000) |
| `npm run build` | Build de produção |
| `npm start` | Inicia o servidor de produção |
| `npm run typecheck` | Verifica TypeScript |
| `npx prisma studio` | Abre GUI para o banco |
| `npx prisma migrate dev` | Cria migration nova |
| `npx prisma migrate deploy` | Aplica migrations |
| `node run-seed.cjs` | Cria admin + dados de exemplo |

## 📋 Notas técnicas

- **Sem `react-router-dom` em SSR.** O `BrowserRouter` foi removido para o client via `dynamic({ ssr: false })`. As páginas em `src/views/` rodam 100% no client.
- **API Routes** substituem o Express antigo. Cada endpoint antigo virou um arquivo em `src/app/api/*`.
- **PDF generation** continua usando `pdfkit` (roda no servidor).
- **Logo da empresa** é configurável via Configurações → Logo (igual à versão anterior).

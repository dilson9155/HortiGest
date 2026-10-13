// Cria rotas reais do Next.js para cada página.
// Em vez de usar react-router-dom (que precisa de SSR hack), usa App Router nativo.
const fs = require('fs');
const path = require('path');

const pages = [
  ['login',         'LoginPage',     ''],
  ['lancamentos',   'LaunchesPage',  ''],
  ['produtos',      'CadastrosPage', ' kind="products"'],
  ['fornecedores',  'CadastrosPage', ' kind="suppliers"'],
  ['relatorios',    'ReportsPage',   ''],
  ['usuarios',      'UsersPage',     ''],
  ['configuracoes', 'SettingsPage',  ''],
  ['auditoria',     'AuditPage',     ''],
];

const root = path.resolve(__dirname, '..', 'src', 'app');

// Para produtos/fornecedores, precisamos passar `kind` como prop. Vamos ajustar dinamicamente.

// 1) Página inicial -> DashboardPage
fs.writeFileSync(path.join(root, 'page.tsx'), `export { default } from '@/views/DashboardPage';\n`);

// 2) Páginas simples (só renderizam o componente)
for (const [p, view, extra] of pages) {
  const dir = path.join(root, p);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  if (extra) {
    // CadastrosPage recebe prop "kind"
    fs.writeFileSync(path.join(dir, 'page.tsx'),
      `import CadastrosPage from '@/views/CadastrosPage';\nexport default function Page() {\n  return <CadastrosPage${extra} />;\n}\n`);
  } else {
    fs.writeFileSync(path.join(dir, 'page.tsx'),
      `export { default } from '@/views/${view}';\n`);
  }
}

console.log('Páginas criadas com Next.js routes nativas!');

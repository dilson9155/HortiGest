// Adiciona 'use client' + dynamic = force-dynamic no topo de cada página.
// Usa leitura + escrita atômica (lê tudo, modifica, escreve) sem corromper.

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', 'src');
const targets = ['_unused_pages', 'components', 'layout', 'contexts', 'hooks', 'app'];

const substitutions = [
  [/\.\.\/lib\//g, '@/lib/'],
  [/\.\.\/components\//g, '@/components/'],
  [/\.\.\/hooks\//g, '@/hooks/'],
  [/\.\.\/contexts\//g, '@/contexts/'],
  [/\.\.\/layout\//g, '@/layout/'],
  [/\.\.\/pages\//g, '@/unused_pages/'],
  [/\.\.\/utils/g, '@/lib/utils'],
  [/\.\/UI'/g, '@/components/UI'],
  [/\.\/Toggle'/g, '@/components/Toggle'],
  [/\.\/SearchSelect'/g, '@/components/SearchSelect'],
];

function walk(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (/\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

let changed = 0;
for (const t of targets) {
  const dir = path.join(root, t);
  for (const f of walk(dir)) {
    let s = fs.readFileSync(f, 'utf8');
    let orig = s;

    // Para páginas: garante 'use client' + dynamic no topo
    if (t === '_unused_pages') {
      const header = "'use client';\n\nexport const dynamic = 'force-dynamic';\n\n";
      // Se já tem, remove antes de reaplicar (idempotente)
      s = s.replace(/^'use client';\s*\n*/m, '');
      s = s.replace(/^export const dynamic = 'force-dynamic';\s*\n*/m, '');
      s = header + s;
    }

    // Ajusta imports
    for (const [regex, replacement] of substitutions) {
      s = s.replace(regex, replacement);
    }

    if (s !== orig) {
      fs.writeFileSync(f, s, 'utf8');
      changed++;
    }
  }
}
console.log('Arquivos alterados:', changed);

// Move e ajusta aliases para as paginas.
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', 'src');
const from = path.join(root, 'pages');
const to = path.join(root, '_unused_pages');

if (fs.existsSync(to)) {
  fs.rmSync(to, { recursive: true });
}
fs.renameSync(from, to);

console.log('Renomeado para _unused_pages');

// Ajustar imports em todos os arquivos
function walk(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (/\.(tsx|ts)$/.test(e.name)) out.push(p);
  }
  return out;
}

let changed = 0;
for (const f of walk(root)) {
  let s = fs.readFileSync(f, 'utf8');
  const orig = s;
  s = s.replace(/@\/pages\//g, '@/unused_pages/');
  s = s.replace(/@\/unused_pages\/unused_pages\//g, '@/unused_pages/');
  if (s !== orig) {
    fs.writeFileSync(f, s, 'utf8');
    changed++;
  }
}
console.log('Imports ajustados:', changed);

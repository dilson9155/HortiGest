// Substitui imports @/* por caminhos relativos em TODOS os arquivos .ts/.tsx.
// Estrategia: caminho relativo baseado na profundidade do arquivo ate src/.
const fs = require('fs');
const path = require('path');

function walk(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (['node_modules', '.next', '.git'].includes(e.name)) continue;
      out.push(...walk(p));
    } else if (/\.tsx?$/.test(e.name) && !e.name.endsWith('.d.ts')) {
      out.push(p);
    }
  }
  return out;
}

// Calcula profundidade do arquivo em relacao a src/
function getDepthInSrc(file, srcRoot) {
  const rel = path.relative(srcRoot, file);
  const dir = path.dirname(rel);
  if (dir === '.') return 0;
  return dir.split(path.sep).length;
}

function relativeImport(fromFile, target) {
  const fromDir = path.dirname(fromFile);
  let rel = path.relative(fromDir, target).replace(/\\/g, '/');
  if (!rel.startsWith('.')) rel = './' + rel;
  return rel;
}

const root = path.resolve(__dirname, '..');

function processFile(file, srcRoot) {
  let src = fs.readFileSync(file, 'utf8');
  const orig = src;

  const depth = getDepthInSrc(file, srcRoot);
  const srcAbs = srcRoot;

  // Substituir @/components/... por caminho relativo
  src = src.replace(/from ['"]@\/([^'"]+)['"]/g, (match, subpath) => {
    const target = path.join(srcAbs, subpath);
    // Garante extensao .ts/.tsx/.js — webpack tenta resolver
    let resolved = relativeImport(file, target);
    // Se nao tem extensao, webpack tenta sozinho; deixa sem extensao
    return `from '${resolved}'`;
  });

  if (src !== orig) {
    fs.writeFileSync(file, src, 'utf8');
    return true;
  }
  return false;
}

const srcDir = path.join(root, 'src');
const files = walk(srcDir);
let changed = 0;
for (const f of files) {
  if (processFile(f, srcDir)) changed++;
}
console.log('Arquivos ajustados:', changed);

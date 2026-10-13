// Substitui react-router-dom imports por next/navigation nas paginas.
const fs = require('fs');
const path = require('path');

const substitutions = [
  ["import { useNavigate, useLocation } from 'react-router-dom';", "import { useRouter, usePathname } from 'next/navigation';"],
  ["import { useNavigate } from 'react-router-dom';", "import { useRouter as useNavigate } from 'next/navigation';"],
  ["import { Routes, Route, Navigate, useLocation } from 'react-router-dom';", "import { usePathname as useLocation, useRouter as useNavigate } from 'next/navigation';"],
  ["import { BrowserRouter } from 'react-router-dom';", "/* noop */"],
  ["<BrowserRouter>", "<>"],
  ["</BrowserRouter>", "</>"],
  ['const nav = useNavigate();', 'const _router = useRouter(); const nav = (path) => _router.push(path);'],
  ['const loc = useLocation();', 'const loc = usePathname();'],
  ['<Navigate to=', '<_NavigatePlaceholder to='],
  ['Navigate to=', '"use client";import { redirect } from "next/navigation";redirect('],
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

const root = path.resolve(__dirname, '..', 'src', 'views');
let changed = 0;
for (const f of walk(root)) {
  let s = fs.readFileSync(f, 'utf8');
  const orig = s;
  for (const [from, to] of substitutions) {
    s = s.split(from).join(to);
  }
  if (s !== orig) {
    fs.writeFileSync(f, s, 'utf8');
    changed++;
  }
}
console.log('Arquivos ajustados:', changed);

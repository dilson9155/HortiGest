/**
 * Catálogo de módulos e ações suportadas.
 * Cada perfil (Role) recebe um conjunto padrão de ações por módulo.
 */

export const MODULES = [
  'dashboard',
  'launches',
  'products',
  'suppliers',
  'reports',
  'users',
  'settings',
  'audit',
];

export const ACTIONS = ['view', 'create', 'edit', 'delete', 'export'];

export const FULL_ACCESS = {
  view: true,
  create: true,
  edit: true,
  delete: true,
  export: true,
};

/**
 * Constrói um mapa padrão de permissões para o "kind" de perfil.
 * ADMIN: tudo. SUPERVISOR: lançamentos, cadastros e relatórios.
 * OPERADOR: lançamentos básicos, sem acesso a usuários/configurações.
 */
export function buildDefaultPermissions(kind) {
  const base = (actions) => Object.fromEntries(ACTIONS.map((a) => [a, actions.includes(a)]));

  switch (kind) {
    case 'ADMIN':
      return Object.fromEntries(MODULES.map((m) => [m, base(ACTIONS)]));
    case 'SUPERVISOR':
      return {
        dashboard: base(['view', 'export']),
        launches: base(['view', 'create', 'edit', 'export']),
        products: base(['view', 'create', 'edit', 'export']),
        suppliers: base(['view', 'create', 'edit', 'export']),
        reports: base(['view', 'export']),
        users: base(['view']),
        settings: base(['view']),
        audit: base(['view', 'export']),
      };
    case 'OPERADOR':
      return {
        dashboard: base(['view']),
        launches: base(['view', 'create']),
        products: base(['view']),
        suppliers: base(['view']),
        reports: base(['view']),
        users: base([]),
        settings: base([]),
        audit: base([]),
      };
    default:
      return Object.fromEntries(MODULES.map((m) => [m, base([])]));
  }
}

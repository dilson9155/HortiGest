/**
 * Catálogo de módulos e ações suportadas.
 * Cada perfil (Role) recebe um conjunto padrão de ações por módulo.
 */

export const MODULES = [
  'dashboard',
  'launches',
  'launches_buyers',
  'launches_reviewers',
  'products',
  'suppliers',
  'reports',
  'users',
  'settings',
  'audit',
];

export const ACTIONS = ['view', 'create', 'edit', 'delete', 'export'];

export const MODULE_LABELS = {
  dashboard: 'Dashboard',
  launches: 'Lançamentos (legado)',
  launches_buyers: 'Lançamento compradores',
  launches_reviewers: 'Lançamento conferentes',
  products: 'Produtos',
  suppliers: 'Fornecedores',
  reports: 'Relatórios',
  users: 'Usuários',
  settings: 'Configurações',
  audit: 'Auditoria',
};

export const USER_MODULE_OPTIONS = Object.keys(MODULE_LABELS)
  .filter((module) => module !== 'launches')
  .map((module) => ({ module, label: MODULE_LABELS[module] }));

export function isModule(value) {
  return MODULES.includes(value);
}

export function hasModuleAccess(permissions, module, action, allowedModules = null) {
  if (!permissions) return false;

  if (allowedModules && allowedModules.length > 0) {
    const allowed =
      allowedModules.includes(module) ||
      (module === 'launches' &&
        (allowedModules.includes('launches_buyers') ||
          allowedModules.includes('launches_reviewers'))) ||
      ((module === 'launches_buyers' || module === 'launches_reviewers') &&
        allowedModules.includes('launches'));
    if (!allowed) return false;
  }

  const candidates =
    module === 'launches_buyers' || module === 'launches_reviewers'
      ? [module, 'launches']
      : [module];

  return candidates.some((m) => !!permissions[m]?.[action]);
}

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
  const launchesSupervisor = base(['view', 'create', 'edit', 'export']);
  const launchesOperador = base(['view', 'create']);

  switch (kind) {
    case 'ADMIN':
      return Object.fromEntries(MODULES.map((m) => [m, base(ACTIONS)]));
    case 'SUPERVISOR':
      return {
        dashboard: base(ACTIONS),
        launches: launchesSupervisor,
        launches_buyers: launchesSupervisor,
        launches_reviewers: launchesSupervisor,
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
        launches: launchesOperador,
        launches_buyers: launchesOperador,
        launches_reviewers: launchesOperador,
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

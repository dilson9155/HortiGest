// Permissões padrão dos perfis.
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
] as const;

export type Module = (typeof MODULES)[number];
export type Actions = 'view' | 'create' | 'edit' | 'delete' | 'export';

export type PermMap = Record<Module, Record<Actions, boolean>>;

export const MODULE_LABELS: Record<Module, string> = {
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

/** Módulos exibidos na escolha individual por usuário. */
export const USER_MODULE_OPTIONS = (Object.keys(MODULE_LABELS) as Module[])
  .filter((module) => module !== 'launches')
  .map((module) => ({ module, label: MODULE_LABELS[module] }));

export function isModule(value: string): value is Module {
  return (MODULES as readonly string[]).includes(value);
}

/**
 * Verifica ação permitida. Os dois módulos novos de lançamento herdam o
 * módulo legado `launches` para não exigir migração dos perfis existentes.
 */
export function hasModuleAccess(
  permissions: Partial<PermMap> | null | undefined,
  module: string,
  action: string,
  allowedModules: string[] | null = null,
) {
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

  return candidates.some((m) => !!(permissions as Record<string, Record<string, boolean>>)[m]?.[action]);
}

const FULL_ACCESS: Record<Actions, boolean> = {
  view: true, create: true, edit: true, delete: true, export: true,
};

const noAccess = (): Record<Actions, boolean> => ({
  view: false, create: false, edit: false, delete: false, export: false,
});

export function buildDefaultPermissions(kind: 'ADMIN' | 'SUPERVISOR' | 'OPERADOR'): PermMap {
  switch (kind) {
    case 'ADMIN':
      return {
        dashboard: { ...FULL_ACCESS },
        launches: { ...FULL_ACCESS },
        launches_buyers: { ...FULL_ACCESS },
        launches_reviewers: { ...FULL_ACCESS },
        products: { ...FULL_ACCESS },
        suppliers: { ...FULL_ACCESS },
        reports: { ...FULL_ACCESS },
        users: { ...FULL_ACCESS },
        settings: { ...FULL_ACCESS },
        audit: { ...FULL_ACCESS },
      };
    case 'SUPERVISOR': {
      const launches = { view: true, create: true, edit: true, delete: false, export: true };
      return {
        dashboard: { ...FULL_ACCESS },
        launches: { ...launches },
        launches_buyers: { ...launches },
        launches_reviewers: { ...launches },
        products: { view: true, create: true, edit: true, delete: false, export: true },
        suppliers: { view: true, create: true, edit: true, delete: false, export: true },
        reports: { view: true, create: false, edit: false, delete: false, export: true },
        users: { view: true, create: false, edit: false, delete: false, export: false },
        settings: { view: true, create: false, edit: false, delete: false, export: false },
        audit: { view: true, create: false, edit: false, delete: false, export: true },
      };
    }
    case 'OPERADOR': {
      const launches = { ...noAccess(), view: true, create: true };
      return {
        dashboard: { ...noAccess(), view: true },
        launches: { ...launches },
        launches_buyers: { ...launches },
        launches_reviewers: { ...launches },
        products: { ...noAccess(), view: true },
        suppliers: { ...noAccess(), view: true },
        reports: { ...noAccess(), view: true },
        users: noAccess(),
        settings: noAccess(),
        audit: noAccess(),
      };
    }
  }
}

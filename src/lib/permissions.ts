// Permissões padrão dos perfis.
export const MODULES = [
  'dashboard',
  'launches',
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
        products: { ...FULL_ACCESS },
        suppliers: { ...FULL_ACCESS },
        reports: { ...FULL_ACCESS },
        users: { ...FULL_ACCESS },
        settings: { ...FULL_ACCESS },
        audit: { ...FULL_ACCESS },
      };
    case 'SUPERVISOR':
      return {
        dashboard: { ...FULL_ACCESS },
        launches: { view: true, create: true, edit: true, delete: false, export: true },
        products: { view: true, create: true, edit: true, delete: false, export: true },
        suppliers: { view: true, create: true, edit: true, delete: false, export: true },
        reports: { view: true, create: false, edit: false, delete: false, export: true },
        users: { view: true, create: false, edit: false, delete: false, export: false },
        settings: { view: true, create: false, edit: false, delete: false, export: false },
        audit: { view: true, create: false, edit: false, delete: false, export: true },
      };
    case 'OPERADOR':
      return {
        dashboard: { ...noAccess(), view: true },
        launches: { ...noAccess(), view: true, create: true },
        products: { ...noAccess(), view: true },
        suppliers: { ...noAccess(), view: true },
        reports: { ...noAccess(), view: true },
        users: noAccess(),
        settings: noAccess(),
        audit: noAccess(),
      };
  }
}

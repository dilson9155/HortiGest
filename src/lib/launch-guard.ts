import { hasModuleAccess } from './permissions';
import type { SessionUser } from './session';
import type { LaunchPayload } from './launch-service';

type ExistingItem = {
  productId: string;
  supplierId: string;
  received: any;
  rendimento: any;
  entryTime: string | null;
  conferenteId: string | null;
  conferenteName: string | null;
  status: string;
};

type ExistingLaunch = {
  conferenteId?: string | null;
  conferenteName?: string | null;
  items?: ExistingItem[];
};

/** Só o setor de conferência pode informar/alterar estes dados. */
export function canEditReceivingData(session: SessionUser) {
  if (session.role?.kind === 'ADMIN') return true;
  return (['view', 'create', 'edit'] as const).some((action) =>
    hasModuleAccess(session.permissions, 'launches_reviewers', action, session.allowedModules),
  );
}

/**
 * Compradores podem mexer somente na previsão. Os campos de conferência
 * (conferente, recebido, rendimento e horário de conferência) são preservados
 * do registro existente ou forçados para o estado "aguardando" em novos itens.
 */
export function applyBuyerGuard(
  payload: LaunchPayload,
  session: SessionUser,
  existing?: ExistingLaunch | null,
): LaunchPayload {
  if (canEditReceivingData(session)) return payload;

  const byKey = new Map<string, ExistingItem>();
  (existing?.items ?? []).forEach((item) => {
    byKey.set(`${item.productId}_${item.supplierId}`, item);
  });

  return {
    ...payload,
    conferenteId: existing?.conferenteId ?? null,
    conferenteName: existing?.conferenteName ?? null,
    items: payload.items.map((item) => {
      const prev = byKey.get(`${item.productId}_${item.supplierId}`);
      const wasReceived = prev?.status === 'RECEBIDO';
      return {
        ...item,
        conferenteId: prev?.conferenteId ?? null,
        conferenteName: prev?.conferenteName ?? null,
        received: wasReceived ? Number(prev?.received ?? 0) : 0,
        rendimento: wasReceived ? Number(prev?.rendimento ?? 0) : 0,
        entryTime: wasReceived ? prev?.entryTime ?? null : null,
        status: wasReceived ? 'RECEBIDO' : 'PREVISTO',
      };
    }),
  };
}

'use client';

import { createContext, useContext } from 'react';

/** Informa às telas se o menu lateral está recolhido (para ampliar colunas). */
export const SidebarCollapsedContext = createContext(false);

export function useSidebarCollapsed() {
  return useContext(SidebarCollapsedContext);
}

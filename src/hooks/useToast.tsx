import { createContext, useCallback, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import { CheckCircle2, AlertTriangle, Info, XCircle, X } from 'lucide-react';
import clsx from 'clsx';

type ToastKind = 'success' | 'error' | 'warning' | 'info';
type Toast = { id: number; kind: ToastKind; message: string };
type Ctx = { toast: (kind: ToastKind, message: string) => void };

const ToastContext = createContext<Ctx | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);

  const toast = useCallback((kind: ToastKind, message: string) => {
    const id = Date.now() + Math.random();
    setItems((arr) => [...arr, { id, kind, message }]);
    setTimeout(() => {
      setItems((arr) => arr.filter((t) => t.id !== id));
    }, 5000);
  }, []);

  const styleFor = (k: ToastKind) =>
    ({
      success: 'bg-emerald-50 text-emerald-900 border-emerald-300',
      error: 'bg-red-50 text-red-900 border-red-300',
      warning: 'bg-amber-50 text-amber-900 border-amber-300',
      info: 'bg-sky-50 text-sky-900 border-sky-300',
    })[k];

  const iconFor = (k: ToastKind) => {
    const cls = 'shrink-0';
    switch (k) {
      case 'success': return <CheckCircle2 className={cls} size={20} />;
      case 'error': return <XCircle className={cls} size={20} />;
      case 'warning': return <AlertTriangle className={cls} size={20} />;
      case 'info': return <Info className={cls} size={20} />;
    }
  };

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed z-50 top-4 right-4 left-4 sm:left-auto sm:w-[420px] flex flex-col gap-2 safe-top pointer-events-none">
        {items.map((t) => (
          <div
            key={t.id}
            className={clsx(
              'flex items-start gap-3 rounded-xl border px-4 py-3 shadow-md bg-white pointer-events-auto',
              styleFor(t.kind),
            )}
          >
            {iconFor(t.kind)}
            <div className="text-sm flex-1">{t.message}</div>
            <button
              onClick={() => setItems((arr) => arr.filter((i) => i.id !== t.id))}
              className="text-slate-500 hover:text-slate-700"
              aria-label="Fechar"
            >
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast deve estar dentro de <ToastProvider>.');
  return ctx;
}

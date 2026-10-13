import { useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import clsx from 'clsx';

type Props = {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => Promise<void> | void | null | undefined;
  onCancel: () => void | null | undefined;
};

export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  danger,
  loading,
  onConfirm,
  onCancel,
}: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 p-2 sm:p-4 safe-bottom">
      <div className="card w-full max-w-md p-5 sm:p-6">
        <div className="flex items-start justify-between">
          <h2 className="text-base font-bold text-slate-900">{title}</h2>
          <button
            onClick={onCancel}
            className="text-slate-500 hover:text-slate-700 p-1"
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
        </div>
        {description && <p className="mt-2 text-sm text-slate-600">{description}</p>}

        <div className="mt-5 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <button
            type="button"
            className="btn-secondary"
            onClick={onCancel}
            disabled={loading}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={clsx(danger ? 'btn-danger' : 'btn-primary')}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading && <Loader2 className="animate-spin" size={16} />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

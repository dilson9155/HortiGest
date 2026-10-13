import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { Loader2 } from 'lucide-react';

// =================== Inputs ===================

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  hint?: string;
  error?: string;
};

export function Input({ label, hint, error, className, ...rest }: InputProps) {
  return (
    <div>
      {label && <label className="label">{label}</label>}
      <input className={clsx('input', error && 'border-red-400', className)} {...rest} />
      {hint && !error && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

type NumberProps = Omit<InputProps, 'type' | 'onChange' | 'value'> & {
  value: number | '';
  onValueChange: (n: number) => void;
  step?: number;
  min?: number;
  inputMode?: 'numeric' | 'decimal';
};

export function NumberInput({
  label,
  hint,
  error,
  value,
  onValueChange,
  step,
  min,
  inputMode = 'decimal',
  className,
}: NumberProps) {
  return (
    <div>
      {label && <label className="label">{label}</label>}
      <input
        type="number"
        inputMode={inputMode}
        step={step}
        min={min}
        value={value === '' || value == null ? '' : value}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
          const v = e.target.value;
          if (v === '') return onValueChange(0);
          const n = Number(v.replace(',', '.'));
          onValueChange(Number.isNaN(n) ? 0 : n);
        }}
        className={clsx('input no-spinner', error && 'border-red-400', className)}
      />
      {hint && !error && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & {
  label?: string;
  error?: string;
};

export function Select({ label, error, className, children, ...rest }: SelectProps) {
  return (
    <div>
      {label && <label className="label">{label}</label>}
      <select className={clsx('input', error && 'border-red-400', className)} {...rest}>
        {children}
      </select>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

// =================== Botões ===================

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  loading?: boolean;
};

export function Button({
  variant = 'primary',
  loading,
  className,
  children,
  disabled,
  ...rest
}: BtnProps) {
  const cls =
    variant === 'primary'
      ? 'btn-primary'
      : variant === 'secondary'
      ? 'btn-secondary'
      : variant === 'danger'
      ? 'btn-danger'
      : 'btn-ghost';
  return (
    <button className={clsx(cls, className)} disabled={loading || disabled} {...rest}>
      {loading && <Loader2 className="animate-spin" size={16} />}
      {children}
    </button>
  );
}

// =================== Modal ===================

export function Modal({
  open,
  onClose,
  title,
  children,
  width = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  width?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  const w =
    width === 'sm' ? 'max-w-sm' : width === 'lg' ? 'max-w-3xl' : width === 'xl' ? 'max-w-5xl' : 'max-w-md';

  return (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-slate-900/60">
      <div className="flex min-h-full items-end sm:items-center justify-center p-2 sm:p-4">
        <div className={clsx('card w-full p-5 sm:p-6', w)}>
          <div className="flex items-start justify-between gap-3 mb-4">
            <h2 className="text-base font-bold text-slate-900">{title}</h2>
            <button onClick={onClose} className="text-slate-500 hover:text-slate-700">
              ✕
            </button>
          </div>
          <div>{children}</div>
        </div>
      </div>
    </div>
  );
}

// =================== SectionCard ===================

export function SectionCard({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="card p-4 sm:p-5">
      <header className="mb-4 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-base font-bold text-slate-900">{title}</h2>
          {description && <p className="text-xs text-slate-500 mt-1">{description}</p>}
        </div>
        {actions && <div className="flex gap-2 flex-wrap">{actions}</div>}
      </header>
      {children}
    </section>
  );
}

// =================== Badge ===================

export function Badge({
  tone = 'slate',
  children,
}: {
  tone?: 'slate' | 'green' | 'red' | 'amber' | 'sky' | 'purple';
  children: React.ReactNode;
}) {
  const cls = {
    slate: 'bg-slate-100 text-slate-700',
    green: 'bg-emerald-100 text-emerald-800',
    red: 'bg-red-100 text-red-800',
    amber: 'bg-amber-100 text-amber-800',
    sky: 'bg-sky-100 text-sky-800',
    purple: 'bg-violet-100 text-violet-800',
  }[tone];
  return <span className={clsx('badge', cls)}>{children}</span>;
}

// =================== Skeleton ===================

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('animate-pulse bg-slate-100 rounded', className)} />;
}

// =================== ResponsiveTable ===================

export function ResponsiveTable<T>({
  items,
  row,
  empty,
  keyOf,
}: {
  items: T[];
  row: (item: T) => React.ReactNode;
  empty?: React.ReactNode;
  keyOf: (item: T) => string;
}) {
  return (
    <div>
      <div className="grid grid-cols-1 gap-3 md:hidden">
        {items.length === 0 ? (
          <div className="card p-6 text-center text-sm text-slate-500">{empty}</div>
        ) : (
          items.map((it) => (
            <div key={keyOf(it)} className="card p-3">
              {row(it)}
            </div>
          ))
        )}
      </div>
      <div className="hidden md:block">
        <table className="w-full text-sm">
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td className="p-4 text-center text-slate-500">{empty}</td>
              </tr>
            ) : (
              items.map((it) => <tr key={keyOf(it)}>{row(it)}</tr>)
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// =================== useDebounced ===================

export function useDebounced<T>(value: T, delay = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return v;
}

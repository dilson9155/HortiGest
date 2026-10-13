import clsx from 'clsx';

type ToggleProps = {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  size?: 'sm' | 'md';
  label?: string;
};

/**
 * Switch / Toggle moderno — acessível.
 * - Sem onlabel/offlabel visualmente.
 * - Cor verde (emerald-500) quando ativo.
 * - Animação suave.
 */
export default function Toggle({ checked, onChange, disabled, size = 'md', label }: ToggleProps) {
  const isMd = size === 'md';
  const trackW = isMd ? 'w-11' : 'w-9';
  const trackH = isMd ? 'h-6' : 'h-5';
  const thumbT = isMd ? 'h-5 w-5' : 'h-4 w-4';
  const translate = isMd ? (checked ? 'translate-x-5' : 'translate-x-0') : (checked ? 'translate-x-4' : 'translate-x-0');

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label || (checked ? 'Ativo' : 'Inativo')}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={clsx(
        'relative inline-flex shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-out',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-500',
        'disabled:opacity-40 disabled:cursor-not-allowed',
        trackW,
        trackH,
        checked ? 'bg-emerald-500 shadow-inner' : 'bg-slate-300 shadow-inner',
      )}
    >
      <span
        aria-hidden
        className={clsx(
          'pointer-events-none absolute top-0.5 left-0.5 inline-block rounded-full bg-white shadow-md ring-0 transition duration-200 ease-out',
          thumbT,
          translate,
        )}
      />
    </button>
  );
}

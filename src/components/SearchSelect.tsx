import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { Search, X, Check } from 'lucide-react';

/**
 * Combobox de busca (autocomplete).
 *
 * Comportamento desejado:
 *  - A lista fica OCULTA. Nada de "lista suspensa" abrindo ao clicar.
 *  - Ao COMEÇAR A DIGITAR, os itens filtrados aparecem.
 *  - Seleciona com clique ou Enter.
 *  - Esc / clique fora: fecha e limpa a busca (mantém o item selecionado).
 *  - A lista é renderizada no <body> para não ser cortada pelo overflow das
 *    tabelas de lançamento (Isso acontecia quando havia só uma linha).
 */

type Option = { id: string; label: string; meta?: string; disabled?: boolean; data?: any };

type Props = {
  items: Option[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string | undefined;
  disabled?: boolean;
  label?: string;
  required?: boolean;
  error?: string;
  icon?: React.ReactNode;
  meta?: (item: Option) => string | undefined;
  search?: (item: Option, q: string) => boolean;
  emptyLabel?: string;
  className?: string;
  compact?: boolean;
};

function defaultSearch(item: Option, q: string) {
  if (!q) return true;
  return item.label.toLowerCase().includes(q.toLowerCase());
}

export default function SearchSelect({
  items,
  value,
  onChange,
  placeholder,
  disabled,
  label,
  required,
  error,
  icon,
  meta,
  search,
  emptyLabel = 'Nada encontrado',
  className,
  compact,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // A lista vive no body; este ref faz o "clique fora" enxergá-la.
  const menuRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(() => items.find((it) => it.id === value), [items, value]);

  const filtered = useMemo(() => {
    const fn = search || defaultSearch;
    return items.filter((it) => fn(it, query));
  }, [items, query, search]);

  // Posiciona a lista abaixo (ou acima, quando não houver espaço) do campo.
  function positionMenu() {
    const input = inputRef.current;
    const menu = menuRef.current;
    if (!input || !menu) return;
    const r = input.getBoundingClientRect();
    const spaceBelow = window.innerHeight - r.bottom - 12;
    const spaceAbove = r.top - 12;
    const placeAbove = spaceBelow < 160 && spaceAbove > spaceBelow;

    menu.style.left = `${r.left}px`;
    menu.style.width = `${r.width}px`;
    menu.style.maxHeight = `${Math.max(120, Math.min(288, placeAbove ? spaceAbove : spaceBelow))}px`;
    const h = menu.offsetHeight;
    menu.style.top = `${placeAbove ? Math.max(8, r.top - 6 - h) : r.bottom + 6}px`;
  }

  useLayoutEffect(() => {
    if (open) positionMenu();
    // filtered.length altera a altura da lista: reposiciona antes da pintura.
  }, [open, filtered.length]);

  useEffect(() => {
    if (!open) return;
    // Acompanha scroll (inclusive o da tabela) e redimensionamento da janela.
    window.addEventListener('scroll', positionMenu, true);
    window.addEventListener('resize', positionMenu);
    return () => {
      window.removeEventListener('scroll', positionMenu, true);
      window.removeEventListener('resize', positionMenu);
    };
  }, [open]);

  // Fecha ao clicar fora. O menu está no body, por isso também é verificado.
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      const target = e.target as Node;
      if (containerRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
      setQuery('');
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  function close() {
    setOpen(false);
    setQuery('');
  }

  function choose(id: string) {
    onChange(id);
    close();
    inputRef.current?.blur();
  }

  function clear() {
    onChange('');
    setQuery('');
    setOpen(false);
    inputRef.current?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const it = filtered[activeIdx];
      if (it && !it.disabled) choose(it.id);
    } else if (e.key === 'Escape') {
      close();
    }
  }

  // A lista só aparece quando há texto digitado.
  function onChangeInput(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    setQuery(v);
    setOpen(v.trim().length > 0);
  }

  const displayValue = open ? query : selected?.label ?? '';

  return (
    <>
      <div className={clsx('relative', className)} ref={containerRef}>
        {label && (
          <label className="block text-sm font-semibold text-slate-700 mb-1">
            {label} {required && <span className="text-red-500">*</span>}
          </label>
        )}
        <div className="relative">
          {icon ? (
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
              {icon}
            </span>
          ) : (
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
            />
          )}
          <input
            ref={inputRef}
            type="text"
            disabled={disabled}
            value={displayValue}
            onChange={onChangeInput}
            onKeyDown={onKeyDown}
            onFocus={(e) => e.currentTarget.select()}
            placeholder={placeholder}
            title={open ? undefined : selected?.label ?? placeholder}
            className={clsx(
              'w-full pr-10 rounded-lg border-2 bg-white',
              compact ? 'h-9 pl-9 text-sm' : 'h-11 pl-10 text-base',
              'focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none transition',
              'placeholder:text-slate-400',
              error ? 'border-red-300' : 'border-slate-200',
              disabled && 'opacity-60 cursor-not-allowed bg-slate-50',
            )}
            autoComplete="off"
          />
          {value && !disabled && (
            <button
              type="button"
              onClick={clear}
              tabIndex={-1}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-slate-400 hover:text-red-500 hover:bg-red-50 transition"
              aria-label="Limpar"
            >
              <X size={15} />
            </button>
          )}
        </div>

        {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
      </div>

      {/* Lista: aparece somente enquanto o usuário digita. Portal evita cortes. */}
      {open &&
        createPortal(
          <div
            ref={menuRef}
            className="fixed z-[9999] bg-white rounded-xl border-2 border-slate-200 shadow-xl overflow-y-auto"
            style={{ top: -9999, left: -9999 }}
          >
            {filtered.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-slate-500">
                {emptyLabel}
                <div className="mt-1 text-sm">
                  para "<span className="font-semibold text-slate-700">{query}</span>"
                </div>
              </div>
            ) : (
              <ul role="listbox" className="py-1">
                {filtered.map((it, idx) => {
                  const isSel = it.id === value;
                  const isActive = idx === activeIdx;
                  const metaText = meta ? meta(it) : it.meta;
                  return (
                    <li
                      key={it.id}
                      role="option"
                      aria-selected={isSel}
                      aria-disabled={it.disabled}
                      onMouseEnter={() => setActiveIdx(idx)}
                      onClick={() => !it.disabled && choose(it.id)}
                      className={clsx(
                        'flex items-start justify-between px-3 py-2.5 text-sm cursor-pointer select-none transition',
                        isActive && 'bg-brand-50',
                        !isActive && 'hover:bg-slate-50',
                        it.disabled && 'opacity-50 cursor-not-allowed',
                      )}
                    >
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <Check
                          size={16}
                          className={clsx('shrink-0', isSel ? 'text-brand-600' : 'text-transparent')}
                        />
                        <span className={clsx('break-words leading-snug', isSel && 'font-semibold text-brand-700')}>
                          {it.label}
                        </span>
                        {metaText && (
                          <span className="ml-2 text-xs text-slate-400 break-words">{metaText}</span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}

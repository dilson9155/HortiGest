import { useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { Search, ChevronDown, X, Check } from 'lucide-react';

/**
 * Combobox pesquisável.
 *
 * Comportamento:
 *  - Foco/clique no campo: abre a lista com todos os itens (funciona no toque).
 *  - Digitar: filtra em tempo real.
 *  - Setas do teclado: navegam na lista.
 *  - Enter: seleciona item ativo.
 *  - Esc / clique fora: fecha e limpa a busca (mantém o item selecionado).
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
  meta?: (item: Option) => string | undefined;
  search?: (item: Option, q: string) => boolean;
  emptyLabel?: string;
  className?: string;
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
  meta,
  search,
  emptyLabel = 'Nada encontrado',
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(() => items.find((it) => it.id === value), [items, value]);

  const filtered = useMemo(() => {
    const fn = search || defaultSearch;
    return items.filter((it) => fn(it, query));
  }, [items, query, search]);

  // Fecha ao clicar fora. Sempre limpa a busca para não vazar texto antigo.
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  // Reseta o índice quando a lista filtrada muda
  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  function openAll() {
    if (disabled) return;
    setOpen(true);
    setActiveIdx(0);
  }

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
    setOpen(true);
    inputRef.current?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
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

  function onChangeInput(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    setQuery(v);
    setOpen(true);
  }

  // Mostra o texto digitado enquanto a lista está aberta; senão, o item selecionado.
  const displayValue = open && query.length > 0 ? query : selected?.label ?? '';

  return (
    <div className={clsx('relative', className)} ref={containerRef}>
      {label && (
        <label className="block text-xs font-semibold text-slate-700 mb-1">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}
      <div className="relative">
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
        />
        <input
          ref={inputRef}
          type="text"
          disabled={disabled}
          value={displayValue}
          onChange={onChangeInput}
          onKeyDown={onKeyDown}
          onFocus={openAll}
          onClick={openAll}
          placeholder={placeholder}
          className={clsx(
            'w-full h-11 pl-10 pr-16 text-sm rounded-lg border-2 bg-white',
            'focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none transition',
            'placeholder:text-slate-400',
            error ? 'border-red-300' : 'border-slate-200',
            disabled && 'opacity-60 cursor-not-allowed bg-slate-50',
          )}
          autoComplete="off"
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
          {value && !disabled && (
            <button
              type="button"
              onClick={clear}
              tabIndex={-1}
              className="p-1.5 rounded-md text-slate-400 hover:text-red-500 hover:bg-red-50 transition"
              aria-label="Limpar"
            >
              <X size={15} />
            </button>
          )}
          <button
            type="button"
            tabIndex={-1}
            onClick={openAll}
            disabled={disabled}
            className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 transition"
            aria-label="Abrir lista"
          >
            <ChevronDown size={15} className={clsx('transition-transform', open && 'rotate-180')} />
          </button>
        </div>
      </div>

      {open && (
        <div className="absolute z-30 left-0 right-0 mt-1.5 bg-white rounded-xl border-2 border-slate-200 shadow-xl max-h-72 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-slate-500">
              {emptyLabel}
              {query && (
                <div className="mt-1 text-xs">
                  para "<span className="font-semibold text-slate-700">{query}</span>"
                </div>
              )}
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
                      'flex items-center justify-between px-3 py-2.5 text-sm cursor-pointer select-none transition',
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
                      <span className={clsx('truncate', isSel && 'font-semibold text-brand-700')}>
                        {it.label}
                      </span>
                      {metaText && (
                        <span className="ml-2 text-xs text-slate-400 truncate">{metaText}</span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

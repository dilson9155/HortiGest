// Helpers numéricos e de data no padrão pt-BR.

export function brNum(v: unknown, decimals = 3): string {
  const n = Number(v ?? 0);
  // Valor zero nunca recebe casas decimais -> "0" em vez de "0,00".
  if (n === 0) return '0';
  return n.toLocaleString('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function brInt(v: unknown): string {
  const n = Number(v ?? 0);
  return n.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
}

export function brDate(d: Date | string | null | undefined): string {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('pt-BR');
}

export function brDateTime(d: Date | string | null | undefined): string {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (isNaN(date.getTime())) return '—';
  return date.toLocaleString('pt-BR');
}

export function isoDate(d: Date | string | null | undefined): string {
  if (!d) return '';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function toNumber(v: unknown): number {
  if (v === '' || v === null || v === undefined) return 0;
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
}

export function calcMissing(received: number, produced: number, broken: number): number {
  const r = Number(received ?? 0);
  const p = Number(produced ?? 0);
  const b = Number(broken ?? 0);
  const m = r - p - b;
  return m < 0 ? 0 : Number(m.toFixed(3));
}

export function percent(value: number, total: number): number {
  if (!total) return 0;
  return (value / total) * 100;
}

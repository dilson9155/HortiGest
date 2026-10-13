// Helpers puros (sem env, sem Prisma) — testáveis.

export function calcMissing(received: number, produced: number, broken: number): number {
  const r = Number(received ?? 0);
  const p = Number(produced ?? 0);
  const b = Number(broken ?? 0);
  const m = r - p - b;
  return m < 0 ? 0 : Number(m.toFixed(3));
}

/** "2026-10-12" -> Date UTC 00:00 */
export function parseDateOnly(input: unknown): Date | null {
  if (!input) return null;
  if (input instanceof Date) return input;
  const s = String(input);
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return null;
  return new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00.000Z`);
}

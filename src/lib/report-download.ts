import { api } from './api';

export type ReportFormat = 'pdf' | 'xlsx' | 'csv';

/**
 * Baixa um relatório no formato escolhido. O PDF continua na rota antiga;
 * XLSX e CSV usam a rota unificada de exportação.
 */
export async function downloadReport(
  query: string,
  format: ReportFormat,
  filenameBase: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const url =
    format === 'pdf'
      ? `/reports/pdf?${query}`
      : `/reports/export?${query}${query ? '&' : ''}format=${format}`;
  const res = await api.download(url);
  if (!res.ok) return { ok: false, message: res.error?.message || 'Falha ao gerar o arquivo.' };
  if (!('blob' in res)) return { ok: false, message: 'Resposta inválida do servidor.' };

  const filename = `${filenameBase}-${new Date().toISOString().slice(0, 10)}.${format}`;
  const objectUrl = URL.createObjectURL(res.blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
  return { ok: true };
}

export const FORMAT_LABEL: Record<ReportFormat, string> = {
  pdf: 'PDF',
  xlsx: 'Excel (.xlsx)',
  csv: 'Excel (.csv)',
};

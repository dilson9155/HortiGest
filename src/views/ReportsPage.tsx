'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { FileDown, FileSpreadsheet, RefreshCw, Search, FileText } from 'lucide-react';
import { api } from '../lib/api';
import { downloadReport, type ReportFormat } from '../lib/report-download';
import { brNum, isoDate } from '../lib/utils';
import { SectionCard, Input, Button, Spinner, Select } from '../components/UI';
import { useToast } from '../hooks/useToast';

type Item = {
  id: string;
  referenceDate: string;
  productName: string;
  supplierName: string;
  boxKg: string;
  forecast: string;
  received: string;
  rendimento: string;
  delta: number;
  forecastTime: string | null;
  entryTime: string | null;
  notes: string | null;
  dockName: string;
  conferenteName: string;
  compradorName: string;
  launch: { referenceDate: string; user?: { name: string } };
};

type Totals = {
  forecast: number;
  received: number;
  rendimento: number;
  delta: number;
  forecastKg: number;
  receivedKg: number;
  deltaKg: number;
};

const emptyFilters = {
  startDate: '',
  endDate: '',
  productId: '',
  supplierId: '',
  userId: '',
  dockId: '',
  conferenteId: '',
  compradorId: '',
  delta: '',
};

export default function ReportsPage() {
  const { toast } = useToast();
  const [filters, setFilters] = useState(emptyFilters);
  const [products, setProducts] = useState<{ id: string; name: string }[]>([]);
  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([]);
  const [docks, setDocks] = useState<{ id: string; name: string }[]>([]);
  const [conferentes, setConferentes] = useState<{ id: string; name: string }[]>([]);
  const [compradores, setCompradores] = useState<{ id: string; name: string }[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [loading, setLoading] = useState(false);

  async function loadOptions() {
    const [p, s, d, cf, cp] = await Promise.all([
      api.get('/products/options'),
      api.get('/suppliers/options'),
      api.get('/registries/docks/options'),
      api.get('/registries/conferentes/options'),
      api.get('/registries/compradores/options'),
    ]);
    if (p.ok) setProducts(p.data);
    if (s.ok) setSuppliers(s.data);
    if (d.ok) setDocks(d.data);
    if (cf.ok) setConferentes(cf.data);
    if (cp.ok) setCompradores(cp.data);
  }

  function query() {
    const qs = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => v && qs.set(k, v));
    return qs.toString();
  }

  async function search() {
    setLoading(true);
    const r = await api.get<{ items: Item[]; totals: Totals }>(`/reports/items?${query()}`);
    setLoading(false);
    if (r.ok) {
      setItems(r.data.items);
      setTotals(r.data.totals);
    } else {
      toast('error', r.error?.message || 'Falha ao buscar.');
    }
  }

  async function download(format: ReportFormat) {
    setLoading(true);
    const r = await downloadReport(query(), format, 'relatorio-recebimento');
    setLoading(false);
    if (r.ok) {
      toast('success', format === 'pdf' ? 'PDF gerado.' : `Arquivo ${format.toUpperCase()} gerado.`);
    } else {
      toast('error', r.message);
    }
  }

  useEffect(() => {
    loadOptions();
    search();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function clearFilters() {
    setFilters(emptyFilters);
    setTimeout(search, 0);
  }

  function deltaText(v: number) {
    return v === 0 ? '0' : `${v > 0 ? '+' : ''}${brNum(v, 0)}`;
  }

  return (
    <div className="space-y-4">
      <SectionCard
        title="Relatórios de recebimento"
        description="Filtre os itens conferidos, veja previsão x recebido, delta, horário e observações, e exporte em PDF, Excel (.xlsx) ou Excel (.csv)."
        actions={
          <>
            <Button variant="secondary" onClick={clearFilters}>
              Limpar filtros
            </Button>
            <Button variant="secondary" onClick={search}>
              <RefreshCw size={15} /> Filtrar
            </Button>
            <Button variant="secondary" onClick={() => download('xlsx')} title="Excel moderno, estilizado e com filtros">
              <FileSpreadsheet size={15} /> Excel (.xlsx)
            </Button>
            <Button variant="secondary" onClick={() => download('csv')} title="CSV compatível com Excel">
              <FileSpreadsheet size={15} /> Excel (.csv)
            </Button>
            <Button onClick={() => download('pdf')}>
              <FileDown size={15} /> Gerar PDF
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <Input type="date" label="Data inicial" value={filters.startDate} onChange={(e) => setFilters((f) => ({ ...f, startDate: e.target.value }))} />
          <Input type="date" label="Data final" value={filters.endDate} onChange={(e) => setFilters((f) => ({ ...f, endDate: e.target.value }))} />
          <Select label="Delta" value={filters.delta} onChange={(e) => setFilters((f) => ({ ...f, delta: e.target.value }))}>
            <option value="">Todos</option>
            <option value="MAIS">Veio a mais (recebido &gt; previsão)</option>
            <option value="MENOS">Veio a menos (recebido &lt; previsão)</option>
            <option value="OK">Sem diferença</option>
          </Select>
          <Select label="Produto" value={filters.productId} onChange={(e) => setFilters((f) => ({ ...f, productId: e.target.value }))}>
            <option value="">Todos</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
          <Select label="Fornecedor" value={filters.supplierId} onChange={(e) => setFilters((f) => ({ ...f, supplierId: e.target.value }))}>
            <option value="">Todos</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
          <Select label="Docа" value={filters.dockId} onChange={(e) => setFilters((f) => ({ ...f, dockId: e.target.value }))}>
            <option value="">Todas</option>
            {docks.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </Select>
          <Select label="Conferente" value={filters.conferenteId} onChange={(e) => setFilters((f) => ({ ...f, conferenteId: e.target.value }))}>
            <option value="">Todos</option>
            {conferentes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Select label="Comprador" value={filters.compradorId} onChange={(e) => setFilters((f) => ({ ...f, compradorId: e.target.value }))}>
            <option value="">Todos</option>
            {compradores.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </div>
      </SectionCard>

      <SectionCard
        title="Resultado"
        description={`${items.length} produto(s) recebido(s)${totals ? ` — totais agregados` : ''}`}
        actions={<Button variant="secondary" onClick={search}><Search size={15} /> Filtrar</Button>}
      >
        {loading ? (
          <div className="flex items-center justify-center p-10 gap-2 text-slate-500"><Spinner /> Carregando...</div>
        ) : items.length === 0 ? (
          <div className="p-6 text-center text-slate-500">
            <FileText className="mx-auto mb-2 text-slate-300" /> Sem entradas conferidas para o filtro informado.
          </div>
        ) : (
          <>
            <div className="hidden lg:block overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full min-w-[1700px] table-fixed text-sm">
                <colgroup>
                  <col className="w-[105px]" />
                  <col className="w-[120px]" />
                  <col className="w-[210px]" />
                  <col className="w-[190px]" />
                  <col className="w-[95px]" />
                  <col className="w-[95px]" />
                  <col className="w-[100px]" />
                  <col className="w-[90px]" />
                  <col className="w-[110px]" />
                  <col className="w-[150px]" />
                  <col className="w-[150px]" />
                  <col className="w-[285px]" />
                </colgroup>
                <thead className="text-left text-xs font-semibold text-white bg-gradient-to-r from-brand-700 to-brand-500">
                  <tr>
                    <th className="py-3 px-3 align-middle">Data</th>
                    <th className="py-3 px-3 align-middle">Horários prev./lanç.</th>
                    <th className="py-3 px-3 align-middle">Produto</th>
                    <th className="py-3 px-3 align-middle">Fornecedor</th>
                    <th className="py-3 px-3 text-right align-middle">Previsão</th>
                    <th className="py-3 px-3 text-right align-middle">Recebido</th>
                    <th className="py-3 px-3 text-right align-middle">Rendimento</th>
                    <th className="py-3 px-3 text-right align-middle">Delta</th>
                    <th className="py-3 px-3 align-middle">Docа</th>
                    <th className="py-3 px-3 align-middle">Conferente</th>
                    <th className="py-3 px-3 align-middle">Comprador</th>
                    <th className="py-3 px-3 align-middle">Observações</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, idx) => (
                    <tr key={it.id} className={clsx('border-b border-slate-100 transition-colors', idx % 2 === 0 ? 'bg-white' : 'bg-slate-50', 'hover:bg-brand-50')}>
                      <td className="py-3 px-3 align-top font-semibold text-slate-700 whitespace-normal break-words">
                        {isoDate(it.launch?.referenceDate || it.referenceDate).split('-').reverse().join('/')}
                      </td>
                      <td className="py-3 px-3 align-top text-xs whitespace-normal break-words">
                        <div><span className="text-slate-500">Prev:</span> <b className="text-sky-700">{it.forecastTime ?? '—'}</b></div>
                        <div><span className="text-slate-500">Lanç:</span> <b className="text-emerald-700">{it.entryTime ?? '—'}</b></div>
                      </td>
                      <td className="py-3 px-3 align-top font-medium text-slate-800 whitespace-normal break-words leading-snug" title={it.productName}>{it.productName}</td>
                      <td className="py-3 px-3 align-top text-slate-600 whitespace-normal break-words leading-snug" title={it.supplierName}>{it.supplierName}</td>
                      <td className="py-3 px-3 align-top text-right font-bold text-blue-700 whitespace-normal break-words">{brNum(Number(it.forecast), 0)}</td>
                      <td className="py-3 px-3 align-top text-right font-bold text-emerald-700 whitespace-normal break-words">{brNum(Number(it.received), 0)}</td>
                      <td className="py-3 px-3 align-top text-right font-bold text-purple-700 whitespace-normal break-words">{brNum(Number(it.rendimento), 0)}</td>
                      <td className={clsx('py-3 px-3 align-top text-right font-bold whitespace-normal break-words', it.delta < 0 ? 'text-red-700' : it.delta > 0 ? 'text-emerald-700' : 'text-slate-500')}>
                        {deltaText(it.delta)}
                      </td>
                      <td className="py-3 px-3 align-top text-slate-600 whitespace-normal break-words">{it.dockName}</td>
                      <td className="py-3 px-3 align-top text-slate-600 whitespace-normal break-words">{it.conferenteName}</td>
                      <td className="py-3 px-3 align-top text-slate-600 whitespace-normal break-words">{it.compradorName}</td>
                      <td className="py-3 px-3 align-top text-slate-600 whitespace-normal break-words" title={it.notes ?? ''}>{it.notes ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
                {totals && (
                  <tfoot>
                    <tr className="bg-gradient-to-r from-brand-700 to-brand-500 text-white font-bold border-t-4 border-brand-700">
                      <td colSpan={4} className="py-3 px-3 text-right uppercase text-sm tracking-wide">Totais</td>
                      <td className="py-3 px-3 text-right">{brNum(totals.forecast, 0)}</td>
                      <td className="py-3 px-3 text-right">{brNum(totals.received, 0)}</td>
                      <td className="py-3 px-3 text-right">{brNum(totals.rendimento, 0)}</td>
                      <td className="py-3 px-3 text-right">{deltaText(totals.delta)}</td>
                      <td colSpan={4} />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            <div className="lg:hidden space-y-3">
              {items.map((it) => (
                <div key={it.id} className="card p-4 border border-slate-200">
                  <div className="font-bold text-base text-slate-800 break-words leading-snug" title={it.productName}>{it.productName}</div>
                  <div className="text-xs text-slate-600 break-words">
                    {it.supplierName} · {isoDate(it.launch?.referenceDate || it.referenceDate).split('-').reverse().join('/')}
                  </div>
                  <div className="text-xs break-words">
                    <span className="text-slate-500">Previsto:</span> <b className="text-sky-700">{it.forecastTime ?? '—'}</b>
                    {' · '}
                    <span className="text-slate-500">Lançado:</span> <b className="text-emerald-700">{it.entryTime ?? '—'}</b>
                  </div>
                  <div className="mt-3 grid grid-cols-4 text-center border-y border-slate-100 py-2">
                    <div><div className="text-xs text-slate-500 uppercase">Previsão</div><div className="font-bold text-blue-700">{brNum(Number(it.forecast), 0)}</div></div>
                    <div><div className="text-xs text-slate-500 uppercase">Recebido</div><div className="font-bold text-emerald-700">{brNum(Number(it.received), 0)}</div></div>
                    <div><div className="text-xs text-slate-500 uppercase">Rendimento</div><div className="font-bold text-purple-700">{brNum(Number(it.rendimento), 0)}</div></div>
                    <div><div className="text-xs text-slate-500 uppercase">Delta</div><div className={clsx('font-bold', it.delta < 0 ? 'text-red-700' : it.delta > 0 ? 'text-emerald-700' : 'text-slate-500')}>{deltaText(it.delta)}</div></div>
                  </div>
                  <div className="text-xs text-slate-600 mt-2 break-words"><b>Docа:</b> {it.dockName} · <b>Conferente:</b> {it.conferenteName} · <b>Comprador:</b> {it.compradorName}</div>
                  {it.notes && <div className="text-xs text-slate-600 mt-1 break-words"><b>Observações:</b> {it.notes}</div>}
                </div>
              ))}
              {totals && (
                <div className="card p-4 border-2 border-brand-200 bg-brand-50">
                  <div className="font-bold text-base mb-2 text-slate-800">TOTAIS</div>
                  <div className="grid grid-cols-4 text-center">
                    <div><div className="text-xs text-slate-600">Previsão</div><div className="font-bold text-blue-700">{brNum(totals.forecast, 0)}</div></div>
                    <div><div className="text-xs text-slate-600">Recebido</div><div className="font-bold text-emerald-700">{brNum(totals.received, 0)}</div></div>
                    <div><div className="text-xs text-slate-600">Rendimento</div><div className="font-bold text-purple-700">{brNum(totals.rendimento, 0)}</div></div>
                    <div><div className="text-xs text-slate-600">Delta</div><div className="font-bold">{deltaText(totals.delta)}</div></div>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </SectionCard>
    </div>
  );
}

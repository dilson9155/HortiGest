'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { FileDown, RefreshCw, Search, FileText } from 'lucide-react';
import { api } from '../lib/api';
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

  async function downloadPdf() {
    setLoading(true);
    const r = await api.download(`/reports/pdf?${query()}`);
    setLoading(false);
    if (r.ok && 'blob' in r) {
      const url = URL.createObjectURL(r.blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `relatorio-recebimento-${Date.now()}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast('success', 'PDF gerado.');
    } else if (!r.ok) {
      toast('error', r.error?.message || 'Falha ao gerar PDF.');
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
        description="Filtre os produtos recebidos, veja previsão x recebido, delta, horário e observações, e gere o PDF."
        actions={
          <>
            <Button variant="secondary" onClick={clearFilters}>
              Limpar filtros
            </Button>
            <Button variant="secondary" onClick={search}>
              <RefreshCw size={15} /> Filtrar
            </Button>
            <Button onClick={downloadPdf}>
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
            <FileText className="mx-auto mb-2 text-slate-300" /> Sem produtos recebidos para o filtro informado.
          </div>
        ) : (
          <>
            <div className="hidden lg:block overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-base">
                <thead className="text-left text-sm font-semibold text-white bg-gradient-to-r from-brand-700 to-brand-500">
                  <tr>
                    <th className="py-3 px-3">Data</th>
                    <th className="py-3 px-3">Horário</th>
                    <th className="py-3 px-3">Produto</th>
                    <th className="py-3 px-3">Fornecedor</th>
                    <th className="py-3 px-3 text-right">Previsão</th>
                    <th className="py-3 px-3 text-right">Recebido</th>
                    <th className="py-3 px-3 text-right">Rendimento</th>
                    <th className="py-3 px-3 text-right">Delta</th>
                    <th className="py-3 px-3">Docа</th>
                    <th className="py-3 px-3">Conferente</th>
                    <th className="py-3 px-3">Comprador</th>
                    <th className="py-3 px-3">Observações</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, idx) => (
                    <tr key={it.id} className={clsx('border-b border-slate-100 transition-colors', idx % 2 === 0 ? 'bg-white' : 'bg-slate-50', 'hover:bg-brand-50')}>
                      <td className="py-3 px-3 font-semibold text-slate-700 whitespace-nowrap">
                        {isoDate(it.launch?.referenceDate || it.referenceDate).split('-').reverse().join('/')}
                      </td>
                      <td className="py-3 px-3 font-bold text-brand-700 whitespace-nowrap">{it.entryTime ?? '—'}</td>
                      <td className="py-3 px-3 font-medium text-slate-800">{it.productName}</td>
                      <td className="py-3 px-3 text-slate-600">{it.supplierName}</td>
                      <td className="py-3 px-3 text-right font-bold text-blue-700">{brNum(Number(it.forecast), 0)}</td>
                      <td className="py-3 px-3 text-right font-bold text-emerald-700">{brNum(Number(it.received), 0)}</td>
                      <td className="py-3 px-3 text-right font-bold text-purple-700">{brNum(Number(it.rendimento), 0)}</td>
                      <td className={clsx('py-3 px-3 text-right font-bold', it.delta > 0 ? 'text-red-700' : it.delta < 0 ? 'text-emerald-700' : 'text-slate-500')}>
                        {deltaText(it.delta)}
                      </td>
                      <td className="py-3 px-3 text-slate-600">{it.dockName}</td>
                      <td className="py-3 px-3 text-slate-600">{it.conferenteName}</td>
                      <td className="py-3 px-3 text-slate-600">{it.compradorName}</td>
                      <td className="py-3 px-3 text-slate-600 max-w-[220px] truncate" title={it.notes ?? ''}>{it.notes ?? '—'}</td>
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
                  <div className="font-bold text-lg text-slate-800">{it.productName}</div>
                  <div className="text-sm text-slate-600">
                    {it.supplierName} · {isoDate(it.launch?.referenceDate || it.referenceDate).split('-').reverse().join('/')} · {it.entryTime ?? '—'}
                  </div>
                  <div className="mt-3 grid grid-cols-4 text-center border-y border-slate-100 py-2">
                    <div><div className="text-xs text-slate-500 uppercase">Previsão</div><div className="font-bold text-blue-700">{brNum(Number(it.forecast), 0)}</div></div>
                    <div><div className="text-xs text-slate-500 uppercase">Recebido</div><div className="font-bold text-emerald-700">{brNum(Number(it.received), 0)}</div></div>
                    <div><div className="text-xs text-slate-500 uppercase">Rendimento</div><div className="font-bold text-purple-700">{brNum(Number(it.rendimento), 0)}</div></div>
                    <div><div className="text-xs text-slate-500 uppercase">Delta</div><div className={clsx('font-bold', it.delta > 0 ? 'text-red-700' : it.delta < 0 ? 'text-emerald-700' : 'text-slate-500')}>{deltaText(it.delta)}</div></div>
                  </div>
                  <div className="text-sm text-slate-600 mt-2"><b>Docа:</b> {it.dockName} · <b>Conferente:</b> {it.conferenteName} · <b>Comprador:</b> {it.compradorName}</div>
                  {it.notes && <div className="text-sm text-slate-600 mt-1"><b>Observações:</b> {it.notes}</div>}
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

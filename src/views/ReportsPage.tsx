'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { FileDown, RefreshCw, Search, FileText } from 'lucide-react';
import { api } from '../lib/api';
import { brNum, isoDate, todayISO } from '../lib/utils';
import { SectionCard, Input, Button, Spinner, Select } from '../components/UI';
import { useToast } from '../hooks/useToast';

type Item = {
  id: string;
  referenceDate: string;
  productName: string;
  supplierName: string;
  boxKg: string;
  received: string;
  produced: string;
  broken: string;
  missing: string;
  launch: { referenceDate: string; user?: { name: string } };
};

type Totals = {
  received: number;
  produced: number;
  broken: number;
  missing: number;
  receivedKg: number;
  producedKg: number;
  brokenKg: number;
  missingKg: number;
};

export default function ReportsPage() {
  const { toast } = useToast();
  const [filters, setFilters] = useState({
    startDate: '',
    endDate: '',
    productId: '',
    supplierId: '',
    userId: '',
    entity: '',
  });
  const [products, setProducts] = useState<{ id: string; name: string }[]>([]);
  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [loading, setLoading] = useState(false);

  async function loadOptions() {
    const [p, s] = await Promise.all([api.get('/products/options'), api.get('/suppliers/options')]);
    if (p.ok) setProducts(p.data);
    if (s.ok) setSuppliers(s.data);
  }

  async function search() {
    setLoading(true);
    const qs = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => v && qs.set(k, v));
    const r = await api.get<{ items: Item[]; totals: Totals }>(`/reports/items?${qs.toString()}`);
    setLoading(false);
    if (r.ok) {
      setItems(r.data.items);
      setTotals(r.data.totals);
    } else {
      toast('error', r.error?.message || 'Falha ao buscar.');
    }
  }

  async function downloadPdf() {
    const qs = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => v && qs.set(k, v));
    setLoading(true);
    const r = await api.download(`/reports/pdf?${qs.toString()}`);
    setLoading(false);
    if (r.ok && 'blob' in r) {
      const url = URL.createObjectURL(r.blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `relatorio-hortifruti-${Date.now()}.pdf`;
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
    setFilters({ startDate: '', endDate: '', productId: '', supplierId: '', userId: '', entity: '' });
    setTimeout(search, 0);
  }

  return (
    <div className="space-y-4">
      <SectionCard
        title="Relatórios"
        description="Aplique filtros, visualize os dados e gere um PDF profissional."
        actions={
          <>
            <Button variant="secondary" onClick={clearFilters}>
              Limpar filtros
            </Button>
            <Button variant="secondary" onClick={search}>
              <RefreshCw size={14} /> Filtrar
            </Button>
            <Button onClick={downloadPdf}>
              <FileDown size={14} /> Gerar PDF
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Input
            type="date"
            label="Data inicial"
            value={filters.startDate}
            onChange={(e) => setFilters((f) => ({ ...f, startDate: e.target.value }))}
          />
          <Input
            type="date"
            label="Data final"
            value={filters.endDate}
            onChange={(e) => setFilters((f) => ({ ...f, endDate: e.target.value }))}
          />
          <Select
            label="Tipo"
            value={filters.entity}
            onChange={(e) => setFilters((f) => ({ ...f, entity: e.target.value }))}
          >
            <option value="">Todos os lançamentos</option>
            <option value="BREAK">Apenas com quebra</option>
            <option value="MISSING">Apenas com falta</option>
          </Select>
          <Select
            label="Produto"
            value={filters.productId}
            onChange={(e) => setFilters((f) => ({ ...f, productId: e.target.value }))}
          >
            <option value="">Todos</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
          <Select
            label="Fornecedor"
            value={filters.supplierId}
            onChange={(e) => setFilters((f) => ({ ...f, supplierId: e.target.value }))}
          >
            <option value="">Todos</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </div>
      </SectionCard>

      <SectionCard
        title="Resultado"
        description={`${items.length} registro(s)${totals ? ` — totais agregados` : ''}`}
        actions={
          <Button variant="secondary" onClick={search}>
            <Search size={14} /> Filtrar
          </Button>
        }
      >
        {loading ? (
          <div className="flex items-center justify-center p-10 gap-2 text-slate-500">
            <Spinner /> Carregando...
          </div>
        ) : items.length === 0 ? (
          <div className="p-6 text-center text-slate-500">
            <FileText className="mx-auto mb-2 text-slate-300" /> Sem dados para o filtro informado.
          </div>
        ) : (
          <>
            {/* Desktop */}
            <div className="hidden md:block overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-sm">
                <thead className="text-left text-[11px] uppercase tracking-wider text-white bg-gradient-to-r from-brand-700 to-brand-500">
                  <tr>
                    <th className="py-3 px-3 font-bold">Data</th>
                    <th className="py-3 px-3 font-bold">Produto</th>
                    <th className="py-3 px-3 font-bold">Fornecedor</th>
                    <th className="py-3 px-3 font-bold text-right">Recebido</th>
                    <th className="py-3 px-3 font-bold text-right">Produzido</th>
                    <th className="py-3 px-3 font-bold text-right">Quebra</th>
                    <th className="py-3 px-3 font-bold text-right">Falta</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, idx) => {
                    const r = Number(it.received);
                    const p = Number(it.produced);
                    const b = Number(it.broken);
                    const m = Number(it.missing);
                    return (
                      <tr
                        key={it.id}
                        className={clsx(
                          'border-b border-slate-100 transition-colors',
                          idx % 2 === 0 ? 'bg-white' : 'bg-slate-50',
                          'hover:bg-brand-50',
                        )}
                      >
                        <td className="py-3 px-3 font-semibold text-slate-700">
                          {isoDate(it.launch?.referenceDate || it.referenceDate).split('-').reverse().join('/')}
                        </td>
                        <td className="py-3 px-3 font-medium text-slate-800">{it.productName}</td>
                        <td className="py-3 px-3 text-slate-600">{it.supplierName}</td>
                        <td className="py-3 px-3 text-right font-bold text-brand-700">{brNum(r, 0)}</td>
                        <td className="py-3 px-3 text-right font-bold text-emerald-700">{brNum(p, 0)}</td>
                        <td className="py-3 px-3 text-right font-bold text-amber-700">{brNum(b, 0)}</td>
                        <td className={clsx('py-3 px-3 text-right font-bold', m > 0 ? 'text-red-700' : 'text-emerald-700')}>
                          {brNum(m, 0)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {totals && (
                  <tfoot>
                    <tr className="bg-gradient-to-r from-brand-700 to-brand-500 text-white font-bold border-t-4 border-brand-700">
                      <td colSpan={3} className="py-3 px-3 text-right uppercase text-[11px] tracking-wider">TOTAIS</td>
                      <td className="py-3 px-3 text-right">{brNum(totals.received, 0)}</td>
                      <td className="py-3 px-3 text-right">{brNum(totals.produced, 0)}</td>
                      <td className="py-3 px-3 text-right">{brNum(totals.broken, 0)}</td>
                      <td className="py-3 px-3 text-right">{brNum(totals.missing, 0)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            {/* Mobile */}
            <div className="md:hidden space-y-3">
              {items.map((it) => {
                const r = Number(it.received);
                const p = Number(it.produced);
                const b = Number(it.broken);
                const m = Number(it.missing);
                return (
                  <div key={it.id} className="card p-3 border border-slate-200">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-slate-800">{it.productName}</div>
                        <div className="text-xs text-slate-500">{it.supplierName}</div>
                        <div className="text-xs text-slate-400 mt-0.5">
                          {isoDate(it.launch?.referenceDate || it.referenceDate).split('-').reverse().join('/')}
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-4 text-center">
                      <div><div className="text-[10px] text-slate-500 uppercase">Rec.</div><div className="font-bold text-brand-700">{brNum(r, 0)}</div></div>
                      <div><div className="text-[10px] text-slate-500 uppercase">Prod.</div><div className="font-bold text-emerald-700">{brNum(p, 0)}</div></div>
                      <div><div className="text-[10px] text-slate-500 uppercase">Queb.</div><div className="font-bold text-amber-700">{brNum(b, 0)}</div></div>
                      <div><div className="text-[10px] text-slate-500 uppercase">Falta</div><div className={clsx('font-bold', m > 0 ? 'text-red-700' : 'text-emerald-700')}>{brNum(m, 0)}</div></div>
                    </div>
                  </div>
                );
              })}
              {totals && (
                <div className="card p-3 border-2 border-brand-200 bg-gradient-to-br from-brand-50 to-emerald-50">
                  <div className="font-bold text-sm mb-2 text-slate-800">TOTAIS</div>
                  <div className="grid grid-cols-4 text-center text-xs">
                    <div><div className="text-[10px] text-slate-500 uppercase">Rec.</div><div className="font-bold text-brand-700">{brNum(totals.received, 0)}</div></div>
                    <div><div className="text-[10px] text-slate-500 uppercase">Prod.</div><div className="font-bold text-emerald-700">{brNum(totals.produced, 0)}</div></div>
                    <div><div className="text-[10px] text-slate-500 uppercase">Queb.</div><div className="font-bold text-amber-700">{brNum(totals.broken, 0)}</div></div>
                    <div><div className="text-[10px] text-slate-500 uppercase">Falta</div><div className="font-bold text-red-700">{brNum(totals.missing, 0)}</div></div>
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

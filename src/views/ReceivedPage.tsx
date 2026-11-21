'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import {
  CheckCircle2,
  Clock3,
  FileDown,
  Pencil,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import { api, errorMessage } from '../lib/api';
import { brNum, isoDate, todayISO } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../hooks/useToast';
import { Badge, Button, Input, SectionCard, Select, Spinner } from '../components/UI';

type Named = { id: string; name: string; active?: boolean };

type ReceivedItem = {
  id: string;
  launchId: string;
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
  launch: { referenceDate: string; user?: { name: string } | null };
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
  dockId: '',
  conferenteId: '',
  compradorId: '',
  userId: '',
  delta: '',
  q: '',
  timeFrom: '',
  timeTo: '',
};

function deltaLabel(v: number) {
  if (!v) return '0';
  return `${v > 0 ? '+' : ''}${brNum(v, 0)}`;
}

function dateBR(d: unknown) {
  const s = isoDate(d as string);
  return s ? s.split('-').reverse().join('/') : '—';
}

export default function ReceivedPage() {
  const { can } = useAuth();
  const { toast } = useToast();
  const [filters, setFilters] = useState(emptyFilters);
  const [products, setProducts] = useState<Named[]>([]);
  const [suppliers, setSuppliers] = useState<Named[]>([]);
  const [docks, setDocks] = useState<Named[]>([]);
  const [conferentes, setConferentes] = useState<Named[]>([]);
  const [compradores, setCompradores] = useState<Named[]>([]);
  const [users, setUsers] = useState<Named[]>([]);
  const [items, setItems] = useState<ReceivedItem[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [loading, setLoading] = useState(false);

  function set<K extends keyof typeof emptyFilters>(key: K, value: string) {
    setFilters((f) => ({ ...f, [key]: value }));
  }

  function query() {
    const qs = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => {
      if (v) qs.set(k, v);
    });
    return qs.toString();
  }

  async function search() {
    setLoading(true);
    const r = await api.get<{ items: ReceivedItem[]; totals: Totals }>(`/reports/items?${query()}`);
    setLoading(false);
    if (r.ok) {
      setItems(r.data.items);
      setTotals(r.data.totals);
    } else {
      toast('error', errorMessage(r, 'Falha ao carregar produtos recebidos.'));
    }
  }

  useEffect(() => {
    (async () => {
      const jobs: Promise<any>[] = [
        api.get('/products/options?includeInactive=1'),
        api.get('/suppliers/options?includeInactive=1'),
        api.get('/registries/docks/options?includeInactive=1'),
        api.get('/registries/conferentes/options?includeInactive=1'),
        api.get('/registries/compradores/options?includeInactive=1'),
      ];
      const [p, s, d, cf, cp, u] = await Promise.all([
        ...jobs,
        can('users', 'view') ? api.get('/users?pageSize=200') : Promise.resolve(null),
      ]);
      if (p?.ok) setProducts(p.data);
      if (s?.ok) setSuppliers(s.data);
      if (d?.ok) setDocks(d.data);
      if (cf?.ok) setConferentes(cf.data);
      if (cp?.ok) setCompradores(cp.data);
      if (u?.ok) setUsers((u.data.items ?? u.data) as Named[]);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    search();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  function period(days: number | null) {
    if (days === null) {
      setFilters((f) => ({ ...f, startDate: '', endDate: '' }));
      return;
    }
    const end = todayISO();
    const start = new Date();
    start.setDate(start.getDate() - (days - 1));
    const s = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;
    setFilters((f) => ({ ...f, startDate: s, endDate: end }));
  }

  async function downloadPdf() {
    setLoading(true);
    const r = await api.download(`/reports/pdf?${query()}`);
    setLoading(false);
    if (r.ok && 'blob' in r) {
      const url = URL.createObjectURL(r.blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `produtos-recebidos-${Date.now()}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast('success', 'PDF gerado.');
    } else if (!r.ok) {
      toast('error', errorMessage(r, 'Falha ao gerar PDF.'));
    }
  }

  const activeFilters = useMemo(
    () => Object.values(filters).filter(Boolean).length,
    [filters],
  );

  return (
    <div className="space-y-5 max-w-[1500px] mx-auto">
      <SectionCard
        title="Produtos recebidos"
        description="Estoque real: todos os itens conferidos, com previsão, recebido, rendimento (informado à mão, base de pagamento ao fornecedor), delta, horário, doca, comprador, conferente e observações."
        actions={
          <>
            <Button variant="secondary" onClick={() => setFilters(emptyFilters)}>
              <X size={15} /> Limpar filtros
            </Button>
            <Button variant="secondary" onClick={search}>
              <RefreshCw size={15} /> Atualizar
            </Button>
            {can('reports', 'export') && (
              <Button onClick={downloadPdf}>
                <FileDown size={15} /> Gerar PDF
              </Button>
            )}
          </>
        }
      >
        <div className="flex flex-wrap gap-2 mb-4">
          <span className="self-center text-sm font-semibold text-slate-600 mr-1">Período rápido:</span>
          <Button variant="secondary" onClick={() => period(1)}>Hoje</Button>
          <Button variant="secondary" onClick={() => period(7)}>Últimos 7 dias</Button>
          <Button variant="secondary" onClick={() => period(30)}>Últimos 30 dias</Button>
          <Button variant="secondary" onClick={() => period(null)}>Todo o período</Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          <Input type="date" label="De" value={filters.startDate} onChange={(e) => set('startDate', e.target.value)} />
          <Input type="date" label="Até" value={filters.endDate} onChange={(e) => set('endDate', e.target.value)} />
          <div>
            <label className="label">Produto</label>
            <Select value={filters.productId} onChange={(e) => set('productId', e.target.value)}>
              <option value="">Todos</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </div>
          <div>
            <label className="label">Fornecedor</label>
            <Select value={filters.supplierId} onChange={(e) => set('supplierId', e.target.value)}>
              <option value="">Todos</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </div>
          <div>
            <label className="label">Docа</label>
            <Select value={filters.dockId} onChange={(e) => set('dockId', e.target.value)}>
              <option value="">Todas</option>
              {docks.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </Select>
          </div>
          <div>
            <label className="label">Conferente</label>
            <Select value={filters.conferenteId} onChange={(e) => set('conferenteId', e.target.value)}>
              <option value="">Todos</option>
              {conferentes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </div>
          <div>
            <label className="label">Comprador</label>
            <Select value={filters.compradorId} onChange={(e) => set('compradorId', e.target.value)}>
              <option value="">Todos</option>
              {compradores.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </div>
          {users.length > 0 && (
            <div>
              <label className="label">Lançado por</label>
              <Select value={filters.userId} onChange={(e) => set('userId', e.target.value)}>
                <option value="">Todos</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </Select>
            </div>
          )}
          <div>
            <label className="label">Diferença</label>
            <Select value={filters.delta} onChange={(e) => set('delta', e.target.value)}>
              <option value="">Todas</option>
              <option value="MAIS">Veio a mais</option>
              <option value="MENOS">Veio a menos</option>
              <option value="OK">Sem diferença</option>
            </Select>
          </div>
          <Input type="time" label="Horário a partir de" value={filters.timeFrom} onChange={(e) => set('timeFrom', e.target.value)} />
          <Input type="time" label="Horário até" value={filters.timeTo} onChange={(e) => set('timeTo', e.target.value)} />
          <div className="sm:col-span-2 xl:col-span-4">
            <Input
              label="Buscar"
              value={filters.q}
              onChange={(e) => set('q', e.target.value)}
              placeholder="Produto, fornecedor, doca, conferente, comprador ou observação..."
            />
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Resultado"
        description={`${items.length} produto(s) recebido(s)${activeFilters ? ` · ${activeFilters} filtro(s) ativo(s)` : ''}`}
        actions={<Badge tone={loading ? 'slate' : 'green'}>{loading ? 'Carregando' : 'Atualizado'}</Badge>}
      >
        {loading && items.length === 0 ? (
          <div className="flex items-center justify-center gap-2 p-10 text-slate-500"><Spinner /> Carregando...</div>
        ) : items.length === 0 ? (
          <div className="p-10 text-center text-slate-500">
            <CheckCircle2 className="mx-auto mb-2 text-emerald-300" size={36} />
            Nenhum produto recebido para os filtros informados.
          </div>
        ) : (
          <>
            <div className="hidden xl:block overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-base">
                <thead className="text-left text-sm font-semibold text-white bg-gradient-to-r from-emerald-700 to-brand-600">
                  <tr>
                    <th className="py-3 px-3">Data</th>
                    <th className="py-3 px-3">Horários prev./lanç.</th>
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
                    <th className="py-3 px-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, idx) => (
                    <tr key={it.id} className={clsx('border-b border-slate-100', idx % 2 === 0 ? 'bg-white' : 'bg-slate-50', 'hover:bg-emerald-50')}>
                      <td className="py-3 px-3 font-semibold whitespace-nowrap">{dateBR(it.referenceDate)}</td>
                      <td className="py-3 px-3 text-xs whitespace-nowrap">
                        <div><span className="text-slate-500">Prev:</span> <b className="text-sky-700">{it.forecastTime ?? '—'}</b></div>
                        <div><span className="text-slate-500">Lanç:</span> <b className="text-emerald-700"><Clock3 size={12} className="inline" /> {it.entryTime ?? '—'}</b></div>
                      </td>
                      <td className="py-3 px-3 font-medium text-sm whitespace-normal break-words min-w-[200px] leading-snug" title={it.productName}>{it.productName}</td>
                      <td className="py-3 px-3 text-slate-600 text-sm whitespace-normal break-words min-w-[180px] leading-snug" title={it.supplierName}>{it.supplierName}</td>
                      <td className="py-3 px-3 text-right font-bold text-blue-700">{brNum(Number(it.forecast), 0)}</td>
                      <td className="py-3 px-3 text-right font-bold text-emerald-700">{brNum(Number(it.received), 0)}</td>
                      <td className="py-3 px-3 text-right font-bold text-purple-700" title="Informado à mão — base de pagamento ao fornecedor">{brNum(Number(it.rendimento), 0)}</td>
                      <td className={clsx('py-3 px-3 text-right font-bold', it.delta > 0 ? 'text-red-700' : it.delta < 0 ? 'text-emerald-700' : 'text-slate-500')}>{deltaLabel(it.delta)}</td>
                      <td className="py-3 px-3 text-slate-600 text-sm whitespace-normal break-words">{it.dockName}</td>
                      <td className="py-3 px-3 text-slate-600 text-sm whitespace-normal break-words">{it.conferenteName}</td>
                      <td className="py-3 px-3 text-slate-600 text-sm whitespace-normal break-words">{it.compradorName}</td>
                      <td className="py-3 px-3 text-slate-600 text-sm whitespace-normal break-words max-w-[220px]" title={it.notes ?? ''}>{it.notes ?? '—'}</td>
                      <td className="py-3 px-3 text-right">
                        {can('launches', 'edit') && (
                          <Link href={`/lancamentos?edit=${it.launchId}`} className="inline-flex p-2 rounded-md text-brand-700 hover:bg-brand-50" title="Editar lançamento">
                            <Pencil size={17} />
                          </Link>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {totals && (
                  <tfoot>
                    <tr className="bg-gradient-to-r from-emerald-700 to-brand-600 text-white font-bold border-t-4 border-emerald-700">
                      <td colSpan={4} className="py-3 px-3 text-right uppercase text-sm tracking-wide">Totais</td>
                      <td className="py-3 px-3 text-right">{brNum(totals.forecast, 0)}</td>
                      <td className="py-3 px-3 text-right">{brNum(totals.received, 0)}</td>
                      <td className="py-3 px-3 text-right">{brNum(totals.rendimento, 0)}</td>
                      <td className="py-3 px-3 text-right">{deltaLabel(totals.delta)}</td>
                      <td colSpan={5} />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            <div className="xl:hidden space-y-3">
              {items.map((it) => (
                <div key={it.id} className="card p-4 border border-slate-200">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-bold text-base text-slate-800 break-words leading-snug" title={it.productName}>{it.productName}</div>
                      <div className="text-xs text-slate-600 break-words">
                        {it.supplierName} · {dateBR(it.referenceDate)}
                      </div>
                      <div className="text-xs break-words">
                        <span className="text-slate-500">Previsto:</span> <b className="text-sky-700">{it.forecastTime ?? '—'}</b>
                        {' · '}
                        <span className="text-slate-500">Lançado:</span> <b className="text-emerald-700">{it.entryTime ?? '—'}</b>
                      </div>
                    </div>
                    {can('launches', 'edit') && (
                      <Link href={`/lancamentos?edit=${it.launchId}`} className="p-2 rounded-md text-brand-700 hover:bg-brand-50" title="Editar">
                        <Pencil size={17} />
                      </Link>
                    )}
                  </div>
                  <div className="mt-3 grid grid-cols-4 text-center border-y border-slate-100 py-2">
                    <div><div className="text-xs text-slate-500 uppercase">Previsão</div><div className="font-bold text-blue-700">{brNum(Number(it.forecast), 0)}</div></div>
                    <div><div className="text-xs text-slate-500 uppercase">Recebido</div><div className="font-bold text-emerald-700">{brNum(Number(it.received), 0)}</div></div>
                    <div><div className="text-xs text-slate-500 uppercase">Rendimento</div><div className="font-bold text-purple-700">{brNum(Number(it.rendimento), 0)}</div></div>
                    <div><div className="text-xs text-slate-500 uppercase">Delta</div><div className={clsx('font-bold', it.delta > 0 ? 'text-red-700' : it.delta < 0 ? 'text-emerald-700' : 'text-slate-500')}>{deltaLabel(it.delta)}</div></div>
                  </div>
                  <div className="text-xs text-slate-600 mt-2 break-words"><b>Docа:</b> {it.dockName} · <b>Conferente:</b> {it.conferenteName} · <b>Comprador:</b> {it.compradorName}</div>
                  {it.notes && <div className="text-xs text-slate-600 mt-1 break-words"><b>Observações:</b> {it.notes}</div>}
                </div>
              ))}
              {totals && (
                <div className="card p-4 border-2 border-emerald-200 bg-emerald-50">
                  <div className="font-bold text-base mb-2 text-slate-800">TOTAIS</div>
                  <div className="grid grid-cols-4 text-center">
                    <div><div className="text-xs text-slate-600">Previsão</div><div className="font-bold text-blue-700">{brNum(totals.forecast, 0)}</div></div>
                    <div><div className="text-xs text-slate-600">Recebido</div><div className="font-bold text-emerald-700">{brNum(totals.received, 0)}</div></div>
                    <div><div className="text-xs text-slate-600">Rendimento</div><div className="font-bold text-purple-700">{brNum(totals.rendimento, 0)}</div></div>
                    <div><div className="text-xs text-slate-600">Delta</div><div className="font-bold">{deltaLabel(totals.delta)}</div></div>
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

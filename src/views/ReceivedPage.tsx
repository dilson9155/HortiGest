'use client';

export const dynamic = 'force-dynamic';

import { Fragment, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import {
  CheckCircle2,
  Clock3,
  FileDown,
  FileSpreadsheet,
  Pencil,
  RefreshCw,
  Search,
  Truck,
  X,
} from 'lucide-react';
import { api, errorMessage } from '../lib/api';
import { downloadReport, type ReportFormat } from '../lib/report-download';
import { brNum, isoDate, todayISO } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../hooks/useToast';
import { Badge, Button, Input, SectionCard, Select, Spinner } from '../components/UI';

type Named = { id: string; name: string; active?: boolean };

type ReceivedItem = {
  id: string;
  launchId: string;
  status: 'PREVISTO' | 'RECEBIDO';
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

export type HistoryMode = 'all' | 'buyers' | 'reviewers';

type HistoryConfig = {
  title: string;
  description: string;
  editPath: (launchId: string) => string;
  editLabel: string;
  downloadBase: string;
};

const HISTORY_CONFIG: Record<HistoryMode, HistoryConfig> = {
  all: {
    title: 'Histórico de entradas',
    description:
      'Todos os registros de entradas, pendentes ou conferidos, com previsão, recebido, rendimento, delta, horário, doca, comprador, conferente e opção de editar.',
    editPath: (id) => `/lancamentos-compradores?edit=${encodeURIComponent(id)}`,
    editLabel: 'Editar lançamento',
    downloadBase: 'historico-entradas',
  },
  buyers: {
    title: 'Histórico de lançamento compradores',
    description:
      'Todas as previsões lançadas pelos compradores. Edite produto, fornecedor, quantidade, horário previsto e observações de cada item.',
    editPath: (id) => `/lancamentos-compradores?edit=${encodeURIComponent(id)}`,
    editLabel: 'Editar previsão',
    downloadBase: 'historico-compradores',
  },
  reviewers: {
    title: 'Histórico lançamento conferentes',
    description:
      'Todos os recebimentos conferidos. Edite recebido, rendimento e observação de cada item; os campos de conferência são preservados para o seu perfil.',
    editPath: (id) => `/lancamentos-conferentes?edit=${encodeURIComponent(id)}`,
    editLabel: 'Editar conferência',
    downloadBase: 'historico-conferentes',
  },
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
  status: '',
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

function sortByName<T extends { name: string }>(list: T[]): T[] {
  return [...list].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }));
}

export default function ReceivedPage({ mode = 'all' }: { mode?: HistoryMode }) {
  const config = HISTORY_CONFIG[mode];
  const { can } = useAuth();
  const { toast } = useToast();
  // O histórico de conferentes mostra apenas o que já foi conferido.
  const baseFilters = useMemo(
    () => ({ ...emptyFilters, status: mode === 'reviewers' ? 'RECEBIDO' : '' }),
    [mode],
  );
  const [filters, setFilters] = useState(baseFilters);
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
    const qs = new URLSearchParams({ scope: 'history' });
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
      toast('error', errorMessage(r, `Falha ao carregar ${config.title}.`));
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
      if (p?.ok) setProducts(sortByName(p.data));
      if (s?.ok) setSuppliers(sortByName(s.data));
      if (d?.ok) setDocks(sortByName(d.data));
      if (cf?.ok) setConferentes(sortByName(cf.data));
      if (cp?.ok) setCompradores(sortByName(cp.data));
      if (u?.ok) setUsers(sortByName((u.data.items ?? u.data) as Named[]));
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

  async function download(format: ReportFormat) {
    setLoading(true);
    const r = await downloadReport(query(), format, config.downloadBase);
    setLoading(false);
    if (r.ok) {
      toast('success', format === 'pdf' ? 'PDF gerado.' : `Arquivo ${format.toUpperCase()} gerado.`);
    } else {
      toast('error', r.message);
    }
  }

  const activeFilters = useMemo(
    () =>
      Object.entries(filters).filter(
        ([key, value]) =>
          value && !(mode === 'reviewers' && key === 'status' && value === 'RECEBIDO'),
      ).length,
    [filters, mode],
  );

  // Histórico agrupado por fornecedor, com produtos em ordem alfabética.
  const groupedItems = useMemo(() => {
    const sorted = [...items].sort((a, b) =>
      String(a.supplierName || '').localeCompare(String(b.supplierName || ''), 'pt-BR', { sensitivity: 'base' }) ||
      String(a.productName || '').localeCompare(String(b.productName || ''), 'pt-BR', { sensitivity: 'base' }) ||
      dateBR(a.referenceDate).localeCompare(dateBR(b.referenceDate)),
    );
    const groups = new Map<string, { key: string; name: string; rows: ReceivedItem[]; totalReceived: number }>();
    for (const it of sorted) {
      const name = String(it.supplierName || '').trim() || 'Sem fornecedor informado';
      const key = name.toLocaleLowerCase('pt-BR');
      if (!groups.has(key)) groups.set(key, { key, name, rows: [], totalReceived: 0 });
      const group = groups.get(key)!;
      group.rows.push(it);
      group.totalReceived += Number(it.received) || 0;
    }
    return Array.from(groups.values());
  }, [items]);

  const canExport =
    can('reports', 'export') ||
    can('launches', 'view') ||
    (mode !== 'all' && can(mode === 'buyers' ? 'launches_buyers' : 'launches_reviewers', 'view'));

  return (
    <div className="space-y-5 max-w-[1500px] mx-auto">
      <SectionCard
        title={config.title}
        description={config.description}
        actions={
          <>
            <Button variant="secondary" onClick={() => setFilters(baseFilters)}>
              <X size={15} /> Limpar filtros
            </Button>
            <Button variant="secondary" onClick={search}>
              <RefreshCw size={15} /> Atualizar
            </Button>
            {canExport && (
              <>
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
            )}
          </>
        }
      >
        <div className="mb-4">
          <div className="relative w-full sm:max-w-xl">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              className="input !h-11 !text-sm pl-10"
              value={filters.q}
              onChange={(e) => set('q', e.target.value)}
              placeholder="Pesquisa rápida: produto, fornecedor, doca, observação..."
            />
          </div>
        </div>

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
            <label className="label">Situação</label>
            <Select value={filters.status} onChange={(e) => set('status', e.target.value)}>
              <option value="">Todas</option>
              <option value="PREVISTO">Previsão (aguardando)</option>
              <option value="RECEBIDO">Recebido (conferido)</option>
            </Select>
          </div>
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
        </div>
      </SectionCard>

      <SectionCard
        title="Resultado"
        description={`${items.length} registro(s) no histórico${activeFilters ? ` · ${activeFilters} filtro(s) ativo(s)` : ''}`}
        actions={<Badge tone={loading ? 'slate' : 'green'}>{loading ? 'Carregando' : 'Atualizado'}</Badge>}
      >
        {loading && items.length === 0 ? (
          <div className="flex items-center justify-center gap-2 p-10 text-slate-500"><Spinner /> Carregando...</div>
        ) : items.length === 0 ? (
          <div className="p-10 text-center text-slate-500">
            <CheckCircle2 className="mx-auto mb-2 text-emerald-300" size={36} />
            Nenhuma entrada encontrada para os filtros informados.
          </div>
        ) : (
          <>
            <div className="hidden xl:block overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full table-fixed text-sm">
                <colgroup>
                  <col className="w-[6%]" />   {/* Data */}
                  <col className="w-[7%]" />   {/* Horários */}
                  <col className="w-[12%]" />  {/* Produto */}
                  <col className="w-[11%]" />  {/* Fornecedor */}
                  <col className="w-[5%]" />   {/* Previsão */}
                  <col className="w-[5%]" />   {/* Recebido */}
                  <col className="w-[5%]" />   {/* Rendimento */}
                  <col className="w-[4%]" />   {/* Delta */}
                  <col className="w-[6%]" />   {/* Docа */}
                  <col className="w-[7%]" />   {/* Conferente */}
                  <col className="w-[8%]" />   {/* Comprador */}
                  <col className="w-[15%]" />  {/* Observações */}
                  <col className="w-[5%]" />   {/* Situação */}
                  <col className="w-[4%]" />   {/* Ações */}
                </colgroup>
                <thead className="text-left text-xs font-semibold text-white bg-gradient-to-r from-emerald-700 to-brand-600">
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
                    <th className="py-3 px-3 align-middle text-center">Comprador</th>
                    <th className="py-3 px-3 align-middle">Observações</th>
                    <th className="py-3 px-3 align-middle">Situação</th>
                    <th className="py-3 px-3 text-right align-middle">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {groupedItems.map((group) => (
                    <Fragment key={group.key}>
                      <tr className="bg-brand-50">
                        <td colSpan={14} className="border-b-2 border-brand-100 px-3 py-2">
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2 min-w-0">
                              <Truck size={16} className="shrink-0 text-brand-700" />
                              <span className="truncate text-sm font-bold text-brand-800" title={group.name}>{group.name}</span>
                              <span className="shrink-0 text-xs font-semibold text-slate-600">{group.rows.length} item(ns)</span>
                            </div>
                            <div className="shrink-0 text-right">
                              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Recebido total</div>
                              <div className="text-sm font-bold text-emerald-700">{brNum(group.totalReceived, 0)}</div>
                            </div>
                          </div>
                        </td>
                      </tr>
                      {group.rows.map((it, idx) => (
                    <tr key={it.id} className={clsx('border-b border-slate-100', idx % 2 === 0 ? 'bg-white' : 'bg-slate-50', 'hover:bg-emerald-50')}>
                      <td className="py-3 px-3 align-top font-semibold whitespace-normal break-words">{dateBR(it.referenceDate)}</td>
                      <td className="py-3 px-3 align-top text-xs whitespace-normal break-words">
                        <div><span className="text-slate-500">Prev:</span> <b className="text-sky-700">{it.forecastTime ?? '—'}</b></div>
                        <div><span className="text-slate-500">Lanç:</span> <b className="text-emerald-700"><Clock3 size={12} className="inline" /> {it.entryTime ?? '—'}</b></div>
                      </td>
                      <td className="py-3 px-3 align-top font-medium whitespace-normal break-words leading-snug" title={it.productName}>{it.productName}</td>
                      <td className="py-3 px-3 align-top text-slate-600 whitespace-normal break-words leading-snug" title={it.supplierName}>{it.supplierName}</td>
                      <td className="py-3 px-3 align-top text-right font-bold text-blue-700 whitespace-normal break-words">{brNum(Number(it.forecast), 0)}</td>
                      <td className="py-3 px-3 align-top text-right font-bold text-emerald-700 whitespace-normal break-words">{brNum(Number(it.received), 0)}</td>
                      <td className="py-3 px-3 align-top text-right font-bold text-purple-700 whitespace-normal break-words" title="Informado à mão — base de pagamento ao fornecedor">{brNum(Number(it.rendimento), 0)}</td>
                      <td className={clsx('py-3 px-3 align-top text-right font-bold whitespace-normal break-words', it.delta < 0 ? 'text-red-700' : it.delta > 0 ? 'text-emerald-700' : 'text-slate-500')}>{deltaLabel(it.delta)}</td>
                      <td className="py-3 px-3 align-top text-slate-600 whitespace-normal break-words">{it.dockName}</td>
                      <td className="py-3 px-3 align-top text-slate-600 whitespace-normal break-words">{it.conferenteName}</td>
                      <td className="py-3 px-3 align-top text-slate-600 whitespace-normal break-words text-center">{it.compradorName}</td>
                      <td className="py-3 px-3 align-top text-slate-600 whitespace-normal break-words" title={it.notes ?? ''}>{it.notes ?? '—'}</td>
                      <td className="py-3 px-3 align-top text-center">
                        <span className={clsx(
                          'inline-flex rounded px-2 py-1 text-xs font-bold uppercase',
                          it.status === 'RECEBIDO' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500',
                        )}>
                          {it.status === 'RECEBIDO' ? 'Recebido' : 'Previsão'}
                        </span>
                      </td>
                      <td className="py-3 px-3 align-top text-right">
                        <Link
                          href={config.editPath(it.launchId)}
                          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm font-semibold text-brand-700 hover:bg-brand-50"
                          title={config.editLabel}
                        >
                          <Pencil size={16} /> Editar
                        </Link>
                      </td>
                    </tr>
                      ))}
                    </Fragment>
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
                      <td colSpan={6} />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            <div className="xl:hidden space-y-4">
              {groupedItems.map((group) => (
                <div key={group.key} className="space-y-3">
                  <div className="flex items-center justify-between gap-2 rounded-lg border border-brand-100 bg-brand-50 px-3 py-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Truck size={16} className="shrink-0 text-brand-700" />
                      <span className="truncate text-sm font-bold text-brand-800" title={group.name}>{group.name}</span>
                    </div>
                    <span className="shrink-0 text-right text-[11px] font-semibold text-slate-600">
                      {group.rows.length} item(ns) · {brNum(group.totalReceived, 0)} recebido(s)
                    </span>
                  </div>
                  {group.rows.map((it) => (
                <div key={it.id} className="card p-4 border border-slate-200">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-bold text-base text-slate-800 break-words leading-snug" title={it.productName}>{it.productName}</div>
                      <div className="text-xs text-slate-600 break-words">
                        {it.supplierName} · {dateBR(it.referenceDate)}
                      </div>
                      <span className={clsx(
                        'inline-flex rounded px-2 py-0.5 text-[11px] font-bold uppercase',
                        it.status === 'RECEBIDO' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500',
                      )}>
                        {it.status === 'RECEBIDO' ? 'Recebido' : 'Previsão'}
                      </span>
                      <div className="text-xs break-words">
                        <span className="text-slate-500">Previsto:</span> <b className="text-sky-700">{it.forecastTime ?? '—'}</b>
                        {' · '}
                        <span className="text-slate-500">Lançado:</span> <b className="text-emerald-700">{it.entryTime ?? '—'}</b>
                      </div>
                    </div>
                    <Link
                      href={config.editPath(it.launchId)}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm font-semibold text-brand-700 hover:bg-brand-50"
                      title={config.editLabel}
                    >
                      <Pencil size={16} /> Editar
                    </Link>
                  </div>
                  <div className="mt-3 grid grid-cols-4 text-center border-y border-slate-100 py-2">
                    <div><div className="text-xs text-slate-500 uppercase">Previsão</div><div className="font-bold text-blue-700">{brNum(Number(it.forecast), 0)}</div></div>
                    <div><div className="text-xs text-slate-500 uppercase">Recebido</div><div className="font-bold text-emerald-700">{brNum(Number(it.received), 0)}</div></div>
                    <div><div className="text-xs text-slate-500 uppercase">Rendimento</div><div className="font-bold text-purple-700">{brNum(Number(it.rendimento), 0)}</div></div>
                    <div><div className="text-xs text-slate-500 uppercase">Delta</div><div className={clsx('font-bold', it.delta < 0 ? 'text-red-700' : it.delta > 0 ? 'text-emerald-700' : 'text-slate-500')}>{deltaLabel(it.delta)}</div></div>
                  </div>
                  <div className="text-xs text-slate-600 mt-2 break-words"><b>Docа:</b> {it.dockName} · <b>Conferente:</b> {it.conferenteName} · <b>Comprador:</b> {it.compradorName}</div>
                  {it.notes && <div className="text-xs text-slate-600 mt-1 break-words"><b>Observações:</b> {it.notes}</div>}
                </div>
                  ))}
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

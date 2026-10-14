'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Save, AlertTriangle, RefreshCw, Search, Package, Truck, Pencil, History, Send } from 'lucide-react';
import clsx from 'clsx';
import { api, errorMessage } from '../lib/api';
import { brNum, calcMissing, isoDate, todayISO } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../hooks/useToast';
import { SectionCard, NumberInput, Input, Button, Spinner, ConfirmDialog, Badge } from '../components/UI';
import SearchSelect from '../components/SearchSelect';

type Product = { id: string; name: string; defaultBoxKg: number; active: boolean };
type Supplier = { id: string; name: string; active: boolean };

type Row = {
  _key: string;
  productId: string;
  supplierId: string;
  received: number;
  produced: number;
  broken: number;
  notes?: string;
};

function newRow(): Row {
  return { _key: `r_${Math.random().toString(36).slice(2, 9)}`, productId: '', supplierId: '', received: 0, produced: 0, broken: 0 };
}

export default function LaunchesPage() {
  const { can } = useAuth();
  const { toast } = useToast();
  const canCreate = can('launches', 'create');
  const canEdit = can('launches', 'edit');
  const canDelete = can('launches', 'delete');

  const [date, setDate] = useState(todayISO());
  const [notes, setNotes] = useState('');
  const [rows, setRows] = useState<Row[]>([newRow()]);
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [editingLaunchId, setEditingLaunchId] = useState<string | null>(null);

  const [history, setHistory] = useState<{ items: any[]; total: number; page: number; pageSize: number } | null>(null);
  const [filters, setFilters] = useState({
    startDate: todayISO(),
    endDate: todayISO(),
    q: '',
    page: 1,
    pageSize: 50,
  });

  const [loading, setLoading] = useState(false);

  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmDelId, setConfirmDelId] = useState<string | null>(null);

  async function loadOptions() {
    const [p, s] = await Promise.all([
      api.get<Product[]>('/products/options?includeInactive=1'),
      api.get<Supplier[]>('/suppliers/options?includeInactive=1'),
    ]);
    if (p.ok) setProducts(p.data);
    if (s.ok) setSuppliers(s.data);
  }

  async function loadHistory() {
    setLoading(true);
    const q = new URLSearchParams();
    if (filters.startDate) q.set('startDate', filters.startDate);
    if (filters.endDate) q.set('endDate', filters.endDate);
    if (filters.q) q.set('q', filters.q);
    q.set('page', String(filters.page));
    q.set('pageSize', String(filters.pageSize));
    const r = await api.get(`/launches?${q.toString()}`);
    setLoading(false);
    if (r.ok) setHistory(r.data);
  }

  useEffect(() => {
    loadOptions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, r) => {
        acc.received += Number(r.received) || 0;
        acc.produced += Number(r.produced) || 0;
        acc.broken += Number(r.broken) || 0;
        acc.missing += calcMissing(r.received, r.produced, r.broken);
        return acc;
      },
      { received: 0, produced: 0, broken: 0, missing: 0 },
    );
  }, [rows]);

  const productOptions = useMemo(
    () =>
      products.map((p) => ({
        id: p.id,
        label: p.name,
        meta: `${Number(p.defaultBoxKg).toFixed(2)} kg${p.active ? '' : ' · inativo'}`,
        disabled: !p.active,
      })),
    [products],
  );

  const supplierOptions = useMemo(
    () =>
      suppliers.map((s) => ({
        id: s.id,
        label: s.name,
        meta: s.active ? undefined : 'inativo',
        disabled: !s.active,
      })),
    [suppliers],
  );

  function setRow(idx: number, patch: Partial<Row>) {
    setRows((arr) => arr.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  function addRow() {
    setRows((arr) => [...arr, newRow()]);
  }

  function removeRow(idx: number) {
    setRows((arr) => (arr.length <= 1 ? arr : arr.filter((_, i) => i !== idx)));
  }

  async function handleSave() {
    const isEditing = !!editingLaunchId;
    if (isEditing ? !canEdit : !canCreate) {
      toast('error', isEditing ? 'Sem permissão para editar lançamentos.' : 'Sem permissão para criar lançamentos.');
      return;
    }
    const valid = rows.filter((r) => r.productId && r.supplierId);
    if (valid.length === 0) {
      toast('warning', 'Adicione ao menos um produto com fornecedor selecionado.');
      return;
    }
    const seen = new Set<string>();
    for (const r of valid) {
      const k = `${r.productId}_${r.supplierId}`;
      if (seen.has(k)) {
        toast('warning', 'Existem linhas duplicadas (mesmo produto + fornecedor). Remova ou corrija.');
        return;
      }
      seen.add(k);
      if (Number(r.produced) + Number(r.broken) > Number(r.received)) {
        toast('error', `Linha ${r.productId}: produzido + quebrado excede o recebido.`);
        return;
      }
      if (Number(r.received) < 0 || Number(r.produced) < 0 || Number(r.broken) < 0) {
        toast('error', 'Não é permitido valor negativo.');
        return;
      }
    }

    setLoading(true);
    const payload = {
      referenceDate: date,
      notes: notes || null,
      items: valid.map((r) => ({
        productId: r.productId,
        supplierId: r.supplierId,
        received: Number(r.received),
        produced: Number(r.produced),
        broken: Number(r.broken),
        notes: r.notes ?? null,
      })),
    };
    const r = isEditing
      ? await api.put(`/launches/${editingLaunchId}`, payload)
      : await api.post('/launches', payload);
    setLoading(false);

    if (r.ok) {
      toast('success', isEditing ? 'Lançamento atualizado com sucesso.' : `${valid.length} produto(s) lançado(s).`);
      setRows([newRow()]);
      setNotes('');
      setEditingLaunchId(null);
      loadHistory();
    } else {
      toast('error', errorMessage(r, 'Falha ao salvar.'));
    }
  }

  function clearForm() {
    const isDirty = rows.some((r) => r.productId || r.supplierId || r.received || r.produced || r.broken);
    if (isDirty) {
      setConfirmClear(true);
      return;
    }
    doClear();
  }

  function doClear() {
    setRows([newRow()]);
    setNotes('');
    setEditingLaunchId(null);
    setConfirmClear(false);
  }

  function loadLaunchIntoForm(launch: any) {
    setEditingLaunchId(launch.id);
    setDate(isoDate(launch.referenceDate));
    setNotes(launch.notes ?? '');
    setRows(
      launch.items.map((it: any) => ({
        _key: it.id,
        productId: it.productId,
        supplierId: it.supplierId,
        received: Number(it.received),
        produced: Number(it.produced),
        broken: Number(it.broken),
        notes: it.notes ?? '',
      })),
    );
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function deleteLaunch(id: string) {
    if (!canDelete) return toast('error', 'Sem permissão para excluir.');
    setConfirmDelId(null);
    const r = await api.del(`/launches/${id}`);
    if (r.ok) {
      toast('success', 'Lançamento excluído.');
      loadHistory();
    } else {
      toast('error', errorMessage(r, 'Falha ao excluir.'));
    }
  }

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      const dirty = rows.some((r) => r.productId || r.supplierId || r.received || r.produced || r.broken);
      if (dirty) e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [rows]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <ConfirmDialog
        open={confirmClear}
        title="Limpar formulário?"
        description="Há dados preenchidos que serão descartados."
        confirmLabel="Limpar"
        danger
        onConfirm={doClear}
        onCancel={() => setConfirmClear(false)}
      />
      <ConfirmDialog
        open={!!confirmDelId}
        title="Excluir lançamento?"
        description="Esta ação não pode ser desfeita."
        confirmLabel="Excluir"
        danger
        onConfirm={() => { if (confirmDelId) return deleteLaunch(confirmDelId); }}
        onCancel={() => setConfirmDelId(null)}
      />

      {/* ===== Card de novo lançamento ===== */}
      <section className={clsx('rounded-2xl bg-white shadow-soft border p-5 sm:p-7', editingLaunchId ? 'border-amber-300 ring-2 ring-amber-100' : 'border-slate-200')}>
        {/* Cabeçalho do card */}
        <header className="mb-6 flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white flex items-center justify-center shadow-md">
              <Plus size={22} />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-slate-900">
                {editingLaunchId ? 'Editando lançamento' : 'Novo lançamento diário'}
              </h2>
              <p className="text-xs sm:text-sm text-slate-500">
                {editingLaunchId
                  ? 'Altere os itens e quantidades e clique em "Salvar alterações".'
                  : 'Adicione produtos informando recebido, produzido e quebra. A falta é calculada automaticamente.'}
              </p>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            {editingLaunchId && (
              <Button variant="ghost" onClick={doClear}>
                Cancelar edição
              </Button>
            )}
            <Button variant="ghost" onClick={clearForm}>
              Limpar
            </Button>
            <Button onClick={handleSave} disabled={!(editingLaunchId ? canEdit : canCreate) || loading} className="!h-10 !px-5">
              {loading ? <Spinner /> : <Send size={16} />}
              {editingLaunchId ? 'Salvar alterações' : 'Salvar lançamento'}
            </Button>
          </div>
        </header>

        {/* Cabeçalho: Data + Observações + Permissão */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Input
            type="date"
            label="Data do lançamento"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="!h-11"
          />
          <Input
            label="Observações"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Opcional..."
            className="!h-11"
          />
          <div className="flex items-end">
            {!canCreate && (
              <Badge tone="amber">Sem permissão para criar lançamentos</Badge>
            )}
          </div>
        </div>

        {/* Tabela desktop */}
        <div className="hidden md:block overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-slate-500 bg-slate-50">
              <tr className="border-b border-slate-200">
                <th className="py-3 px-3 min-w-[200px]">Produto</th>
                <th className="py-3 px-3 min-w-[180px]">Fornecedor</th>
                <th className="py-3 px-3 w-28">Recebido</th>
                <th className="py-3 px-3 w-28">Produzido</th>
                <th className="py-3 px-3 w-28">Quebra</th>
                <th className="py-3 px-3 w-28">Falta</th>
                <th className="py-3 px-3 w-14"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => {
                const falta = calcMissing(r.received, r.produced, r.broken);
                const excess = Number(r.produced) + Number(r.broken) > Number(r.received);
                return (
                  <tr key={r._key} className="border-b border-slate-100 align-top hover:bg-slate-50/60">
                    <td className="py-2 px-2">
                      <SearchSelect
                        icon={<Package size={16} />}
                        items={productOptions}
                        value={r.productId}
                        onChange={(id) => setRow(idx, { productId: id })}
                        placeholder="Digite para buscar produto..."
                      />
                    </td>
                    <td className="py-2 px-2">
                      <SearchSelect
                        icon={<Truck size={16} />}
                        items={supplierOptions}
                        value={r.supplierId}
                        onChange={(id) => setRow(idx, { supplierId: id })}
                        placeholder="Digite para buscar fornecedor..."
                      />
                    </td>
                    <td className="py-2 px-2"><NumberInput value={r.received} onValueChange={(v) => setRow(idx, { received: v })} /></td>
                    <td className="py-2 px-2"><NumberInput value={r.produced} onValueChange={(v) => setRow(idx, { produced: v })} /></td>
                    <td className="py-2 px-2"><NumberInput value={r.broken} onValueChange={(v) => setRow(idx, { broken: v })} /></td>
                    <td className={clsx('py-3 px-3 font-bold text-lg', excess && 'text-red-600', !excess && falta > 0 && 'text-red-500', !excess && falta === 0 && 'text-emerald-600')}>
                      {brNum(falta, 0)}
                      {excess && (
                        <div className="text-[10px] text-red-500 flex items-center gap-1 mt-1">
                          <AlertTriangle size={10} /> excede
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-3">
                      <button
                        onClick={() => removeRow(idx)}
                        disabled={rows.length === 1}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-md disabled:opacity-30 transition"
                        title="Remover linha"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-gradient-to-r from-brand-50 to-emerald-50 font-bold border-t-2 border-brand-200">
                <td colSpan={2} className="py-4 px-3 text-right uppercase text-xs tracking-wider text-slate-700">TOTAIS</td>
                <td className="py-4 px-3 text-brand-700 text-xl">{brNum(totals.received, 0)}</td>
                <td className="py-4 px-3 text-emerald-700 text-xl">{brNum(totals.produced, 0)}</td>
                <td className="py-4 px-3 text-amber-700 text-xl">{brNum(totals.broken, 0)}</td>
                <td className="py-4 px-3 text-red-700 text-xl">{brNum(totals.missing, 0)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Mobile: cards empilhados */}
        <div className="md:hidden space-y-3">
          {rows.map((r, idx) => {
            const falta = calcMissing(r.received, r.produced, r.broken);
            const excess = Number(r.produced) + Number(r.broken) > Number(r.received);
            return (
              <div key={r._key} className="rounded-xl border-2 border-slate-200 bg-white p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Item {idx + 1}</span>
                  <button
                    onClick={() => removeRow(idx)}
                    disabled={rows.length === 1}
                    className="p-2 text-red-600 hover:bg-red-50 rounded-md disabled:opacity-30 transition"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                <SearchSelect
                  label="Mercadoria"
                  icon={<Package size={16} />}
                  items={productOptions}
                  value={r.productId}
                  onChange={(id) => setRow(idx, { productId: id })}
                  placeholder="Digite para buscar mercadoria..."
                />
                <SearchSelect
                  label="Fornecedor"
                  icon={<Truck size={16} />}
                  items={supplierOptions}
                  value={r.supplierId}
                  onChange={(id) => setRow(idx, { supplierId: id })}
                  placeholder="Digite para buscar fornecedor..."
                />
                <div className="grid grid-cols-2 gap-3">
                  <NumberInput label="Recebido" value={r.received} onValueChange={(v) => setRow(idx, { received: v })} />
                  <NumberInput label="Produzido" value={r.produced} onValueChange={(v) => setRow(idx, { produced: v })} />
                  <NumberInput label="Quebra" value={r.broken} onValueChange={(v) => setRow(idx, { broken: v })} />
                  <div>
                    <label className="label">Falta</label>
                    <div className={clsx('input bg-slate-50 flex items-center font-bold text-lg',
                      excess ? 'text-red-600 border-red-300' : falta === 0 ? 'text-emerald-600' : 'text-red-500')}>
                      {brNum(falta, 0)}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Totais mobile */}
          <div className="rounded-xl border-2 border-brand-200 bg-gradient-to-br from-brand-50 to-emerald-50 p-4">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">TOTAIS</div>
            <div className="grid grid-cols-4 text-center">
              <div><div className="text-[10px] text-slate-500 uppercase">Rec.</div><div className="text-xl font-bold text-brand-700">{brNum(totals.received, 0)}</div></div>
              <div><div className="text-[10px] text-slate-500 uppercase">Prod.</div><div className="text-xl font-bold text-emerald-700">{brNum(totals.produced, 0)}</div></div>
              <div><div className="text-[10px] text-slate-500 uppercase">Queb.</div><div className="text-xl font-bold text-amber-700">{brNum(totals.broken, 0)}</div></div>
              <div><div className="text-[10px] text-slate-500 uppercase">Falta</div><div className="text-xl font-bold text-red-700">{brNum(totals.missing, 0)}</div></div>
            </div>
          </div>
        </div>

        {/* Botão adicionar produto */}
        <div className="mt-6 pt-5 border-t border-slate-100">
          <button onClick={addRow} className="h-11 px-5 rounded-xl font-semibold text-base bg-white text-brand-700 border-2 border-dashed border-brand-300 hover:bg-brand-50 hover:border-brand-500 transition flex items-center gap-2">
            <Plus size={18} /> Adicionar produto
          </button>
        </div>
      </section>

      {/* ===== Card de histórico ===== */}
      <section className="rounded-2xl bg-white shadow-soft border border-slate-200 p-5 sm:p-7">
        <header className="mb-5 flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-slate-500 to-slate-700 text-white flex items-center justify-center shadow-md">
              <History size={22} />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-slate-900">Histórico de lançamentos</h2>
              <p className="text-xs sm:text-sm text-slate-500">
                Mostrando por padrão os lançamentos de hoje. Para ver outro período, ajuste as datas.
              </p>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button
              variant="secondary"
              onClick={() => setFilters((f) => ({ ...f, startDate: todayISO(), endDate: todayISO(), page: 1 }))}
            >
              Hoje
            </Button>
            <Button variant="secondary" onClick={loadHistory}>
              <RefreshCw size={14} /> Atualizar
            </Button>
          </div>
        </header>

        {/* Filtros */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 mb-5">
          <div className="sm:col-span-3">
            <label className="block text-xs font-semibold text-slate-600 mb-1">De</label>
            <input type="date" className="input !h-11" value={filters.startDate} onChange={(e) => setFilters((f) => ({ ...f, startDate: e.target.value, page: 1 }))} />
          </div>
          <div className="sm:col-span-3">
            <label className="block text-xs font-semibold text-slate-600 mb-1">Até</label>
            <input type="date" className="input !h-11" value={filters.endDate} onChange={(e) => setFilters((f) => ({ ...f, endDate: e.target.value, page: 1 }))} />
          </div>
          <div className="sm:col-span-6">
            <label className="block text-xs font-semibold text-slate-600 mb-1">Produto ou fornecedor</label>
            <div className="relative">
              <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                className="input !h-11 pl-11 text-base rounded-lg"
                value={filters.q}
                onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value, page: 1 }))}
              />
            </div>
          </div>
        </div>

        {/* Histórico desktop */}
        <div className="hidden md:block overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-slate-500 bg-slate-50">
              <tr className="border-b border-slate-200">
                <th className="py-3 px-3">Data</th>
                <th className="py-3 px-3">Itens</th>
                <th className="py-3 px-3">Recebido</th>
                <th className="py-3 px-3">Produzido</th>
                <th className="py-3 px-3">Quebra</th>
                <th className="py-3 px-3">Falta</th>
                <th className="py-3 px-3">Usuário</th>
                <th className="py-3 px-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {(history?.items ?? []).map((l) => {
                const sum = (k: 'received' | 'produced' | 'broken' | 'missing') =>
                  l.items.reduce((acc: number, it: any) => acc + Number(it[k] ?? 0), 0);
                return (
                  <tr key={l.id} className="border-b border-slate-100 hover:bg-brand-50/40">
                    <td className="py-3 px-3 font-semibold text-slate-800">
                      {isoDate(l.referenceDate).split('-').reverse().join('/')}
                    </td>
                    <td className="py-3 px-3">
                      <Badge tone="slate">{l.items.length}</Badge>
                    </td>
                    <td className="py-3 px-3 font-semibold text-brand-700">{brNum(sum('received'), 0)}</td>
                    <td className="py-3 px-3 font-semibold text-emerald-700">{brNum(sum('produced'), 0)}</td>
                    <td className="py-3 px-3 font-semibold text-amber-700">{brNum(sum('broken'), 0)}</td>
                    <td className="py-3 px-3 font-semibold text-red-700">{brNum(sum('missing'), 0)}</td>
                    <td className="py-3 px-3 text-slate-600 text-xs">{l.user?.name ?? '—'}</td>
                    <td className="py-3 px-3 text-right">
                      <div className="inline-flex gap-1">
                        {canEdit && (
                          <button onClick={() => loadLaunchIntoForm(l)} className="p-2 text-brand-700 hover:bg-brand-50 rounded-md transition" title="Editar">
                            <Pencil size={15} />
                          </button>
                        )}
                        {canDelete && (
                          <button onClick={() => setConfirmDelId(l.id)} className="p-2 text-red-600 hover:bg-red-50 rounded-md transition" title="Excluir">
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {(history?.items ?? []).length === 0 && (
                <tr>
                  <td colSpan={8} className="p-10 text-center text-slate-500">
                    <Package className="mx-auto mb-2 text-slate-300" size={32} />
                    <p className="text-sm">Nenhum lançamento encontrado no período.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile */}
        <div className="md:hidden space-y-3">
          {(history?.items ?? []).map((l) => {
            const sum = (k: 'received' | 'produced' | 'broken' | 'missing') =>
              l.items.reduce((acc: number, it: any) => acc + Number(it[k] ?? 0), 0);
            return (
              <div key={l.id} className="rounded-xl border-2 border-slate-200 bg-white p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="font-bold text-slate-800">
                      {isoDate(l.referenceDate).split('-').reverse().join('/')}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {l.user?.name ?? '—'} · {l.items.length} item(ns)
                    </div>
                  </div>
                  <div className="flex gap-1">
                    {canEdit && <button onClick={() => loadLaunchIntoForm(l)} className="p-2 text-brand-700 hover:bg-brand-50 rounded-md"><Pencil size={15} /></button>}
                    {canDelete && <button onClick={() => setConfirmDelId(l.id)} className="p-2 text-red-600 hover:bg-red-50 rounded-md"><Trash2 size={15} /></button>}
                  </div>
                </div>
                <div className="grid grid-cols-4 text-center">
                  <div><div className="text-[10px] text-slate-500 uppercase">Rec.</div><div className="font-bold text-brand-700">{brNum(sum('received'), 0)}</div></div>
                  <div><div className="text-[10px] text-slate-500 uppercase">Prod.</div><div className="font-bold text-emerald-700">{brNum(sum('produced'), 0)}</div></div>
                  <div><div className="text-[10px] text-slate-500 uppercase">Queb.</div><div className="font-bold text-amber-700">{brNum(sum('broken'), 0)}</div></div>
                  <div><div className="text-[10px] text-slate-500 uppercase">Falta</div><div className="font-bold text-red-700">{brNum(sum('missing'), 0)}</div></div>
                </div>
              </div>
            );
          })}
          {(history?.items ?? []).length === 0 && (
            <div className="rounded-xl border-2 border-dashed border-slate-200 p-10 text-center text-slate-500">
              <Package className="mx-auto mb-2 text-slate-300" size={32} />
              <p className="text-sm">Nenhum lançamento encontrado.</p>
            </div>
          )}
        </div>

        <Pagination
          page={history?.page ?? 1}
          pageSize={history?.pageSize ?? 10}
          total={history?.total ?? 0}
          onPage={(p) => setFilters((f) => ({ ...f, page: p }))}
        />
      </section>
    </div>
  );
}

function Pagination({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (p: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <div className="mt-5 flex items-center justify-between gap-2 text-sm">
      <span className="text-slate-500">
        Página {page} de {pages} ({total} registros)
      </span>
      <div className="flex gap-2">
        <button className="h-9 px-4 rounded-lg font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-40 transition" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Anterior
        </button>
        <button className="h-9 px-4 rounded-lg font-semibold text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-40 transition" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          Próxima
        </button>
      </div>
    </div>
  );
}

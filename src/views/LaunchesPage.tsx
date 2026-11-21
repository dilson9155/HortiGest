'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useMemo, useState } from 'react';
import {
  Plus,
  Trash2,
  AlertTriangle,
  RefreshCw,
  Search,
  Package,
  Truck,
  Pencil,
  History,
  Send,
  Warehouse,
  Clock3,
  CheckCircle2,
} from 'lucide-react';
import clsx from 'clsx';
import { api, errorMessage } from '../lib/api';
import { brNum, isoDate, todayISO } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../hooks/useToast';
import { Input, Select, Button, Spinner, ConfirmDialog, Badge } from '../components/UI';
import SearchSelect from '../components/SearchSelect';

type NamedOption = { id: string; name: string; active: boolean };
type Product = NamedOption & { defaultBoxKg: number };
type ItemStatus = 'PREVISTO' | 'RECEBIDO';

type Row = {
  _key: string;
  productId: string;
  supplierId: string;
  forecast: number | '';
  received: number | '';
  entryTime: string;
  notes: string;
  status: ItemStatus;
};

function nowHHmm() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function newRow(): Row {
  return {
    _key: `r_${Math.random().toString(36).slice(2, 9)}`,
    productId: '',
    supplierId: '',
    forecast: 0,
    received: 0,
    entryTime: '',
    notes: '',
    status: 'PREVISTO',
  };
}

function deltaOf(forecast: unknown, received: unknown) {
  return Number(received ?? 0) - Number(forecast ?? 0);
}

function deltaLabel(v: number) {
  if (v === 0) return '0';
  return `${v > 0 ? '+' : ''}${brNum(v, 0)}`;
}

export default function LaunchesPage() {
  const { can } = useAuth();
  const { toast } = useToast();
  const canCreate = can('launches', 'create');
  const canEdit = can('launches', 'edit');
  const canDelete = can('launches', 'delete');

  const [date, setDate] = useState(todayISO());
  const [dockId, setDockId] = useState('');
  const [compradorId, setCompradorId] = useState('');
  const [conferenteId, setConferenteId] = useState('');
  const [notes, setNotes] = useState('');
  const [rows, setRows] = useState<Row[]>([newRow()]);
  const [editingLaunchId, setEditingLaunchId] = useState<string | null>(null);

  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<NamedOption[]>([]);
  const [docks, setDocks] = useState<NamedOption[]>([]);
  const [compradores, setCompradores] = useState<NamedOption[]>([]);
  const [conferentes, setConferentes] = useState<NamedOption[]>([]);

  const [pending, setPending] = useState<any[]>([]);
  const [received, setReceived] = useState<any[]>([]);
  const [filters, setFilters] = useState({
    startDate: todayISO(),
    endDate: todayISO(),
    q: '',
    dockId: '',
  });

  const [loading, setLoading] = useState(false);
  const [loadingLists, setLoadingLists] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmDelId, setConfirmDelId] = useState<string | null>(null);

  async function loadOptions() {
    const [p, s, d, c, f] = await Promise.all([
      api.get<Product[]>('/products/options?includeInactive=1'),
      api.get<NamedOption[]>('/suppliers/options?includeInactive=1'),
      api.get<NamedOption[]>('/registries/docks/options?includeInactive=1'),
      api.get<NamedOption[]>('/registries/compradores/options?includeInactive=1'),
      api.get<NamedOption[]>('/registries/conferentes/options?includeInactive=1'),
    ]);
    if (p.ok) setProducts(p.data);
    if (s.ok) setSuppliers(s.data);
    if (d.ok) setDocks(d.data);
    if (c.ok) setCompradores(c.data);
    if (f.ok) setConferentes(f.data);
  }

  function queryString(view: 'pending' | 'received') {
    const q = new URLSearchParams({ view });
    if (filters.startDate) q.set('startDate', filters.startDate);
    if (filters.endDate) q.set('endDate', filters.endDate);
    if (filters.q) q.set('q', filters.q);
    if (view === 'received' && filters.dockId) q.set('dockId', filters.dockId);
    q.set('pageSize', '500');
    return q.toString();
  }

  async function loadLists() {
    setLoadingLists(true);
    const [a, b] = await Promise.all([
      api.get(`/launches?${queryString('pending')}`),
      api.get(`/launches?${queryString('received')}`),
    ]);
    setLoadingLists(false);
    if (a.ok) setPending(a.data.items);
    if (b.ok) setReceived(b.data.items);
  }

  useEffect(() => {
    loadOptions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadLists();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, r) => {
          acc.forecast += Number(r.forecast) || 0;
          acc.received += Number(r.received) || 0;
          acc.delta += deltaOf(r.forecast, r.received);
          return acc;
        },
        { forecast: 0, received: 0, delta: 0 },
      ),
    [rows],
  );

  const toOptions = (list: NamedOption[]) =>
    list.map((x) => ({
      id: x.id,
      label: x.name,
      meta: x.active ? undefined : 'inativo',
      disabled: !x.active,
    }));

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
  const supplierOptions = useMemo(() => toOptions(suppliers), [suppliers]);
  const dockOptions = useMemo(() => toOptions(docks), [docks]);
  const compradorOptions = useMemo(() => toOptions(compradores), [compradores]);
  const conferenteOptions = useMemo(() => toOptions(conferentes), [conferentes]);

  function setRow(idx: number, patch: Partial<Row>) {
    setRows((arr) => arr.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  function markReceived(idx: number, status: ItemStatus) {
    const row = rows[idx];
    setRow(idx, {
      status,
      entryTime: status === 'RECEBIDO' ? row.entryTime || nowHHmm() : row.entryTime,
    });
  }

  function addRow() {
    setRows((arr) => [...arr, newRow()]);
  }

  function removeRow(idx: number) {
    setRows((arr) => (arr.length <= 1 ? arr : arr.filter((_, i) => i !== idx)));
  }

  async function handleSave() {
    if (editingLaunchId ? !canEdit : !canCreate) {
      toast('error', editingLaunchId ? 'Sem permissão para editar lançamentos.' : 'Sem permissão para criar lançamentos.');
      return;
    }
    const valid = rows.filter((r) => r.productId && r.supplierId);
    if (valid.length === 0) {
      toast('warning', 'Adicione ao menos um produto com fornecedor selecionado.');
      return;
    }

    const receivedKeys = new Set<string>();
    for (const r of valid) {
      const nForecast = Number(r.forecast) || 0;
      const nReceived = Number(r.received) || 0;
      if (nForecast < 0 || nReceived < 0) {
        toast('error', 'Não é permitido valor negativo.');
        return;
      }
      if (r.status === 'RECEBIDO') {
        if (!r.entryTime) {
          toast('error', 'Informe o horário de entrada de cada produto recebido.');
          return;
        }
        const k = `${r.productId}_${r.supplierId}`;
        if (receivedKeys.has(k)) {
          toast('warning', 'Existem produtos recebidos duplicados (mesmo produto e fornecedor).');
          return;
        }
        receivedKeys.add(k);
      }
    }

    setLoading(true);
    const payload = {
      referenceDate: date,
      notes: notes || null,
      dockId: dockId || null,
      compradorId: compradorId || null,
      conferenteId: conferenteId || null,
      items: valid.map((r) => ({
        productId: r.productId,
        supplierId: r.supplierId,
        forecast: Number(r.forecast) || 0,
        received: Number(r.received) || 0,
        entryTime: r.status === 'RECEBIDO' ? r.entryTime : null,
        notes: r.notes || null,
        status: r.status,
      })),
    };
    const r = editingLaunchId
      ? await api.put(`/launches/${editingLaunchId}`, payload)
      : await api.post('/launches', payload);
    setLoading(false);

    if (r.ok) {
      const nReceived = valid.filter((x) => x.status === 'RECEBIDO').length;
      toast(
        'success',
        editingLaunchId
          ? 'Lançamento atualizado. Os itens recebidos foram movidos para "Produtos recebidos".'
          : `${valid.length} produto(s) salvo(s). ${nReceived} recebido(s) enviado(s) para "Produtos recebidos".`,
      );
      doClear();
      loadLists();
    } else {
      toast('error', errorMessage(r, 'Falha ao salvar.'));
    }
  }

  function doClear() {
    setRows([newRow()]);
    setNotes('');
    setDockId('');
    setCompradorId('');
    setConferenteId('');
    setEditingLaunchId(null);
    setConfirmClear(false);
  }

  function clearForm() {
    const dirty = rows.some((r) => r.productId || r.supplierId || r.forecast || r.received || r.notes);
    if (dirty) {
      setConfirmClear(true);
      return;
    }
    doClear();
  }

  async function loadLaunchIntoForm(launch: any) {
    // Busca o lançamento completo: as listas filtradas trazem só parte dos itens.
    const r = await api.get(`/launches/${launch.id}`);
    const full = r.ok ? (r.data as any) : launch;
    setEditingLaunchId(full.id);
    setDate(isoDate(full.referenceDate));
    setNotes(full.notes ?? '');
    setDockId(full.dockId ?? '');
    setCompradorId(full.compradorId ?? '');
    setConferenteId(full.conferenteId ?? '');
    setRows(
      (full.items ?? []).map((it: any) => ({
        _key: it.id,
        productId: it.productId,
        supplierId: it.supplierId,
        forecast: Number(it.forecast),
        received: Number(it.received),
        entryTime: it.entryTime ?? '',
        notes: it.notes ?? '',
        status: it.status === 'RECEBIDO' ? ('RECEBIDO' as ItemStatus) : ('PREVISTO' as ItemStatus),
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
      loadLists();
    } else {
      toast('error', errorMessage(r, 'Falha ao excluir.'));
    }
  }

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (rows.some((r) => r.productId || r.supplierId || r.forecast || r.received || r.notes)) e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [rows]);

  const receivedFlat = useMemo(
    () =>
      received.flatMap((l) =>
        (l.items ?? []).map((it: any) => ({
          ...it,
          launch: l,
        })),
      ),
    [received],
  );

  return (
    <div className="space-y-7 max-w-[1500px] mx-auto">
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

      {/* ===================== MÓDULO 1 — LANÇAMENTOS ===================== */}
      <section className={clsx('rounded-2xl bg-white shadow-soft border p-5 sm:p-7', editingLaunchId ? 'border-amber-300 ring-2 ring-amber-100' : 'border-slate-200')}>
        <header className="mb-6 flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white flex items-center justify-center shadow-md">
              <Plus size={24} />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-slate-900">
                {editingLaunchId ? 'Editando lançamento' : 'Lançamentos — previsão e recebimento'}
              </h2>
              <p className="text-sm text-slate-600">
                Comprador informa a previsão, conferente informa o que chegou, o horário e as observações.
              </p>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            {editingLaunchId && (
              <Button variant="ghost" onClick={doClear}>Cancelar edição</Button>
            )}
            <Button variant="ghost" onClick={clearForm}>Limpar</Button>
            <Button onClick={handleSave} disabled={!(editingLaunchId ? canEdit : canCreate) || loading} className="!h-11 !px-6 !text-base">
              {loading ? <Spinner /> : <Send size={18} />}
              {editingLaunchId ? 'Salvar alterações' : 'Salvar lançamento'}
            </Button>
          </div>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
          <Input type="date" label="Data" value={date} onChange={(e) => setDate(e.target.value)} className="!h-12 !text-base" />
          <div>
            <label className="label">Docа de recebimento</label>
            <SearchSelect items={dockOptions} value={dockId} onChange={setDockId} icon={<Warehouse size={17} />} placeholder="Buscar docа..." emptyLabel="Nenhuma docа cadastrada" />
          </div>
          <div>
            <label className="label">Comprador (previsão)</label>
            <SearchSelect items={compradorOptions} value={compradorId} onChange={setCompradorId} placeholder="Buscar comprador..." emptyLabel="Nenhum comprador cadastrado" />
          </div>
          <div>
            <label className="label">Conferente (recebimento)</label>
            <SearchSelect items={conferenteOptions} value={conferenteId} onChange={setConferenteId} placeholder="Buscar conferente..." emptyLabel="Nenhum conferente cadastrado" />
          </div>
          <div className="sm:col-span-2">
            <Input label="Observações gerais" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional..." className="!h-12 !text-base" />
          </div>
        </div>

        <div className="mb-5 flex items-start gap-3 rounded-xl border border-brand-200 bg-brand-50 p-4 text-brand-900">
          <AlertTriangle size={19} className="mt-0.5 shrink-0" />
          <div className="text-sm sm:text-base">
            <b>Fluxo:</b> preencha a previsão por produto. Quando a mercadoria chegar, informe a quantidade recebida,
            o <b>horário de entrada</b> e as observações, e mude a situação para <b>Recebido</b>. O item sai daqui e
            aparece em <b>Produtos recebidos</b> logo abaixo. O delta (recebido − previsto) é calculado automaticamente.
          </div>
        </div>

        {/* Tabela desktop */}
        <div className="hidden lg:block overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-base">
            <thead className="text-left text-sm font-semibold text-slate-700 bg-slate-100">
              <tr className="border-b border-slate-200">
                <th className="py-3 px-3 min-w-[210px]">Produto</th>
                <th className="py-3 px-3 min-w-[180px]">Fornecedor</th>
                <th className="py-3 px-3 w-28">Previsão</th>
                <th className="py-3 px-3 w-28">Recebido</th>
                <th className="py-3 px-3 w-28">Delta</th>
                <th className="py-3 px-3 w-36">Situação</th>
                <th className="py-3 px-3 w-36">Horário</th>
                <th className="py-3 px-3 min-w-[200px]">Observações</th>
                <th className="py-3 px-3 w-14" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => {
                const delta = deltaOf(r.forecast, r.received);
                return (
                  <tr key={r._key} className="border-b border-slate-100 align-top hover:bg-slate-50/70">
                    <td className="py-2 px-2">
                      <SearchSelect icon={<Package size={17} />} items={productOptions} value={r.productId} onChange={(id) => setRow(idx, { productId: id })} placeholder="Digite o produto..." />
                    </td>
                    <td className="py-2 px-2">
                      <SearchSelect icon={<Truck size={17} />} items={supplierOptions} value={r.supplierId} onChange={(id) => setRow(idx, { supplierId: id })} placeholder="Digite o fornecedor..." />
                    </td>
                    <td className="py-2 px-2"><input type="number" min="0" step="0.001" className="input !h-11 !text-base" value={r.forecast} onChange={(e) => setRow(idx, { forecast: e.target.value === '' ? '' : Number(e.target.value) })} /></td>
                    <td className="py-2 px-2"><input type="number" min="0" step="0.001" className="input !h-11 !text-base" value={r.received} onChange={(e) => setRow(idx, { received: e.target.value === '' ? '' : Number(e.target.value) })} /></td>
                    <td className={clsx('py-4 px-3 font-bold text-lg', r.status === 'RECEBIDO' ? (delta > 0 ? 'text-emerald-700' : delta < 0 ? 'text-red-600' : 'text-slate-500') : 'text-slate-300')}>
                      {r.status === 'RECEBIDO' ? deltaLabel(delta) : '—'}
                    </td>
                    <td className="py-2 px-2">
                      <Select value={r.status} onChange={(e) => markReceived(idx, e.target.value as ItemStatus)} className="!h-11 !text-base">
                        <option value="PREVISTO">Previsão</option>
                        <option value="RECEBIDO">Recebido</option>
                      </Select>
                    </td>
                    <td className="py-2 px-2">
                      <Input type="time" value={r.entryTime} onChange={(e) => setRow(idx, { entryTime: e.target.value, status: e.target.value ? 'RECEBIDO' : r.status })} className="!h-11 !text-base" />
                    </td>
                    <td className="py-2 px-2">
                      <Input value={r.notes} onChange={(e) => setRow(idx, { notes: e.target.value })} placeholder="Observação do produto..." className="!h-11 !text-base" />
                    </td>
                    <td className="py-3 px-2">
                      <button onClick={() => removeRow(idx)} disabled={rows.length === 1} className="p-2 text-red-600 hover:bg-red-50 rounded-md disabled:opacity-30 transition" title="Remover linha">
                        <Trash2 size={18} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-gradient-to-r from-brand-50 to-emerald-50 font-bold border-t-2 border-brand-200">
                <td colSpan={2} className="py-4 px-3 text-right uppercase text-sm tracking-wide text-slate-700">Totais</td>
                <td className="py-4 px-3 text-brand-700 text-xl">{brNum(totals.forecast, 0)}</td>
                <td className="py-4 px-3 text-emerald-700 text-xl">{brNum(totals.received, 0)}</td>
                <td className="py-4 px-3 text-slate-800 text-xl">{deltaLabel(totals.delta)}</td>
                <td colSpan={4} />
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Mobile */}
        <div className="lg:hidden space-y-3">
          {rows.map((r, idx) => {
            const delta = deltaOf(r.forecast, r.received);
            return (
              <div key={r._key} className="rounded-xl border-2 border-slate-200 bg-white p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold uppercase tracking-wide text-slate-600">Item {idx + 1}</span>
                  <button onClick={() => removeRow(idx)} disabled={rows.length === 1} className="p-2 text-red-600 hover:bg-red-50 rounded-md disabled:opacity-30">
                    <Trash2 size={18} />
                  </button>
                </div>
                <SearchSelect label="Produto" icon={<Package size={17} />} items={productOptions} value={r.productId} onChange={(id) => setRow(idx, { productId: id })} placeholder="Digite o produto..." />
                <SearchSelect label="Fornecedor" icon={<Truck size={17} />} items={supplierOptions} value={r.supplierId} onChange={(id) => setRow(idx, { supplierId: id })} placeholder="Digite o fornecedor..." />
                <div className="grid grid-cols-2 gap-3">
                  <Input type="number" min="0" step="0.001" label="Previsão" value={r.forecast} onChange={(e) => setRow(idx, { forecast: e.target.value === '' ? '' : Number(e.target.value) })} className="!h-12 !text-base" />
                  <Input type="number" min="0" step="0.001" label="Recebido" value={r.received} onChange={(e) => setRow(idx, { received: e.target.value === '' ? '' : Number(e.target.value) })} className="!h-12 !text-base" />
                  <Select label="Situação" value={r.status} onChange={(e) => markReceived(idx, e.target.value as ItemStatus)} className="!h-12 !text-base">
                    <option value="PREVISTO">Previsão</option>
                    <option value="RECEBIDO">Recebido</option>
                  </Select>
                  <Input type="time" label="Horário de entrada" value={r.entryTime} onChange={(e) => setRow(idx, { entryTime: e.target.value, status: e.target.value ? 'RECEBIDO' : r.status })} className="!h-12 !text-base" />
                </div>
                <Input label="Observações" value={r.notes} onChange={(e) => setRow(idx, { notes: e.target.value })} placeholder="Opcional..." className="!h-12 !text-base" />
                <div className={clsx('text-right font-bold text-lg', delta > 0 && r.status === 'RECEBIDO' ? 'text-emerald-700' : delta < 0 && r.status === 'RECEBIDO' ? 'text-red-600' : 'text-slate-500')}>
                  Delta: {r.status === 'RECEBIDO' ? deltaLabel(delta) : '—'}
                </div>
              </div>
            );
          })}
          <div className="rounded-xl border-2 border-brand-200 bg-brand-50 p-4">
            <div className="text-sm font-bold uppercase text-slate-700 mb-2">Totais</div>
            <div className="grid grid-cols-3 text-center gap-2">
              <div><div className="text-xs text-slate-600">Previsão</div><div className="text-xl font-bold text-brand-700">{brNum(totals.forecast, 0)}</div></div>
              <div><div className="text-xs text-slate-600">Recebido</div><div className="text-xl font-bold text-emerald-700">{brNum(totals.received, 0)}</div></div>
              <div><div className="text-xs text-slate-600">Delta</div><div className="text-xl font-bold text-slate-800">{deltaLabel(totals.delta)}</div></div>
            </div>
          </div>
        </div>

        <div className="mt-6 pt-5 border-t border-slate-100">
          <button onClick={addRow} className="h-12 px-5 rounded-xl font-semibold text-base bg-white text-brand-700 border-2 border-dashed border-brand-300 hover:bg-brand-50 hover:border-brand-500 transition flex items-center gap-2">
            <Plus size={19} /> Adicionar produto
          </button>
        </div>
      </section>

      {/* ===================== MÓDULO 2 — PRODUTOS RECEBIDOS ===================== */}
      <section className="rounded-2xl bg-white shadow-soft border border-slate-200 p-5 sm:p-7">
        <header className="mb-5 flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 text-white flex items-center justify-center shadow-md">
              <CheckCircle2 size={24} />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-slate-900">Produtos recebidos</h2>
              <p className="text-sm text-slate-600">
                Todos os itens conferidos, com horário de entrada obrigatório e todas as informações do recebimento.
              </p>
            </div>
          </div>
          <Button variant="secondary" onClick={loadLists}>
            <RefreshCw size={16} /> Atualizar
          </Button>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          <div>
            <label className="label">De</label>
            <input type="date" className="input !h-11 !text-base" value={filters.startDate} onChange={(e) => setFilters((f) => ({ ...f, startDate: e.target.value }))} />
          </div>
          <div>
            <label className="label">Até</label>
            <input type="date" className="input !h-11 !text-base" value={filters.endDate} onChange={(e) => setFilters((f) => ({ ...f, endDate: e.target.value }))} />
          </div>
          <div>
            <label className="label">Docа</label>
            <Select value={filters.dockId} onChange={(e) => setFilters((f) => ({ ...f, dockId: e.target.value }))} className="!h-11 !text-base">
              <option value="">Todas</option>
              {docks.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </Select>
          </div>
          <div>
            <label className="label">Buscar</label>
            <div className="relative">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input className="input !h-11 !text-base pl-11" value={filters.q} onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))} placeholder="Produto, fornecedor, observação..." />
            </div>
          </div>
        </div>

        <div className="hidden xl:block overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-base">
            <thead className="text-left text-sm font-semibold text-slate-700 bg-slate-100">
              <tr className="border-b border-slate-200">
                <th className="py-3 px-3">Data</th>
                <th className="py-3 px-3">Horário</th>
                <th className="py-3 px-3">Produto</th>
                <th className="py-3 px-3">Fornecedor</th>
                <th className="py-3 px-3">Previsão</th>
                <th className="py-3 px-3">Recebido</th>
                <th className="py-3 px-3">Delta</th>
                <th className="py-3 px-3">Docа</th>
                <th className="py-3 px-3">Conferente</th>
                <th className="py-3 px-3">Comprador</th>
                <th className="py-3 px-3">Observações</th>
                <th className="py-3 px-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {receivedFlat.map((it: any) => {
                const delta = deltaOf(it.forecast, it.received);
                return (
                  <tr key={it.id} className="border-b border-slate-100 hover:bg-emerald-50/40">
                    <td className="py-3 px-3 font-semibold whitespace-nowrap">{isoDate(it.launch.referenceDate).split('-').reverse().join('/')}</td>
                    <td className="py-3 px-3 font-bold text-brand-700 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1"><Clock3 size={15} />{it.entryTime ?? '—'}</span>
                    </td>
                    <td className="py-3 px-3">{it.productName}</td>
                    <td className="py-3 px-3">{it.supplierName}</td>
                    <td className="py-3 px-3">{brNum(it.forecast, 0)}</td>
                    <td className="py-3 px-3 font-bold text-emerald-700">{brNum(it.received, 0)}</td>
                    <td className={clsx('py-3 px-3 font-bold', delta > 0 ? 'text-emerald-700' : delta < 0 ? 'text-red-600' : 'text-slate-500')}>{deltaLabel(delta)}</td>
                    <td className="py-3 px-3">{it.launch.dockName ?? '—'}</td>
                    <td className="py-3 px-3">{it.launch.conferenteName ?? '—'}</td>
                    <td className="py-3 px-3">{it.launch.compradorName ?? '—'}</td>
                    <td className="py-3 px-3 text-slate-600 max-w-[220px] truncate" title={it.notes ?? ''}>{it.notes ?? '—'}</td>
                    <td className="py-3 px-3 text-right">
                      <div className="inline-flex gap-1">
                        {canEdit && (
                          <button onClick={() => loadLaunchIntoForm(it.launch)} className="p-2 text-brand-700 hover:bg-brand-50 rounded-md" title="Editar">
                            <Pencil size={17} />
                          </button>
                        )}
                        {canDelete && (
                          <button onClick={() => setConfirmDelId(it.launch.id)} className="p-2 text-red-600 hover:bg-red-50 rounded-md" title="Excluir lançamento">
                            <Trash2 size={17} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {receivedFlat.length === 0 && (
                <tr>
                  <td colSpan={12} className="p-10 text-center text-slate-500">
                    <CheckCircle2 className="mx-auto mb-2 text-emerald-300" size={34} />
                    <p className="text-base">Nenhum produto recebido no período.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="xl:hidden space-y-3">
          {receivedFlat.map((it: any) => {
            const delta = deltaOf(it.forecast, it.received);
            return (
              <div key={it.id} className="rounded-xl border-2 border-slate-200 bg-white p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-bold text-slate-800">{it.productName}</div>
                    <div className="text-sm text-slate-600">{it.supplierName} · {isoDate(it.launch.referenceDate).split('-').reverse().join('/')}</div>
                  </div>
                  <div className="flex gap-1">
                    {canEdit && <button onClick={() => loadLaunchIntoForm(it.launch)} className="p-2 text-brand-700 hover:bg-brand-50 rounded-md"><Pencil size={17} /></button>}
                    {canDelete && <button onClick={() => setConfirmDelId(it.launch.id)} className="p-2 text-red-600 hover:bg-red-50 rounded-md"><Trash2 size={17} /></button>}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center border-y border-slate-100 py-2">
                  <div><div className="text-xs text-slate-500">Previsão</div><div className="font-bold">{brNum(it.forecast, 0)}</div></div>
                  <div><div className="text-xs text-slate-500">Recebido</div><div className="font-bold text-emerald-700">{brNum(it.received, 0)}</div></div>
                  <div><div className="text-xs text-slate-500">Delta</div><div className={clsx('font-bold', delta > 0 ? 'text-emerald-700' : delta < 0 ? 'text-red-600' : 'text-slate-500')}>{deltaLabel(delta)}</div></div>
                </div>
                <div className="text-sm text-slate-700">
                  <Clock3 size={15} className="inline mr-1 text-brand-600" />
                  <b>Horário:</b> {it.entryTime ?? '—'} · <b>Docа:</b> {it.launch.dockName ?? '—'}
                </div>
                <div className="text-sm text-slate-600"><b>Conferente:</b> {it.launch.conferenteName ?? '—'} · <b>Comprador:</b> {it.launch.compradorName ?? '—'}</div>
                {it.notes && <div className="text-sm text-slate-600"><b>Observações:</b> {it.notes}</div>}
              </div>
            );
          })}
          {receivedFlat.length === 0 && (
            <div className="rounded-xl border-2 border-dashed border-slate-200 p-10 text-center text-slate-500">
              Nenhum produto recebido no período.
            </div>
          )}
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3 text-sm text-slate-600">
          <Badge tone="slate">{receivedFlat.length} produto(s) recebido(s)</Badge>
          <span className="inline-flex items-center gap-1"><History size={15} /> Atualizado automaticamente ao salvar um recebimento.</span>
          {loadingLists && <Spinner />}
        </div>
      </section>
    </div>
  );
}

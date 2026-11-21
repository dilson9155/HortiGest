'use client';

export const dynamic = 'force-dynamic';

import { Fragment, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  ListChecks,
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
  CheckCircle2,
  ChevronDown,
  ChevronRight,
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
  // Detalhes próprios de cada item lançado.
  compradorId: string;
  compradorName: string;
  conferenteId: string;
  conferenteName: string;
  dockId: string;
  forecastTime: string; // horário previsto pelo comprador
  forecast: number | '';
  received: number | '';
  rendimento: number | '';
  entryTime: string; // horário do lançamento do conferente
  notes: string;
  status: ItemStatus;
};

type RowDefaults = Partial<Pick<Row, 'dockId' | 'compradorId' | 'compradorName' | 'conferenteId' | 'conferenteName'>>;

// A situação é automática: ao registrar o horário do lançamento ou a
// quantidade recebida, o conferente deu entrada e o item vira RECEBIDO.
function autoStatus(row: Pick<Row, 'entryTime' | 'received'>): ItemStatus {
  return row.entryTime.trim() || Number(row.received) > 0 ? 'RECEBIDO' : 'PREVISTO';
}

function newRow(defaults: RowDefaults = {}): Row {
  return {
    _key: `r_${Math.random().toString(36).slice(2, 9)}`,
    productId: '',
    supplierId: '',
    compradorId: defaults.compradorId ?? '',
    compradorName: defaults.compradorName ?? '',
    conferenteId: defaults.conferenteId ?? '',
    conferenteName: defaults.conferenteName ?? '',
    dockId: defaults.dockId ?? '',
    forecastTime: '',
    forecast: 0,
    received: 0,
    rendimento: 0,
    entryTime: '',
    notes: '',
    status: 'PREVISTO',
  };
}

// Delta = previsão - recebido (positivo = faltou receber; negativo = veio a mais).
function deltaOf(forecast: unknown, received: unknown) {
  return Number(forecast ?? 0) - Number(received ?? 0);
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
  const [compradorName, setCompradorName] = useState('');
  const [conferenteName, setConferenteName] = useState('');
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
  const [collapsedSuppliers, setCollapsedSuppliers] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState({
    startDate: '',
    endDate: '',
    q: '',
    dockId: '',
    productId: '',
    supplierId: '',
    compradorId: '',
    conferenteId: '',
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
    if (filters.dockId) q.set('dockId', filters.dockId);
    if (filters.productId) q.set('productId', filters.productId);
    if (filters.supplierId) q.set('supplierId', filters.supplierId);
    if (filters.compradorId) q.set('compradorId', filters.compradorId);
    if (filters.conferenteId) q.set('conferenteId', filters.conferenteId);
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

  // Permite abrir o lançamento diretamente pelo módulo "Produtos recebidos".
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('edit');
    if (id) {
      loadLaunchIntoForm({ id });
      window.history.replaceState({}, '', window.location.pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, r) => {
          acc.forecast += Number(r.forecast) || 0;
          acc.received += Number(r.received) || 0;
          acc.rendimento += Number(r.rendimento) || 0;
          acc.delta += deltaOf(r.forecast, r.received);
          return acc;
        },
        { forecast: 0, received: 0, rendimento: 0, delta: 0 },
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

  function setRow(idx: number, patch: Partial<Row>) {
    setRows((arr) =>
      arr.map((r, i) => {
        if (i !== idx) return r;
        const next = { ...r, ...patch };
        // Situação nunca é digitada: ela acompanha o que o conferente lançou.
        if ('entryTime' in patch || 'received' in patch) next.status = autoStatus(next);
        return next;
      }),
    );
  }

  function addRow() {
    setRows((arr) => [
      ...arr,
      newRow({ dockId, compradorId, compradorName, conferenteId, conferenteName }),
    ]);
  }

  // Aplica os padrões do topo a todas as linhas já abertas.
  function applyDefaultsToRows() {
    setRows((arr) =>
      arr.map((r) => ({
        ...r,
        dockId: dockId || r.dockId,
        compradorId: compradorId || r.compradorId,
        compradorName: compradorName.trim() || r.compradorName,
        conferenteId: conferenteId || r.conferenteId,
        conferenteName: conferenteName.trim() || r.conferenteName,
      })),
    );
    toast('success', 'Padrões aplicados às linhas. Ajuste o que for diferente em cada item.');
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
    for (const [idx, r] of valid.entries()) {
      const nForecast = Number(r.forecast) || 0;
      const nReceived = Number(r.received) || 0;
      if (nForecast < 0 || nReceived < 0) {
        toast('error', 'Não é permitido valor negativo.');
        return;
      }
      if (!r.compradorName.trim()) {
        toast('warning', `Item ${idx + 1}: informe o comprador que lançou a previsão.`);
        return;
      }
      if (!r.forecastTime) {
        toast('warning', `Item ${idx + 1}: informe o horário previsto de entrega.`);
        return;
      }
      if (!r.dockId) {
        toast('warning', `Item ${idx + 1}: informe a doca prevista.`);
        return;
      }
      if (r.status === 'RECEBIDO') {
        if (!r.conferenteName.trim()) {
          toast('warning', `Item ${idx + 1}: informe o conferente que lançou o recebimento.`);
          return;
        }
        if (!r.entryTime) {
          toast('error', `Item ${idx + 1}: informe o horário do lançamento do conferente.`);
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
    const first = valid[0];
    const payload = {
      referenceDate: date,
      notes: notes || null,
      // Snapshots do lançamento espelham o primeiro item (compatibilidade).
      dockId: first?.dockId || null,
      compradorId: first?.compradorId || null,
      conferenteId: first?.conferenteId || null,
      compradorName: first?.compradorName.trim() || null,
      conferenteName: first?.conferenteName.trim() || null,
      items: valid.map((r) => ({
        productId: r.productId,
        supplierId: r.supplierId,
        forecast: Number(r.forecast) || 0,
        received: Number(r.received) || 0,
        rendimento: Number(r.rendimento) || 0,
        compradorId: r.compradorId || null,
        compradorName: r.compradorName.trim(),
        conferenteId: r.conferenteId || null,
        conferenteName: r.conferenteName.trim() || null,
        dockId: r.dockId,
        forecastTime: r.forecastTime,
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
    setCompradorName('');
    setConferenteName('');
    setEditingLaunchId(null);
    setConfirmClear(false);
  }

  function clearForm() {
    const dirty =
      rows.some((r) => r.productId || r.supplierId || r.forecast || r.received || r.rendimento || r.notes || r.compradorName || r.conferenteName || r.forecastTime || r.entryTime || r.dockId) ||
      !!compradorName.trim() || !!conferenteName.trim() || !!dockId;
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
    setCompradorName(full.compradorName ?? full.comprador?.name ?? '');
    setConferenteName(full.conferenteName ?? full.conferente?.name ?? '');
    setRows(
      (full.items ?? []).map((it: any) => ({
        _key: it.id,
        productId: it.productId,
        supplierId: it.supplierId,
        forecast: Number(it.forecast),
        received: Number(it.received),
        rendimento: Number(it.rendimento),
        compradorId: it.compradorId ?? full.compradorId ?? '',
        compradorName: it.compradorName ?? full.compradorName ?? full.comprador?.name ?? '',
        conferenteId: it.conferenteId ?? full.conferenteId ?? '',
        conferenteName: it.conferenteName ?? full.conferenteName ?? full.conferente?.name ?? '',
        dockId: it.dockId ?? full.dockId ?? '',
        forecastTime: it.forecastTime ?? '',
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
      if (rows.some((r) => r.productId || r.supplierId || r.forecast || r.received || r.rendimento || r.notes || r.compradorName || r.conferenteName || r.forecastTime || r.entryTime || r.dockId) || !!compradorName.trim() || !!conferenteName.trim() || !!dockId) e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [rows, compradorName, conferenteName]);

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

  const pendingFlat = useMemo(
    () =>
      pending.flatMap((l) =>
        (l.items ?? []).map((it: any) => ({
          ...it,
          launch: l,
        })),
      ),
    [pending],
  );

  // Agrupa as entradas pendentes por fornecedor para facilitar a identificação.
  const pendingBySupplier = useMemo(() => {
    const groups = new Map<string, { key: string; name: string; items: any[]; totalForecast: number }>();
    for (const it of pendingFlat) {
      const key = it.supplierId || '__sem_fornecedor__';
      const name = it.supplierName || 'Sem fornecedor informado';
      if (!groups.has(key)) groups.set(key, { key, name, items: [], totalForecast: 0 });
      const group = groups.get(key)!;
      group.items.push(it);
      group.totalForecast += Number(it.forecast ?? 0);
    }
    return Array.from(groups.values()).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [pendingFlat]);

  function toggleSupplier(key: string) {
    setCollapsedSuppliers((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function SupplierGroupHeader({ group }: { group: { key: string; name: string; items: any[]; totalForecast: number } }) {
    const collapsed = collapsedSuppliers.has(group.key);
    return (
      <div className="flex items-center justify-between gap-3 px-4 py-3 bg-slate-50 border-b-2 border-brand-100">
        <button
          type="button"
          onClick={() => toggleSupplier(group.key)}
          className="flex items-start gap-2 min-w-0 text-left group"
          title={collapsed ? 'Expandir fornecedor' : 'Recolher fornecedor'}
        >
          {collapsed ? <ChevronRight size={18} className="mt-0.5 shrink-0 text-brand-600" /> : <ChevronDown size={18} className="mt-0.5 shrink-0 text-brand-600" />}
          <Truck size={18} className="mt-0.5 shrink-0 text-brand-600" />
          <span className="min-w-0">
            <span className="block text-sm sm:text-base font-bold text-slate-900 break-words leading-snug group-hover:text-brand-700" title={group.name}>
              {group.name}
            </span>
            <span className="block text-xs text-slate-500">{group.items.length} entrada(s) neste fornecedor</span>
          </span>
        </button>
        <div className="shrink-0 text-right pl-2">
          <div className="text-[11px] uppercase tracking-wide text-slate-500">Previsão total</div>
          <div className="text-lg font-bold text-brand-700">{brNum(group.totalForecast, 0)}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-[1800px] mx-auto">
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
      <section className={clsx('rounded-2xl bg-white shadow-soft border p-4 sm:p-5', editingLaunchId ? 'border-amber-300 ring-2 ring-amber-100' : 'border-slate-200')}>
        <header className="mb-4 flex items-start justify-between gap-3 flex-wrap">
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

        {/* Padrões compactos — preenchem novas linhas; cada item pode ser diferente. */}
        <datalist id="hl-compradores">
          {compradores.map((c) => <option key={c.id} value={c.name} />)}
        </datalist>
        <datalist id="hl-conferentes">
          {conferentes.map((c) => <option key={c.id} value={c.name} />)}
        </datalist>
        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 mb-4">
          <div className="flex flex-wrap items-end gap-2">
            <div className="w-36 shrink-0">
              <Input type="date" label="Data" value={date} onChange={(e) => setDate(e.target.value)} className="!h-9 !text-sm" />
            </div>
            <div className="min-w-[150px] flex-1">
              <label className="label">Comprador padrão</label>
              <Input
                list="hl-compradores"
                value={compradorName}
                onChange={(e) => { setCompradorName(e.target.value); setCompradorId(''); }}
                placeholder="Nome do comprador"
                className="!h-9 !text-sm"
              />
            </div>
            <div className="min-w-[130px] flex-1">
              <label className="label">Docа padrão</label>
              <Select value={dockId} onChange={(e) => setDockId(e.target.value)} className="!h-9 !text-sm">
                <option value="">Selecione...</option>
                {docks.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </Select>
            </div>
            <div className="min-w-[150px] flex-1">
              <label className="label">Conferente padrão</label>
              <Input
                list="hl-conferentes"
                value={conferenteName}
                onChange={(e) => { setConferenteName(e.target.value); setConferenteId(''); }}
                placeholder="Nome do conferente"
                className="!h-9 !text-sm"
              />
            </div>
            <div className="min-w-[160px] flex-[1.2]">
              <Input label="Observações gerais" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional" className="!h-9 !text-sm" />
            </div>
            <Button variant="secondary" onClick={applyDefaultsToRows} className="!h-9 !text-sm">
              Aplicar às linhas
            </Button>
          </div>
          <p className="mt-2 text-[11px] text-slate-500">
            Padrões para novos itens. Cada item registrado abaixo pode ter comprador, conferente, doca e horários próprios.
          </p>
        </div>

        <div className="mb-4 flex items-start gap-3 rounded-xl border border-brand-200 bg-brand-50 p-3 text-sm text-brand-900">
          <AlertTriangle size={19} className="mt-0.5 shrink-0" />
          <div>
            <b>Dois horários por item:</b> o comprador informa o <b>horário previsto de entrega</b> e a <b>docа</b>;
            o conferente informa o <b>horário do lançamento</b>, a quantidade recebida e o <b>rendimento</b>.
            A <b>situação muda para Recebido automaticamente</b> quando o conferente informa o horário ou a quantidade recebida.
            O delta (previsto − recebido) também é automático.
          </div>
        </div>

        {/* Tabela estilo planilha — todas as colunas visíveis, edição direta. */}
        <div className="overflow-x-auto rounded-xl border border-slate-300 bg-white">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10">
              {/* Grupos de colunas */}
              <tr className="text-[11px] font-bold uppercase tracking-wide text-white">
                <th rowSpan={2} className="border border-slate-300 bg-slate-700 px-2 py-1.5 text-left min-w-[220px]">Produto</th>
                <th rowSpan={2} className="border border-slate-300 bg-slate-700 px-2 py-1.5 text-left min-w-[180px]">Fornecedor</th>
                <th colSpan={4} className="border border-sky-800 bg-sky-700 px-1.5 py-1 text-center">Previsão — comprador</th>
                <th colSpan={4} className="border border-emerald-800 bg-emerald-700 px-1.5 py-1 text-center">Recebimento — conferente</th>
                <th colSpan={3} className="border border-slate-800 bg-slate-700 px-1.5 py-1 text-center">Resultado</th>
                <th rowSpan={2} className="border border-slate-300 bg-slate-700 px-1.5 py-1.5 w-9" />
              </tr>
              <tr className="text-xs font-semibold text-slate-800">
                <th className="border border-sky-200 bg-sky-100 px-2 py-1 text-left min-w-[150px]">Comprador</th>
                <th className="border border-sky-200 bg-sky-100 px-2 py-1 min-w-[100px]">Hor. previsto</th>
                <th className="border border-sky-200 bg-sky-100 px-2 py-1 min-w-[110px]">Docа</th>
                <th className="border border-sky-200 bg-sky-100 px-2 py-1 min-w-[85px]">Previsão</th>
                <th className="border border-emerald-200 bg-emerald-100 px-2 py-1 text-left min-w-[150px]">Conferente</th>
                <th className="border border-emerald-200 bg-emerald-100 px-2 py-1 min-w-[100px]">Hor. lançamento</th>
                <th className="border border-emerald-200 bg-emerald-100 px-2 py-1 min-w-[85px]">Recebido</th>
                <th className="border border-emerald-200 bg-emerald-100 px-2 py-1 min-w-[85px]">Rendimento</th>
                <th className="border border-slate-300 bg-slate-100 px-2 py-1 min-w-[70px]">Delta</th>
                <th className="border border-slate-300 bg-slate-100 px-2 py-1 min-w-[100px]">Situação</th>
                <th className="border border-slate-300 bg-slate-100 px-2 py-1 min-w-[180px]">Observações</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => {
                const delta = deltaOf(r.forecast, r.received);
                return (
                  <tr key={r._key} className={clsx(idx % 2 === 0 ? 'bg-white' : 'bg-slate-50', 'hover:bg-brand-50/40')}>
                    <td className="border border-slate-200 p-1.5 align-middle">
                      <SearchSelect compact icon={<Package size={16} />} items={productOptions} value={r.productId} onChange={(id) => setRow(idx, { productId: id })} placeholder="Produto..." />
                    </td>
                    <td className="border border-slate-200 p-1.5 align-middle">
                      <SearchSelect compact icon={<Truck size={16} />} items={supplierOptions} value={r.supplierId} onChange={(id) => setRow(idx, { supplierId: id })} placeholder="Fornecedor..." />
                    </td>
                    <td className="border border-sky-100 p-1.5 align-middle">
                      <input list="hl-compradores" value={r.compradorName} onChange={(e) => setRow(idx, { compradorName: e.target.value, compradorId: '' })} placeholder="Nome" className="input !h-9 !text-sm !px-2" />
                    </td>
                    <td className="border border-sky-100 p-1.5 align-middle">
                      <input type="time" value={r.forecastTime} onChange={(e) => setRow(idx, { forecastTime: e.target.value })} className="input !h-9 !text-sm !px-2" />
                    </td>
                    <td className="border border-sky-100 p-1.5 align-middle">
                      <select value={r.dockId} onChange={(e) => setRow(idx, { dockId: e.target.value })} className="input !h-9 !text-sm !px-2">
                        <option value="">—</option>
                        {docks.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                      </select>
                    </td>
                    <td className="border border-sky-100 p-1.5 align-middle">
                      <input type="number" min="0" step="0.001" value={r.forecast} onChange={(e) => setRow(idx, { forecast: e.target.value === '' ? '' : Number(e.target.value) })} className="input !h-9 !text-sm !px-2 text-right" />
                    </td>
                    <td className="border border-emerald-100 p-1.5 align-middle">
                      <input list="hl-conferentes" value={r.conferenteName} onChange={(e) => setRow(idx, { conferenteName: e.target.value, conferenteId: '' })} placeholder="Nome" className="input !h-9 !text-sm !px-2" />
                    </td>
                    <td className="border border-emerald-100 p-1.5 align-middle">
                      <input type="time" value={r.entryTime} onChange={(e) => setRow(idx, { entryTime: e.target.value })} className="input !h-9 !text-sm !px-2" title="Ao informar o horário, a situação vira Recebido automaticamente" />
                    </td>
                    <td className="border border-emerald-100 p-1.5 align-middle">
                      <input type="number" min="0" step="0.001" value={r.received} onChange={(e) => setRow(idx, { received: e.target.value === '' ? '' : Number(e.target.value) })} className="input !h-9 !text-sm !px-2 text-right" />
                    </td>
                    <td className="border border-emerald-100 p-1.5 align-middle">
                      <input type="number" min="0" step="0.001" value={r.rendimento} onChange={(e) => setRow(idx, { rendimento: e.target.value === '' ? '' : Number(e.target.value) })} title="Informado à mão — base de pagamento do fornecedor" className="input !h-9 !text-sm !px-2 text-right" />
                    </td>
                    <td className={clsx('border border-slate-200 p-1.5 text-center font-bold align-middle', r.status === 'RECEBIDO' ? (delta > 0 ? 'text-red-600' : delta < 0 ? 'text-emerald-700' : 'text-slate-500') : 'text-slate-300')}>
                      {r.status === 'RECEBIDO' ? deltaLabel(delta) : '—'}
                    </td>
                    <td className="border border-slate-200 p-1.5 text-center align-middle">
                      <span
                        title="Automático: muda para Recebido quando o conferente informa o horário do lançamento ou a quantidade recebida"
                        className={clsx(
                          'inline-flex w-full items-center justify-center rounded px-1 py-1.5 text-xs font-bold uppercase',
                          r.status === 'RECEBIDO' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500',
                        )}
                      >
                        {r.status === 'RECEBIDO' ? 'Recebido' : 'Previsão'}
                      </span>
                    </td>
                    <td className="border border-slate-200 p-1.5 align-middle">
                      <input value={r.notes} onChange={(e) => setRow(idx, { notes: e.target.value })} placeholder="Opcional" className="input !h-9 !text-sm !px-2" />
                    </td>
                    <td className="border border-slate-200 p-1.5 text-center align-middle">
                      <button onClick={() => removeRow(idx)} disabled={rows.length === 1} className="p-1.5 text-red-600 hover:bg-red-50 rounded disabled:opacity-30" title="Remover linha">
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="font-bold text-slate-800 bg-gradient-to-r from-sky-50 to-emerald-50">
                <td colSpan={5} className="border border-slate-300 px-2 py-2 text-right uppercase text-[11px] tracking-wide">Totais</td>
                <td className="border border-slate-300 px-2 py-2 text-right text-base text-brand-700">{brNum(totals.forecast, 0)}</td>
                <td colSpan={2} className="border border-slate-300" />
                <td className="border border-slate-300 px-2 py-2 text-right text-base text-emerald-700">{brNum(totals.received, 0)}</td>
                <td className="border border-slate-300 px-2 py-2 text-right text-base text-purple-700">{brNum(totals.rendimento, 0)}</td>
                <td className="border border-slate-300 px-2 py-2 text-center text-base">{deltaLabel(totals.delta)}</td>
                <td colSpan={3} className="border border-slate-300" />
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
          <button onClick={addRow} className="h-10 px-4 rounded-lg font-semibold text-sm bg-white text-brand-700 border-2 border-dashed border-brand-300 hover:bg-brand-50 hover:border-brand-500 transition flex items-center gap-2">
            <Plus size={17} /> Adicionar linha
          </button>
          <span className="text-xs text-slate-500">Use <b>Tab</b> para percorrer as colunas. A situação é automática: ao informar o horário ou o recebido, o item vira <b>Recebido</b>.</span>
        </div>
      </section>

      {/* ===================== MÓDULO 2 — ENTRADAS / PREVISÕES ===================== */}
      <section className="rounded-2xl bg-white shadow-soft border border-slate-200 p-5 sm:p-7">
        <header className="mb-5 flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white flex items-center justify-center shadow-md">
              <ListChecks size={24} />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-slate-900">Entradas / previsões pendentes</h2>
              <p className="text-sm text-slate-600">
                Todas as entradas aparecem aqui. Ao confirmar o recebimento, o item sai desta lista e vai para o módulo <b>Produtos recebidos</b>.
              </p>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button variant="secondary" onClick={loadLists}>
              <RefreshCw size={16} /> Atualizar
            </Button>
            <Link
              href="/recebidos"
              className="h-11 px-5 rounded-lg font-semibold text-base inline-flex items-center gap-2 bg-emerald-600 text-white hover:bg-emerald-700 transition"
            >
              <CheckCircle2 size={18} /> Produtos recebidos <ArrowRight size={17} />
            </Link>
          </div>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 mb-5">
          <div>
            <label className="label">De</label>
            <input type="date" className="input !h-11 !text-base" value={filters.startDate} onChange={(e) => setFilters((f) => ({ ...f, startDate: e.target.value }))} />
          </div>
          <div>
            <label className="label">Até</label>
            <input type="date" className="input !h-11 !text-base" value={filters.endDate} onChange={(e) => setFilters((f) => ({ ...f, endDate: e.target.value }))} />
          </div>
          <div>
            <label className="label">Produto</label>
            <Select value={filters.productId} onChange={(e) => setFilters((f) => ({ ...f, productId: e.target.value }))} className="!h-11 !text-base">
              <option value="">Todos</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </div>
          <div>
            <label className="label">Fornecedor</label>
            <Select value={filters.supplierId} onChange={(e) => setFilters((f) => ({ ...f, supplierId: e.target.value }))} className="!h-11 !text-base">
              <option value="">Todos</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </div>
          <div>
            <label className="label">Docа</label>
            <Select value={filters.dockId} onChange={(e) => setFilters((f) => ({ ...f, dockId: e.target.value }))} className="!h-11 !text-base">
              <option value="">Todas</option>
              {docks.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </Select>
          </div>
          <div>
            <label className="label">Comprador</label>
            <Select value={filters.compradorId} onChange={(e) => setFilters((f) => ({ ...f, compradorId: e.target.value }))} className="!h-11 !text-base">
              <option value="">Todos</option>
              {compradores.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </div>
          <div>
            <label className="label">Conferente</label>
            <Select value={filters.conferenteId} onChange={(e) => setFilters((f) => ({ ...f, conferenteId: e.target.value }))} className="!h-11 !text-base">
              <option value="">Todos</option>
              {conferentes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
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
            <thead className="text-left text-sm font-semibold text-white bg-gradient-to-r from-brand-700 to-brand-500">
              <tr className="border-b border-slate-200">
                <th className="py-3 px-3">Data</th>
                <th className="py-3 px-3">Produto</th>
                <th className="py-3 px-3 text-right">Previsão</th>
                <th className="py-3 px-3">Docа</th>
                <th className="py-3 px-3">Horários prev./lanç.</th>
                <th className="py-3 px-3">Comprador</th>
                <th className="py-3 px-3">Conferente</th>
                <th className="py-3 px-3">Observações</th>
                <th className="py-3 px-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {pendingBySupplier.map((group) => (
                <Fragment key={group.key}>
                  <tr className="bg-slate-50 border-b-2 border-brand-100">
                    <td colSpan={9} className="p-0">
                      <SupplierGroupHeader group={group} />
                    </td>
                  </tr>
                  {!collapsedSuppliers.has(group.key) && group.items.map((it: any) => (
                    <tr key={it.id} className="border-b border-slate-100 hover:bg-brand-50/60">
                      <td className="py-3 px-3 font-semibold whitespace-nowrap">{isoDate(it.launch.referenceDate).split('-').reverse().join('/')}</td>
                      <td className="py-3 px-3 font-medium text-sm whitespace-normal break-words min-w-[220px] max-w-[320px] leading-snug" title={it.productName ?? ''}>{it.productName}</td>
                      <td className="py-3 px-3 text-right font-bold text-blue-700">{brNum(it.forecast, 0)}</td>
                      <td className="py-3 px-3 text-slate-600 text-sm whitespace-normal break-words">{it.dockName || it.launch.dockName || '—'}</td>
                      <td className="py-3 px-3 text-xs whitespace-nowrap">
                        <div><span className="text-slate-500">Prev:</span> <b className="text-sky-700">{it.forecastTime ?? '—'}</b></div>
                        <div><span className="text-slate-500">Lanç:</span> <b className="text-emerald-700">{it.entryTime ?? '—'}</b></div>
                      </td>
                      <td className="py-3 px-3 text-slate-600 text-sm whitespace-normal break-words min-w-[140px]" title={it.compradorName || it.launch.compradorName || ''}>{it.compradorName || it.launch.compradorName || '—'}</td>
                      <td className="py-3 px-3 text-slate-600 text-sm whitespace-normal break-words min-w-[140px]" title={it.conferenteName || it.launch.conferenteName || ''}>{it.conferenteName || it.launch.conferenteName || '—'}</td>
                      <td className="py-3 px-3 text-slate-600 text-sm whitespace-normal break-words max-w-[220px]" title={it.notes ?? ''}>{it.notes ?? '—'}</td>
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
                  ))}
                </Fragment>
              ))}
              {pendingBySupplier.length === 0 && (
                <tr>
                  <td colSpan={9} className="p-10 text-center text-slate-500">
                    <ListChecks className="mx-auto mb-2 text-brand-300" size={34} />
                    <p className="text-base">Nenhuma entrada pendente para os filtros informados.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="xl:hidden space-y-4">
          {pendingBySupplier.map((group) => (
            <div key={group.key} className="rounded-xl border-2 border-slate-200 bg-white overflow-hidden">
              <SupplierGroupHeader group={group} />
              {!collapsedSuppliers.has(group.key) && (
                <div className="space-y-3 p-3">
                  {group.items.map((it: any) => (
                    <div key={it.id} className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-bold text-slate-800 text-sm break-words leading-snug" title={it.productName ?? ''}>{it.productName}</div>
                          <div className="text-xs text-slate-500">{isoDate(it.launch.referenceDate).split('-').reverse().join('/')}</div>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          {canEdit && <button onClick={() => loadLaunchIntoForm(it.launch)} className="p-2 text-brand-700 hover:bg-brand-50 rounded-md"><Pencil size={17} /></button>}
                          {canDelete && <button onClick={() => setConfirmDelId(it.launch.id)} className="p-2 text-red-600 hover:bg-red-50 rounded-md"><Trash2 size={17} /></button>}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-center border-y border-slate-200 py-2">
                        <div><div className="text-[11px] text-slate-500">Previsão (cx)</div><div className="font-bold text-blue-700">{brNum(it.forecast, 0)}</div></div>
                        <div><div className="text-[11px] text-slate-500">Docа</div><div className="font-bold text-slate-700 text-xs break-words">{it.dockName || it.launch.dockName || '—'}</div></div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 rounded-lg bg-white/70 p-2 text-center">
                        <div><div className="text-[11px] text-slate-500">Horário previsto</div><div className="font-bold text-sky-700">{it.forecastTime ?? '—'}</div></div>
                        <div><div className="text-[11px] text-slate-500">Horário lançado</div><div className="font-bold text-emerald-700">{it.entryTime ?? '—'}</div></div>
                      </div>
                      <div className="text-xs text-slate-600 break-words"><b>Comprador:</b> {it.compradorName || it.launch.compradorName || '—'}</div>
                      <div className="text-xs text-slate-600 break-words"><b>Conferente:</b> {it.conferenteName || it.launch.conferenteName || '—'}</div>
                      {it.notes && <div className="text-xs text-slate-600 break-words"><b>Observações:</b> {it.notes}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
          {pendingBySupplier.length === 0 && (
            <div className="rounded-xl border-2 border-dashed border-slate-200 p-10 text-center text-slate-500">
              Nenhuma entrada pendente para os filtros informados.
            </div>
          )}
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3 text-sm text-slate-600">
          <Badge tone="sky">{pendingFlat.length} entrada(s) pendente(s)</Badge>
          <Badge tone="green">{receivedFlat.length} produto(s) recebido(s) no filtro</Badge>
          <span className="inline-flex items-center gap-1"><History size={15} /> Atualizado automaticamente ao salvar um recebimento.</span>
          <Link href="/recebidos" className="inline-flex items-center gap-1 font-semibold text-emerald-700 hover:underline">
            Abrir módulo Produtos recebidos <ArrowRight size={15} />
          </Link>
          {loadingLists && <Spinner />}
        </div>
      </section>
    </div>
  );
}

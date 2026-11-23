'use client';

export const dynamic = 'force-dynamic';

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  ArrowRight,
  ListChecks,
  Plus,
  Trash2,
  RefreshCw,
  Search,
  Package,
  Truck,
  Pencil,
  History,
  Save,
  Send,
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
  launchId: string;
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

// Rascunho do conferente por item, mantido enquanto ele confere o grupo.
type ReceiveDraft = {
  conferenteId: string;
  received: number | '';
  rendimento: number | '';
  notes: string;
};

// Horário do conferente é registrado no momento do lançamento, sem digitação.
function nowHHmm() {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date());
}

// Quantidade recebida > 0 => item recebido, com horário automático.
// Se o recebido for apagado, o item volta para previsão e o horário é limpo.
function isReceivedRow(row: Row) {
  return row.status === 'RECEBIDO' || Number(row.received) > 0;
}

function applyReceiptAuto(row: Row): Row {
  const hasReceived = Number(row.received) > 0;
  if (hasReceived || row.entryTime) {
    if (!row.entryTime) row.entryTime = nowHHmm();
    row.status = 'RECEBIDO';
  } else {
    row.entryTime = '';
    row.status = 'PREVISTO';
  }
  return row;
}

// Lançamentos antigos podem ter só o nome gravado; localiza o cadastro atual.
// Nome pode vir nulo do banco, então a comparação é segura.
function registryIdByName(list: NamedOption[], name?: string | null) {
  if (!name) return '';
  const wanted = name.trim().toLowerCase();
  if (!wanted) return '';
  return list.find((x) => x.name?.trim().toLowerCase() === wanted)?.id ?? '';
}

function newRow(defaults: RowDefaults = {}): Row {
  return {
    _key: `r_${Math.random().toString(36).slice(2, 9)}`,
    launchId: '',
    productId: '',
    supplierId: '',
    compradorId: defaults.compradorId ?? '',
    compradorName: defaults.compradorName ?? '',
    conferenteId: defaults.conferenteId ?? '',
    conferenteName: defaults.conferenteName ?? '',
    dockId: defaults.dockId ?? '',
    forecastTime: '',
    // Vazios de propósito: o zero aparece só como placeholder (fictício).
    forecast: '',
    received: '',
    rendimento: '',
    entryTime: '',
    notes: '',
    status: 'PREVISTO',
  };
}

// Identifica alterações ainda não gravadas. Linhas novas (chave temporária)
// são normalizadas para que uma linha vazia nunca dispare aviso de saída.
function formSignature(
  rows: Row[],
  header: { date: string; notes: string; dockId: string; compradorId: string; conferenteId: string },
) {
  return JSON.stringify({
    h: [header.date, header.notes, header.dockId, header.compradorId, header.conferenteId],
    r: rows.map((r) => [
      r._key.startsWith('r_') ? 'new' : r._key,
      r.productId, r.supplierId, r.compradorId, r.compradorName,
      r.conferenteId, r.conferenteName, r.dockId, r.forecastTime,
      r.forecast, r.received, r.rendimento, r.entryTime, r.notes, r.status,
    ]),
  });
}

// Converte um item gravado de volta para linha da tabela.
function rowFromItem(it: any): Row {
  return {
    _key: it.id,
    launchId: it.launchId ?? it.launch?.id ?? '',
    productId: it.productId,
    supplierId: it.supplierId,
    // Zero vira vazio: o "0" aparece só como placeholder e some ao digitar.
    forecast: Number(it.forecast) || '',
    received: Number(it.received) || '',
    rendimento: Number(it.rendimento) || '',
    compradorId: it.compradorId ?? '',
    compradorName: it.compradorName ?? '',
    conferenteId: it.conferenteId ?? '',
    conferenteName: it.conferenteName ?? '',
    dockId: it.dockId ?? '',
    forecastTime: it.forecastTime ?? '',
    entryTime: it.entryTime ?? '',
    notes: it.notes ?? '',
    status: it.status === 'RECEBIDO' ? 'RECEBIDO' : 'PREVISTO',
  };
}

// Delta = recebido - previsão (negativo = faltou/vermelho; positivo = veio a mais/verde).
function deltaOf(forecast: unknown, received: unknown) {
  return Number(received ?? 0) - Number(forecast ?? 0);
}

function deltaLabel(v: number) {
  if (v === 0) return '0';
  return `${v > 0 ? '+' : ''}${brNum(v, 0)}`;
}

export type LaunchMode = 'buyers' | 'reviewers';

export default function LaunchesPage({ mode = 'buyers' }: { mode?: LaunchMode }) {
  const { can, loading: loadingAuth } = useAuth();
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const editParam = searchParams.get('edit');
  const launchModule = mode === 'buyers' ? 'launches_buyers' : 'launches_reviewers';
  const openedFromHistory = !!editParam;
  const canView =
    can(launchModule, 'view') ||
    (mode === 'buyers' && openedFromHistory && (can('reports', 'view') || can('launches', 'view')));
  const canCreate = can(launchModule, 'create');
  const canEditModule = can(launchModule, 'edit');
  const canDelete = can(launchModule, 'delete');
  // Dados de conferência (conferente, recebido, rendimento e horário) só são editáveis
  // por quem acessa o módulo Lançamento conferentes.
  const canEditReceiving = (['view', 'create', 'edit'] as const).some((action) =>
    can('launches_reviewers', action),
  );
  const receivingLocked = mode === 'buyers' && !canEditReceiving;

  const [date, setDate] = useState(todayISO());
  const [dockId, setDockId] = useState('');
  const [compradorId, setCompradorId] = useState('');
  const [conferenteId, setConferenteId] = useState('');
  const [compradorName, setCompradorName] = useState('');
  const [conferenteName, setConferenteName] = useState('');
  const [notes, setNotes] = useState('');
  const [rows, setRows] = useState<Row[]>([newRow()]);
  const [editingLaunchId, setEditingLaunchId] = useState<string | null>(null);
  // Último estado confirmado pelo servidor — usado para não bloquear a saída
  // depois que o item foi salvo individualmente.
  const savedSignatureRef = useRef<string | null>(null);

  // Ao abrir um lançamento pelo histórico, quem pode ver o histórico pode editá-lo.
  const canHistoryEdit = can('reports', 'view') || can('launches', 'view');
  const canEdit =
    canEditModule ||
    can(launchModule, 'create') ||
    ((!!editingLaunchId || openedFromHistory) && (canHistoryEdit || can(launchModule, 'view')));

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
  const [receiveDrafts, setReceiveDrafts] = useState<Record<string, ReceiveDraft>>({});

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

  // Histórico com apenas o nome gravado é amarrado ao cadastro correspondente.
  useEffect(() => {
    if (!compradores.length && !conferentes.length) return;
    setRows((arr) =>
      arr.map((r) => ({
        ...r,
        compradorId: r.compradorId || registryIdByName(compradores, r.compradorName),
        conferenteId: r.conferenteId || registryIdByName(conferentes, r.conferenteName),
      })),
    );
  }, [compradores, conferentes]);

  useEffect(() => {
    loadLists();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  // Permite abrir o lançamento diretamente pelo histórico de entradas.
  useEffect(() => {
    if (editParam) loadLaunchIntoForm({ id: editParam });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editParam]);

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
  // Somente cadastros ativos podem ser selecionados como responsáveis.
  const compradoresAtivos = useMemo(() => compradores.filter((c) => c.active !== false), [compradores]);
  const conferentesAtivos = useMemo(() => conferentes.filter((c) => c.active !== false), [conferentes]);

  function setRow(idx: number, patch: Partial<Row>) {
    setRows((arr) =>
      arr.map((r, i) => {
        if (i !== idx) return r;
        const next = { ...r, ...patch };
        // Situação e horário nunca são digitados: acompanham o recebido.
        return applyReceiptAuto(next);
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

  // Payload reaproveitado pelo botão superior e pelo disco de cada linha.
  function buildPayload(list: Row[], referenceDate = date, notesValue = notes) {
    const first = list[0];
    return {
      referenceDate,
      notes: notesValue || null,
      // Snapshots do lançamento espelham o primeiro item (compatibilidade).
      dockId: first?.dockId || null,
      compradorId: first?.compradorId || null,
      conferenteId: first?.conferenteId || null,
      compradorName: first?.compradorName?.trim() || null,
      conferenteName: first?.conferenteName?.trim() || null,
      items: list.map((r) => {
        const receivedItem = isReceivedRow(r);
        return {
          productId: r.productId,
          supplierId: r.supplierId,
          forecast: Number(r.forecast) || 0,
          received: Number(r.received) || 0,
          rendimento: Number(r.rendimento) || 0,
          compradorId: r.compradorId || null,
          compradorName: r.compradorName.trim() || null,
          conferenteId: r.conferenteId || null,
          conferenteName: r.conferenteName.trim() || null,
          dockId: r.dockId || null,
          forecastTime: r.forecastTime || null,
          entryTime: receivedItem ? r.entryTime || nowHHmm() : null,
          notes: r.notes || null,
          status: receivedItem ? ('RECEBIDO' as ItemStatus) : ('PREVISTO' as ItemStatus),
        };
      }),
    };
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
    for (const [idx, r] of valid.entries()) {
      const nForecast = Number(r.forecast) || 0;
      const nReceived = Number(r.received) || 0;
      if (nForecast < 0 || nReceived < 0) {
        toast('error', 'Não é permitido valor negativo.');
        return;
      }
      // Mesmo produto + fornecedor pode aparecer mais de uma vez (entregas distintas).
      if (isReceivedRow(r) && !r.conferenteId) {
        toast('warning', `Item ${idx + 1}: selecione um conferente cadastrado.`);
        return;
      }
    }

    setLoading(true);
    const payload = buildPayload(valid);
    const r = editingLaunchId
      ? await api.put(`/launches/${editingLaunchId}`, payload)
      : await api.post('/launches', payload);
    setLoading(false);

    if (r.ok) {
      toast(
        'success',
        editingLaunchId
          ? 'Lançamento atualizado. Os itens conferidos aparecem no histórico de entradas.'
          : `${valid.length} previsão(ões) salva(s) e agrupada(s) para o conferente.`,
      );
      doClear();
      loadLists();
    } else {
      toast('error', errorMessage(r, 'Falha ao salvar.'));
    }
  }

  // Disco ao lado da linha: salva somente aquele item e mantém os outros na tela.
  async function saveSingleRow(idx: number) {
    if (editingLaunchId ? !canEdit : !canCreate) {
      toast('error', editingLaunchId ? 'Sem permissão para editar lançamentos.' : 'Sem permissão para criar lançamentos.');
      return;
    }
    const row = rows[idx];
    if (!row?.productId || !row.supplierId) {
      toast('warning', 'Selecione produto e fornecedor nesta linha antes de salvar.');
      return;
    }
    if (Number(row.forecast) < 0 || Number(row.received) < 0) {
      toast('error', 'Não é permitido valor negativo.');
      return;
    }
    if (isReceivedRow(row) && !row.conferenteId) {
      toast('warning', 'Selecione um conferente cadastrado para salvar este item como recebido.');
      return;
    }

    setLoading(true);
    try {
      let launchId = editingLaunchId;
      let itemsToSave: Row[] = [row];

      if (launchId) {
        // Monta a lista completa para não apagar os itens já gravados.
        const fullRes = await api.get(`/launches/${launchId}`);
        if (!fullRes.ok) throw fullRes;
        const stored: Row[] = ((fullRes.data as any)?.items ?? []).map(rowFromItem);
        const isStoredRow = !row._key.startsWith('r_');
        itemsToSave = isStoredRow
          ? stored.map((it) => (it._key === row._key ? row : it))
          : [...stored, row];
        if (isStoredRow && !itemsToSave.some((it) => it._key === row._key)) itemsToSave.push(row);
      }

      const res = launchId
        ? await api.put(`/launches/${launchId}`, buildPayload(itemsToSave))
        : await api.post('/launches', buildPayload(itemsToSave));

      if (!res.ok) {
        toast('error', errorMessage(res, 'Falha ao salvar item.'));
        return;
      }

      const saved = res.data as any;
      if (!launchId && saved?.id) setEditingLaunchId(saved.id);

      // Atualização imediata: o item salvo sai da tela e já aparece no grupo
      // abaixo. As demais linhas continuam disponíveis para salvar depois.
      const finalRows = rows.filter((_, i) => i !== idx);
      const visibleRows = finalRows.length ? finalRows : [newRow()];
      setRows(visibleRows);
      savedSignatureRef.current = formSignature(visibleRows, {
        date, notes, dockId, compradorId, conferenteId,
      });

      toast('success', 'Item salvo e atualizado. Você já pode sair da tela.');
      await loadLists();
    } catch (err) {
      toast('error', errorMessage(err, 'Falha ao salvar item.'));
    } finally {
      setLoading(false);
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
    savedSignatureRef.current = formSignature([newRow()], {
      date, notes: '', dockId: '', compradorId: '', conferenteId: '',
    });
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
    const loadedRows: Row[] = (full.items ?? []).map((it: any) => ({
      ...rowFromItem(it),
      // Histórico sem responsável no item usa o snapshot do lançamento.
      compradorId: it.compradorId ?? full.compradorId ?? '',
      compradorName: it.compradorName ?? full.compradorName ?? full.comprador?.name ?? '',
      conferenteId: it.conferenteId ?? full.conferenteId ?? '',
      conferenteName: it.conferenteName ?? full.conferenteName ?? full.conferente?.name ?? '',
      dockId: it.dockId ?? full.dockId ?? '',
    }));
    setRows(loadedRows);
    savedSignatureRef.current = formSignature(loadedRows, {
      date: isoDate(full.referenceDate),
      notes: full.notes ?? '',
      dockId: full.dockId ?? '',
      compradorId: full.compradorId ?? '',
      conferenteId: full.conferenteId ?? '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Editar carrega o lançamento no formulário da própria tela (comprador ou conferente).
  function openLaunchEditor(launch: any) {
    loadLaunchIntoForm(launch);
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

  const currentSignature = formSignature(rows, { date, notes, dockId, compradorId, conferenteId });
  useEffect(() => {
    // Primeira renderização: nada foi digitado ainda.
    if (savedSignatureRef.current === null) savedSignatureRef.current = currentSignature;
  }, [currentSignature]);
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      // Só avisa quando existir alteração realmente não salva. Depois de salvar
      // um item pelo disco, a saída é livre e imediata.
      if (currentSignature !== savedSignatureRef.current) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [currentSignature]);

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

  // Rascunho do conferente: valores gravados aparecem como vazio quando são zero.
  function draftFor(it: any): ReceiveDraft {
    return receiveDrafts[it.id] ?? {
      conferenteId: it.conferenteId || '',
      received: Number(it.received) || '',
      rendimento: Number(it.rendimento) || '',
      notes: it.notes ?? '',
    };
  }

  function setDraft(itemId: string, patch: Partial<ReceiveDraft>) {
    setReceiveDrafts((prev) => {
      const base: ReceiveDraft = prev[itemId] ?? {
        conferenteId: '',
        received: '',
        rendimento: '',
        notes: '',
      };
      return { ...prev, [itemId]: { ...base, ...patch } };
    });
  }

  // Salva somente o item conferido, preservando os demais do mesmo lançamento.
  async function saveConferenteItem(it: any) {
    if (!canEdit) {
      toast('error', 'Sem permissão para editar lançamentos.');
      return;
    }
    const draft = draftFor(it);
    if (!draft.conferenteId) {
      toast('warning', 'Selecione o conferente deste item.');
      return;
    }
    if (Number(draft.received) <= 0) {
      toast('warning', 'Informe a quantidade recebida.');
      return;
    }

    setLoading(true);
    try {
      const fullRes = await api.get(`/launches/${it.launchId}`);
      if (!fullRes.ok) throw fullRes;
      const full = (fullRes.data as any) ?? {};
      const stored: Row[] = (full.items ?? []).map(rowFromItem);
      const row: Row = {
        ...rowFromItem(it),
        conferenteId: draft.conferenteId,
        conferenteName: conferentes.find((c) => c.id === draft.conferenteId)?.name ?? '',
        received: draft.received,
        rendimento: draft.rendimento,
        notes: draft.notes,
        status: 'RECEBIDO',
        entryTime: it.entryTime || nowHHmm(),
      };
      const merged = stored.map((x) => (x._key === it.id ? row : x));
      if (!merged.some((x) => x._key === it.id)) merged.push(row);

      const res = await api.put(
        `/launches/${it.launchId}`,
        buildPayload(merged, isoDate(full.referenceDate), full.notes ?? ''),
      );
      if (!res.ok) {
        toast('error', errorMessage(res, 'Falha ao salvar recebimento.'));
        return;
      }
      setReceiveDrafts((prev) => {
        const next = { ...prev };
        delete next[it.id];
        return next;
      });
      toast('success', 'Recebimento salvo e atualizado. O item permanece agrupado até o lançamento ser concluído.');
      await loadLists();
    } catch (err) {
      toast('error', errorMessage(err, 'Falha ao salvar recebimento.'));
    } finally {
      setLoading(false);
    }
  }

  // Rendimento e observação podem ser ajustados depois da conferência,
  // sem exigir acesso à tela de compradores nem regravar o recebimento.
  async function saveItemAdjustment(it: any, draft: ReceiveDraft) {
    if (!canEdit) {
      toast('error', 'Sem permissão para editar lançamentos.');
      return;
    }
    const rendimento = Number(draft.rendimento) || 0;
    if (rendimento < 0) {
      toast('error', 'Não é permitido valor negativo.');
      return;
    }
    setLoading(true);
    try {
      const res = await api.patch(`/launches/${it.launchId}/items/${it.id}`, {
        rendimento,
        notes: draft.notes || null,
      });
      if (!res.ok) {
        toast('error', errorMessage(res, 'Falha ao salvar ajuste do item.'));
        return;
      }
      toast('success', 'Rendimento e observação atualizados.');
      await loadLists();
    } catch (err) {
      toast('error', errorMessage(err, 'Falha ao salvar ajuste do item.'));
    } finally {
      setLoading(false);
    }
  }

  // Ao abrir pelo histórico, mostra também os campos do conferente para edição completa.
  const showFullEdit = !!editingLaunchId;

  // Larguras percentuais: todas as colunas cabem na largura disponível, sem scroll horizontal.
  const buyerCol = 'text-center';
  const buyerInputAlign = '!text-center';

  if (!loadingAuth && !canView) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
        <h1 className="text-lg font-bold text-amber-900">Sem permissão</h1>
        <p className="mt-1 text-sm text-amber-800">
          Seu usuário não tem acesso ao módulo {mode === 'buyers' ? 'Lançamento compradores' : 'Lançamento conferentes'}.
        </p>
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

      {/* ===================== MÓDULO 1 — LANÇAMENTOS / EDIÇÃO ===================== */}
      {(mode === 'buyers' || !!editingLaunchId) && (
      <section className={clsx('rounded-2xl bg-white shadow-soft border p-4 sm:p-5', editingLaunchId ? 'border-amber-300 ring-2 ring-amber-100' : 'border-slate-200')}>
        <header className="mb-4 flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white flex items-center justify-center shadow-md">
              <Plus size={24} />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-slate-900">
                {mode === 'reviewers'
                  ? 'Editando conferência'
                  : editingLaunchId
                    ? 'Editando lançamento'
                    : 'Lançamento compradores'}
              </h2>
              <p className="text-sm text-slate-600">
                {mode === 'reviewers'
                  ? 'Ajuste os dados de conferência deste lançamento. O horário do conferente é registrado automaticamente e o grupo permanece pendente até todos os itens serem conferidos.'
                  : 'Registre produto, fornecedor, comprador, doca, horário previsto e previsão. Tudo salvo fica agrupado para o conferente.'}
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
              {editingLaunchId ? 'Salvar alterações' : 'Salvar previsão'}
            </Button>
          </div>
        </header>

        {/* Padrões compactos — preenchem novas linhas; cada item pode ser diferente. */}
        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 mb-4">
          <div className="flex flex-wrap items-end gap-2">
            <div className="w-36 shrink-0">
              <Input type="date" label="Data" value={date} onChange={(e) => setDate(e.target.value)} className="!h-9 !text-sm" />
            </div>
            <div className="min-w-[150px] flex-1">
              <label className="label">Comprador padrão</label>
              <Select
                value={compradorId}
                onChange={(e) => {
                  setCompradorId(e.target.value);
                  setCompradorName(compradores.find((c) => c.id === e.target.value)?.name ?? '');
                }}
                className="!h-9 !text-sm"
              >
                <option value="">Selecione...</option>
                {compradoresAtivos.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </div>
            <div className="min-w-[130px] flex-1">
              <label className="label">Docа padrão</label>
              <Select value={dockId} onChange={(e) => setDockId(e.target.value)} className="!h-9 !text-sm">
                <option value="">Selecione...</option>
                {docks.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </Select>
            </div>
            <div className="min-w-[160px] flex-[1.2]">
              <Input label="Observações gerais" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional" className="!h-9 !text-sm" />
            </div>
            <Button variant="secondary" onClick={applyDefaultsToRows} className="!h-9 !text-sm">
              Aplicar às linhas
            </Button>
          </div>
          <p className="mt-2 text-[11px] text-slate-500">
            Padrões para novos itens. O comprador vem somente dos cadastros; cada item pode ter seu próprio comprador, doca, horário previsto e observação.
            {receivingLocked ? ' Conferente, recebido, rendimento e horário de conferência aparecem apenas para leitura.' : ''}
          </p>
        </div>

        {/* Tabela estilo planilha — larguras percentuais: nenhuma coluna fica escondida. */}
        <div className="overflow-x-auto rounded-xl border border-slate-300 bg-white">
          <table className={clsx('w-full border-collapse text-sm table-fixed', showFullEdit ? 'min-w-[1200px] lg:min-w-0' : 'min-w-[900px] lg:min-w-0')}>
            <colgroup>
              {showFullEdit ? (
                <>
                  <col className="w-[11%]" />  {/* Produto */}
                  <col className="w-[9%]" />   {/* Fornecedor */}
                  <col className="w-[8%]" />   {/* Comprador */}
                  <col className="w-[6%]" />   {/* Hor. previsto */}
                  <col className="w-[6%]" />   {/* Docа */}
                  <col className="w-[5%]" />   {/* Previsão */}
                  <col className="w-[8%]" />   {/* Conferente */}
                  <col className="w-[6%]" />   {/* Hor. conf. */}
                  <col className="w-[6%]" />   {/* Recebido */}
                  <col className="w-[6%]" />   {/* Rendimento */}
                  <col className="w-[4%]" />   {/* Delta */}
                  <col className="w-[6%]" />   {/* Situação */}
                  <col className="w-[15%]" />  {/* Observações */}
                  <col className="w-[4%]" />   {/* Ações */}
                </>
              ) : (
                <>
                  <col className="w-[18%]" />  {/* Produto */}
                  <col className="w-[15%]" />  {/* Fornecedor */}
                  <col className="w-[14%]" />  {/* Comprador */}
                  <col className="w-[8%]" />   {/* Hor. previsto */}
                  <col className="w-[9%]" />   {/* Docа */}
                  <col className="w-[7%]" />   {/* Previsão */}
                  <col className="w-[22%]" />  {/* Observações */}
                  <col className="w-[7%]" />   {/* Ações */}
                </>
              )}
            </colgroup>
            <thead className="sticky top-0 z-10">
              <tr className="text-xs font-semibold text-white bg-slate-700">
                <th className="border border-slate-300 px-2 py-2 text-center text-[15px]">Produto</th>
                <th className="border border-slate-300 px-2 py-2 text-center text-[15px]">Fornecedor</th>
                <th className={clsx('border border-sky-300 bg-sky-700 px-2 py-2', buyerCol)}>Comprador</th>
                <th className="border border-sky-300 bg-sky-700 px-2 py-2">Hor. previsto</th>
                <th className="border border-sky-300 bg-sky-700 px-2 py-2">Docа</th>
                <th className="border border-sky-300 bg-sky-700 px-2 py-2">Previsão</th>
                {showFullEdit && (
                  <>
                    <th className="border border-emerald-300 bg-emerald-700 px-2 py-2 text-left">Conferente</th>
                    <th className="border border-emerald-300 bg-emerald-700 px-2 py-2">Hor. conf. (auto)</th>
                    <th className="border border-emerald-300 bg-emerald-700 px-2 py-2">Recebido</th>
                    <th className="border border-emerald-300 bg-emerald-700 px-2 py-2">Rendimento</th>
                    <th className="border border-slate-300 px-2 py-2">Delta</th>
                    <th className="border border-slate-300 px-2 py-2">Situação</th>
                  </>
                )}
                <th className="border border-slate-300 px-2 py-2">Observações</th>
                <th className="border border-slate-300 px-1.5 py-2">Ações</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => {
                const delta = deltaOf(r.forecast, r.received);
                return (
                  <tr key={r._key} className={clsx(idx % 2 === 0 ? 'bg-white' : 'bg-slate-50', 'hover:bg-brand-50/40')}>
                    <td className="border border-slate-200 p-1.5 align-middle">
                      <SearchSelect
                        compact
                        icon={<Package size={16} />}
                        items={productOptions}
                        value={r.productId}
                        onChange={(id) => setRow(idx, { productId: id })}
                        placeholder="Produto..."
                        className="[&_input]:!text-center [&_input]:!text-[15px] [&_input]:!font-semibold"
                      />
                    </td>
                    <td className="border border-slate-200 p-1.5 align-middle">
                      <SearchSelect
                        compact
                        icon={<Truck size={16} />}
                        items={supplierOptions}
                        value={r.supplierId}
                        onChange={(id) => setRow(idx, { supplierId: id })}
                        placeholder="Fornecedor..."
                        className="[&_input]:!text-center [&_input]:!text-[15px] [&_input]:!font-semibold"
                      />
                    </td>
                    <td className="border border-sky-100 p-1.5 align-middle">
                      <select
                        value={r.compradorId || registryIdByName(compradoresAtivos, r.compradorName)}
                        onChange={(e) => {
                          const found = compradores.find((c) => c.id === e.target.value);
                          setRow(idx, { compradorId: e.target.value, compradorName: found?.name ?? '' });
                        }}
                        className={clsx('input !h-9 !text-sm !px-2', buyerInputAlign)}
                        title="Somente compradores cadastrados"
                      >
                        <option value="">Selecione...</option>
                        {compradoresAtivos.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
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
                      <input type="number" min="0" step="0.001" value={r.forecast} placeholder="0" onChange={(e) => setRow(idx, { forecast: e.target.value === '' ? '' : Number(e.target.value) })} className="input !h-9 !text-sm !px-2 text-right !placeholder:text-slate-300 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" />
                    </td>
                    {showFullEdit && (
                      <>
                        <td className="border border-emerald-100 p-1.5 align-middle">
                          {receivingLocked ? (
                            <div className="flex h-9 items-center justify-center rounded-md bg-emerald-50/60 px-2 text-sm text-emerald-900" title="Somente o setor de conferência pode alterar">
                              {r.conferenteName || '—'}
                            </div>
                          ) : (
                            <select
                              value={r.conferenteId || registryIdByName(conferentesAtivos, r.conferenteName)}
                              onChange={(e) => {
                                const found = conferentes.find((c) => c.id === e.target.value);
                                setRow(idx, { conferenteId: e.target.value, conferenteName: found?.name ?? '' });
                              }}
                              className="input !h-9 !text-sm !px-2"
                              title="Somente conferentes cadastrados"
                            >
                              <option value="">Selecione...</option>
                              {conferentesAtivos.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                          )}
                        </td>
                        <td className="border border-emerald-100 p-1.5 align-middle">
                          <div
                            className="flex h-9 items-center justify-center rounded-md border border-emerald-200 bg-emerald-50/60 px-2 text-sm font-semibold tabular-nums text-emerald-800"
                            title="Registrado automaticamente ao informar a quantidade recebida"
                          >
                            {r.entryTime || '—'}
                          </div>
                        </td>
                        <td className="border border-emerald-100 p-1.5 align-middle">
                          {receivingLocked ? (
                            <div className="flex h-9 items-center justify-end rounded-md bg-emerald-50/60 px-2 text-sm font-bold tabular-nums text-emerald-800" title="Somente o setor de conferência pode alterar">
                              {brNum(r.received, 0)}
                            </div>
                          ) : (
                            <input type="number" min="0" step="0.001" value={r.received} placeholder="0" onChange={(e) => setRow(idx, { received: e.target.value === '' ? '' : Number(e.target.value) })} className="input !h-9 !text-sm !px-2 text-right !placeholder:text-slate-300 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" />
                          )}
                        </td>
                        <td className="border border-emerald-100 p-1.5 align-middle">
                          {receivingLocked ? (
                            <div className="flex h-9 items-center justify-end rounded-md bg-emerald-50/60 px-2 text-sm font-bold tabular-nums text-emerald-800" title="Somente o setor de conferência pode alterar">
                              {brNum(r.rendimento, 0)}
                            </div>
                          ) : (
                            <input type="number" min="0" step="0.001" value={r.rendimento} placeholder="0" onChange={(e) => setRow(idx, { rendimento: e.target.value === '' ? '' : Number(e.target.value) })} title="Informado à mão — base de pagamento do fornecedor" className="input !h-9 !text-sm !px-2 text-right !placeholder:text-slate-300 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" />
                          )}
                        </td>
                        <td className={clsx('border border-slate-200 p-1.5 text-center font-bold align-middle', r.status === 'RECEBIDO' ? (delta < 0 ? 'text-red-600' : delta > 0 ? 'text-emerald-700' : 'text-slate-500') : 'text-slate-300')}>
                          {r.status === 'RECEBIDO' ? deltaLabel(delta) : '—'}
                        </td>
                        <td className="border border-slate-200 p-1.5 text-center align-middle">
                          <span
                            title="Automático: muda para Recebido quando o conferente informa a quantidade recebida"
                            className={clsx(
                              'inline-flex w-full items-center justify-center rounded px-1 py-1.5 text-xs font-bold uppercase',
                              r.status === 'RECEBIDO' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500',
                            )}
                          >
                            {r.status === 'RECEBIDO' ? 'Recebido' : 'Previsão'}
                          </span>
                        </td>
                      </>
                    )}
                    <td className="border border-slate-200 p-1.5 align-middle">
                      <input value={r.notes} onChange={(e) => setRow(idx, { notes: e.target.value })} placeholder="Opcional" className="input !h-9 !text-sm !px-2" title="Observação deste produto" />
                    </td>
                    <td className="border border-slate-200 p-1.5 text-center align-middle">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => saveSingleRow(idx)}
                          disabled={loading}
                          className="p-1.5 text-brand-700 hover:bg-brand-50 rounded disabled:opacity-30"
                          title="Salvar somente este item"
                        >
                          <Save size={16} />
                        </button>
                        <button onClick={() => removeRow(idx)} disabled={rows.length === 1} className="p-1.5 text-red-600 hover:bg-red-50 rounded disabled:opacity-30" title="Remover linha">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
          <button onClick={addRow} className="h-10 px-4 rounded-lg font-semibold text-sm bg-white text-brand-700 border-2 border-dashed border-brand-300 hover:bg-brand-50 hover:border-brand-500 transition flex items-center gap-2">
            <Plus size={17} /> Adicionar linha
          </button>
          <span className="text-xs text-slate-500">
            {mode === 'reviewers'
              ? 'Você pode salvar item por item. Use Tab para percorrer as colunas; o grupo sai da pendência quando todos os itens estiverem conferidos.'
              : <>Você pode salvar item por item. Use <b>Tab</b> para percorrer as colunas. Cada previsão salva fica disponível no módulo <b>Lançamento conferentes</b>.</>}
          </span>
        </div>
      </section>
      )}

      {/* ===================== MÓDULO 2 — ENTRADAS / PREVISÕES ===================== */}
      {mode === 'reviewers' && (
      <section className="rounded-2xl bg-white shadow-soft border border-slate-200 p-5 sm:p-7">
        <header className="mb-5 flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white flex items-center justify-center shadow-md">
              <ListChecks size={24} />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-slate-900">Lançamento conferentes</h2>
              <p className="text-sm text-slate-600">
                Tudo que os compradores lançam fica agrupado aqui por fornecedor. Confira o que chegou e salve item por item; o lançamento só vai para o
                histórico quando todos os itens estiverem conferidos. Depois de salvo, rendimento e observação continuam editáveis pelo disco da linha.
              </p>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button variant="secondary" onClick={loadLists}>
              <RefreshCw size={16} /> Atualizar
            </Button>
            <Link
              href="/historico-lancamentos-conferentes"
              className="h-11 px-5 rounded-lg font-semibold text-base inline-flex items-center gap-2 bg-emerald-600 text-white hover:bg-emerald-700 transition"
            >
              <History size={18} /> Histórico conferentes <ArrowRight size={17} />
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
          <table className="w-full text-base table-fixed">
            <colgroup>
              <col className="w-[6%]" />   {/* Data */}
              <col className="w-[12%]" />  {/* Produto */}
              <col className="w-[5%]" />   {/* Previsão */}
              <col className="w-[6%]" />   {/* Docа */}
              <col className="w-[5%]" />   {/* Hor. prev. */}
              <col className="w-[9%]" />   {/* Comprador */}
              <col className="w-[9%]" />   {/* Conferente */}
              <col className="w-[5%]" />   {/* Recebido */}
              <col className="w-[5%]" />   {/* Rendimento */}
              <col className="w-[5%]" />   {/* Hor. conf. */}
              <col className="w-[4%]" />   {/* Delta */}
              <col className="w-[5%]" />   {/* Situação */}
              <col className="w-[20%]" />  {/* Observações */}
              <col className="w-[4%]" />   {/* Ações */}
            </colgroup>
            <thead className="text-left text-sm font-semibold text-white bg-gradient-to-r from-brand-700 to-brand-500">
              <tr className="border-b border-slate-200">
                <th className="py-3 px-3">Data</th>
                <th className="py-3 px-3">Produto</th>
                <th className="py-3 px-3 text-right">Previsão</th>
                <th className="py-3 px-3">Docа</th>
                <th className="py-3 px-3">Hor. prev.</th>
                <th className={clsx('py-3 px-3', buyerCol)}>Comprador</th>
                <th className="py-3 px-3">Conferente</th>
                <th className="py-3 px-3 text-right">Recebido</th>
                <th className="py-3 px-3 text-right">Rendimento</th>
                <th className="py-3 px-3">Hor. conf.</th>
                <th className="py-3 px-3 text-right">Delta</th>
                <th className="py-3 px-3">Situação</th>
                <th className="py-3 px-3">Observações</th>
                <th className="py-3 px-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {pendingBySupplier.map((group) => (
                <Fragment key={group.key}>
                  <tr className="bg-slate-50 border-b-2 border-brand-100">
                    <td colSpan={14} className="p-0">
                      <SupplierGroupHeader group={group} />
                    </td>
                  </tr>
                  {!collapsedSuppliers.has(group.key) && group.items.map((it: any) => {
                    const d = draftFor(it);
                    const receivedItem = it.status === 'RECEBIDO';
                    const diff = deltaOf(it.forecast, it.received);
                    return (
                      <tr key={it.id} className="border-b border-slate-100 hover:bg-brand-50/60">
                        <td className="py-3 px-3 font-semibold whitespace-nowrap">{isoDate(it.launch.referenceDate).split('-').reverse().join('/')}</td>
                        <td className="py-3 px-3 font-medium text-sm whitespace-normal break-words leading-snug" title={it.productName ?? ''}>{it.productName}</td>
                        <td className="py-3 px-3 text-right font-bold text-blue-700">{brNum(it.forecast, 0)}</td>
                        <td className="py-3 px-3 text-slate-600 text-sm whitespace-normal break-words">{it.dockName || it.launch.dockName || '—'}</td>
                        <td className="py-3 px-3 text-xs whitespace-nowrap"><b className="text-sky-700">{it.forecastTime ?? '—'}</b></td>
                        <td className="py-3 px-3 text-slate-600 text-sm whitespace-normal break-words text-center" title={it.compradorName || it.launch.compradorName || ''}>{it.compradorName || it.launch.compradorName || '—'}</td>
                        <td className="py-3 px-3 min-w-[150px]">
                          {receivedItem ? (
                            <span className="text-sm text-slate-700 break-words">{it.conferenteName || it.launch.conferenteName || '—'}</span>
                          ) : (
                            <select
                              value={d.conferenteId || registryIdByName(conferentesAtivos, it.conferenteName)}
                              onChange={(e) => setDraft(it.id, { ...d, conferenteId: e.target.value })}
                              className="input !h-9 !text-sm !px-2"
                              title="Somente conferentes cadastrados"
                            >
                              <option value="">Selecione...</option>
                              {conferentesAtivos.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                          )}
                        </td>
                        <td className="py-3 px-3 text-right">
                          {receivedItem ? (
                            <b className="text-emerald-700">{brNum(it.received, 0)}</b>
                          ) : (
                            <input type="number" min="0" step="0.001" value={d.received} placeholder="0" onChange={(e) => setDraft(it.id, { ...d, received: e.target.value === '' ? '' : Number(e.target.value) })} className="input !h-9 !text-sm !px-2 text-right !placeholder:text-slate-300 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" />
                          )}
                        </td>
                        <td className="py-3 px-3 text-right">
                          <input
                            type="number"
                            min="0"
                            step="0.001"
                            value={d.rendimento}
                            placeholder="0"
                            title={receivedItem ? 'Rendimento permanece editável após a conferência' : 'Informado à mão — base de pagamento do fornecedor'}
                            onChange={(e) => setDraft(it.id, { ...d, rendimento: e.target.value === '' ? '' : Number(e.target.value) })}
                            className="input !h-9 !text-sm !px-2 text-right !placeholder:text-slate-300 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                          />
                        </td>
                        <td className="py-3 px-3 text-sm font-semibold tabular-nums text-emerald-700">{it.entryTime ?? '—'}</td>
                        <td className={clsx('py-3 px-3 text-right font-bold', diff < 0 ? 'text-red-700' : diff > 0 ? 'text-emerald-700' : 'text-slate-500')}>{receivedItem ? deltaLabel(diff) : '—'}</td>
                        <td className="py-3 px-3 text-center">
                          <span className={clsx('inline-flex rounded px-2 py-1 text-xs font-bold uppercase', receivedItem ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500')}>
                            {receivedItem ? 'Recebido' : 'Previsão'}
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          <input
                            value={d.notes}
                            onChange={(e) => setDraft(it.id, { ...d, notes: e.target.value })}
                            placeholder="Opcional"
                            className="input !h-9 !text-sm !px-2"
                            title={receivedItem ? 'Observação permanece editável após a conferência' : 'Observação deste item'}
                          />
                        </td>
                        <td className="py-3 px-3 text-right">
                          <div className="inline-flex gap-1">
                            {canEdit && !receivedItem && (
                              <button onClick={() => saveConferenteItem(it)} disabled={loading} className="p-2 text-brand-700 hover:bg-brand-50 rounded-md disabled:opacity-30" title="Salvar recebimento deste item">
                                <Save size={17} />
                              </button>
                            )}
                            {canEdit && receivedItem && (
                              <button onClick={() => saveItemAdjustment(it, d)} disabled={loading} className="p-2 text-purple-700 hover:bg-purple-50 rounded-md disabled:opacity-30" title="Salvar rendimento e observação">
                                <Save size={17} />
                              </button>
                            )}
                            {canEdit && (
                              <button onClick={() => openLaunchEditor(it.launch)} className="p-2 text-brand-700 hover:bg-brand-50 rounded-md" title="Editar">
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
                </Fragment>
              ))}
              {pendingBySupplier.length === 0 && (
                <tr>
                  <td colSpan={14} className="p-10 text-center text-slate-500">
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
                  {group.items.map((it: any) => {
                    const d = draftFor(it);
                    const receivedItem = it.status === 'RECEBIDO';
                    const diff = deltaOf(it.forecast, it.received);
                    return (
                      <div key={it.id} className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-bold text-slate-800 text-sm break-words leading-snug" title={it.productName ?? ''}>{it.productName}</div>
                            <div className="text-xs text-slate-500">{isoDate(it.launch.referenceDate).split('-').reverse().join('/')} · Previsão: {brNum(it.forecast, 0)}</div>
                          </div>
                          <div className="flex gap-1 shrink-0">
                            {canEdit && !receivedItem && <button onClick={() => saveConferenteItem(it)} disabled={loading} className="p-2 text-brand-700 hover:bg-brand-50 rounded-md disabled:opacity-30" title="Salvar recebimento"><Save size={17} /></button>}
                            {canEdit && receivedItem && <button onClick={() => saveItemAdjustment(it, d)} disabled={loading} className="p-2 text-purple-700 hover:bg-purple-50 rounded-md disabled:opacity-30" title="Salvar rendimento e observação"><Save size={17} /></button>}
                            {canEdit && <button onClick={() => openLaunchEditor(it.launch)} className="p-2 text-brand-700 hover:bg-brand-50 rounded-md" title="Editar"><Pencil size={17} /></button>}
                            {canDelete && <button onClick={() => setConfirmDelId(it.launch.id)} className="p-2 text-red-600 hover:bg-red-50 rounded-md" title="Excluir"><Trash2 size={17} /></button>}
                          </div>
                        </div>
                        <div className="text-xs text-slate-600 break-words"><b>Comprador:</b> {it.compradorName || it.launch.compradorName || '—'} <b>Doca:</b> {it.dockName || it.launch.dockName || '—'} <b>Prev:</b> {it.forecastTime ?? '—'}</div>
                        {receivedItem ? (
                          <div className="grid grid-cols-3 gap-2 rounded-lg bg-white/70 p-2 text-center">
                            <div><div className="text-[11px] text-slate-500">Recebido</div><div className="font-bold text-emerald-700">{brNum(it.received, 0)}</div></div>
                            <div>
                              <label className="text-[11px] text-slate-500">Rendimento</label>
                              <input
                                type="number"
                                min="0"
                                step="0.001"
                                value={d.rendimento}
                                placeholder="0"
                                title="Rendimento permanece editável após a conferência"
                                onChange={(e) => setDraft(it.id, { ...d, rendimento: e.target.value === '' ? '' : Number(e.target.value) })}
                                className="input !h-9 !text-sm !px-2 text-center !placeholder:text-slate-300 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                              />
                            </div>
                            <div><div className="text-[11px] text-slate-500">Hor. conf.</div><div className="font-bold text-emerald-700">{it.entryTime ?? '—'}</div></div>
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 gap-2 rounded-lg bg-white/70 p-2">
                            <div>
                              <label className="label !mb-1">Conferente</label>
                              <select value={d.conferenteId || registryIdByName(conferentesAtivos, it.conferenteName)} onChange={(e) => setDraft(it.id, { ...d, conferenteId: e.target.value })} className="input !h-9 !text-sm">
                                <option value="">Selecione...</option>
                                {conferentesAtivos.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                              </select>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <Input type="number" min="0" step="0.001" label="Recebido" value={d.received} onChange={(e) => setDraft(it.id, { ...d, received: e.target.value === '' ? '' : Number(e.target.value) })} placeholder="0" className="!h-9 !text-sm [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" />
                              <Input type="number" min="0" step="0.001" label="Rendimento" value={d.rendimento} onChange={(e) => setDraft(it.id, { ...d, rendimento: e.target.value === '' ? '' : Number(e.target.value) })} placeholder="0" className="!h-9 !text-sm [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" />
                            </div>
                          </div>
                        )}
                        <div className="flex items-center justify-between text-xs">
                          <span className={clsx('inline-flex rounded px-2 py-1 font-bold uppercase', receivedItem ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500')}>{receivedItem ? 'Recebido' : 'Previsão'}</span>
                          <span className={clsx('font-bold', diff < 0 ? 'text-red-700' : diff > 0 ? 'text-emerald-700' : 'text-slate-500')}>{receivedItem ? deltaLabel(diff) : '—'}</span>
                        </div>
                        <div>
                          <label className="label !mb-1">Observações deste item</label>
                          <input
                            value={d.notes}
                            onChange={(e) => setDraft(it.id, { ...d, notes: e.target.value })}
                            placeholder="Opcional"
                            className="input !h-9 !text-sm"
                            title={receivedItem ? 'Observação permanece editável após a conferência' : 'Observação deste item'}
                          />
                        </div>
                      </div>
                    );
                  })}
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
          <Badge tone="sky">{pendingFlat.filter((x: any) => x.status !== 'RECEBIDO').length} item(ns) aguardando conferência</Badge>
          <Badge tone="green">{pendingFlat.filter((x: any) => x.status === 'RECEBIDO').length} item(ns) já conferido(s) no grupo</Badge>
          <span className="inline-flex items-center gap-1"><History size={15} /> Atualizado automaticamente ao salvar um recebimento.</span>
          <Link href="/historico-lancamentos-conferentes" className="inline-flex items-center gap-1 font-semibold text-emerald-700 hover:underline">
            Abrir histórico conferentes <ArrowRight size={15} />
          </Link>
          {loadingLists && <Spinner />}
        </div>
      </section>
      )}
    </div>
  );
}

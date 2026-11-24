'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { Plus, Search, RefreshCw, Trash2, Edit3, Scale, Truck, Boxes, Package, History, Warehouse, UserCheck, ShoppingCart } from 'lucide-react';
import clsx from 'clsx';
import { api, errorMessage } from '../lib/api';
import { useToast } from '../hooks/useToast';
import { useAuth } from '../contexts/AuthContext';
import { SectionCard, Button, Input, Spinner, Modal, ConfirmDialog, NumberInput, Select, Badge } from '../components/UI';
import Toggle from '../components/Toggle';

type Product = {
  id: string;
  name: string;
  defaultBoxKg: number;
  active: boolean;
  createdAt: string;
  code: string | null;
  category: string | null;
  unit: string | null;
  notes: string | null;
};
type Supplier = {
  id: string;
  name: string;
  active: boolean;
  createdAt: string;
  document: string | null;
  legalName: string | null;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  state: string | null;
  notes: string | null;
};
type CadastroKind = 'products' | 'suppliers' | 'docks' | 'conferentes' | 'compradores';

const PRODUCT_EXTRA_FIELDS = ['code', 'category', 'unit', 'notes'] as const;
const SUPPLIER_EXTRA_FIELDS = ['document', 'legalName', 'contactName', 'phone', 'email', 'city', 'state', 'notes'] as const;

const REGISTRY_LABELS: Record<Exclude<CadastroKind, 'products' | 'suppliers'>, { title: string; singular: string; description: string }> = {
  docks: {
    title: 'Docas',
    singular: 'docа',
    description: 'Cadastre as docas de recebimento. A docа é escolhida uma vez por lançamento.',
  },
  conferentes: {
    title: 'Conferentes',
    singular: 'conferente',
    description: 'Cadastre os conferentes que informam a quantidade recebida e o horário de entrada.',
  },
  compradores: {
    title: 'Compradores',
    singular: 'comprador',
    description: 'Cadastre os compradores que informam a previsão de quantidade de mercadorias.',
  },
};

export default function CadastrosPage({ kind }: { kind: CadastroKind }) {
  const { can } = useAuth();
  const { toast } = useToast();
  const isProduct = kind === 'products';
  const isCatalog = kind === 'products' || kind === 'suppliers';
  const isRegistry = kind === 'docks' || kind === 'conferentes' || kind === 'compradores';
  const endpoint = isRegistry ? `/registries/${kind}` : `/${kind}`;
  const permModule = isRegistry ? 'products' : kind;
  const labels = isRegistry
    ? REGISTRY_LABELS[kind]
    : { title: isProduct ? 'Produtos' : 'Fornecedores', singular: isProduct ? 'produto' : 'fornecedor', description: '' };

  const [items, setItems] = useState<(Product | Supplier)[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 25;

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Product | Supplier | null>(null);
  const [confirmDelId, setConfirmDelId] = useState<string | null>(null);

  // form
  const [name, setName] = useState('');
  const [weight, setWeight] = useState<number>(20);
  const [extra, setExtra] = useState<Record<string, string>>({});

  function setField(key: string, value: string) {
    setExtra((prev) => ({ ...prev, [key]: value }));
  }

  async function load(p = 1) {
    setLoading(true);
    setPage(p);
    const qs = new URLSearchParams({
      q,
      includeInactive: includeInactive ? '1' : '0',
      page: String(p),
      pageSize: String(pageSize),
    });
    const r = await api.get(`${endpoint}?${qs.toString()}`);
    setLoading(false);
    if (r.ok) {
      setItems(r.data.items);
      setTotal(r.data.total);
    }
  }

  useEffect(() => {
    load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [includeInactive]);

  function openCreate() {
    setEditing(null);
    setName('');
    setWeight(20);
    setExtra(isCatalog ? { unit: isProduct ? 'CX' : '' } : {});
    setModalOpen(true);
  }

  function openEdit(item: Product | Supplier) {
    setEditing(item);
    setName(item.name);
    if (isProduct) setWeight(Number((item as Product).defaultBoxKg));
    if (isCatalog) {
      const fields = isProduct ? PRODUCT_EXTRA_FIELDS : SUPPLIER_EXTRA_FIELDS;
      const next: Record<string, string> = {};
      fields.forEach((key) => { next[key] = String((item as any)[key] ?? ''); });
      if (isProduct && !next.unit) next.unit = 'CX';
      setExtra(next);
    } else {
      setExtra({});
    }
    setModalOpen(true);
  }

  async function save() {
    if (!name.trim()) return toast('warning', 'Informe o nome.');
    if (isProduct && (Number(weight) <= 0 || Number.isNaN(Number(weight))))
      return toast('warning', 'O peso da caixa deve ser maior que zero.');

    const body: any = { name: name.trim() };
    if (isProduct) body.defaultBoxKg = Number(weight);

    if (isCatalog) {
      const fields: readonly string[] = isProduct ? PRODUCT_EXTRA_FIELDS : SUPPLIER_EXTRA_FIELDS;
      fields.forEach((key) => { body[key] = (extra[key] ?? '').trim() || null; });
    }

    const r = editing
      ? await api.put(`${endpoint}/${editing.id}`, body)
      : await api.post(endpoint, body);

    if (r.ok) {
      toast('success', editing ? 'Cadastro atualizado.' : 'Cadastro criado.');
      setModalOpen(false);
      load(page);
    } else {
      toast('error', errorMessage(r));
    }
  }

  async function toggle(item: Product | Supplier) {
    const r = await api.post(`${endpoint}/${item.id}/toggle`, { active: !item.active });
    if (r.ok) {
      toast('success', `Cadastro ${!item.active ? 'ativado' : 'inativado'}.`);
      load(page);
    } else {
      toast('error', errorMessage(r));
    }
  }

  async function del(id: string) {
    setConfirmDelId(null);
    // Não há delete físico — em vez disso inativa
    const r = await api.post(`${endpoint}/${id}/toggle`, { active: false });
    if (r.ok) {
      toast('success', 'Cadastro inativado.');
      load(page);
    } else {
      toast('error', errorMessage(r));
    }
  }

  const canCreate = can(permModule, 'create');
  const canEdit = can(permModule, 'edit');

  const pages = Math.max(1, Math.ceil(total / pageSize));

  function subtitle(item: Product | Supplier): string {
    if (!isCatalog) return '';
    const parts = isProduct
      ? [(item as Product).code, (item as Product).category]
      : [(item as Supplier).document, (item as Supplier).legalName];
    return parts.filter(Boolean).join(' · ');
  }

  return (
    <div className="space-y-4">
      <SectionCard
        title={labels.title}
        description={
          isRegistry
            ? labels.description
            : isProduct
              ? 'Cadastre produtos informando o peso padrão da caixa. Esse peso é usado nos relatórios e na conversão para quilogramas.'
              : 'Cadastre os fornecedores de hortifrúti. Fornecedores inativos não aparecem para novos lançamentos.'
        }
        actions={
          <>
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                className="input pl-9"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <Button variant="secondary" onClick={() => load(1)}>
              <RefreshCw size={14} /> Atualizar
            </Button>
            <Button onClick={openCreate} disabled={!canCreate}>
              <Plus size={14} /> Novo {labels.singular}
            </Button>
          </>
        }
      >
        <div className="flex items-center gap-3 mb-3 text-sm">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={includeInactive}
              onChange={(e) => setIncludeInactive(e.target.checked)}
              className="accent-brand-600"
            />
            <span>Incluir inativos</span>
          </label>
          <Badge tone="slate">{total} registro(s)</Badge>
        </div>

        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-slate-500 border-b">
              <tr>
                <th className="py-2">{labels.singular.charAt(0).toUpperCase() + labels.singular.slice(1)}</th>
                {isProduct && <th>Peso da caixa</th>}
                <th>Situação</th>
                <th className="text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id} className="border-b hover:bg-slate-50">
                  <td className="py-2 font-medium text-slate-800">
                    <div>{it.name}</div>
                    {subtitle(it) && <div className="text-xs font-normal text-slate-500">{subtitle(it)}</div>}
                  </td>
                  {isProduct && (
                    <td>
                      <span className="inline-flex items-center gap-1">
                        <Scale size={14} className="text-slate-400" />
                        {Number((it as Product).defaultBoxKg).toFixed(3)} kg
                      </span>
                    </td>
                  )}
                  <td>
                    <div className="flex items-center gap-2">
                      <Toggle
                        checked={it.active}
                        onChange={() => canEdit && toggle(it)}
                        disabled={!canEdit}
                        label={it.active ? 'Ativo' : 'Inativo'}
                      />
                      <span className={clsx(
                        'text-xs font-semibold',
                        it.active ? 'text-emerald-700' : 'text-slate-400'
                      )}>
                        {it.active ? 'Ativo' : 'Inativo'}
                      </span>
                    </div>
                  </td>
                  <td className="text-right">
                    <div className="inline-flex gap-1">
                      {canEdit && (
                        <button onClick={() => openEdit(it)} className="p-1.5 rounded-md text-slate-500 hover:text-brand-700 hover:bg-brand-50 transition" title="Editar">
                          <Edit3 size={15} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && items.length === 0 && (
                <tr>
                  <td colSpan={isProduct ? 4 : 3} className="p-6 text-center text-slate-500">
                    {isProduct ? <Package className="mx-auto mb-2 text-slate-300" /> : kind === 'suppliers' ? <Truck className="mx-auto mb-2 text-slate-300" /> : kind === 'docks' ? <Warehouse className="mx-auto mb-2 text-slate-300" /> : kind === 'conferentes' ? <UserCheck className="mx-auto mb-2 text-slate-300" /> : <ShoppingCart className="mx-auto mb-2 text-slate-300" />}
                    Nenhum registro.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="md:hidden space-y-2">
          {items.map((it) => (
            <div key={it.id} className="card p-3 border border-slate-200">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-slate-800 truncate">{it.name}</div>
                  {subtitle(it) && <div className="text-xs text-slate-500 truncate">{subtitle(it)}</div>}
                  {isProduct && (
                    <div className="text-xs text-slate-500 inline-flex items-center gap-1 mt-0.5">
                      <Scale size={12} /> {Number((it as Product).defaultBoxKg).toFixed(3)} kg / cx
                    </div>
                  )}
                  <div className="mt-2 flex items-center gap-2">
                    <Toggle
                      checked={it.active}
                      onChange={() => canEdit && toggle(it)}
                      disabled={!canEdit}
                      size="sm"
                      label={it.active ? 'Ativo' : 'Inativo'}
                    />
                    <span className={clsx(
                      'text-xs font-semibold',
                      it.active ? 'text-emerald-700' : 'text-slate-400'
                    )}>
                      {it.active ? 'Ativo' : 'Inativo'}
                    </span>
                  </div>
                </div>
                {canEdit && (
                  <button onClick={() => openEdit(it)} className="p-1.5 rounded-md text-slate-500 hover:text-brand-700 hover:bg-brand-50 transition">
                    <Edit3 size={15} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-slate-500">Página {page} de {pages} ({total})</span>
          <div className="flex gap-1">
            <Button variant="secondary" disabled={page <= 1} onClick={() => load(page - 1)}>Anterior</Button>
            <Button variant="secondary" disabled={page >= pages} onClick={() => load(page + 1)}>Próxima</Button>
          </div>
        </div>
      </SectionCard>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? `Editar ${labels.singular}` : `Novo ${labels.singular}`}
        width={isCatalog ? 'lg' : 'md'}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label={`Nome do ${labels.singular}${isCatalog ? ' *' : ''}`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
              autoFocus
            />
            {isProduct && (
              <NumberInput
                label="Peso padrão da caixa (kg) *"
                value={weight}
                onValueChange={setWeight}
                min={0}
                step={0.001}
              />
            )}
          </div>

          {isCatalog && (
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-slate-800">Informações complementares</h3>
                <Badge tone="slate">opcional</Badge>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {isProduct ? (
                  <>
                    <Input
                      label="Código interno"
                      value={extra.code ?? ''}
                      onChange={(e) => setField('code', e.target.value)}
                      maxLength={40}
                    />
                    <Input
                      label="Categoria"
                      value={extra.category ?? ''}
                      onChange={(e) => setField('category', e.target.value)}
                      maxLength={80}
                    />
                    <Select
                      label="Unidade de venda"
                      value={extra.unit ?? ''}
                      onChange={(e) => setField('unit', e.target.value)}
                    >
                      <option value="">Não informar</option>
                      <option value="CX">CX — caixa</option>
                      <option value="KG">KG — quilograma</option>
                      <option value="UN">UN — unidade</option>
                    </Select>
                  </>
                ) : (
                  <>
                    <Input
                      label="Razão social"
                      value={extra.legalName ?? ''}
                      onChange={(e) => setField('legalName', e.target.value)}
                      maxLength={120}
                    />
                    <Input
                      label="CNPJ/CPF"
                      value={extra.document ?? ''}
                      onChange={(e) => setField('document', e.target.value)}
                      maxLength={30}
                    />
                    <Input
                      label="Nome do contato"
                      value={extra.contactName ?? ''}
                      onChange={(e) => setField('contactName', e.target.value)}
                      maxLength={120}
                    />
                    <Input
                      label="Telefone"
                      value={extra.phone ?? ''}
                      onChange={(e) => setField('phone', e.target.value)}
                      maxLength={30}
                    />
                    <Input
                      label="E-mail"
                      type="email"
                      value={extra.email ?? ''}
                      onChange={(e) => setField('email', e.target.value)}
                      maxLength={120}
                    />
                    <div className="grid grid-cols-2 gap-3">
                      <Input
                        label="Cidade"
                        value={extra.city ?? ''}
                        onChange={(e) => setField('city', e.target.value)}
                        maxLength={80}
                      />
                      <Input
                        label="UF"
                        value={extra.state ?? ''}
                        onChange={(e) => setField('state', e.target.value.toUpperCase())}
                        maxLength={2}
                      />
                    </div>
                  </>
                )}
                <div className="sm:col-span-2">
                  <label className="label">Observações</label>
                  <textarea
                    className="input min-h-[76px] resize-y"
                    value={extra.notes ?? ''}
                    onChange={(e) => setField('notes', e.target.value)}
                    maxLength={2000}
                  />
                </div>
              </div>
              <p className="mt-3 text-[11px] text-slate-500">
                Apenas {isProduct ? 'nome e peso da caixa' : 'o nome'} são obrigatórios. Os demais campos podem ficar em branco.
              </p>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={save}>{editing ? 'Salvar alterações' : 'Cadastrar'}</Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!confirmDelId}
        title="Inativar cadastro?"
        onConfirm={() => { if (confirmDelId) return del(confirmDelId); }}
        onCancel={() => setConfirmDelId(null)}
      />
    </div>
  );
}

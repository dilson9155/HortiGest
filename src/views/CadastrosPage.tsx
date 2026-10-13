'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { Plus, Search, RefreshCw, Trash2, Edit3, Scale, Truck, Boxes, Package, History } from 'lucide-react';
import clsx from 'clsx';
import { api, errorMessage } from '@/lib/api';
import { useToast } from '@/hooks/useToast';
import { useAuth } from '@/contexts/AuthContext';
import { SectionCard, Button, Input, Spinner, Modal, ConfirmDialog, NumberInput, Badge } from '@/components/UI';
import Toggle from '@/components/Toggle';

type Product = { id: string; name: string; defaultBoxKg: number; active: boolean; createdAt: string };
type Supplier = { id: string; name: string; active: boolean; createdAt: string };

export default function CadastrosPage({ kind }: { kind: 'products' | 'suppliers' }) {
  const { can } = useAuth();
  const { toast } = useToast();
  const isProduct = kind === 'products';

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

  async function load(p = 1) {
    setLoading(true);
    setPage(p);
    const qs = new URLSearchParams({
      q,
      includeInactive: includeInactive ? '1' : '0',
      page: String(p),
      pageSize: String(pageSize),
    });
    const r = await api.get(`/${kind}?${qs.toString()}`);
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
    setModalOpen(true);
  }

  function openEdit(item: Product | Supplier) {
    setEditing(item);
    setName(item.name);
    if (isProduct) setWeight(Number((item as Product).defaultBoxKg));
    setModalOpen(true);
  }

  async function save() {
    if (!name.trim()) return toast('warning', 'Informe o nome.');
    if (isProduct && (Number(weight) <= 0 || Number.isNaN(Number(weight))))
      return toast('warning', 'O peso da caixa deve ser maior que zero.');

    const body: any = { name: name.trim() };
    if (isProduct) body.defaultBoxKg = Number(weight);

    const r = editing
      ? await api.put(`/${kind}/${editing.id}`, body)
      : await api.post(`/${kind}`, body);

    if (r.ok) {
      toast('success', editing ? 'Cadastro atualizado.' : 'Cadastro criado.');
      setModalOpen(false);
      load(page);
    } else {
      toast('error', errorMessage(r));
    }
  }

  async function toggle(item: Product | Supplier) {
    const r = await api.post(`/${kind}/${item.id}/toggle`, { active: !item.active });
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
    const r = await api.post(`/${kind}/${id}/toggle`, { active: false });
    if (r.ok) {
      toast('success', 'Cadastro inativado.');
      load(page);
    } else {
      toast('error', errorMessage(r));
    }
  }

  const canCreate = can(kind, 'create');
  const canEdit = can(kind, 'edit');

  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-4">
      <SectionCard
        title={isProduct ? 'Produtos' : 'Fornecedores'}
        description={
          isProduct
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
              <Plus size={14} /> {isProduct ? 'Novo produto' : 'Novo fornecedor'}
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
                <th className="py-2">{isProduct ? 'Produto' : 'Fornecedor'}</th>
                {isProduct && <th>Peso da caixa</th>}
                <th>Situação</th>
                <th className="text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id} className="border-b hover:bg-slate-50">
                  <td className="py-2 font-medium text-slate-800">{it.name}</td>
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
                    {isProduct ? <Package className="mx-auto mb-2 text-slate-300" /> : <Truck className="mx-auto mb-2 text-slate-300" />}
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

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Editar' : 'Novo cadastro'}>
        <div className="space-y-3">
          <Input
            label={isProduct ? 'Nome do produto' : 'Nome do fornecedor'}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
          {isProduct && (
            <NumberInput
              label="Peso padrão da caixa (kg)"
              value={weight}
              onValueChange={setWeight}
              hint="Usado como snapshot em cada item do lançamento."
            />
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
        description="Esta ação pode ser revertida ativando o registro novamente."
        onConfirm={() => { if (confirmDelId) return del(confirmDelId); }}
        onCancel={() => setConfirmDelId(null)}
      />
    </div>
  );
}

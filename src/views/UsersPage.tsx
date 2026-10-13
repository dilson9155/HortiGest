'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { Plus, Search, RefreshCw, Edit3, KeyRound, Users, ShieldCheck, Eye } from 'lucide-react';
import clsx from 'clsx';
import { api, errorMessage } from '../lib/api';
import { useToast } from '../hooks/useToast';
import { SectionCard, Button, Input, Modal, ConfirmDialog, Spinner, Badge } from '../components/UI';
import Toggle from '../components/Toggle';

type User = {
  id: string;
  username: string;
  name: string;
  email?: string | null;
  active: boolean;
  role: { id: string; kind: string; name: string } | null;
};

export default function UsersPage() {
  const { toast } = useToast();
  const [items, setItems] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);

  // Form
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [roleKind, setRoleKind] = useState<'ADMIN' | 'SUPERVISOR' | 'OPERADOR'>('OPERADOR');

  const [pwdModal, setPwdModal] = useState<User | null>(null);
  const [newPwd, setNewPwd] = useState('');
  const [confirmDel, setConfirmDel] = useState<User | null>(null);

  async function load() {
    setLoading(true);
    const r = await api.get<{ items: User[]; total: number }>(`/users?q=${encodeURIComponent(q)}&page=${page}&pageSize=${pageSize}`);
    setLoading(false);
    if (r.ok) {
      setItems(r.data.items);
      setTotal(r.data.total);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  function openCreate() {
    setEditing(null);
    setName('');
    setUsername('');
    setEmail('');
    setPassword('');
    setRoleKind('OPERADOR');
    setModalOpen(true);
  }

  function openEdit(u: User) {
    setEditing(u);
    setName(u.name);
    setUsername(u.username);
    setEmail(u.email ?? '');
    setPassword('');
    setRoleKind((u.role?.kind as any) ?? 'OPERADOR');
    setModalOpen(true);
  }

  async function save() {
    if (!editing && !username.trim()) return toast('warning', 'Informe o login.');
    if (!name.trim()) return toast('warning', 'Informe o nome.');
    if (!editing && password.length < 8) return toast('warning', 'Senha mínima de 8 caracteres.');
    if (editing && password && password.length < 8) return toast('warning', 'Senha mínima de 8 caracteres.');

    let r;
    if (editing) {
      const body: any = { name, email: email || null, roleKind };
      if (password) body.password = password;
      r = await api.put(`/users/${editing.id}`, body);
    } else {
      r = await api.post('/users', { username, name, email, password, roleKind });
    }

    if (r.ok) {
      toast('success', editing ? 'Usuário atualizado.' : 'Usuário criado.');
      setModalOpen(false);
      load();
    } else {
      toast('error', errorMessage(r));
    }
  }

  async function toggle(u: User) {
    const r = await api.post(`/users/${u.id}/toggle`, { active: !u.active });
    if (r.ok) {
      toast('success', u.active ? 'Usuário inativado.' : 'Usuário ativado.');
      load();
    } else toast('error', errorMessage(r));
  }

  async function resetPwd() {
    if (!pwdModal) return;
    if (newPwd.length < 8) return toast('warning', 'Senha mínima de 8 caracteres.');
    const r = await api.post(`/users/${pwdModal.id}/reset-password`, { newPassword: newPwd });
    if (r.ok) {
      toast('success', 'Senha redefinida.');
      setPwdModal(null);
      setNewPwd('');
    } else toast('error', errorMessage(r));
  }

  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-4">
      <SectionCard
        title="Usuários"
        description="Gerencie usuários, perfis e permissões. ADMIN tem acesso total ao sistema."
        actions={
          <>
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input className="input pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <Button variant="secondary" onClick={() => load()}>
              <RefreshCw size={14} /> Atualizar
            </Button>
            <Button onClick={openCreate}>
              <Plus size={14} /> Novo usuário
            </Button>
          </>
        }
      >
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-slate-500 border-b">
              <tr>
                <th className="py-2">Nome</th>
                <th>Login</th>
                <th>E-mail</th>
                <th>Perfil</th>
                <th>Situação</th>
                <th className="text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {items.map((u) => (
                <tr key={u.id} className="border-b hover:bg-slate-50">
                  <td className="py-2 font-medium">{u.name}</td>
                  <td className="text-slate-600">@{u.username}</td>
                  <td className="text-slate-600">{u.email || '—'}</td>
                  <td>
                    {u.role ? (
                      <Badge tone={u.role.kind === 'ADMIN' ? 'red' : u.role.kind === 'SUPERVISOR' ? 'amber' : 'sky'}>
                        {u.role.name}
                      </Badge>
                    ) : '—'}
                  </td>
                  <td>
                    <div className="flex items-center gap-2">
                      <Toggle
                        checked={u.active}
                        onChange={() => toggle(u)}
                        label={u.active ? 'Ativo' : 'Inativo'}
                      />
                      <span className={clsx(
                        'text-xs font-semibold',
                        u.active ? 'text-emerald-700' : 'text-slate-400'
                      )}>
                        {u.active ? 'Ativo' : 'Inativo'}
                      </span>
                    </div>
                  </td>
                  <td className="text-right">
                    <button onClick={() => openEdit(u)} className="p-1.5 rounded-md text-slate-500 hover:text-brand-700 hover:bg-brand-50 transition" title="Editar">
                      <Edit3 size={15} />
                    </button>
                    <button onClick={() => setPwdModal(u)} className="p-1.5 rounded-md text-slate-500 hover:text-amber-700 hover:bg-amber-50 transition" title="Redefinir senha">
                      <KeyRound size={15} />
                    </button>
                  </td>
                </tr>
              ))}
              {!loading && items.length === 0 && (
                <tr><td colSpan={6} className="p-6 text-center text-slate-500"><Users className="mx-auto mb-2 text-slate-300" /> Nenhum usuário.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="md:hidden space-y-2">
          {items.map((u) => (
            <div key={u.id} className="card p-3 border border-slate-200">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold">{u.name}</div>
                  <div className="text-xs text-slate-500">@{u.username}</div>
                  <div className="text-xs text-slate-500">{u.email || '—'}</div>
                  <div className="mt-2 flex gap-1 items-center flex-wrap">
                    {u.role && (
                      <Badge tone={u.role.kind === 'ADMIN' ? 'red' : u.role.kind === 'SUPERVISOR' ? 'amber' : 'sky'}>
                        {u.role.name}
                      </Badge>
                    )}
                    <div className="flex items-center gap-2 ml-2">
                      <Toggle
                        checked={u.active}
                        onChange={() => toggle(u)}
                        size="sm"
                        label={u.active ? 'Ativo' : 'Inativo'}
                      />
                      <span className={clsx(
                        'text-xs font-semibold',
                        u.active ? 'text-emerald-700' : 'text-slate-400'
                      )}>
                        {u.active ? 'Ativo' : 'Inativo'}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => openEdit(u)} className="p-1.5 rounded-md text-slate-500 hover:text-brand-700 hover:bg-brand-50 transition"><Edit3 size={15} /></button>
                  <button onClick={() => setPwdModal(u)} className="p-1.5 rounded-md text-slate-500 hover:text-amber-700 hover:bg-amber-50 transition"><KeyRound size={15} /></button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 flex justify-between text-sm">
          <span className="text-slate-500">Página {page} de {pages} ({total})</span>
          <div className="flex gap-1">
            <Button variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Anterior</Button>
            <Button variant="secondary" disabled={page >= pages} onClick={() => setPage(page + 1)}>Próxima</Button>
          </div>
        </div>
      </SectionCard>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Editar usuário' : 'Novo usuário'}>
        <div className="space-y-3">
          <Input label="Nome completo" value={name} onChange={(e) => setName(e.target.value)} />
          {!editing && (
            <Input label="Login de usuário" value={username} onChange={(e) => setUsername(e.target.value)} />
          )}
          <Input label="E-mail (opcional)" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Input
            label={editing ? 'Nova senha (deixe vazio para manter)' : 'Senha'}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <div>
            <label className="label">Perfil</label>
            <select className="input" value={roleKind} onChange={(e) => setRoleKind(e.target.value as any)}>
              <option value="ADMIN">Administrador</option>
              <option value="SUPERVISOR">Supervisor</option>
              <option value="OPERADOR">Operador</option>
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={save}>{editing ? 'Salvar' : 'Criar usuário'}</Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!pwdModal} onClose={() => setPwdModal(null)} title={`Redefinir senha: ${pwdModal?.name ?? ''}`}>
        <div className="space-y-3">
          <Input type="password" label="Nova senha (mínimo 8 caracteres)" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setPwdModal(null)}>Cancelar</Button>
            <Button onClick={resetPwd}>Redefinir</Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!confirmDel}
        title="Inativar usuário?"
        onConfirm={() => { confirmDel && toggle(confirmDel); setConfirmDel(null); }}
        onCancel={() => setConfirmDel(null)}
      />
    </div>
  );
}

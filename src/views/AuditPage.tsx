'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { RefreshCw, Search, History } from 'lucide-react';
import { api } from '../lib/api';
import { SectionCard, Input, Button, Spinner, Select } from '../components/UI';
import { brDateTime } from '../lib/utils';

type Audit = {
  id: string;
  userName: string | null;
  entity: string;
  entityId: string | null;
  operation: string;
  description: string;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
};

export default function AuditPage() {
  const [items, setItems] = useState<Audit[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({ q: '', entity: '', startDate: '', endDate: '', page: 1 });
  const pageSize = 50;

  async function load() {
    setLoading(true);
    const qs = new URLSearchParams();
    if (filters.q) qs.set('q', filters.q);
    if (filters.entity) qs.set('entity', filters.entity);
    if (filters.startDate) qs.set('startDate', filters.startDate);
    if (filters.endDate) qs.set('endDate', filters.endDate);
    qs.set('page', String(filters.page));
    qs.set('pageSize', String(pageSize));

    const r = await api.get<{ items: Audit[]; total: number }>(`/audit?${qs.toString()}`);
    setLoading(false);
    if (r.ok) {
      setItems(r.data.items);
      setTotal(r.data.total);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.page]);

  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-4">
      <SectionCard
        title="Auditoria"
        description="Registro das operações realizadas no sistema."
        actions={
          <Button variant="secondary" onClick={() => load()}>
            <RefreshCw size={14} /> Atualizar
          </Button>
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 mb-4">
          <div className="relative sm:col-span-2">
            <Search size={14} className="absolute left-3 top-9 text-slate-400" />
            <Input label="Descrição" value={filters.q} onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))} className="pl-9" />
          </div>
          <Select label="Entidade" value={filters.entity} onChange={(e) => setFilters((f) => ({ ...f, entity: e.target.value, page: 1 }))}>
            <option value="">Todas</option>
            <option value="user">Usuários</option>
            <option value="supplier">Fornecedores</option>
            <option value="product">Produtos</option>
            <option value="launch">Lançamentos</option>
            <option value="launchItem">Itens</option>
          </Select>
          <Input type="date" label="De" value={filters.startDate} onChange={(e) => setFilters((f) => ({ ...f, startDate: e.target.value, page: 1 }))} />
          <Input type="date" label="Até" value={filters.endDate} onChange={(e) => setFilters((f) => ({ ...f, endDate: e.target.value, page: 1 }))} />
        </div>

        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-slate-500 border-b">
              <tr>
                <th className="py-2">Data/Hora</th>
                <th>Usuário</th>
                <th>Operação</th>
                <th>Entidade</th>
                <th>Descrição</th>
              </tr>
            </thead>
            <tbody>
              {items.map((a) => (
                <tr key={a.id} className="border-b hover:bg-slate-50">
                  <td className="py-1.5">{brDateTime(a.createdAt)}</td>
                  <td>{a.userName ?? '—'}</td>
                  <td><span className="badge bg-slate-100 text-slate-700">{a.operation}</span></td>
                  <td><span className="badge bg-violet-100 text-violet-800">{a.entity}</span></td>
                  <td className="text-slate-700">{a.description}</td>
                </tr>
              ))}
              {!loading && items.length === 0 && (
                <tr><td colSpan={5} className="p-6 text-center text-slate-500">
                  <History className="mx-auto mb-2 text-slate-300" /> Sem registros.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="md:hidden space-y-2">
          {items.map((a) => (
            <div key={a.id} className="card p-3 border border-slate-200">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-xs text-slate-500">{brDateTime(a.createdAt)}</div>
                  <div className="font-medium">{a.userName ?? '—'}</div>
                  <div className="mt-1 flex gap-1">
                    <span className="badge bg-slate-100 text-slate-700">{a.operation}</span>
                    <span className="badge bg-violet-100 text-violet-800">{a.entity}</span>
                  </div>
                </div>
              </div>
              <p className="mt-2 text-sm text-slate-700">{a.description}</p>
            </div>
          ))}
        </div>

        <div className="mt-4 flex justify-between text-sm">
          <span className="text-slate-500">Página {filters.page} de {pages} ({total})</span>
          <div className="flex gap-1">
            <Button variant="secondary" disabled={filters.page <= 1} onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}>Anterior</Button>
            <Button variant="secondary" disabled={filters.page >= pages} onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}>Próxima</Button>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}

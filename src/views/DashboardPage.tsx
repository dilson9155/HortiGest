'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { Box, Trash2, AlertOctagon, ClipboardCheck, Truck, Activity } from 'lucide-react';
import { api } from '@/lib/api';
import { brDateTime, brNum, todayISO } from '@/lib/utils';
import { SectionCard, Input, Spinner } from '@/components/UI';

type IndicatorCards = {
  totalReceivedBoxes: number;
  totalProducedBoxes: number;
  totalBrokenBoxes: number;
  totalMissingBoxes: number;
  totalLaunchItems: number;
  totalLaunches: number;
  aproveitamentoPercent: number;
  quebraPercent: number;
  faltaPercent: number;
};

type DashboardData = {
  cards: IndicatorCards;
  productionDaily: { date: string; received: number; produced: number; broken: number; missing: number }[];
  productChart: { productName: string; received: number; produced: number; broken: number; missing: number }[];
  supplierChart: { supplierName: string; received: number; produced: number; broken: number; missing: number }[];
  recent: any[];
};

const colors = ['#0d9488', '#22c55e', '#f59e0b', '#ef4444', '#3b82f6', '#a855f7', '#ec4899', '#14b8a6'];

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 29);
    return d.toISOString().slice(0, 10);
  });
  const [endDate, setEndDate] = useState(todayISO());

  async function load() {
    setLoading(true);
    const r = await api.get<DashboardData>(`/dashboard?startDate=${startDate}&endDate=${endDate}`);
    setLoading(false);
    if (r.ok) setData(r.data);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cards: { label: string; value: string | number; tone: 'good' | 'warn' | 'bad' | 'info'; icon: React.ReactNode; sub?: string }[] = [];
  if (data) {
    const c = data.cards;
    cards.push(
      { label: 'Caixas Recebidas', value: brNum(c.totalReceivedBoxes, 0), tone: 'info', icon: <Truck size={20} /> },
      { label: 'Caixas Produzidas', value: brNum(c.totalProducedBoxes, 0), tone: 'good', icon: <Box size={20} /> },
      { label: 'Caixas Quebradas', value: brNum(c.totalBrokenBoxes, 0), tone: 'warn', icon: <Trash2 size={20} /> },
      { label: 'Caixas em Falta', value: brNum(c.totalMissingBoxes, 0), tone: 'bad', icon: <AlertOctagon size={20} /> },
      { label: 'Lançamentos Realizados', value: c.totalLaunchItems, tone: 'info', icon: <ClipboardCheck size={20} /> },
    );
  }

  const toneClass = (t: string) =>
    ({
      good: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
      warn: 'bg-amber-50 text-amber-700 ring-amber-200',
      bad: 'bg-red-50 text-red-700 ring-red-200',
      info: 'bg-sky-50 text-sky-700 ring-sky-200',
    }[t] || 'bg-slate-50 text-slate-700 ring-slate-200');

  return (
    <div className="space-y-4">
      <SectionCard
        title="Filtros"
        description="Defina o período para visualizar os indicadores."
        actions={
          <>
            <button className="btn-secondary" onClick={() => { setStartDate(''); setEndDate(todayISO()); setTimeout(load, 0); }}>
              Limpar período
            </button>
            <button className="btn-primary" onClick={load}>Aplicar</button>
          </>
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Input type="date" label="Data inicial" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          <Input type="date" label="Data final" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          <div className="hidden sm:flex items-end text-xs text-slate-500">
            Opcional: defina produtos e fornecedores nos relatórios.
          </div>
        </div>
      </SectionCard>

      {loading ? (
        <div className="card flex items-center justify-center p-10 gap-3 text-slate-500">
          <Spinner /> Carregando indicadores...
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {cards.map((c) => (
              <div key={c.label} className={`card p-4 ring-1 ${toneClass(c.tone)}`}>
                <div className="flex items-start justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wide opacity-80">{c.label}</span>
                  <div className="opacity-70">{c.icon}</div>
                </div>
                <div className="mt-2 text-2xl sm:text-3xl font-extrabold">{c.value}</div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <SectionCard title="Produção diária" description="Caixas por dia">
              <div className="h-72">
                <ResponsiveContainer>
                  <LineChart data={data?.productionDaily ?? []}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="received" name="Recebido" stroke="#0d9488" />
                    <Line type="monotone" dataKey="produced" name="Produzido" stroke="#22c55e" />
                    <Line type="monotone" dataKey="broken" name="Quebrado" stroke="#f59e0b" />
                    <Line type="monotone" dataKey="missing" name="Falta" stroke="#ef4444" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </SectionCard>

            <SectionCard title="Recebimento vs Produção" description="Comparativo por dia">
              <div className="h-72">
                <ResponsiveContainer>
                  <BarChart data={data?.productionDaily ?? []}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="received" name="Recebido" fill="#0d9488" />
                    <Bar dataKey="produced" name="Produzido" fill="#22c55e" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </SectionCard>

            <SectionCard title="Quebras por produto" description="Top 20 itens com mais quebras">
              <div className="h-72">
                <ResponsiveContainer>
                  <BarChart data={data?.productChart ?? []} layout="vertical" margin={{ left: 80 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="productName" tick={{ fontSize: 11 }} width={140} />
                    <Tooltip />
                    <Bar dataKey="broken" name="Quebrado" fill="#f59e0b" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </SectionCard>

            <SectionCard title="Produção por fornecedor" description="Top 20 fornecedores por recebido">
              <div className="h-72">
                <ResponsiveContainer>
                  <PieChart>
                    <Pie
                      data={data?.supplierChart ?? []}
                      dataKey="received"
                      nameKey="supplierName"
                      innerRadius={45}
                      outerRadius={90}
                    >
                      {(data?.supplierChart ?? []).map((_, i) => (
                        <Cell key={i} fill={colors[i % colors.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </SectionCard>
          </div>

          <SectionCard title="Lançamentos recentes">
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-slate-500">
                  <tr className="border-b">
                    <th className="py-2">Data</th>
                    <th>Itens</th>
                    <th>Recebido</th>
                    <th>Produzido</th>
                    <th>Quebra</th>
                    <th>Falta</th>
                    <th>Usuário</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.recent ?? []).map((l) => {
                    const sum = (k: 'received' | 'produced' | 'broken' | 'missing') =>
                      l.items.reduce((acc: number, it: any) => acc + Number(it[k] ?? 0), 0);
                    return (
                      <tr key={l.id} className="border-b hover:bg-slate-50">
                        <td className="py-2">{brDateTime(l.referenceDate).slice(0, 10)}</td>
                        <td>{l.items?.length ?? 0}</td>
                        <td>{brNum(sum('received'), 0)}</td>
                        <td>{brNum(sum('produced'), 0)}</td>
                        <td>{brNum(sum('broken'), 0)}</td>
                        <td>{brNum(sum('missing'), 0)}</td>
                        <td>{l.user?.name ?? '—'}</td>
                      </tr>
                    );
                  })}
                  {(data?.recent ?? []).length === 0 && (
                    <tr>
                      <td colSpan={7} className="p-6 text-center text-slate-500">
                        <Activity className="mx-auto mb-2 text-slate-300" /> Sem lançamentos no período.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </>
      )}
    </div>
  );
}

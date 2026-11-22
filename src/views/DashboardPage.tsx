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
import { ClipboardCheck, Truck, TrendingUp, Activity, PackageCheck, Target } from 'lucide-react';
import { api } from '../lib/api';
import { brDateTime, brNum, todayISO } from '../lib/utils';
import { SectionCard, Input, Spinner } from '../components/UI';

type IndicatorCards = {
  totalForecastBoxes: number;
  totalReceivedBoxes: number;
  totalDeltaBoxes: number;
  totalLaunchItems: number;
  totalLaunches: number;
  atendimentoPercent: number;
  deltaPercent: number;
};

type DashboardData = {
  cards: IndicatorCards;
  productionDaily: { date: string; forecast: number; received: number; delta: number }[];
  productChart: { productName: string; forecast: number; received: number; delta: number }[];
  supplierChart: { supplierName: string; forecast: number; received: number; delta: number }[];
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
      { label: 'Previsão (cx)', value: brNum(c.totalForecastBoxes, 0), tone: 'info', icon: <Target size={21} /> },
      { label: 'Recebido (cx)', value: brNum(c.totalReceivedBoxes, 0), tone: 'good', icon: <Truck size={21} /> },
      {
        label: 'Delta (cx)',
        value: `${c.totalDeltaBoxes > 0 ? '+' : ''}${brNum(c.totalDeltaBoxes, 0)}`,
        tone: c.totalDeltaBoxes < 0 ? 'bad' : c.totalDeltaBoxes > 0 ? 'good' : 'info',
        icon: <TrendingUp size={21} />,
        sub: `${brNum(c.deltaPercent, 1)}% sobre a previsão`,
      },
      { label: 'Atendimento', value: `${brNum(c.atendimentoPercent, 1)}%`, tone: 'info', icon: <PackageCheck size={21} /> },
      { label: 'Produtos recebidos', value: c.totalLaunchItems, tone: 'good', icon: <ClipboardCheck size={21} /> },
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
        description="Defina o período para visualizar os indicadores de recebimento."
        actions={
          <>
            <button className="btn-secondary !text-base" onClick={() => { setStartDate(''); setEndDate(todayISO()); setTimeout(load, 0); }}>
              Limpar período
            </button>
            <button className="btn-primary !text-base" onClick={load}>Aplicar</button>
          </>
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Input type="date" label="Data inicial" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          <Input type="date" label="Data final" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          <div className="hidden sm:flex items-end text-sm text-slate-500">
            Filtros de produto e fornecedor disponíveis em Relatórios.
          </div>
        </div>
      </SectionCard>

      {loading ? (
        <div className="card flex items-center justify-center p-10 gap-3 text-slate-500"><Spinner /> Carregando indicadores...</div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {cards.map((c) => (
              <div key={c.label} className={`card p-4 ring-1 ${toneClass(c.tone)}`}>
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm font-semibold uppercase tracking-wide opacity-80">{c.label}</span>
                  <div className="opacity-70">{c.icon}</div>
                </div>
                <div className="mt-2 text-2xl sm:text-3xl font-extrabold">{c.value}</div>
                {c.sub && <div className="text-xs font-semibold mt-1 opacity-80">{c.sub}</div>}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <SectionCard title="Recebimento diário" description="Previsão x recebido por dia">
              <div className="h-72">
                <ResponsiveContainer>
                  <LineChart data={data?.productionDaily ?? []}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 13 }} />
                    <YAxis tick={{ fontSize: 13 }} />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="forecast" name="Previsão" stroke="#2563eb" strokeWidth={2} />
                    <Line type="monotone" dataKey="received" name="Recebido" stroke="#0d9488" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </SectionCard>

            <SectionCard title="Delta por dia" description="Recebido − previsão">
              <div className="h-72">
                <ResponsiveContainer>
                  <BarChart data={data?.productionDaily ?? []}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 13 }} />
                    <YAxis tick={{ fontSize: 13 }} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="delta" name="Delta" fill="#d97706" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </SectionCard>

            <SectionCard title="Recebido por produto" description="Top 20 produtos">
              <div className="h-72">
                <ResponsiveContainer>
                  <BarChart data={data?.productChart ?? []} layout="vertical" margin={{ left: 80 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis type="number" tick={{ fontSize: 13 }} />
                    <YAxis type="category" dataKey="productName" tick={{ fontSize: 12 }} width={150} />
                    <Tooltip />
                    <Bar dataKey="received" name="Recebido" fill="#0d9488" />
                    <Bar dataKey="forecast" name="Previsão" fill="#2563eb" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </SectionCard>

            <SectionCard title="Recebido por fornecedor" description="Participação dos fornecedores">
              <div className="h-72">
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={data?.supplierChart ?? []} dataKey="received" nameKey="supplierName" innerRadius={45} outerRadius={90}>
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

          <SectionCard title="Produtos recebidos recentes">
            <div className="overflow-auto">
              <table className="w-full text-base">
                <thead className="text-left text-sm font-semibold text-slate-600">
                  <tr className="border-b">
                    <th className="py-2">Data</th>
                    <th>Produtos</th>
                    <th>Previsão</th>
                    <th>Recebido</th>
                    <th>Delta</th>
                    <th>Docа</th>
                    <th>Usuário</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.recent ?? []).map((l) => {
                    const sum = (k: 'forecast' | 'received') =>
                      (l.items ?? []).reduce((acc: number, it: any) => acc + Number(it[k] ?? 0), 0);
                    const delta = sum('received') - sum('forecast');
                    return (
                      <tr key={l.id} className="border-b hover:bg-slate-50">
                        <td className="py-2">{brDateTime(l.referenceDate).slice(0, 10)}</td>
                        <td>{l.items?.length ?? 0}</td>
                        <td>{brNum(sum('forecast'), 0)}</td>
                        <td className="font-bold text-emerald-700">{brNum(sum('received'), 0)}</td>
                        <td className={delta < 0 ? 'text-red-700 font-bold' : delta > 0 ? 'text-emerald-700 font-bold' : ''}>
                          {delta > 0 ? '+' : ''}{brNum(delta, 0)}
                        </td>
                        <td>{l.dock?.name ?? '—'}</td>
                        <td>{l.user?.name ?? '—'}</td>
                      </tr>
                    );
                  })}
                  {(data?.recent ?? []).length === 0 && (
                    <tr>
                      <td colSpan={7} className="p-6 text-center text-slate-500">
                        <Activity className="mx-auto mb-2 text-slate-300" /> Sem recebimentos no período.
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

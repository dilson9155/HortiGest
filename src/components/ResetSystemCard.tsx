'use client';

import { useState } from 'react';
import { AlertTriangle, Trash2, Database } from 'lucide-react';
import clsx from 'clsx';
import { api, errorMessage } from '../lib/api';
import { useToast } from '../hooks/useToast';
import { Button, Spinner } from './UI';

type Scope = 'launches' | 'catalog' | 'users' | 'audit';

const LABELS: Record<Scope, { title: string; desc: string; danger?: boolean }> = {
  launches: {
    title: 'Lançamentos e histórico',
    desc: 'Apaga todos os lançamentos e itens (inclui previsões de chegada).',
  },
  catalog: {
    title: 'Produtos e fornecedores',
    desc: 'Apaga todo o cadastro de mercadorias e fornecedores (também limpa os lançamentos).',
  },
  users: {
    title: 'Usuários',
    desc: 'Apaga todos os usuários, exceto o seu. (também limpa os lançamentos)',
    danger: true,
  },
  audit: {
    title: 'Log de auditoria',
    desc: 'Apaga todo o histórico de auditoria do sistema.',
  },
};

export default function ResetSystemCard() {
  const { toast } = useToast();
  const [scopes, setScopes] = useState<Record<Scope, boolean>>({
    launches: true,
    catalog: false,
    users: false,
    audit: true,
  });
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);

  const selected = (Object.keys(scopes) as Scope[]).filter((s) => scopes[s]);
  const canRun = selected.length > 0 && confirmText.trim().toUpperCase() === 'ZERAR' && !busy;

  function toggle(s: Scope) {
    setScopes((prev) => ({ ...prev, [s]: !prev[s] }));
  }

  async function run() {
    if (!canRun) return;
    setBusy(true);
    const r = await api.post('/system/reset', { confirm: 'ZERAR', scopes: selected });
    setBusy(false);
    if (r.ok) {
      const d: any = r.data ?? {};
      toast(
        'success',
        `Sistema zerado. Lançamentos: ${d.launches ?? 0}, produtos: ${d.products ?? 0}, fornecedores: ${d.suppliers ?? 0}, usuários: ${d.users ?? 0}.`,
      );
      setConfirmText('');
      // Recarrega a página para refletir o estado limpo em todo o app.
      window.location.reload();
    } else {
      toast('error', errorMessage(r, 'Falha ao zerar o sistema.'));
    }
  }

  return (
    <section className="rounded-2xl bg-white shadow-soft border-2 border-red-200 p-5 sm:p-7">
      <header className="mb-5 flex items-start gap-3">
        <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-red-500 to-red-700 text-white flex items-center justify-center shadow-md">
          <AlertTriangle size={22} />
        </div>
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-red-700">Zerar o sistema</h2>
          <p className="text-xs sm:text-sm text-slate-500">
            Apaga permanentemente os dados selecionados (usado para limpar dados de teste). Esta ação não pode ser
            desfeita.
          </p>
        </div>
      </header>

      <div className="space-y-2 mb-5">
        {(Object.keys(LABELS) as Scope[]).map((s) => (
          <label
            key={s}
            className={clsx(
              'flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition',
              scopes[s] ? 'border-red-300 bg-red-50/60' : 'border-slate-200 hover:bg-slate-50',
            )}
          >
            <input
              type="checkbox"
              className="mt-1 w-4 h-4 accent-red-600"
              checked={scopes[s]}
              onChange={() => toggle(s)}
            />
            <div>
              <div className={clsx('text-sm font-semibold', LABELS[s].danger ? 'text-red-700' : 'text-slate-800')}>
                {LABELS[s].title}
              </div>
              <div className="text-xs text-slate-500">{LABELS[s].desc}</div>
            </div>
          </label>
        ))}
      </div>

      <div className="rounded-xl border border-red-200 bg-white p-4">
        <label className="label !mb-1">
          Para confirmar, digite <b className="text-red-700">ZERAR</b> no campo abaixo:
        </label>
        <input
          className="input !h-11"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder="ZERAR"
          autoComplete="off"
        />
        <div className="mt-3 flex items-center gap-3 flex-wrap">
          <Button variant="danger" onClick={run} disabled={!canRun} className="!h-11 !px-5">
            {busy ? <Spinner /> : <><Trash2 size={16} /> Zerar dados selecionados</>}
          </Button>
          <span className="text-xs text-slate-500 flex items-center gap-1">
            <Database size={13} /> {selected.length} opção(ões) selecionada(s)
          </span>
        </div>
      </div>
    </section>
  );
}

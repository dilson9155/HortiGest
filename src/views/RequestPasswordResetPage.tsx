'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AlertCircle, ArrowLeft, Loader2, MailCheck, Sprout } from 'lucide-react';
import { api, errorMessage } from '../lib/api';

type Result = { message: string; devUrl: string | null };

export default function RequestPasswordResetPage() {
  const [email, setEmail] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const r = await api.post<Result>('/auth/forgot-password', { email });
      if (!r.ok) {
        setError(errorMessage(r, 'Não foi possível solicitar a recuperação.'));
        return;
      }
      setResult(r.data);
    } catch {
      setError('Não foi possível solicitar a recuperação. Tente novamente.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="min-h-screen relative overflow-hidden flex items-center justify-center p-4 bg-gradient-to-br from-emerald-800 via-brand-700 to-brand-500 safe-top safe-bottom">
      <div aria-hidden className="absolute -top-20 -left-20 h-72 w-72 rounded-full bg-emerald-300/30 blur-3xl" />
      <div aria-hidden className="absolute bottom-0 right-1/4 h-80 w-80 rounded-full bg-emerald-400/30 blur-3xl" />

      <div className="absolute top-5 left-5 flex items-center gap-2 text-white/90 text-base font-semibold">
        <div className="bg-white/15 backdrop-blur p-2 rounded-lg">
          <Sprout size={20} />
        </div>
        HortiGest
      </div>

      <div className="relative w-full max-w-md">
        <div className="absolute -inset-1 bg-gradient-to-tr from-emerald-300/40 via-white/20 to-emerald-300/40 blur-2xl rounded-3xl" />
        <div className="relative bg-white/95 backdrop-blur rounded-3xl shadow-2xl border border-white/40 p-8 sm:p-10">
          {result ? (
            <>
              <div className="flex flex-col items-center text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                  <MailCheck size={26} />
                </div>
                <h1 className="mt-4 text-xl font-extrabold text-slate-800">Verifique seu e-mail</h1>
                <p className="mt-2 text-sm text-slate-500">{result.message}</p>
              </div>

              {result.devUrl ? (
                <div className="mt-6 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                  <p className="font-semibold">Ambiente local: link de teste</p>
                  <p className="mt-1 text-xs">
                    O envio de e-mail não está configurado. Use o link abaixo para redefinir a senha.
                  </p>
                  <Link href={result.devUrl} className="mt-2 block break-all text-xs font-medium underline">
                    {result.devUrl}
                  </Link>
                </div>
              ) : null}

              <p className="mt-6 text-center text-xs text-slate-400">
                O link expira em 30 minutos e só pode ser usado uma vez.
              </p>

              <Link
                href="/login"
                className="mt-6 flex h-12 w-full items-center justify-center rounded-xl font-semibold text-white bg-gradient-to-r from-brand-700 to-brand-500 hover:from-brand-800 hover:to-brand-600 shadow-lg shadow-brand-600/30 transition-all"
              >
                Voltar para o login
              </Link>
              <button
                type="button"
                onClick={() => {
                  setResult(null);
                  setEmail('');
                }}
                className="mt-4 w-full text-center text-xs text-slate-500 hover:text-brand-700 hover:underline"
              >
                Solicitar novamente com outro e-mail
              </button>
            </>
          ) : (
            <>
              <div className="text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 text-brand-700">
                  <MailCheck size={26} />
                </div>
                <h1 className="mt-4 text-2xl font-extrabold text-slate-800">Recuperar senha</h1>
                <p className="mt-2 text-sm text-slate-500">
                  Informe o e-mail da sua conta. Enviaremos um link para criar uma nova senha.
                </p>
              </div>

              <form onSubmit={onSubmit} className="mt-8">
                <label className="block text-sm font-semibold text-slate-700" htmlFor="recovery-email">
                  E-mail
                </label>
                <input
                  id="recovery-email"
                  type="email"
                  autoComplete="email"
                  autoFocus
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu.email@seudominio.com.br"
                  className="mt-2 h-12 w-full rounded-xl border-2 border-slate-200 bg-white px-4 text-base focus:border-brand-500 focus:ring-4 focus:ring-brand-100 focus:outline-none transition placeholder:text-slate-400"
                />

                {error ? (
                  <p className="mt-3 flex items-center gap-2 text-sm text-red-600">
                    <AlertCircle size={16} /> {error}
                  </p>
                ) : null}

                <button
                  type="submit"
                  disabled={pending || !email}
                  className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-xl font-semibold text-white bg-gradient-to-r from-brand-700 to-brand-500 hover:from-brand-800 hover:to-brand-600 active:scale-[0.99] shadow-lg shadow-brand-600/30 disabled:opacity-60 disabled:cursor-not-allowed transition-all"
                >
                  {pending ? <Loader2 className="animate-spin" size={18} /> : null}
                  {pending ? 'Enviando...' : 'Enviar link de recuperação'}
                </button>
              </form>

              <Link
                href="/login"
                className="mt-6 flex items-center justify-center gap-2 text-sm font-semibold text-brand-700 hover:underline"
              >
                <ArrowLeft size={16} /> Voltar para o login
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

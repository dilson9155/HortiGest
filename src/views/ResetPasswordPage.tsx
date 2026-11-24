'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Sprout,
} from 'lucide-react';
import { api, errorMessage } from '../lib/api';

export default function ResetPasswordPage({ token }: { token: string }) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('A senha deve ter no mínimo 8 caracteres.');
      return;
    }
    if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      setError('A senha deve conter letras e números.');
      return;
    }
    if (password !== confirmPassword) {
      setError('As senhas informadas não coincidem.');
      return;
    }

    setPending(true);
    try {
      const r = await api.post('/auth/reset-password', { token, password, confirmPassword });
      if (!r.ok) {
        setError(errorMessage(r, 'Não foi possível redefinir a senha.'));
        return;
      }
      setDone(true);
    } catch {
      setError('Não foi possível redefinir a senha. Tente novamente.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="min-h-screen relative overflow-hidden flex items-center justify-center p-4 bg-gradient-to-br from-emerald-800 via-brand-700 to-brand-500 safe-top safe-bottom">
      <div aria-hidden className="absolute -top-20 -right-20 h-72 w-72 rounded-full bg-emerald-300/30 blur-3xl" />
      <div aria-hidden className="absolute bottom-0 left-1/4 h-80 w-80 rounded-full bg-emerald-400/30 blur-3xl" />

      <div className="absolute top-5 left-5 flex items-center gap-2 text-white/90 text-base font-semibold">
        <div className="bg-white/15 backdrop-blur p-2 rounded-lg">
          <Sprout size={20} />
        </div>
        HortiGest
      </div>

      <div className="relative w-full max-w-md">
        <div className="absolute -inset-1 bg-gradient-to-tr from-emerald-300/40 via-white/20 to-emerald-300/40 blur-2xl rounded-3xl" />
        <div className="relative bg-white/95 backdrop-blur rounded-3xl shadow-2xl border border-white/40 p-8 sm:p-10">
          {!token ? (
            <div className="text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-100 text-red-600">
                <AlertTriangle size={26} />
              </div>
              <h1 className="mt-4 text-xl font-extrabold text-slate-800">Link inválido</h1>
              <p className="mt-2 text-sm text-slate-500">
                Este link de recuperação está incompleto ou expirou. Solicite uma nova recuperação de senha.
              </p>
              <Link
                href="/recuperar-senha"
                className="mt-6 flex h-12 w-full items-center justify-center rounded-xl font-semibold text-white bg-gradient-to-r from-brand-700 to-brand-500 shadow-lg shadow-brand-600/30 transition-all"
              >
                Solicitar novo link
              </Link>
            </div>
          ) : done ? (
            <div className="text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                <CheckCircle2 size={26} />
              </div>
              <h1 className="mt-4 text-xl font-extrabold text-slate-800">Senha redefinida</h1>
              <p className="mt-2 text-sm text-slate-500">
                Sua nova senha foi salva com sucesso. Você já pode acessar o sistema.
              </p>
              <Link
                href="/login"
                className="mt-6 flex h-12 w-full items-center justify-center rounded-xl font-semibold text-white bg-gradient-to-r from-brand-700 to-brand-500 shadow-lg shadow-brand-600/30 transition-all"
              >
                Entrar no sistema
              </Link>
            </div>
          ) : (
            <>
              <div className="text-center">
                <h1 className="text-2xl font-extrabold text-slate-800">Criar nova senha</h1>
                <p className="mt-2 text-sm text-slate-500">
                  Escolha uma senha forte com pelo menos 8 caracteres, contendo letras e números.
                </p>
              </div>

              <form onSubmit={onSubmit} className="mt-8 space-y-5">
                <div>
                  <label className="block text-sm font-semibold text-slate-700" htmlFor="new-password">
                    Nova senha
                  </label>
                  <div className="relative mt-2">
                    <input
                      id="new-password"
                      type={showPwd ? 'text' : 'password'}
                      autoComplete="new-password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder=""
                      className="h-12 w-full rounded-xl border-2 border-slate-200 bg-white px-4 pr-12 text-base focus:border-brand-500 focus:ring-4 focus:ring-brand-100 focus:outline-none transition"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPwd((v) => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-slate-500 hover:text-brand-700 rounded-md"
                      aria-label={showPwd ? 'Ocultar senha' : 'Mostrar senha'}
                    >
                      {showPwd ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700" htmlFor="confirm-password">
                    Confirmar nova senha
                  </label>
                  <input
                    id="confirm-password"
                    type={showPwd ? 'text' : 'password'}
                    autoComplete="new-password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder=""
                    className="mt-2 h-12 w-full rounded-xl border-2 border-slate-200 bg-white px-4 text-base focus:border-brand-500 focus:ring-4 focus:ring-brand-100 focus:outline-none transition"
                  />
                </div>

                {error ? (
                  <p className="flex items-center gap-2 text-sm text-red-600">
                    <AlertCircle size={16} /> {error}
                  </p>
                ) : null}

                <button
                  type="submit"
                  disabled={pending || !password || !confirmPassword}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-xl font-semibold text-white bg-gradient-to-r from-brand-700 to-brand-500 hover:from-brand-800 hover:to-brand-600 active:scale-[0.99] shadow-lg shadow-brand-600/30 disabled:opacity-60 disabled:cursor-not-allowed transition-all"
                >
                  {pending ? <Loader2 className="animate-spin" size={18} /> : null}
                  {pending ? 'Salvando...' : 'Salvar nova senha'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

'use client';

export const dynamic = 'force-dynamic';

import { useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Loader2, Lock, User, Sprout, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/useToast';

export default function LoginPage() {
  const { login } = useAuth();
  const { toast } = useToast();
  const _router = useRouter(); const nav = (path: string) => _router.push(path);
  const loc = usePathname();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!username || !password) {
      toast('warning', 'Informe usuário e senha.');
      return;
    }
    setLoading(true);
    const r = await login(username, password);
    setLoading(false);
    if (r.ok) {
      toast('success', 'Bem-vindo!');
      const to = '/';
      _router.replace(to);
    } else {
      toast('error', r.error || 'Falha no login.');
    }
  }

  return (
    <div className="min-h-screen relative overflow-hidden flex items-center justify-center p-4 bg-gradient-to-br from-emerald-800 via-brand-700 to-brand-500 safe-top safe-bottom">
      {/* ===== Decoração de fundo ===== */}
      <div aria-hidden className="absolute -top-20 -left-20 h-72 w-72 rounded-full bg-emerald-300/30 blur-3xl" />
      <div aria-hidden className="absolute top-1/3 -right-32 h-96 w-96 rounded-full bg-brand-300/40 blur-3xl" />
      <div aria-hidden className="absolute bottom-0 left-1/4 h-80 w-80 rounded-full bg-emerald-400/30 blur-3xl" />

      {/* Folhas decorativas */}
      <svg aria-hidden className="absolute top-10 right-10 h-28 w-28 text-brand-200/30 rotate-12" viewBox="0 0 64 64" fill="currentColor">
        <path d="M32 8 C 18 12, 10 24, 14 38 C 18 52, 30 58, 40 54 C 52 50, 56 36, 50 24 C 44 14, 38 8, 32 8 Z" />
      </svg>
      <svg aria-hidden className="absolute bottom-16 left-8 h-40 w-40 text-emerald-200/20 -rotate-45" viewBox="0 0 64 64" fill="currentColor">
        <path d="M32 8 C 18 12, 10 24, 14 38 C 18 52, 30 58, 40 54 C 52 50, 56 36, 50 24 C 44 14, 38 8, 32 8 Z" />
      </svg>
      <svg aria-hidden className="absolute top-1/2 right-12 h-20 w-20 text-emerald-100/30" viewBox="0 0 64 64" fill="currentColor">
        <path d="M32 8 C 18 12, 10 24, 14 38 C 18 52, 30 58, 40 54 C 52 50, 56 36, 50 24 C 44 14, 38 8, 32 8 Z" />
      </svg>

      {/* Marca no canto */}
      <div className="absolute top-5 left-5 flex items-center gap-2 text-white/90 text-base font-semibold">
        <div className="bg-white/15 backdrop-blur p-2 rounded-lg">
          <Sprout size={20} />
        </div>
        HortiGest
      </div>

      {/* ===== Card principal ===== */}
      <div className="relative w-full max-w-md">
        <div className="absolute -inset-1 bg-gradient-to-tr from-emerald-300/40 via-white/20 to-emerald-300/40 blur-2xl rounded-3xl" />

        <div className="relative bg-white/95 backdrop-blur rounded-3xl shadow-2xl border border-white/40 p-8 sm:p-10">
          {/* Logo + título */}
          <div className="flex flex-col items-center text-center">
            <div className="relative">
              <div className="absolute -inset-4 bg-gradient-to-tr from-brand-200 via-emerald-100 to-brand-200 rounded-3xl blur-2xl opacity-60" />
              <img
                src="/logo.png"
                alt="HortiGest"
                className="relative h-32 sm:h-36 w-auto max-w-full drop-shadow-md"
                style={{ objectFit: 'contain' }}
              />
            </div>
            <h1 className="mt-5 text-2xl sm:text-3xl font-extrabold bg-gradient-to-r from-brand-700 to-brand-500 bg-clip-text text-transparent tracking-tight">
              Bem-vindo de volta
            </h1>
            <p className="text-sm text-slate-500 mt-1.5">
              Entre para gerenciar o recebimento e a produção
            </p>
          </div>

          {/* Form */}
          <form onSubmit={onSubmit} className="mt-8 space-y-5">
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-slate-700">Usuário</label>
              <div className="relative group">
                <User
                  size={18}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-brand-600 transition-colors pointer-events-none"
                />
                <input
                  autoFocus
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full h-12 pl-11 pr-4 text-base rounded-xl border-2 border-slate-200 bg-white focus:border-brand-500 focus:ring-4 focus:ring-brand-100 focus:outline-none transition placeholder:text-slate-400"
                  placeholder="seu.usuario"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-semibold text-slate-700">Senha</label>
              <div className="relative group">
                <Lock
                  size={18}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-brand-600 transition-colors pointer-events-none"
                />
                <input
                  type={showPwd ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full h-12 pl-11 pr-14 text-base rounded-xl border-2 border-slate-200 bg-white focus:border-brand-500 focus:ring-4 focus:ring-brand-100 focus:outline-none transition placeholder:text-slate-400"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-slate-500 hover:text-brand-700 hover:bg-brand-50 rounded-md transition-colors"
                  aria-label={showPwd ? 'Ocultar senha' : 'Mostrar senha'}
                >
                  {showPwd ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full h-12 mt-2 rounded-xl font-semibold text-base text-white bg-gradient-to-r from-brand-700 to-brand-500 hover:from-brand-800 hover:to-brand-600 active:scale-[0.99] shadow-lg shadow-brand-600/30 disabled:opacity-60 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="animate-spin" size={18} />
                  Entrando...
                </>
              ) : (
                'Entrar'
              )}
            </button>
          </form>

          {/* Helper card */}
          <div className="mt-7 p-3 rounded-xl bg-brand-50 border border-brand-100 text-center">
            <p className="text-xs text-brand-800">
              <span className="font-semibold">Primeiro acesso?</span> Use as credenciais informadas pelo administrador.
            </p>
          </div>

          <p className="text-center text-[11px] text-slate-400 mt-6">
            Controle e Produção de Hortifrúti · v1.0
          </p>
        </div>

        <p className="text-center text-xs text-white/80 mt-4">
          Acesso seguro · Suas informações estão protegidas
        </p>
      </div>
    </div>
  );
}

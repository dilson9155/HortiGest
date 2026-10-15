'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useRef, useState } from 'react';
import { Save, RefreshCw, Upload, X, Image as ImageIcon, Building2, Settings as SettingsIcon } from 'lucide-react';
import clsx from 'clsx';
import { api, errorMessage } from '../lib/api';
import { useToast } from '../hooks/useToast';
import { SectionCard, Button, Input, Spinner } from '../components/UI';
import ResetSystemCard from '../components/ResetSystemCard';
import { useAuth } from '../contexts/AuthContext';
import { useBranding } from '../contexts/BrandingContext';

export default function SettingsPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const isAdmin = user?.role?.kind === 'ADMIN';
  const branding = useBranding();
  const [data, setData] = useState<Record<string, any>>({});
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    setLoading(true);
    const r = await api.get('/settings');
    setLoading(false);
    if (r.ok) {
      setData(r.data);
      setLogoPreview(r.data['company.logo'] ?? null);
    }
  }

  async function save() {
    setLoading(true);
    // Remove valores vazios do JSON para não salvar valores nulos
    const payload: Record<string, any> = {};
    for (const [k, v] of Object.entries(data)) {
      if (v !== '' && v !== null && v !== undefined) payload[k] = v;
    }
    const r = await api.put('/settings', payload);
    setLoading(false);
    if (r.ok) {
      toast('success', 'Configurações salvas.');
      // Atualiza o contexto para refletir imediatamente em outros lugares
      branding.setLogo(data['company.logo'] || null);
      branding.setCompanyName(data['company.name'] || '');
    } else toast('error', errorMessage(r));
  }

  useEffect(() => { load(); }, []);

  function set(k: string, v: any) {
    setData((d) => ({ ...d, [k]: v }));
  }

  function handleLogoFile(file: File) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast('warning', 'Selecione um arquivo de imagem.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast('warning', 'Imagem muito grande (máx 2 MB).');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setLogoPreview(dataUrl);
      set('company.logo', dataUrl);
      set('company.logoMime', file.type);
    };
    reader.readAsDataURL(file);
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) handleLogoFile(f);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) handleLogoFile(f);
  }

  function removeLogo() {
    setLogoPreview(null);
    set('company.logo', '');
    set('company.logoMime', '');
    if (fileRef.current) fileRef.current.value = '';
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* ============== LOGO ============== */}
      <section className="rounded-2xl bg-white shadow-soft border border-slate-200 p-5 sm:p-7">
        <header className="mb-5 flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white flex items-center justify-center shadow-md">
              <ImageIcon size={22} />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-slate-900">Logo da empresa</h2>
              <p className="text-xs sm:text-sm text-slate-500">
                Defina a logomarca exibida no menu do sistema e no cabeçalho dos relatórios PDF.
              </p>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-start">
          {/* Preview */}
          <div className="md:col-span-1">
            <div className="text-xs font-semibold text-slate-600 mb-2">Pré-visualização</div>
            <div className="aspect-square w-full max-w-[260px] mx-auto rounded-2xl border-2 border-dashed border-slate-300 bg-gradient-to-br from-slate-50 to-brand-50/40 flex items-center justify-center overflow-hidden">
              {logoPreview ? (
                <img src={logoPreview} alt="Logo da empresa" className="max-w-full max-h-full object-contain" />
              ) : (
                <div className="text-center px-4">
                  <ImageIcon size={36} className="text-slate-300 mx-auto mb-2" />
                  <div className="text-xs text-slate-500">Sem logo definida</div>
                  <div className="text-[10px] text-slate-400 mt-1">Será usada a logo padrão</div>
                </div>
              )}
            </div>

            {logoPreview && (
              <button
                onClick={removeLogo}
                className="mt-3 w-full h-10 rounded-lg text-xs font-semibold text-red-700 bg-red-50 border border-red-200 hover:bg-red-100 transition flex items-center justify-center gap-2"
              >
                <X size={14} /> Remover logo
              </button>
            )}
          </div>

          {/* Upload */}
          <div className="md:col-span-2">
            <div className="text-xs font-semibold text-slate-600 mb-2">Enviar uma nova logo</div>
            <div
              onDrop={onDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => fileRef.current?.click()}
              className="rounded-2xl border-2 border-dashed border-brand-300 bg-brand-50/30 hover:bg-brand-50 transition cursor-pointer p-8 text-center"
            >
              <div className="w-14 h-14 rounded-xl bg-brand-100 text-brand-700 mx-auto mb-3 flex items-center justify-center">
                <Upload size={28} />
              </div>
              <p className="text-sm font-semibold text-slate-700">Arraste e solte a imagem aqui</p>
              <p className="text-xs text-slate-500 mt-1">ou</p>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); fileRef.current?.click(); }}
                className="mt-3 inline-flex h-10 px-5 rounded-lg font-semibold text-sm bg-brand-600 text-white hover:bg-brand-700 transition items-center gap-2"
              >
                <Upload size={14} /> Selecionar arquivo
              </button>
              <p className="text-[10px] text-slate-400 mt-3">PNG ou JPG, até 2 MB. Fundo transparente recomendado.</p>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/webp,image/svg+xml"
                className="hidden"
                onChange={onFileChange}
              />
            </div>
          </div>
        </div>
      </section>

      {/* ============== DADOS DA EMPRESA ============== */}
      <section className="rounded-2xl bg-white shadow-soft border border-slate-200 p-5 sm:p-7">
        <header className="mb-5 flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-slate-500 to-slate-700 text-white flex items-center justify-center shadow-md">
              <Building2 size={22} />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-slate-900">Dados da empresa</h2>
              <p className="text-xs sm:text-sm text-slate-500">
                Essas informações aparecem no cabeçalho dos PDFs e nas configurações internas.
              </p>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button variant="secondary" onClick={load} disabled={loading}>
              <RefreshCw size={14} /> Recarregar
            </Button>
            <Button onClick={save} disabled={loading}>
              <Save size={14} /> Salvar
            </Button>
          </div>
        </header>

        {loading && !Object.keys(data).length ? (
          <div className="p-6 flex items-center gap-2 text-slate-500"><Spinner /> Carregando...</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="Nome da empresa" value={data['company.name'] ?? ''} onChange={(e) => set('company.name', e.target.value)} />
            <Input label="CNPJ" value={data['company.cnpj'] ?? ''} onChange={(e) => set('company.cnpj', e.target.value)} />
            <Input label="Endereço" value={data['company.address'] ?? ''} onChange={(e) => set('company.address', e.target.value)} />
            <Input label="Telefone" value={data['company.phone'] ?? ''} onChange={(e) => set('company.phone', e.target.value)} />
            <Input label="E-mail" value={data['company.email'] ?? ''} onChange={(e) => set('company.email', e.target.value)} />
          </div>
        )}
      </section>

      {/* ============== PREFERÊNCIAS ============== */}
      <section className="rounded-2xl bg-white shadow-soft border border-slate-200 p-5 sm:p-7">
        <header className="mb-5 flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-500 to-amber-700 text-white flex items-center justify-center shadow-md">
              <SettingsIcon size={22} />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-slate-900">Preferências</h2>
              <p className="text-xs sm:text-sm text-slate-500">Regras gerais de exibição e relatórios.</p>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="label">Unidade</label>
            <select className="input" value={data['preferences.unit'] ?? 'CAIXA'} onChange={(e) => set('preferences.unit', e.target.value)}>
              <option value="CAIXA">CAIXA</option>
              <option value="KG">KG</option>
            </select>
          </div>
          <div>
            <label className="label">Casas decimais</label>
            <input
              type="number"
              className="input no-spinner"
              value={data['preferences.decimals'] ?? '3'}
              onChange={(e) => set('preferences.decimals', e.target.value)}
            />
          </div>
          <div>
            <label className="label">Formato de data</label>
            <select className="input" value={data['preferences.dateFormat'] ?? 'dd/MM/yyyy'} onChange={(e) => set('preferences.dateFormat', e.target.value)}>
              <option value="dd/MM/yyyy">dd/MM/yyyy</option>
              <option value="yyyy-MM-dd">yyyy-MM-dd</option>
            </select>
          </div>
        </div>
      </section>

      {/* ============== ZONA DE PERIGO (somente ADMIN) ============== */}
      {isAdmin && <ResetSystemCard />}
    </div>
  );
}

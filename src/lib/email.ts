// Envio de e-mail transacional via Resend (API REST, sem dependência extra).
// Sem RESEND_API_KEY o link é registrado no console do servidor (desenvolvimento).

export interface PasswordResetEmailInput {
  to: string;
  name: string;
  resetUrl: string;
  /** Base pública da aplicação, usada para o logo no e-mail. */
  baseUrl?: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function appUrl(): string {
  return (
    process.env.APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    'http://localhost:3000'
  ).replace(/\/$/, '');
}

/** Envia o e-mail de recuperação. Devolve false quando não há API key ou falha o envio. */
export async function sendPasswordResetEmail({
  to,
  name,
  resetUrl,
  baseUrl,
}: PasswordResetEmailInput): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY?.trim();

  if (!apiKey) {
    console.info(
      `[recuperar-senha] RESEND_API_KEY não configurada. Link para ${to}: ${resetUrl}`,
    );
    return false;
  }

  const from = process.env.EMAIL_FROM?.trim() || 'HortiGest <onboarding@resend.dev>';
  const logoUrl = `${baseUrl || appUrl()}/logo.png`;
  const safeName = escapeHtml(name);
  const subject = 'Recuperação de senha — HortiGest';

  const html = `
    <div style="font-family: Arial, Helvetica, sans-serif; max-width: 520px; margin: 0 auto; color: #0f172a;">
      <div style="text-align: center; margin: 0 0 20px;">
        <img src="${escapeHtml(logoUrl)}" alt="HortiGest" width="88" style="display: inline-block; width: 88px; border: 0; border-radius: 12px;" />
      </div>
      <h2 style="margin: 0 0 16px; text-align: center;">HortiGest</h2>
      <p>Olá, ${safeName}!</p>
      <p>Recebemos uma solicitação para redefinir a senha da sua conta no HortiGest.</p>
      <p style="margin: 24px 0;">
        <a href="${escapeHtml(resetUrl)}" style="display: inline-block; background: #047857; color: #ffffff; padding: 12px 20px; border-radius: 8px; text-decoration: none; font-weight: 600;">
          Redefinir minha senha
        </a>
      </p>
      <p>Este link expira em <strong>30 minutos</strong> e só pode ser usado uma vez.</p>
      <p>Se você não solicitou a recuperação, ignore este e-mail. Sua senha permanece a mesma.</p>
      <p style="margin-top: 28px; font-size: 12px; color: #64748b;">
        Se o botão não funcionar, copie e cole este endereço no navegador:<br />
        <span style="word-break: break-all;">${escapeHtml(resetUrl)}</span>
      </p>
    </div>
  `;

  const text = [
    `Olá, ${name}!`,
    '',
    'Recebemos uma solicitação para redefinir a senha da sua conta no HortiGest.',
    '',
    `Acesse o link para criar uma nova senha: ${resetUrl}`,
    '',
    'Este link expira em 30 minutos e só pode ser usado uma vez.',
    'Se você não solicitou a recuperação, ignore este e-mail.',
  ].join('\n');

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to: [to], subject, html, text }),
    });

    if (!response.ok) {
      const detail = await response.text();
      console.error(`[recuperar-senha] Falha ao enviar e-mail (${response.status}): ${detail}`);
      return false;
    }
    return true;
  } catch (error) {
    console.error('[recuperar-senha] Erro ao enviar e-mail:', error);
    return false;
  }
}

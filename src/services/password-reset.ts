// Recuperação de senha baseada nos fluxos de financy-pro-2.0 e ecclesia,
// adaptada ao auth do HortiGest (argon2 + JWT + Prisma).

import { randomBytes } from 'node:crypto';
import { prisma } from '../lib/prisma';
import { hashPassword, hashToken } from '../lib/auth';
import { sendPasswordResetEmail } from '../lib/email';

const TOKEN_TTL_MINUTES = 30;
const RATE_WINDOW_MINUTES = 15;
const MAX_REQUESTS_PER_USER = 3;
const MAX_REQUESTS_PER_IP = 10;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const GENERIC_RESET_MESSAGE =
  'Se este e-mail estiver cadastrado, enviaremos um link para redefinir a senha. Verifique sua caixa de entrada e o spam.';

export type PasswordResetRequestResult =
  | { ok: true; message: string; devUrl: string | null }
  | { ok: false; error: string };

export type PasswordResetResult = { ok: true } | { ok: false; error: string };

function publicBaseUrl(origin?: string | null): string {
  return (
    process.env.APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    origin?.trim() ||
    'http://localhost:3000'
  ).replace(/\/$/, '');
}

function buildResetUrl(token: string, base: string): string {
  return `${base}/redefinir-senha?token=${encodeURIComponent(token)}`;
}

function genericSuccess(devUrl: string | null = null): PasswordResetRequestResult {
  return { ok: true, message: GENERIC_RESET_MESSAGE, devUrl };
}

/** Solicita o link. A resposta é sempre genérica para não revelar se o e-mail existe. */
export async function requestPasswordReset(
  emailRaw: string,
  requestedIp: string | null,
  requestOrigin?: string | null,
): Promise<PasswordResetRequestResult> {
  const email = emailRaw.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    return { ok: false, error: 'Informe um e-mail válido.' };
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true, active: true },
  });

  if (!user || !user.active) return genericSuccess();

  const windowStart = new Date(Date.now() - RATE_WINDOW_MINUTES * 60 * 1000);
  const [recentByUser, recentByIp] = await Promise.all([
    prisma.passwordResetToken.count({
      where: { userId: user.id, createdAt: { gte: windowStart } },
    }),
    requestedIp
      ? prisma.passwordResetToken.count({
          where: { requestedIp, createdAt: { gte: windowStart } },
        })
      : Promise.resolve(0),
  ]);

  // Mesmo quando o limite é atingido, mantemos a resposta genérica.
  if (recentByUser >= MAX_REQUESTS_PER_USER || recentByIp >= MAX_REQUESTS_PER_IP) {
    return genericSuccess();
  }

  const token = randomBytes(32).toString('base64url');
  const tokenHash = hashToken(token);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + TOKEN_TTL_MINUTES * 60 * 1000);
  const cleanupBefore = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  await prisma.$transaction([
    // Invalida links anteriores ainda não usados.
    prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: now },
    }),
    prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash, expiresAt, requestedIp },
    }),
    prisma.passwordResetToken.deleteMany({
      where: { expiresAt: { lt: cleanupBefore } },
    }),
  ]);

  const base = publicBaseUrl(requestOrigin);
  const resetUrl = buildResetUrl(token, base);
  await sendPasswordResetEmail({ to: email, name: user.name, resetUrl, baseUrl: base });

  const showDevLink =
    process.env.NODE_ENV !== 'production' && process.env.PASSWORD_RESET_DEV_LINK === 'true';
  return genericSuccess(showDevLink ? resetUrl : null);
}

/** Valida a força mínima da nova senha. */
export function validatePasswordStrength(password: string): string | null {
  if (password.length < 8) return 'A senha deve ter no mínimo 8 caracteres.';
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return 'A senha deve conter letras e números.';
  }
  return null;
}

/** Redefine a senha usando um token de uso único. */
export async function resetPasswordWithToken(
  tokenRaw: string,
  password: string,
  confirmPassword: string,
): Promise<PasswordResetResult> {
  const token = tokenRaw.trim();
  const invalidLink = 'Link inválido ou expirado. Solicite uma nova recuperação.';
  if (token.length < 32) return { ok: false, error: invalidLink };

  const strengthError = validatePasswordStrength(password);
  if (strengthError) return { ok: false, error: strengthError };
  if (password !== confirmPassword) {
    return { ok: false, error: 'As senhas informadas não coincidem.' };
  }

  const tokenHash = hashToken(token);
  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      userId: true,
      expiresAt: true,
      usedAt: true,
      user: { select: { active: true, name: true } },
    },
  });

  if (
    !record ||
    record.usedAt ||
    record.expiresAt <= new Date() ||
    !record.user.active
  ) {
    return { ok: false, error: invalidLink };
  }

  const passwordHash = await hashPassword(password);
  const now = new Date();

  try {
    await prisma.$transaction(async (tx) => {
      // Update condicional garante uso único mesmo com requisições concorrentes.
      const claimed = await tx.passwordResetToken.updateMany({
        where: { id: record.id, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      if (claimed.count === 0) throw new Error('TOKEN_ALREADY_USED');

      await tx.user.update({
        where: { id: record.userId },
        data: { passwordHash },
      });

      await tx.passwordResetToken.updateMany({
        where: { userId: record.userId, id: { not: record.id }, usedAt: null },
        data: { usedAt: now },
      });
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'TOKEN_ALREADY_USED') {
      return { ok: false, error: invalidLink };
    }
    throw error;
  }

  try {
    await prisma.auditLog.create({
      data: {
        userId: record.userId,
        userName: record.user.name,
        entity: 'user',
        entityId: record.userId,
        operation: 'PASSWORD_RESET',
        description: 'Senha redefinida via link de recuperação.',
      },
    });
  } catch (error) {
    console.error('[recuperar-senha] Falha ao registrar auditoria:', error);
  }

  return { ok: true };
}

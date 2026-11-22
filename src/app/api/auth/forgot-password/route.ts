import { z } from 'zod';
import { handler } from '../../../../lib/api-handler';
import { requestPasswordReset } from '../../../../services/password-reset';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({
  email: z.string().trim().email('Informe um e-mail válido.'),
});

function clientIp(req: Request): string | null {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]?.trim() || null;
  return req.headers.get('x-real-ip')?.trim() || null;
}

function requestOrigin(req: Request): string | null {
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
  if (!host) return null;
  const proto = req.headers.get('x-forwarded-proto') || 'https';
  return `${proto}://${host}`;
}

/** Solicita o link de recuperação (resposta sempre genérica). */
export const POST = handler(async (req) => {
  const { email } = schema.parse(await req.json());
  const result = await requestPasswordReset(email, clientIp(req), requestOrigin(req));
  return result.ok
    ? { message: result.message, devUrl: result.devUrl }
    : { message: result.error, devUrl: null };
});

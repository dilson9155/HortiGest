import { z } from 'zod';
import { handler } from '../../../../lib/api-handler';
import { HttpError } from '../../../../lib/session';
import { resetPasswordWithToken } from '../../../../services/password-reset';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({
  token: z.string().min(1, 'Link inválido.'),
  password: z.string().min(1, 'Informe a nova senha.'),
  confirmPassword: z.string().min(1, 'Confirme a nova senha.'),
});

/** Redefine a senha a partir do token enviado por e-mail. */
export const POST = handler(async (req) => {
  const body = schema.parse(await req.json());
  const result = await resetPasswordWithToken(
    body.token,
    body.password,
    body.confirmPassword,
  );
  if (!result.ok) throw new HttpError(400, 'LINK_INVALIDO', result.error);
  return { reset: true };
});

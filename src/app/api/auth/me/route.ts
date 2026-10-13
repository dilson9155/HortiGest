import { handler } from '@/lib/api-handler';
import { getSession } from '@/lib/session';

export const runtime = 'nodejs';

export const GET = handler(async (req) => {
  const session = await getSession(req);
  if (!session) {
    return new Response(
      JSON.stringify({ ok: false, error: { code: 'UNAUTHORIZED', message: 'Autenticação necessária.' } }),
      { status: 401, headers: { 'Content-Type': 'application/json' } },
    );
  }
  return session;
});

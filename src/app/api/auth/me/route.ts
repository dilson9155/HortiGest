import { NextResponse } from 'next/server';
import { handler } from '../../../../lib/api-handler';
import { apiErr, getSession } from '../../../../lib/session';

export const runtime = 'nodejs';

export const GET = handler(async (req) => {
  const session = await getSession(req);
  if (!session) {
    const e = apiErr(401, 'UNAUTHORIZED', 'Autenticação necessária.');
    return NextResponse.json(e.body, { status: e.status });
  }
  return session;
});

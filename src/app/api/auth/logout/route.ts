import { handler } from '../../../../lib/api-handler';
import { prisma } from '../../../../lib/prisma';
import { getSession } from '../../../../lib/session';

export const runtime = 'nodejs';

export const POST = handler(async (req) => {
  const session = await getSession(req);
  if (session) {
    await prisma.auditLog.create({
      data: {
        userId: session.id,
        userName: session.name,
        entity: 'user',
        entityId: session.id,
        operation: 'LOGOUT',
        description: 'Logout realizado.',
      },
    });
  }
  return { ok: true };
});

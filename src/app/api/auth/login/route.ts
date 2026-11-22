import { z } from 'zod';
import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { verifyPassword, signToken } from '../../../../lib/auth';
import { handler } from '../../../../lib/api-handler';
import { apiErr } from '../../../../lib/session';

export const runtime = 'nodejs';

const schema = z.object({
  username: z.string().min(1, 'Informe o usuário.').max(60),
  password: z.string().min(1, 'Informe a senha.'),
});

export const POST = handler(async (req) => {
  const { username, password } = schema.parse(await req.json());

  const user = await prisma.user.findUnique({
    where: { username },
    include: { role: { include: { permissions: true } } },
  });
  if (!user || !user.active) {
    const e = apiErr(401, 'CREDENTIALS_INVALID', 'Usuário ou senha inválidos.');
    return NextResponse.json(e.body, { status: e.status });
  }

  const okPw = await verifyPassword(user.passwordHash, password);
  if (!okPw) {
    const e = apiErr(401, 'CREDENTIALS_INVALID', 'Usuário ou senha inválidos.');
    return NextResponse.json(e.body, { status: e.status });
  }

  const token = signToken({ sub: user.id, username: user.username });

  const modulePermissions = await prisma.userModulePermission.findMany({
    where: { userId: user.id },
    select: { module: true },
  });
  const allowedModules = modulePermissions.length
    ? modulePermissions.map((p) => p.module)
    : null;

  // Atualiza lastLogin
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  // Auditoria
  await prisma.auditLog.create({
    data: {
      userId: user.id,
      userName: user.name,
      entity: 'user',
      entityId: user.id,
      operation: 'LOGIN',
      description: 'Login realizado.',
    },
  });

  return {
    token,
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      email: user.email,
      role: user.role
        ? { id: user.role.id, kind: user.role.kind, name: user.role.name }
        : null,
      permissions: Object.fromEntries(
        (user.role?.permissions ?? []).map((p) => [p.module, p.actions]),
      ),
      allowedModules,
    },
  };
});

import { registryDeleteHandler, registryUpdateHandler } from '../../../../../lib/registry';

export const runtime = 'nodejs';

function kindFromPath(pathname: string) {
  const parts = pathname.split('/').filter(Boolean);
  return parts[parts.indexOf('registries') + 1];
}

export async function PUT(req: Request, ctx: any) {
  return registryUpdateHandler(kindFromPath(new URL(req.url).pathname) as any)(req, ctx);
}

export async function DELETE(req: Request, ctx: any) {
  return registryDeleteHandler(kindFromPath(new URL(req.url).pathname) as any)(req, ctx);
}

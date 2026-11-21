import { registryToggleHandler } from '../../../../../../lib/registry';

export const runtime = 'nodejs';

function kindFromPath(pathname: string) {
  const parts = pathname.split('/').filter(Boolean);
  return parts[parts.indexOf('registries') + 1];
}

export async function POST(req: Request, ctx: any) {
  return registryToggleHandler(kindFromPath(new URL(req.url).pathname) as any)(req, ctx);
}

import { registryCreateHandler, registryListHandler } from '../../../../lib/registry';

export const runtime = 'nodejs';

function kindFromPath(pathname: string) {
  const parts = pathname.split('/').filter(Boolean);
  return parts[parts.indexOf('registries') + 1];
}

export async function GET(req: Request) {
  return registryListHandler(kindFromPath(new URL(req.url).pathname) as any)(req);
}

export async function POST(req: Request) {
  return registryCreateHandler(kindFromPath(new URL(req.url).pathname) as any)(req);
}

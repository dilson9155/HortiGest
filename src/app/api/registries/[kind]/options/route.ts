import { registryOptionsHandler } from '../../../../../lib/registry';

export const runtime = 'nodejs';

function kindFromPath(pathname: string) {
  const parts = pathname.split('/').filter(Boolean);
  return parts[parts.indexOf('registries') + 1];
}

export async function GET(req: Request) {
  return registryOptionsHandler(kindFromPath(new URL(req.url).pathname) as any)(req);
}

import ResetPasswordPage from '../../views/ResetPasswordPage';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Redefinir senha — HortiGest',
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const params = await searchParams;
  const token = typeof params.token === 'string' ? params.token : '';
  return <ResetPasswordPage token={token} />;
}

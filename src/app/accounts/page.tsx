import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { AccountManager } from '@/components/AccountManager';
import { latestVersion } from '@/lib/ddragon';
import { listClaims } from '@/lib/verification';

export const dynamic = 'force-dynamic';

export default async function AccountsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/signin?callbackUrl=/accounts');

  const [accounts, version] = await Promise.all([
    listClaims(session.user.id),
    latestVersion(),
  ]);

  return (
    <div className="page" style={{ maxWidth: 780, margin: '0 auto' }}>
      <div className="page-head">
        <div className="eyebrow">Signed in as {session.user.name ?? 'you'}</div>
        <h1>Your Riot accounts</h1>
        <p className="page-sub">
          Add every account you play on, smurfs included. Verifying proves it&apos;s yours,
          so nobody else can claim it — and it only has to be done once, whichever group
          you join next.
        </p>
      </div>

      <AccountManager accounts={accounts} version={version} />

      <div className="note">
        <b>How verifying works.</b> We ask you to set your profile icon to a specific one
        and then read it back from Riot. Only somebody logged into that account can change
        its icon, so a match is proof. Nothing is stored beyond which account you claimed —
        we never see your Riot password, and this isn&apos;t a Riot login.
      </div>
    </div>
  );
}

import { notFound } from 'next/navigation';
import { auth } from '@/auth';
import { ChampionMetaPreview } from '@/components/ChampionMetaPreview';
import { checkGroupAccess } from '@/lib/access';
import { latestVersion } from '@/lib/ddragon';
import { getGroupChampionMeta } from '@/lib/groupChampionMeta';

export default async function GroupChampionsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await auth();
  const access = await checkGroupAccess(slug, session?.user?.id);
  if (!access.allowed) notFound();

  const [version, meta] = await Promise.all([latestVersion(), getGroupChampionMeta(access.group.id)]);
  const groupName = access.group.name;

  return (
    <div className="page">
      <header className="page-head">
        <h1>{groupName} champion pool</h1>
        <p className="page-sub">What your group actually plays in ranked this split. Every number comes from matches already ingested for accounts on this board.</p>
      </header>
      {meta.rows.length ? (
        <ChampionMetaPreview
          version={version}
          rows={meta.rows}
          scope={{ region: 'Your group', queue: 'Ranked Solo/Duo', patch: 'Current split', sample: `${meta.matches} matches` }}
          heading="See your group’s comfort picks at a glance"
          preview={false}
        />
      ) : (
        <div className="card" style={{ padding: '42px 24px', textAlign: 'center' }}>
          <h2 style={{ fontSize: 20, margin: '0 0 8px' }}>No ranked games ingested yet</h2>
          <p style={{ color: 'var(--muted)', margin: 0 }}>Once the next scheduled ingest picks up a group member’s ranked match, their champion pool will appear here. No production API key is needed for this view.</p>
        </div>
      )}
      <p className="note"><b>Group tier is confidence-aware.</b> A champion needs 8 games before it can be ranked. Its adjusted win rate starts at this group&apos;s normal win rate for that role across 12 virtual games, then its own results take over. A two-game 100% Twitch stays visible as a building sample, but cannot outrank an established comfort pick. Matchup history is the next group-meta addition.</p>
    </div>
  );
}

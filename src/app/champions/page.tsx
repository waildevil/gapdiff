import { ChampionMetaPreview } from '@/components/ChampionMetaPreview';
import { latestVersion } from '@/lib/ddragon';

export const metadata = {
  title: 'Champion meta | gapdiff',
  description: 'Champion meta for Ranked Solo/Duo, built from GapDiff match samples.',
};

export default async function ChampionsPage() {
  const version = await latestVersion();

  return (
    <div className="page">
      <header className="page-head">
        <div className="eyebrow">Champion meta</div>
        <h1>Champion stats, without borrowed rankings</h1>
        <p className="page-sub">A first look at the public meta page: filter a role, compare the signals that matter, then see where each champion is strongest.</p>
      </header>
      <ChampionMetaPreview version={version} />
    </div>
  );
}

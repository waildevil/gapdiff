import Link from 'next/link';
import { SearchForm } from '@/components/SearchForm';
import { listGroups } from '@/lib/leaderboard';
import styles from './page.module.css';

const EXAMPLES = [
  { label: 'anvil#DEVIL', platform: 'euw1', gameName: 'anvil', tagLine: 'DEVIL' },
  { label: 'Agurin#EUW', platform: 'euw1', gameName: 'Agurin', tagLine: 'EUW' },
  { label: 'Caps#0000', platform: 'euw1', gameName: 'Caps', tagLine: '0000' },
];

export default async function HomePage() {
  // Empty until a group has been seeded, so the link only appears when real.
  const groups = await listGroups().catch(() => []);

  return (
    <>
      <section className={styles.hero}>
        <h1 className={styles.title}>
          Find out who&apos;s actually <em>carrying</em>
        </h1>
        <p className={styles.lede}>
          Look up any player&apos;s live rank and recent games, with every match scored
          against the nine other people who were actually in it.
        </p>

        <div className={styles.searchSlot}>
          <SearchForm size="large" />
        </div>

        <div className={styles.examples}>
          <span className={styles.examplesLabel}>Try</span>
          {EXAMPLES.map((example) => (
            <Link
              key={example.label}
              className={styles.example}
              href={`/player/${example.platform}/${example.gameName}/${example.tagLine}`}
            >
              {example.label}
            </Link>
          ))}
        </div>

        {groups.length > 0 ? (
          <div className={styles.examples}>
            <span className={styles.examplesLabel}>Standings</span>
            {groups.map((group) => (
              <Link key={group.slug} className={styles.example} href={`/group/${group.slug}`}>
                {group.name}
              </Link>
            ))}
          </div>
        ) : null}
      </section>

      <section className={styles.explainer}>
        <div className={styles.point}>
          <div className={styles.pointTitle}>Scored in context</div>
          <p className={styles.pointBody}>
            A 7/2/9 game means nothing on its own. Every match is measured against the
            other nine players in that same lobby, so the score already accounts for the
            rank you were playing at.
          </p>
        </div>
        <div className={styles.point}>
          <div className={styles.pointTitle}>Weighted by role</div>
          <p className={styles.pointBody}>
            Vision dominates the score for supports, CS and damage share for ADCs,
            objective participation for junglers. A support isn&apos;t punished for
            farming less than a mid laner.
          </p>
        </div>
        <div className={styles.point}>
          <div className={styles.pointTitle}>Live from Riot</div>
          <p className={styles.pointBody}>
            Rank, LP and match history come straight from the Riot API when you search.
            Nothing is cached for days and then shown as current.
          </p>
        </div>
      </section>
    </>
  );
}

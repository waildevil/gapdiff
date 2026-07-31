import styles from './ScoreBreakdown.module.css';

/**
 * What the Gap Score is made of. Colours match the segments in each row's
 * breakdown bar, so the explanation and the data read as the same thing.
 */
const PILLARS = [
  {
    name: 'Rank',
    weight: '40%',
    colour: 'var(--diamond)',
    body: 'Your ranked solo LP, flattened onto one ladder from Iron IV to Challenger and scaled to 0–100. The only pillar that comes from Riot rather than from how you played.',
  },
  {
    name: 'Performance',
    weight: '40%',
    colour: 'var(--amber)',
    body: 'How you played against the nine other people in each lobby — kill participation, damage, gold, CS, vision and deaths, weighted differently per role. Recent games count for more.',
  },
  {
    name: 'Consistency',
    weight: '20%',
    colour: 'var(--platinum)',
    body: 'How much your per-game scores swing. Someone who alternates hard carries and hard feeds scores below a steadier player with the same average.',
  },
];

export function ScoreBreakdown() {
  return (
    <div>
      <div className={styles.grid}>
        {PILLARS.map((pillar) => (
          <div className="card" key={pillar.name}>
            <div className={styles.pillar}>
              <div className={styles.head}>
                <span className={styles.name}>{pillar.name}</span>
                <span className={styles.weight} style={{ color: pillar.colour }}>
                  {pillar.weight}
                </span>
              </div>
              <div className={styles.bar}>
                <div
                  className={styles.fill}
                  style={{ width: pillar.weight, background: pillar.colour }}
                />
              </div>
              <p className={styles.body}>{pillar.body}</p>
            </div>
          </div>
        ))}
      </div>

      <div className={styles.footnote}>
        <b>Rank is only 40%, which is why the order isn&apos;t just LP.</b> A
        higher-ranked player with volatile games can sit below a steadier one. Players with
        no ranked games are scored on performance and consistency alone, and always sort
        below ranked players — otherwise having no rank would be an advantage, since there
        would be nothing to drag the score down.
      </div>
    </div>
  );
}

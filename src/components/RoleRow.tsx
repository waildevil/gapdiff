'use client';

import Link from 'next/link';
import { useState } from 'react';
import { LiveGameExpand, type LiveGameExpandProps } from './LiveGameExpand';
import { RankBadge } from './RankBadge';
import styles from './RoleRow.module.css';

export interface RoleCardData {
  puuid: string;
  champIconSrc?: string;
  profileIconSrc: string;
  spell1Src?: string;
  spell2Src?: string;
  name: string;
  tag: string | null;
  href: string | null;
  rank: { tier: string; division: string; leaguePoints: number } | null;
  record: string | null;
  roleChips: string[];
  autofilled: boolean;
  expand: LiveGameExpandProps | null;
}

const SLOT_LABELS = ['TOP', 'JG', 'MID', 'ADC', 'SUP'];

/** Cards laid out one per role slot, left to right — the estimate can be
 *  wrong, so dragging two cards swaps their slots for anyone who knows
 *  better than the guess. Purely a local view fix; nothing is saved. */
export function RoleRow({ cards }: { cards: RoleCardData[] }) {
  const [order, setOrder] = useState(cards.map((c) => c.puuid));
  const byPuuid = new Map(cards.map((c) => [c.puuid, c]));
  const [draggedPuuid, setDraggedPuuid] = useState<string | null>(null);

  function swap(a: string, b: string) {
    if (a === b) return;
    setOrder((current) => {
      const next = [...current];
      const ai = next.indexOf(a);
      const bi = next.indexOf(b);
      if (ai === -1 || bi === -1) return current;
      [next[ai], next[bi]] = [next[bi] as string, next[ai] as string];
      return next;
    });
  }

  return (
    <div className={styles.row}>
      {order.map((puuid, i) => {
        const card = byPuuid.get(puuid);
        if (!card) return null;
        return (
          <div key={puuid} className={styles.slot}>
            <div className={styles.slotLabel}>{SLOT_LABELS[i] ?? ''}</div>
            <div
              className={`${styles.card} ${draggedPuuid === puuid ? styles.dragging : ''}`}
              draggable
              onDragStart={() => setDraggedPuuid(puuid)}
              onDragEnd={() => setDraggedPuuid(null)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (draggedPuuid) swap(draggedPuuid, puuid);
                setDraggedPuuid(null);
              }}
            >
              <div className={styles.champWrap}>
                {card.champIconSrc ? (
                  <img className={styles.champIcon} src={card.champIconSrc} alt="" width={52} height={52} draggable={false} />
                ) : (
                  <span className={styles.champIcon} />
                )}
                <img
                  className={styles.profileBadge}
                  src={card.profileIconSrc}
                  alt=""
                  width={20}
                  height={20}
                  draggable={false}
                />
              </div>

              <div className={styles.spells}>
                {card.spell1Src ? (
                  <img src={card.spell1Src} width={18} height={18} className={styles.spellIcon} alt="" draggable={false} />
                ) : (
                  <span className={styles.spellIcon} />
                )}
                {card.spell2Src ? (
                  <img src={card.spell2Src} width={18} height={18} className={styles.spellIcon} alt="" draggable={false} />
                ) : (
                  <span className={styles.spellIcon} />
                )}
              </div>

              <div className={styles.cardBody}>
                {card.href ? (
                  <Link className={styles.name} href={card.href}>
                    {card.name}
                    {card.tag ? <span className={styles.tag}>#{card.tag}</span> : null}
                  </Link>
                ) : (
                  <span className={styles.name}>{card.name}</span>
                )}

                <RankBadge rank={card.rank} />
                {card.record ? <span className={styles.record}>{card.record}</span> : null}

                {card.roleChips.length > 0 ? (
                  <div className={styles.roles}>
                    {card.roleChips.map((chip) => (
                      <span key={chip} className={styles.roleChip}>
                        {chip}
                      </span>
                    ))}
                  </div>
                ) : null}

                {card.autofilled ? <span className={styles.autofill}>Autofilled?</span> : null}

                {card.expand ? <LiveGameExpand {...card.expand} /> : null}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

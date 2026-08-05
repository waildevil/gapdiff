'use client';

import { useEffect, useRef } from 'react';
import styles from './EmojiPicker.module.css';

/** A small curated set rather than a full Unicode picker — this is a friend-group chat, not Slack. */
const EMOJIS = [
  '😀', '😂', '😅', '😉', '😍', '😘', '😎', '🤔',
  '😢', '😭', '😡', '🥵', '🤡', '💀', '😴', '🫠',
  '👍', '👎', '👏', '🙏', '💪', '🤝', '🔥', '💯',
  '🎉', '❤️', '💔', '⚡', '👑', '🏆', '🎮', '🐐',
];

export function EmojiPicker({
  onPick,
  onClose,
}: {
  onPick: (emoji: string) => void;
  onClose: () => void;
}) {
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!wrap.current?.contains(event.target as Node)) onClose();
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [onClose]);

  return (
    <div className={styles.grid} ref={wrap} role="menu">
      {EMOJIS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          className={styles.emoji}
          onClick={() => onPick(emoji)}
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}

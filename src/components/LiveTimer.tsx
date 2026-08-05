'use client';

import { useEffect, useState } from 'react';
import { formatDuration } from '@/lib/profile';

/** Ticks a live game's elapsed time forward locally between server refreshes. */
export function LiveTimer({ initialSeconds }: { initialSeconds: number }) {
  const [seconds, setSeconds] = useState(Math.max(0, Math.floor(initialSeconds)));

  useEffect(() => {
    setSeconds(Math.max(0, Math.floor(initialSeconds)));
    const interval = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, [initialSeconds]);

  return <>{formatDuration(seconds)}</>;
}

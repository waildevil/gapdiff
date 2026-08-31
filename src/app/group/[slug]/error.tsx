'use client';

import Link from 'next/link';

export default function GroupError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="page" style={{ margin: '0 auto', paddingTop: 72 }}>
      <div className="card" style={{ maxWidth: 560, margin: '0 auto', padding: '48px 24px', textAlign: 'center' }}>
        <div className="eyebrow">Standings unavailable</div>
        <h1 style={{ fontSize: 24, margin: '10px 0', letterSpacing: '-0.02em' }}>
          We couldn&apos;t load this group right now
        </h1>
        <p style={{ color: 'var(--muted)', margin: '0 0 24px', lineHeight: 1.6 }}>
          Your data is safe. Please try again in a moment.
        </p>
        <button
          type="button"
          onClick={reset}
          style={{
            background: 'var(--accent)',
            border: 0,
            borderRadius: 'var(--r-sm)',
            color: 'var(--bg)',
            cursor: 'pointer',
            fontFamily: 'var(--mono)',
            fontSize: 12,
            padding: '10px 16px',
          }}
        >
          Try again
        </button>
        <p style={{ marginTop: 24 }}>
          <Link href="/groups" style={{ color: 'var(--accent)', fontFamily: 'var(--mono)', fontSize: 12 }}>
            ← Your groups
          </Link>
        </p>
      </div>
    </main>
  );
}

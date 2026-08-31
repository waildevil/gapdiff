'use client';

import Link from 'next/link';

export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="page" style={{ margin: '0 auto', paddingTop: 72 }}>
      <div className="card" style={{ maxWidth: 560, margin: '0 auto', padding: '48px 24px', textAlign: 'center' }}>
        <div className="eyebrow">Something went wrong</div>
        <h1 style={{ fontSize: 24, margin: '10px 0', letterSpacing: '-0.02em' }}>We couldn&apos;t load this page</h1>
        <p style={{ color: 'var(--muted)', margin: '0 0 24px', lineHeight: 1.6 }}>
          Your data is safe. Please try again in a moment.
        </p>
        <button type="button" onClick={reset} style={buttonStyle}>Try again</button>
        <p style={{ marginTop: 24 }}>
          <Link href="/" style={{ color: 'var(--accent)', fontFamily: 'var(--mono)', fontSize: 12 }}>← Back to search</Link>
        </p>
      </div>
    </main>
  );
}

const buttonStyle = {
  background: 'var(--accent)', border: 0, borderRadius: 'var(--r-sm)', color: 'var(--bg)', cursor: 'pointer',
  fontFamily: 'var(--mono)', fontSize: 12, padding: '10px 16px',
};

'use client';

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: '#101214', color: '#f3f5f4', fontFamily: 'system-ui, sans-serif' }}>
        <main style={{ maxWidth: 560, margin: '0 auto', padding: '96px 24px', textAlign: 'center' }}>
          <p style={{ color: '#abb5b0', fontSize: 12, letterSpacing: '0.14em', textTransform: 'uppercase' }}>Something went wrong</p>
          <h1 style={{ fontSize: 26, margin: '10px 0' }}>We couldn&apos;t open Gapdiff</h1>
          <p style={{ color: '#abb5b0', lineHeight: 1.6 }}>Please try again in a moment.</p>
          <button type="button" onClick={reset} style={{ background: '#b9ff68', border: 0, borderRadius: 7, color: '#101214', cursor: 'pointer', fontSize: 14, marginTop: 12, padding: '10px 16px' }}>Try again</button>
        </main>
      </body>
    </html>
  );
}

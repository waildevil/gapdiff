/**
 * Standings recompute from every match on read (see docs/DESIGN.md) — a page
 * with real history is several DB round trips, not one, so a bare navigation
 * or a post-60s revalidation is worth a real loading state instead of a
 * frozen previous page.
 */
export default function Loading() {
  return (
    <div className="page" style={{ margin: '0 auto' }}>
      <div className="page-head">
        <div className="eyebrow">Loading</div>
        <h1>The gap, as of right now</h1>
      </div>

      <div className="card" style={{ padding: '48px 24px', textAlign: 'center' }}>
        <div
          style={{
            margin: '0 auto',
            width: 180,
            height: 3,
            borderRadius: 2,
            background: 'var(--surface-3)',
            overflow: 'hidden',
          }}
        >
          <div className="loadingBar" />
        </div>
        <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 18 }}>
          Tallying the standings…
        </p>
      </div>
    </div>
  );
}

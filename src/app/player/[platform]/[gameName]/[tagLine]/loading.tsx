/**
 * A profile costs about a dozen Riot calls, which the rate limiter deliberately
 * paces. That takes a couple of seconds, so the wait gets a real state.
 */
export default function Loading() {
  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', padding: '80px 24px', textAlign: 'center' }}>
      <div
        style={{
          fontFamily: 'var(--mono)',
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: '0.16em',
          color: 'var(--faint)',
        }}
      >
        Fetching from Riot
      </div>
      <div
        style={{
          margin: '18px auto 0',
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
        Resolving the account, then scoring the last ten games against their lobbies.
      </p>
    </div>
  );
}

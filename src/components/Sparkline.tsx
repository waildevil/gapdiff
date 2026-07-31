interface SparklineProps {
  /** Performance scores, most recent first. Rendered most recent on the right. */
  values: number[];
  width?: number;
  height?: number;
  /** Must be unique on the page — used for the gradient id. */
  seed: string;
}

export function Sparkline({ values, width = 68, height = 22, seed }: SparklineProps) {
  if (values.length < 2) return <svg width={width} height={height} aria-hidden="true" />;

  const series = [...values].reverse();
  const min = Math.min(...series);
  const max = Math.max(...series);
  const span = Math.max(1, max - min);
  const stepX = width / (series.length - 1);

  const points = series.map((value, index) => {
    const x = index * stepX;
    const y = height - ((value - min) / span) * (height - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const last = points[points.length - 1]!.split(',');
  const area = `M0,${height} L${points.join(' L')} L${width},${height} Z`;
  const gradientId = `spark-${seed}`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Recent form, most recent score ${series[series.length - 1]}`}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--amber)" stopOpacity="0.28" />
          <stop offset="100%" stopColor="var(--amber)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} />
      <polyline
        points={points.join(' ')}
        fill="none"
        stroke="var(--amber)"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={last[0]} cy={last[1]} r="2.4" fill="var(--amber)" />
    </svg>
  );
}

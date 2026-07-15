/**
 * Content Intelligence brand mark — "Constellation".
 *
 * A knowledge graph: one central intelligence node linked to three
 * grounded source nodes. Says "AI built on your knowledge base"
 * without the sparkle cliché.
 *
 *   <Logo />               → gradient badge + white constellation (40px)
 *   <Logo size={56} />     → larger
 *   <Logo variant="mark" />→ just the glyph, inherits currentColor
 */

interface LogoProps {
  size?: number;
  variant?: 'badge' | 'mark';
  radius?: number;
  className?: string;
  style?: React.CSSProperties;
}

const CENTER = { cx: 12, cy: 12, r: 2.8 };
const NODES = [
  { cx: 6.2, cy: 6.6, r: 1.9 },
  { cx: 18.4, cy: 7.6, r: 1.9 },
  { cx: 15.4, cy: 18.4, r: 1.9 },
];

function Constellation({ nodeFill }: { nodeFill: string }) {
  return (
    <>
      <g stroke="currentColor" strokeWidth={1.7} opacity={0.85} strokeLinecap="round">
        {NODES.map((n, i) => (
          <line key={i} x1={CENTER.cx} y1={CENTER.cy} x2={n.cx} y2={n.cy} />
        ))}
      </g>
      <circle cx={CENTER.cx} cy={CENTER.cy} r={CENTER.r} fill={nodeFill} />
      {NODES.map((n, i) => (
        <circle key={i} cx={n.cx} cy={n.cy} r={n.r} fill="currentColor" />
      ))}
    </>
  );
}

export default function Logo({
  size = 40,
  variant = 'badge',
  radius,
  className,
  style,
}: LogoProps) {
  if (variant === 'mark') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="currentColor"
        className={className}
        style={style}
        aria-hidden
      >
        <Constellation nodeFill="currentColor" />
      </svg>
    );
  }

  const r = radius ?? size * 0.28;
  const gid = `ci-node-grad-${size}`;
  const glyph = size - size * 0.22 * 2;

  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        borderRadius: r,
        background: 'linear-gradient(140deg, #8B5CF6 0%, #7C3AED 55%, #6D28D9 100%)',
        boxShadow: `0 ${size * 0.16}px ${size * 0.5}px rgba(124,58,237,0.45)`,
        color: '#ffffff',
        flexShrink: 0,
        ...style,
      }}
      aria-hidden
    >
      <svg width={glyph} height={glyph} viewBox="0 0 24 24">
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="1" stopColor="#EDE9FE" />
          </linearGradient>
        </defs>
        <Constellation nodeFill={`url(#${gid})`} />
      </svg>
    </span>
  );
}

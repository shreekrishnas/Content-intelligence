/**
 * Content Intelligence brand mark.
 *
 * A twin-spark motif (large + small) — the recognizable "intelligence"
 * signal — set on a purple gradient badge. Bold enough to stay crisp
 * from 16px (favicon) up to 64px (login hero).
 *
 *   <Logo />               → gradient badge + white spark (default 40px)
 *   <Logo size={56} />     → larger
 *   <Logo variant="mark" />→ just the spark glyph, inherits currentColor
 */

interface LogoProps {
  size?: number;
  variant?: 'badge' | 'mark';
  radius?: number;
  className?: string;
  style?: React.CSSProperties;
}

// Large spark (concave 4-point star) + small companion spark.
const SPARK_PATH =
  'M9.5 3 C9.5 8.1 11.9 10.5 17 10.5 C11.9 10.5 9.5 12.9 9.5 18 ' +
  'C9.5 12.9 7.1 10.5 2 10.5 C7.1 10.5 9.5 8.1 9.5 3 Z ' +
  'M18 1.7 C18 3.95 19.05 5 21.3 5 C19.05 5 18 6.05 18 8.3 ' +
  'C18 6.05 16.95 5 14.7 5 C16.95 5 18 3.95 18 1.7 Z';

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
        <path d={SPARK_PATH} />
      </svg>
    );
  }

  const r = radius ?? size * 0.28;
  const gid = `ci-logo-grad-${size}`;
  const inset = size * 0.22;
  const glyph = size - inset * 2;

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
        background: `linear-gradient(140deg, #8B5CF6 0%, #7C3AED 55%, #6D28D9 100%)`,
        boxShadow: `0 ${size * 0.16}px ${size * 0.5}px rgba(124,58,237,0.45)`,
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
        <path d={SPARK_PATH} fill={`url(#${gid})`} />
      </svg>
    </span>
  );
}

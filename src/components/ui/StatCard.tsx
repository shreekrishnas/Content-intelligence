import { useEffect, useRef, useState } from 'react';
import { useInView } from 'motion/react';

interface StatCardProps {
  label: string;
  value: string | number;
  color: string;
}

function AnimatedNumber({ target }: { target: number }) {
  const [display, setDisplay] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });

  useEffect(() => {
    if (!inView) return;
    const duration = 900;
    const start = performance.now();
    function tick(now: number) {
      const progress = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(ease * target));
      if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }, [inView, target]);

  return <span ref={ref}>{display}</span>;
}

export default function StatCard({ label, value, color }: StatCardProps) {
  const isNumber = typeof value === 'number';

  return (
    <div
      className="glass-card-static"
      style={{ position: 'relative', overflow: 'hidden' }}
    >
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: 4,
          background: color,
          borderRadius: '4px 0 0 4px',
        }}
      />
      <div style={{ paddingLeft: 12 }}>
        <div className="micro-label">{label}</div>
        <div
          style={{
            fontFamily: "'Fraunces', serif",
            fontSize: 28,
            fontWeight: 600,
            color,
          }}
        >
          {isNumber ? <AnimatedNumber target={value} /> : value}
        </div>
      </div>
    </div>
  );
}

import { motion } from 'motion/react';

interface SkeletonProps {
  height?: number | string;
  width?: number | string;
  radius?: number | string;
  className?: string;
}

export function Skeleton({ height = 20, width = '100%', radius = 8, className = '' }: SkeletonProps) {
  return (
    <div
      className={className}
      style={{
        height,
        width,
        borderRadius: radius,
        background: 'var(--surface-hover)',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      <motion.div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.15) 50%, transparent 100%)',
        }}
        animate={{ x: ['-100%', '100%'] }}
        transition={{ duration: 1.4, ease: 'linear', repeat: Infinity }}
      />
    </div>
  );
}

export function CardSkeleton() {
  return (
    <div className="glass-card-static" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Skeleton height={14} width="60%" />
      <Skeleton height={10} width="90%" />
      <Skeleton height={10} width="75%" />
      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <Skeleton height={24} width={64} radius={999} />
        <Skeleton height={24} width={48} radius={999} />
      </div>
    </div>
  );
}

export function RowSkeleton() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
      <Skeleton height={36} width={36} radius="50%" />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <Skeleton height={12} width="55%" />
        <Skeleton height={10} width="35%" />
      </div>
      <Skeleton height={24} width={72} radius={999} />
    </div>
  );
}

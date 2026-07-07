import type { ReactNode, CSSProperties } from "react";

interface CardProps {
  interactive?: boolean;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}

export default function GlassCard({
  interactive = false,
  className = "",
  style,
  children,
}: CardProps) {
  const base = interactive ? "glass-card" : "glass-card-static";
  const classes = [base, className].filter(Boolean).join(" ");

  return (
    <div className={classes} style={style}>
      {children}
    </div>
  );
}

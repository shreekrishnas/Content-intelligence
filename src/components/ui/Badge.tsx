import type { ReactNode, CSSProperties, MouseEventHandler } from "react";

interface BadgeProps {
  style?: CSSProperties;
  children: ReactNode;
  onClick?: MouseEventHandler<HTMLSpanElement>;
}

export default function Badge({ style, children, onClick }: BadgeProps) {
  return (
    <span className="badge" style={style} onClick={onClick}>
      {children}
    </span>
  );
}

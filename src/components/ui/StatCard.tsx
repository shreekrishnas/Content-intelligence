interface StatCardProps {
  label: string;
  value: string | number;
  color: string;
}

export default function StatCard({ label, value, color }: StatCardProps) {
  return (
    <div className="glass-card-static" style={{ position: "relative", overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 4,
          background: color,
          borderRadius: "4px 0 0 4px",
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
          {value}
        </div>
      </div>
    </div>
  );
}

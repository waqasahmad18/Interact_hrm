export default function EmployeeDashboardLoading() {
  const bar = {
    height: 64,
    borderRadius: 14,
    background: "#e8eaee",
  } as const;
  const card = {
    minHeight: 160,
    borderRadius: 14,
    background: "#e8eaee",
  } as const;

  return (
    <div
      style={{
        maxWidth: 1320,
        margin: "0 auto",
        padding: "6px 24px 28px",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
      aria-busy
      aria-live="polite"
      aria-label="Loading dashboard"
    >
      <div style={bar} />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.15fr 1fr 1fr 0.92fr",
          gap: 12,
        }}
      >
        <div style={{ ...card, minHeight: 240, gridRow: "span 2" }} />
        <div style={card} />
        <div style={card} />
        <div style={card} />
        <div style={card} />
        <div style={card} />
        <div style={card} />
      </div>
    </div>
  );
}

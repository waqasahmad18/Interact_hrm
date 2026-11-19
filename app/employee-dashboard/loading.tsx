export default function EmployeeDashboardLoading() {
  return (
    <div
      style={{
        maxWidth: 1360,
        margin: "0 auto",
        padding: "8px 22px 32px",
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
      aria-busy
      aria-live="polite"
      aria-label="Loading dashboard"
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          gap: 10,
        }}
      >
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            style={{
              height: 78,
              borderRadius: 16,
              background: "linear-gradient(90deg, #eef2f6 0%, #f8fafc 50%, #eef2f6 100%)",
              backgroundSize: "200% 100%",
            }}
          />
        ))}
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.12fr 1fr 1fr 0.95fr",
          gap: 14,
        }}
      >
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            style={{
              minHeight: i === 0 ? 260 : 180,
              gridColumn: i === 0 ? "span 1" : undefined,
              borderRadius: 18,
              background: "linear-gradient(90deg, #eef2f6 0%, #f8fafc 50%, #eef2f6 100%)",
              backgroundSize: "200% 100%",
            }}
          />
        ))}
      </div>
    </div>
  );
}

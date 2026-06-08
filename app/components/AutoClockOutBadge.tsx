export function AutoClockOutBadge({
  title = "Auto clock out — employee forgot to clock out",
}: {
  title?: string;
}) {
  return (
    <span
      title={title}
      aria-label={title}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        marginLeft: 6,
        minWidth: 18,
        height: 18,
        padding: "0 4px",
        borderRadius: 4,
        background: "#27ae60",
        color: "#fff",
        fontSize: "0.68rem",
        fontWeight: 800,
        lineHeight: 1,
        verticalAlign: "middle",
        boxShadow: "0 1px 3px rgba(39,174,96,0.35)",
      }}
    >
      A
    </span>
  );
}

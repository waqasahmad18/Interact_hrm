"use client";
import React from "react";
import { useRouter } from "next/navigation";
import LayoutDashboard from "../layout-dashboard";
import styles from "./dashboard.module.css";

const stats = [
  { label: "Employees", value: "120", badge: "+6 this week" },
  { label: "Attendance", value: "92%", badge: "Stable" },
  { label: "Open Roles", value: "3", badge: "Hiring" },
];

const quickLinks = [
  { label: "Add Employee", action: "/add-employee" },
  { label: "Leave Requests", action: "/leave" },
  { label: "Recruitment", action: "/recruitment" },
];

const recruitment = [
  "Software Engineer — 2 candidates",
  "HR Manager — 1 candidate",
  "Accountant — 1 candidate",
];

const announcements = [
  "New HR policies are live.",
  "Company townhall on Dec 22.",
];

const birthdays = ["Sara Khan — Dec 25", "Ibad ur Rahman — Jan 3"];

type Leave = {
  id: number;
  employee_name: string;
  leave_category: string;
  status: string;
  start_date: string;
  end_date: string;
  requested_at?: string;
};

export default function DashboardPage() {
  const router = useRouter();
  const [leaves, setLeaves] = React.useState<Leave[]>([]);
  const [loadingLeaves, setLoadingLeaves] = React.useState(false);
  const [pulseIds, setPulseIds] = React.useState<number[]>([]);
  const leavesRef = React.useRef<Leave[]>([]);
  const timerRef = React.useRef<number | null>(null);

  const pendingLeaves = React.useMemo(() => leaves.filter((l) => (l.status || "").toLowerCase() === "pending"), [leaves]);

  const formatDate = React.useCallback((value: string) => {
    if (!value) return "";
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString();
  }, []);

  const fetchLeaves = React.useCallback(async () => {
    try {
      setLoadingLeaves(true);
      const res = await fetch("/api/leaves", { cache: "no-store" });
      const data = await res.json();
      if (data?.success) {
        const next: Leave[] = data.leaves || [];
        const prevIds = new Set(leavesRef.current.map((l) => l.id));
        const newOnes = next.filter((l) => !prevIds.has(l.id)).map((l) => l.id);
        setLeaves(next);
        leavesRef.current = next;
        if (newOnes.length) {
          setPulseIds(newOnes);
          if (timerRef.current) window.clearTimeout(timerRef.current);
          timerRef.current = window.setTimeout(() => setPulseIds([]), 3500);
        }
      }
    } catch (err) {
      console.error("leaves fetch", err);
    } finally {
      setLoadingLeaves(false);
    }
  }, []);

  React.useEffect(() => {
    fetchLeaves();
    if (typeof window === "undefined") return;
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${protocol}://${window.location.host}/api/ws`);
    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data.toString());
        if (msg?.type === "leave_update") fetchLeaves();
      } catch (_) {
        // ignore malformed
      }
    };
    return () => {
      ws.close();
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [fetchLeaves]);

  return (
    <LayoutDashboard>
      <div className={styles.page}>
        <section className={styles.hero}>
          <div className={styles.heroText}>
            <span className={styles.heroBadge}>Admin overview</span>
            <h1 className={styles.heroTitle}>Welcome back, Admin</h1>
            <p className={styles.heroSubtitle}>
              Keep an eye on hiring, attendance, and employee engagement in one place.
            </p>
            <div className={styles.heroActions}>
              <button className={styles.primaryButton} onClick={() => router.push("/add-employee")}>Add employee</button>
              <button className={styles.ghostButton} onClick={() => router.push("/admin/events")}>View events</button>
            </div>
          </div>
          <div className={styles.heroStats}>
            {stats.map((item) => (
              <div key={item.label} className={styles.heroStat}>
                <div className={styles.heroStatValue}>{item.value}</div>
                <div className={styles.heroStatLabel}>{item.label}</div>
                <span className={styles.heroStatBadge}>{item.badge}</span>
              </div>
            ))}
          </div>
        </section>

        <section className={styles.grid}>
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <h2 className={styles.cardTitle}>Quick actions</h2>
            </div>
            <div className={styles.quickActions}>
              {quickLinks.map((item) => (
                <button key={item.label} className={styles.quickChip} onClick={() => router.push(item.action)}>
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <h2 className={styles.cardTitle}>Employee snapshot</h2>
              <span className={styles.pill}>Live</span>
            </div>
            <div className={styles.metricsRow}>
              <div className={styles.metricBlock}>
                <div className={styles.metricValue}>110</div>
                <div className={styles.metricLabel}>Active</div>
              </div>
              <div className={styles.metricBlock}>
                <div className={styles.metricValue}>7</div>
                <div className={styles.metricLabel}>On leave</div>
              </div>
              <div className={styles.metricBlock}>
                <div className={styles.metricValue}>3</div>
                <div className={styles.metricLabel}>Probation</div>
              </div>
            </div>
          </div>

          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <h2 className={styles.cardTitle}>Recruitment</h2>
              <span className={styles.pill}>3 open</span>
            </div>
            <ul className={`${styles.list} ${styles.listScrollable}`} style={{ minHeight: 220 }}>
              {recruitment.map((item) => (
                <li key={item} className={styles.listItem}>{item}</li>
              ))}
            </ul>
          </div>

          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <h2 className={styles.cardTitle}>Attendance</h2>
              <span className={styles.pill}>Today</span>
            </div>
            <div className={styles.metricsRow}>
              <div className={styles.metricBlock}>
                <div className={styles.metricValue}>92%</div>
                <div className={styles.metricLabel}>Clocked in</div>
              </div>
              <div className={styles.metricBlock}>
                <div className={styles.metricValue}>09:02</div>
                <div className={styles.metricLabel}>Avg. check-in</div>
              </div>
              <div className={styles.metricBlock}>
                <div className={styles.metricValue}>7h 45m</div>
                <div className={styles.metricLabel}>Avg. hours</div>
              </div>
            </div>
          </div>

          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <h2 className={styles.cardTitle}>Leave requests</h2>
              <span className={styles.pill}>{loadingLeaves ? "Loading" : "Live"}</span>
            </div>
            <ul className={`${styles.list} ${styles.listScrollable}`} style={{ minHeight: 220 }}>
              {pendingLeaves.length === 0 && (
                <li className={styles.listItem} onClick={() => router.push("/leave")}>
                  <div className={styles.listItemTitle}>No new leave requests</div>
                  <div className={styles.listItemMeta}>Tap to view leave page</div>
                </li>
              )}
              {pendingLeaves.slice(0, 1).map((leave) => {
                const isNew = pulseIds.includes(leave.id);
                return (
                  <li
                    key={leave.id}
                    className={`${styles.listItem} ${isNew ? styles.listItemNew : ""}`}
                    onClick={() => router.push("/leave")}
                  >
                    <div className={styles.listItemTop}>
                      <span className={styles.listItemTitle}>{leave.employee_name || "Employee"}</span>
                      <span className={styles.badge}>Pending</span>
                    </div>
                    <div className={styles.listItemMeta}>
                      {leave.leave_category} • {formatDate(leave.start_date)} → {formatDate(leave.end_date)}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <h2 className={styles.cardTitle}>Upcoming birthdays</h2>
            </div>
            <ul className={`${styles.list} ${styles.listScrollable}`} style={{ minHeight: 220 }}>
              {birthdays.map((item) => (
                <li key={item} className={styles.listItem}>{item}</li>
              ))}
            </ul>
          </div>

          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <h2 className={styles.cardTitle}>Announcements</h2>
            </div>
            <ul className={`${styles.list} ${styles.listScrollable}`} style={{ minHeight: 220 }}>
              {announcements.map((item) => (
                <li key={item} className={styles.listItem}>{item}</li>
              ))}
            </ul>
          </div>
        </section>
      </div>
    </LayoutDashboard>
  );
}

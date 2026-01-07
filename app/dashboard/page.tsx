"use client";
import React from "react";
import { useRouter } from "next/navigation";
import LayoutDashboard from "../layout-dashboard";
import styles from "./dashboard.module.css";

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
  const [stats, setStats] = React.useState([
    { label: "Employees", value: "0", badge: "+0 this week" },
    { label: "Attendance", value: "0%", badge: "Today" },
    { label: "Open Roles", value: "3", badge: "Hiring" },
  ]);
  const [weeklyAttendance, setWeeklyAttendance] = React.useState("0%");
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

  // Fetch employee count
  const fetchEmployeeCount = React.useCallback(async () => {
    try {
      const res = await fetch("/api/employee-list", { cache: "no-store" });
      const data = await res.json();
      if (data?.success && data.employees) {
        const employeeCount = data.employees.length;
        setStats(prev => [
          { label: "Employees", value: employeeCount.toString(), badge: "+0 this week" },
          prev[1],
          prev[2],
        ]);
      }
    } catch (err) {
      console.error("employee count fetch", err);
    }
  }, []);

  // Calculate today's attendance percentage
  const fetchTodayAttendance = React.useCallback(async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      
      // Get total employees
      const empRes = await fetch("/api/employee-list", { cache: "no-store" });
      const empData = await empRes.json();
      const totalEmployees = empData.success && empData.employees ? empData.employees.length : 0;
      
      if (totalEmployees === 0) {
        setStats(prev => [
          prev[0],
          { label: "Attendance", value: "0%", badge: "Today" },
          prev[2],
        ]);
        return;
      }
      
      // Get today's attendance (employees with clock_in today)
      const attRes = await fetch(`/api/attendance?date=${today}`, { cache: "no-store" });
      const attData = await attRes.json();
      const todayClockIns = attData.success && attData.attendance ? 
        attData.attendance.filter((a: any) => a.clock_in).length : 0;
      
      const attendancePercentage = Math.round((todayClockIns / totalEmployees) * 100);
      
      setStats(prev => [
        prev[0],
        { label: "Attendance", value: `${attendancePercentage}%`, badge: "Today" },
        prev[2],
      ]);
    } catch (err) {
      console.error("today attendance fetch", err);
    }
  }, []);

  // Calculate weekly attendance (Mon-Fri of last week, excluding Sat-Sun)
  const fetchWeeklyAttendance = React.useCallback(async () => {
    try {
      // Get last Monday to Friday (5 working days)
      const today = new Date();
      const dayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday, etc.
      
      // Calculate last Friday
      let lastFriday = new Date(today);
      if (dayOfWeek === 0) {
        // If today is Sunday, go back to Friday (2 days)
        lastFriday.setDate(today.getDate() - 2);
      } else if (dayOfWeek === 1) {
        // If today is Monday, go back to Friday of previous week (3 days)
        lastFriday.setDate(today.getDate() - 3);
      } else {
        // Otherwise, go back to Friday of current week
        lastFriday.setDate(today.getDate() - (dayOfWeek - 5));
      }
      
      // Calculate last Monday (5 days before Friday)
      const lastMonday = new Date(lastFriday);
      lastMonday.setDate(lastFriday.getDate() - 4);
      
      const fromDate = lastMonday.toISOString().split('T')[0];
      const toDate = lastFriday.toISOString().split('T')[0];
      
      // Get total employees
      const empRes = await fetch("/api/employee-list", { cache: "no-store" });
      const empData = empRes.json();
      const totalEmployees = (await empData).success && (await empData).employees ? 
        (await empData).employees.length : 0;
      
      if (totalEmployees === 0) {
        setWeeklyAttendance("0%");
        return;
      }
      
      // Get attendance for the week
      const attRes = await fetch(`/api/attendance?fromDate=${fromDate}&toDate=${toDate}`, { 
        cache: "no-store" 
      });
      const attData = await attRes.json();
      const weeklyRecords = attData.success && attData.attendance ? attData.attendance : [];
      
      // Count unique employees who clocked in during the week
      const uniqueEmployees = new Set(
        weeklyRecords.filter((a: any) => a.clock_in).map((a: any) => a.employee_id)
      ).size;
      
      // Calculate 5 working days average
      const weeklyPercentage = Math.round((uniqueEmployees / totalEmployees) * 100);
      setWeeklyAttendance(`${weeklyPercentage}%`);
    } catch (err) {
      console.error("weekly attendance fetch", err);
    }
  }, []);

  React.useEffect(() => {
    fetchLeaves();
    fetchEmployeeCount();
    fetchTodayAttendance();
    fetchWeeklyAttendance();
    
    // Refresh attendance every 30 seconds for real-time updates
    const attendanceInterval = setInterval(() => {
      fetchTodayAttendance();
      fetchWeeklyAttendance();
    }, 30000);
    
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
      clearInterval(attendanceInterval);
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [fetchLeaves, fetchEmployeeCount, fetchTodayAttendance, fetchWeeklyAttendance]);

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
              <span className={styles.pill}>Live</span>
            </div>
            <div className={styles.metricsRow}>
              <div className={styles.metricBlock}>
                <div className={styles.metricValue}>{stats[1].value}</div>
                <div className={styles.metricLabel}>Today</div>
              </div>
              <div className={styles.metricBlock}>
                <div className={styles.metricValue}>{weeklyAttendance}</div>
                <div className={styles.metricLabel}>Past Week</div>
              </div>
              <div className={styles.metricBlock}>
                <div className={styles.metricValue}>09:02</div>
                <div className={styles.metricLabel}>Avg. check-in</div>
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

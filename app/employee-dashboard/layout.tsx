"use client";
import React from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { FaTachometerAlt, FaClock, FaCalendarAlt, FaCoffee, FaUser } from "react-icons/fa";
import styles from "../layout-dashboard.module.css";
import { ClockBreakPrayerWidget } from "../components/ClockBreakPrayer";
import { TardyNoteWidget } from "../components/TardyNoteWidget";

const employeeTabs = [
  { name: "Dashboard", path: "/employee-dashboard", icon: <FaTachometerAlt /> },
  { name: "My Info", path: "/employee-dashboard/my-info", icon: <FaUser /> },
  { name: "Time", path: "/employee-dashboard/time", icon: <FaClock /> },
  { name: "Leave", path: "/employee-dashboard/leave", icon: <FaCalendarAlt /> }
];

/** Routes where the clock/break widget stays mounted so Dashboard ↔ Time switches
 *  do not tear down timers, face-model preload, or attendance sync state. */
const CLOCK_WIDGET_PATHS = new Set(["/employee-dashboard", "/employee-dashboard/time"]);

export default function EmployeeDashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [employeeName, setEmployeeName] = React.useState<string>("");
  const [employeeId, setEmployeeId] = React.useState<string>("");
  const showClockBar = pathname != null && CLOCK_WIDGET_PATHS.has(pathname);
  const isDashboardHome = pathname === "/employee-dashboard";

  const quickActionStyle: React.CSSProperties = {
    border: "none",
    borderRadius: 14,
    padding: "12px 16px",
    fontSize: "0.9rem",
    fontWeight: 700,
    color: "#0f1d40",
    cursor: "pointer",
    background: "#f7fafc",
    boxShadow: "0 8px 24px rgba(15,29,64,0.12)",
  };

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const loginId = localStorage.getItem("loginId");
    if (!loginId) {
      window.location.href = "/auth";
      return;
    }

    const cachedId = localStorage.getItem("employeeId");
    const cachedName = localStorage.getItem("employeeName");
    if (cachedId) setEmployeeId(cachedId);
    else setEmployeeId(loginId);
    if (cachedName) setEmployeeName(cachedName);

    let apiUrl = "/api/hrm_employees?";
    if (loginId.includes("@")) {
      apiUrl += `email=${loginId}`;
    } else {
      apiUrl += `username=${loginId}`;
    }
    Promise.all([
      fetch(apiUrl).then(res => res.json()).catch(() => ({ success: false })),
      fetch(`/api/hrm_employees?employeeId=${loginId}`).then(res => res.json()).catch(() => ({ success: false }))
    ]).then(([data1, data2]) => {
      const data = data1.success ? data1 : data2;
      if (data.success && data.employee) {
        const name = (data.employee.first_name || "") + (data.employee.last_name ? " " + data.employee.last_name : "");
        const trimmedName = name.trim() || "Employee";
        const empId = String(data.employee.id || data.employee.employee_id || loginId);
        setEmployeeName(trimmedName);
        setEmployeeId(empId);
        localStorage.setItem("employeeId", empId);
        localStorage.setItem("employeeName", trimmedName);
      } else {
        setEmployeeName("Employee");
      }
    }).catch(() => {
      setEmployeeName("Employee");
    });
  }, []);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) {
      window.addEventListener("mousedown", handleClickOutside);
      return () => window.removeEventListener("mousedown", handleClickOutside);
    }
  }, [menuOpen]);

  return (
    <>
      <div className={styles.topBar}>
        <div className={styles.topBarLeft}>
          <span className={styles.sidebarTitle}>Interact Global</span>
          <span className={styles.sidebarMenuIcon}>&#9776;</span>
        </div>
        <div className={styles.topBarRight}>
          <div className={styles.topBarProfile}>
            {/* If user image exists, show image, else show initials */}
            {false ? (
              <span className={styles.topBarProfilePic} style={{backgroundImage: "url('https://ui-avatars.com/api/?name=" + employeeName + "')"}}></span>
            ) : (
              <span className={styles.topBarProfileInitials}>{employeeName ? employeeName[0] : "E"}</span>
            )}
            <span className={styles.topBarProfileName}>{employeeName || "Employee"}</span>
            <div className={styles.profileMenuWrapper} ref={menuRef}>
              <button
                className={styles.profileMenuButton}
                onClick={() => setMenuOpen((open) => !open)}
                aria-label="Open menu"
              >
                <span style={{ fontSize: "1.7rem", color: "#fff" }}>⋮</span>
              </button>
              {menuOpen && (
                <div className={styles.profileMenuDropdown}>
                  <button
                    className={styles.logoutButton}
                    onClick={() => {
                      if (typeof window !== "undefined") {
                        localStorage.removeItem("loginId");
                      }
                      router.push("/auth");
                    }}
                  >
                    Logout
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      <div className={styles.layout}>
        <aside className={styles.sidebar}>
          <nav className={styles.nav}>
            {employeeTabs.map((tab, idx) => {
              const isActive = pathname === tab.path;
              return (
                <Link
                  key={tab.path || idx}
                  href={tab.path}
                  prefetch
                  className={isActive ? `${styles.navItem} ${styles.navItemActive}` : styles.navItem}
                >
                  <span className={styles.navIcon}>{tab.icon}</span>
                  <span>{tab.name}</span>
                </Link>
              );
            })}
          </nav>
        </aside>
        <div className={styles.contentArea}>
          {isDashboardHome ? (
            <div
              style={{
                background: "linear-gradient(135deg, #0f1d40 0%, #122b66 40%, #1853b3 100%)",
                color: "#e8f0ff",
                padding: "28px 32px 24px",
                boxShadow: "0 20px 60px rgba(8, 25, 66, 0.35)",
                width: "100%",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontSize: "0.95rem", opacity: 0.85 }}>Welcome back</div>
                  <div style={{ fontSize: "1.7rem", fontWeight: 700, marginTop: 6 }}>{employeeName || "Your dashboard"}</div>
                  <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <span style={{ background: "rgba(255,255,255,0.08)", borderRadius: 12, padding: "10px 14px", fontSize: "0.92rem", color: "#dbe7ff", border: "1px solid rgba(255,255,255,0.12)", display: "inline-flex", alignItems: "center", gap: 8 }}>
                      Small daily efforts compound into big wins. Keep going.
                    </span>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <Link href="/employee-dashboard/time" prefetch style={{ ...quickActionStyle, background: "linear-gradient(120deg, #8bf3ff, #5b9bff)", color: "#0b1b40", textDecoration: "none" }}>Time & Attendance</Link>
                  <Link href="/employee-dashboard/leave" prefetch style={{ ...quickActionStyle, background: "linear-gradient(120deg, #ffd89b, #f7b733)", color: "#3d2600", textDecoration: "none" }}>Leave Center</Link>
                </div>
              </div>
            </div>
          ) : null}
          {showClockBar && employeeId ? (
            <div
              style={{
                padding: "16px 20px",
                background: "linear-gradient(135deg, #0f1d40 0%, #122b66 40%, #1853b3 100%)",
              }}
            >
              <ClockBreakPrayerWidget employeeId={employeeId} employeeName={employeeName || "Employee"} />
              <TardyNoteWidget employeeId={employeeId} />
            </div>
          ) : null}
          <main className={styles.main}>{children}</main>
        </div>
      </div>
    </>
  );
}

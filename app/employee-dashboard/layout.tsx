"use client";
import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FaTachometerAlt, FaClock, FaUser, FaUsers, FaTicketAlt } from "react-icons/fa";
import styles from "../layout-dashboard.module.css";
import empStyles from "./emp-shell.module.css";
import { ClockBreakPrayerWidget } from "../components/ClockBreakPrayer";
import { TardyNoteWidget } from "../components/TardyNoteWidget";
import { ShellImageUpload } from "../components/ShellImageUpload";
import {
  fetchShellBranding,
  removeCompanyLogo,
  removeEmployeeAvatar,
  saveCompanyLogo,
  saveEmployeeAvatar,
} from "../shell-branding-api";
import { fetchEmployeeHierarchy, type HierarchyPerson } from "../employee-hierarchy-api";
import { EmployeeAvatar } from "../components/EmployeeAvatar";
import { EmployeeProfileMenu } from "./components/EmployeeProfileMenu";
import { toastError } from "@/lib/app-toast";

function greetingLabel() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

const employeeTabs = [
  { name: "Dashboard", path: "/employee-dashboard", icon: <FaTachometerAlt /> },
  { name: "My Team", path: "/employee-dashboard/my-team", icon: <FaUsers /> },
  { name: "My Info", path: "/employee-dashboard/my-info", icon: <FaUser /> },
  { name: "Time", path: "/employee-dashboard/time", icon: <FaClock /> },
  { name: "Generate Ticket", path: "/employee-dashboard/generate-ticket", icon: <FaTicketAlt /> },
];

/** Routes where the clock/break widget stays mounted so Dashboard ↔ Time switches
 *  do not tear down timers, face-model preload, or attendance sync state. */
const CLOCK_WIDGET_PATHS = new Set(["/employee-dashboard", "/employee-dashboard/time"]);

export default function EmployeeDashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [employeeName, setEmployeeName] = React.useState<string>("");
  const [employeeId, setEmployeeId] = React.useState<string>("");
  const showClockBar = pathname != null && CLOCK_WIDGET_PATHS.has(pathname);
  const isDashboardHome = pathname === "/employee-dashboard";

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
  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const [companyLogo, setCompanyLogo] = React.useState<string | null>(null);
  const [employeeAvatar, setEmployeeAvatar] = React.useState<string | null>(null);
  const [reportsTo, setReportsTo] = React.useState<HierarchyPerson | null>(null);
  React.useEffect(() => {
    void fetchShellBranding()
      .then((branding) => {
        setCompanyLogo(branding.companyLogo);
        if (employeeId) {
          setEmployeeAvatar(branding.employeeAvatars[employeeId] ?? null);
        }
      })
      .catch(() => {
        /* keep placeholder */
      });
  }, [employeeId]);

  React.useEffect(() => {
    if (!employeeId || !isDashboardHome) return;
    void fetchEmployeeHierarchy(employeeId)
      .then((data) => setReportsTo(data?.reportsTo ?? null))
      .catch(() => setReportsTo(null));
  }, [employeeId, isDashboardHome]);

  React.useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  return (
    <>
      <div className={styles.topBar}>
        <div className={styles.topBarSidebarSlot}>
          <span
            className={styles.sidebarMenuIcon}
            role="button"
            tabIndex={0}
            aria-label="Toggle menu"
            onClick={() => setSidebarOpen((open) => !open)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") setSidebarOpen((open) => !open);
            }}
          >
            &#9776;
          </span>
          <div className={styles.topBarBrandGroup}>
            <ShellImageUpload
              variant="logo"
              image={companyLogo}
              title="Upload company logo"
              onImage={(dataUrl) => {
                const prev = companyLogo;
                setCompanyLogo(dataUrl);
                void saveCompanyLogo(dataUrl).catch(() => {
                  setCompanyLogo(prev);
                  toastError("Could not save company logo.");
                });
              }}
              onRemove={() => {
                const prev = companyLogo;
                setCompanyLogo(null);
                void removeCompanyLogo().catch(() => {
                  setCompanyLogo(prev);
                  toastError("Could not remove company logo.");
                });
              }}
            />
          </div>
        </div>
        <div className={styles.topBarMain}>
        <div className={styles.topBarRight}>
          <div className={styles.topBarProfile}>
            <ShellImageUpload
              variant="avatar"
              image={employeeAvatar}
              fallbackInitial={employeeName || "E"}
              title="Upload profile photo"
              onImage={(dataUrl) => {
                if (!employeeId) return;
                const prev = employeeAvatar;
                setEmployeeAvatar(dataUrl);
                void saveEmployeeAvatar(employeeId, dataUrl).catch(() => {
                  setEmployeeAvatar(prev);
                  toastError("Could not save profile photo.");
                });
              }}
              onRemove={() => {
                if (!employeeId) return;
                const prev = employeeAvatar;
                setEmployeeAvatar(null);
                void removeEmployeeAvatar(employeeId).catch(() => {
                  setEmployeeAvatar(prev);
                  toastError("Could not remove profile photo.");
                });
              }}
            />
            <span className={styles.topBarProfileName}>{employeeName || "Employee"}</span>
            <EmployeeProfileMenu
              employeeId={employeeId}
              onAvatarUpdated={(dataUrl) => setEmployeeAvatar(dataUrl)}
            />
          </div>
        </div>
        </div>
      </div>
      <div className={styles.layout}>
        {sidebarOpen && (
          <div
            className={styles.sidebarOverlay}
            onClick={() => setSidebarOpen(false)}
            aria-hidden
          />
        )}
        <aside className={`${styles.sidebar} ${sidebarOpen ? styles.sidebarOpen : ""}`}>
          <nav className={`${styles.nav} ${styles.navEmployee}`}>
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
            <div className={empStyles.heroStrip}>
              <div className={empStyles.heroStripInner}>
                <header className={empStyles.hero}>
                  <div className={empStyles.heroMain}>
                    <p className={empStyles.heroKicker}>{greetingLabel()}</p>
                    <h1 className={empStyles.heroTitle}>{employeeName || "Employee"} test</h1>
                    <span className={empStyles.heroDate}>
                      {new Date().toLocaleDateString("en-US", {
                        weekday: "long",
                        month: "long",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>
                  </div>
                  {reportsTo ? (
                    <div className={empStyles.heroManager}>
                      <EmployeeAvatar
                        name={reportsTo.name}
                        initials={reportsTo.initials}
                        photo={reportsTo.photo}
                        size="md"
                      />
                      <div>
                        <div className={empStyles.heroManagerLabel}>Reports to</div>
                        <div className={empStyles.heroManagerName}>{reportsTo.name}</div>
                        <div className={empStyles.heroManagerRole}>
                          {reportsTo.role}
                          {reportsTo.jobTitle ? ` · ${reportsTo.jobTitle}` : ""}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </header>
              </div>
            </div>
          ) : null}
          {showClockBar && employeeId ? (
            <div className={empStyles.attendanceDock}>
              <div className={empStyles.attendanceDockInner}>
                <div className={empStyles.dockCard}>
                  {isDashboardHome ? (
                    <div className={empStyles.dockHeader}>
                      <span className={empStyles.dockTitle}>Today&apos;s shift</span>
                      <span className={empStyles.dockSub}>Clock in, breaks &amp; prayer</span>
                    </div>
                  ) : (
                    <div className={empStyles.dockHeader}>
                      <span className={empStyles.dockTitle}>Time &amp; attendance</span>
                    </div>
                  )}
                  <ClockBreakPrayerWidget
                    employeeId={employeeId}
                    employeeName={employeeName || "Employee"}
                    variant="slack"
                  />
                  <TardyNoteWidget employeeId={employeeId} variant="slack" />
                </div>
              </div>
            </div>
          ) : null}
          <main className={`${styles.main} ${empStyles.employeeMain}`}>{children}</main>
        </div>
      </div>
    </>
  );
}

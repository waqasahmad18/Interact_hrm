"use client";
import React from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { EmployeeShellProvider, markEmployeePortal } from "@/lib/access-control/employee-shell";
import {
  FaTachometerAlt,
  FaUser,
  FaUsers,
  FaSearch,
  FaTicketAlt,
  FaClipboardList,
  FaCalendarAlt,
  FaDollarSign,
  FaCog,
  FaCoffee,
  FaFileAlt,
  FaEdit,
} from "react-icons/fa";
import styles from "../layout-dashboard.module.css";
import empStyles from "./emp-shell.module.css";
import { fetchShellBranding } from "../shell-branding-api";
import { EmployeeAvatar } from "../components/EmployeeAvatar";
import { EmployeeProfileMenu } from "./components/EmployeeProfileMenu";
import { InteractGlobeLogo } from "./components/InteractGlobeLogo";

/** Heavy clock/biometric UI — load only when dashboard home needs it. */
const ClockBreakPrayerWidget = dynamic(
  () =>
    import("../components/ClockBreakPrayer").then((m) => m.ClockBreakPrayerWidget),
  { ssr: false }
);

function greetingLabel() {
  return "Welcome Back";
}

function formatHeroDateTime() {
  const d = new Date();
  const date = d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const time = d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
  return `${date} | ${time}`;
}

/** Isolated so typing does not re-render ClockBreakPrayer / dashboard children. */
function HeroSearch() {
  const [searchQuery, setSearchQuery] = React.useState("");
  return (
    <label className={empStyles.heroSearch}>
      <FaSearch className={empStyles.heroSearchIcon} aria-hidden />
      <input
        type="search"
        className={empStyles.heroSearchInput}
        placeholder="Search"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        aria-label="Search"
      />
    </label>
  );
}

type NavTab = { name: string; path: string; icon: React.ReactNode };

const BASE_EMPLOYEE_TABS: NavTab[] = [
  { name: "Employee Dashboard", path: "/employee-dashboard", icon: <FaTachometerAlt /> },
  { name: "My Info", path: "/employee-dashboard/my-info", icon: <FaUser /> },
  { name: "Generate Ticket", path: "/employee-dashboard/generate-ticket", icon: <FaTicketAlt /> },
];

function iconForPath(path: string, name: string): React.ReactNode {
  if (path.includes("my-team") || name.includes("Team")) return <FaUsers />;
  if (path.includes("leave") || name.includes("Leave")) return <FaCalendarAlt />;
  if (path.includes("break")) return <FaCoffee />;
  if (
    path.includes("payroll") ||
    path.includes("commission") ||
    path.includes("advance") ||
    path.includes("loan")
  ) {
    return <FaDollarSign />;
  }
  if (path.includes("system-control")) return <FaCog />;
  if (path.includes("manage-")) return <FaEdit />;
  if (path.includes("monthly")) return <FaFileAlt />;
  return <FaClipboardList />;
}

const PREFETCH_PATHS = [
  "/employee-dashboard",
  "/employee-dashboard/my-team",
  "/employee-dashboard/my-info",
  "/employee-dashboard/generate-ticket",
  "/employee-dashboard/time",
  "/employee-dashboard/attendance",
  "/employee-dashboard/leave",
];

export default function EmployeeDashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [employeeName, setEmployeeName] = React.useState<string>("");
  const [employeeId, setEmployeeId] = React.useState<string>("");
  const [heroDateTime, setHeroDateTime] = React.useState(formatHeroDateTime);
  const isDashboardHome = pathname === "/employee-dashboard";
  const [todayStatusRoot, setTodayStatusRoot] = React.useState<HTMLElement | null>(null);
  const [accessTabs, setAccessTabs] = React.useState<NavTab[]>([]);

  React.useEffect(() => {
    const id = window.setInterval(() => setHeroDateTime(formatHeroDateTime()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  React.useEffect(() => {
    for (const path of PREFETCH_PATHS) {
      try {
        router.prefetch(path);
      } catch {
        /* ignore */
      }
    }
  }, [router]);

  React.useLayoutEffect(() => {
    if (!isDashboardHome) {
      setTodayStatusRoot(null);
      return;
    }
    let cancelled = false;
    const sync = () => {
      if (cancelled) return;
      const el = document.getElementById("emp-today-status-root");
      if (el) setTodayStatusRoot((prev) => (prev === el ? prev : el));
    };
    sync();
    const obs = new MutationObserver(sync);
    obs.observe(document.body, { childList: true, subtree: true });
    return () => {
      cancelled = true;
      obs.disconnect();
    };
  }, [isDashboardHome]);

  React.useLayoutEffect(() => {
    const loginId = localStorage.getItem("loginId");
    if (!loginId) {
      window.location.href = "/auth";
      return;
    }
    const cachedId = localStorage.getItem("employeeId");
    const cachedName = localStorage.getItem("employeeName");
    setEmployeeId(cachedId || loginId);
    if (cachedName) setEmployeeName(cachedName);
  }, []);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const loginId = localStorage.getItem("loginId");
    if (!loginId) return;

    let apiUrl = "/api/hrm_employees?";
    if (loginId.includes("@")) {
      apiUrl += `email=${loginId}`;
    } else {
      apiUrl += `username=${loginId}`;
    }
    Promise.all([
      fetch(apiUrl).then((res) => res.json()).catch(() => ({ success: false })),
      fetch(`/api/hrm_employees?employeeId=${loginId}`)
        .then((res) => res.json())
        .catch(() => ({ success: false })),
    ])
      .then(([data1, data2]) => {
        const data = data1.success ? data1 : data2;
        if (data.success && data.employee) {
          const name =
            (data.employee.first_name || "") +
            (data.employee.last_name ? " " + data.employee.last_name : "");
          const trimmedName = name.trim() || "Employee";
          const empId = String(data.employee.id || data.employee.employee_id || loginId);
          setEmployeeName(trimmedName);
          setEmployeeId(empId);
          markEmployeePortal(empId, trimmedName);
        } else {
          setEmployeeName((prev) => prev || "Employee");
        }
      })
      .catch(() => {
        setEmployeeName((prev) => prev || "Employee");
      });
  }, []);

  // System Control permissions → extra sidebar links for this employee.
  React.useEffect(() => {
    if (!employeeId || !/^\d+$/.test(employeeId)) {
      setAccessTabs([]);
      return;
    }
    let cancelled = false;
    fetch(`/api/access-control/me?employeeId=${encodeURIComponent(employeeId)}`, {
      cache: "no-store",
    })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled || !data?.success) return;
        const menu = Array.isArray(data.menu) ? data.menu : [];
        const basePaths = new Set(BASE_EMPLOYEE_TABS.map((t) => t.path));
        const tabs: NavTab[] = [];
        for (const item of menu) {
          const path = String(item.path || "");
          const name = String(item.name || "");
          if (!path || !name || basePaths.has(path)) continue;
          if (tabs.some((t) => t.path === path)) continue;
          tabs.push({ name, path, icon: iconForPath(path, name) });
          try {
            router.prefetch(path);
          } catch {
            /* ignore */
          }
        }
        setAccessTabs(tabs);
        try {
          localStorage.setItem(
            "accessPermissions",
            JSON.stringify(Array.isArray(data.permissions) ? data.permissions : []),
          );
          localStorage.setItem("accessRoleSlug", String(data.role?.slug || ""));
        } catch {
          /* ignore */
        }
      })
      .catch(() => {
        if (!cancelled) setAccessTabs([]);
      });
    return () => {
      cancelled = true;
    };
  }, [employeeId, router]);

  const employeeTabs = React.useMemo(() => {
    const team = accessTabs.filter((t) => t.path === "/employee-dashboard/my-team");
    const rest = accessTabs.filter((t) => t.path !== "/employee-dashboard/my-team");
    const [home, ...tail] = BASE_EMPLOYEE_TABS;
    return [home, ...team, ...tail, ...rest];
  }, [accessTabs]);

  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const [employeeAvatar, setEmployeeAvatar] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!employeeId) return;
    let idleId: number | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;
    const load = () => {
      if (cancelled) return;
      void fetchShellBranding()
        .then((branding) => {
          if (!cancelled) setEmployeeAvatar(branding.employeeAvatars[employeeId] ?? null);
        })
        .catch(() => {
          /* keep placeholder */
        });
    };
    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      idleId = window.requestIdleCallback(load, { timeout: 2500 });
    } else {
      timeoutId = setTimeout(load, 400);
    }
    return () => {
      cancelled = true;
      if (idleId !== undefined && typeof window !== "undefined" && "cancelIdleCallback" in window) {
        window.cancelIdleCallback(idleId);
      }
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [employeeId]);

  React.useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  const initials = (employeeName || "E")
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const clockWidget =
    employeeId && isDashboardHome ? (
      <ClockBreakPrayerWidget
        key="emp-clock-widget"
        employeeId={employeeId}
        employeeName={employeeName || "Employee"}
        variant="todayStatus"
      />
    ) : null;

  return (
    <EmployeeShellProvider>
    <div className={`${styles.layout} ${empStyles.noTopbar} ${empStyles.modernShell}`}>
      {sidebarOpen ? (
        <div
          className={styles.sidebarOverlay}
          onClick={() => setSidebarOpen(false)}
          aria-hidden
        />
      ) : null}

      <aside
        className={`${styles.sidebar} ${empStyles.sidebarFull} ${empStyles.sidebarPdf} ${sidebarOpen ? styles.sidebarOpen : ""}`}
      >
        <div className={empStyles.sidebarBrand}>
          <InteractGlobeLogo className={empStyles.sidebarGlobe} />
          <div className={empStyles.sidebarBrandText}>
            <span className={empStyles.sidebarBrandName}>INTERACT</span>
            <span className={empStyles.sidebarBrandSub}>GLOBAL</span>
          </div>
        </div>

        <nav className={`${styles.nav} ${styles.navEmployee} ${empStyles.sidebarNav}`}>
          {employeeTabs.map((tab, idx) => {
            const isActive =
              tab.path === "/employee-dashboard"
                ? pathname === tab.path
                : pathname === tab.path || (pathname?.startsWith(tab.path + "/") ?? false);
            const isPermissionTab = accessTabs.some((t) => t.path === tab.path);
            return (
              <Link
                key={tab.path || idx}
                href={tab.path}
                prefetch={!isPermissionTab}
                className={
                  isActive
                    ? `${styles.navItem} ${styles.navItemActive} ${empStyles.navItemPdf} ${empStyles.navItemPdfActive}`
                    : `${styles.navItem} ${empStyles.navItemPdf}`
                }
                onClick={(e) => {
                  if (isActive) {
                    e.preventDefault();
                    return;
                  }
                  // Full load keeps employee layout; soft-nav was swapping to admin chrome.
                  if (isPermissionTab) {
                    e.preventDefault();
                    window.location.assign(tab.path);
                  }
                }}
              >
                <span className={`${styles.navIcon} ${empStyles.navIconPdf}`}>{tab.icon}</span>
                <span>{tab.name}</span>
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className={`${styles.contentArea} ${empStyles.contentFull} ${empStyles.contentModern}`}>
        {isDashboardHome ? (
          <div className={empStyles.heroStrip}>
            <div className={empStyles.heroStripInner}>
              <header className={empStyles.hero}>
                <div className={empStyles.heroLeft}>
                  <button
                    type="button"
                    className={empStyles.mobileMenuBtn}
                    aria-label="Toggle menu"
                    onClick={() => setSidebarOpen((open) => !open)}
                  >
                    &#9776;
                  </button>
                  <div className={empStyles.heroMain}>
                    <h1 className={empStyles.heroTitle}>
                      {greetingLabel()},{" "}
                      <span className={empStyles.heroNameAccent}>{employeeName || "Employee"}!</span>
                    </h1>
                    <span className={empStyles.heroDate}>{heroDateTime}</span>
                  </div>
                </div>

                <div className={empStyles.heroRight}>
                  <HeroSearch />
                  <EmployeeProfileMenu
                    employeeId={employeeId}
                    onAvatarUpdated={(dataUrl) => setEmployeeAvatar(dataUrl)}
                  />
                </div>
              </header>
            </div>
          </div>
        ) : (
          <div className={empStyles.subPageBar}>
            <button
              type="button"
              className={empStyles.mobileMenuBtn}
              aria-label="Toggle menu"
              onClick={() => setSidebarOpen((open) => !open)}
            >
              &#9776;
            </button>
            <div className={empStyles.subPageProfile}>
              <EmployeeAvatar
                name={employeeName || "Employee"}
                initials={initials}
                photo={employeeAvatar}
                size="sm"
              />
              <span>{employeeName || "Employee"}</span>
              <EmployeeProfileMenu
                employeeId={employeeId}
                onAvatarUpdated={(dataUrl) => setEmployeeAvatar(dataUrl)}
              />
            </div>
          </div>
        )}

        {employeeId && isDashboardHome && todayStatusRoot
          ? createPortal(clockWidget, todayStatusRoot)
          : null}

        <main className={`${styles.main} ${empStyles.employeeMain}`}>{children}</main>
      </div>
    </div>
    </EmployeeShellProvider>
  );
}

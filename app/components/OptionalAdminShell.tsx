"use client";

import React from "react";
import { usePathname, useRouter } from "next/navigation";
import LayoutDashboard from "../layout-dashboard";
import {
  isEmployeeBrowserSession,
  useEmployeeShell,
} from "@/lib/access-control/employee-shell";
import { ADMIN_PATH_TO_EMPLOYEE } from "@/lib/access-control/menu-registry";

/**
 * Admin chrome only for true admin sessions.
 * Under employee-dashboard (or any employee browser session) renders children only.
 */
export default function OptionalAdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const inEmployeeLayout = useEmployeeShell();
  const [employeeSession, setEmployeeSession] = React.useState(false);

  React.useLayoutEffect(() => {
    const isEmp = isEmployeeBrowserSession();
    setEmployeeSession(isEmp);
    if (!isEmp) return;
    if (pathname?.startsWith("/employee-dashboard")) return;

    const path = pathname || "";
    const mapped =
      ADMIN_PATH_TO_EMPLOYEE[path] ||
      Object.entries(ADMIN_PATH_TO_EMPLOYEE).find(
        ([adminPath]) => path === adminPath || path.startsWith(`${adminPath}/`),
      )?.[1];

    if (mapped) {
      window.location.replace(mapped);
      return;
    }
    if (
      path.startsWith("/admin") ||
      path.startsWith("/summaries") ||
      path === "/leave" ||
      path.startsWith("/attendance")
    ) {
      window.location.replace("/employee-dashboard");
    }
  }, [pathname, router]);

  if (inEmployeeLayout || employeeSession || pathname?.startsWith("/employee-dashboard")) {
    return <>{children}</>;
  }

  return <LayoutDashboard>{children}</LayoutDashboard>;
}

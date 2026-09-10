"use client";

import React from "react";

const EmployeeShellContext = React.createContext(false);

/** True when rendered under `/employee-dashboard` layout. */
export function EmployeeShellProvider({ children }: { children: React.ReactNode }) {
  React.useEffect(() => {
    try {
      sessionStorage.setItem("hrmPortal", "employee");
    } catch {
      /* ignore */
    }
  }, []);
  return (
    <EmployeeShellContext.Provider value={true}>{children}</EmployeeShellContext.Provider>
  );
}

export function useEmployeeShell(): boolean {
  return React.useContext(EmployeeShellContext);
}

export function isEmployeeBrowserSession(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (/^\d+$/.test(localStorage.getItem("employeeId") || "")) return true;
    if (sessionStorage.getItem("hrmPortal") === "employee") return true;
  } catch {
    /* ignore */
  }
  return false;
}

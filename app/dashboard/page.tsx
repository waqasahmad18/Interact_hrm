"use client";
import React from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { usePathname } from "next/navigation";
import LayoutDashboard from "../layout-dashboard";
import styles from "./nexatech-theme.module.css";

export default function DashboardPage() {
  const router = useRouter();
  const pathname = usePathname();
  const sidebarLinks = [
    { name: "Dashboard", icon: "🏠", path: "/dashboard" },
    { name: "Admin", icon: "👤", path: "/admin" },
    { name: "Leave", icon: "🌴", path: "/leave" },
    { name: "Time", icon: "⏰", path: "/time" },
    { name: "Recruitment", icon: "🧑‍💼", path: "/recruitment" },
    { name: "My Info", icon: "ℹ️", path: "/my-info" },
    { name: "Performance", icon: "📈", path: "/performance" },
  ];
  return (
    <LayoutDashboard>
      <h1 className={styles.heading}>Dashboard</h1>
      <div className={styles.dashboardGrid}>
        {/* Quick Links Widget */}
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Quick Links</h2>
          <div className={styles.quickLinks}>
            <button className={styles.quickButton} onClick={() => router.push('/add-employee')}>Add Employee</button>
            <button className={styles.quickButton} onClick={() => router.push('/leave')}>Leave Requests</button>
            <button className={styles.quickButton} onClick={() => router.push('/recruitment')}>Recruitment</button>
          </div>
        </div>

        {/* Employee Statistics Widget */}
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Employee Statistics</h2>
          <div style={{ display: "flex", gap: 24, justifyContent: "center", marginBottom: 8 }}>
            <div style={{ textAlign: "center" }}>
              <div className={styles.metric}>120</div>
              <div className={styles.label}>Total</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div className={styles.metric}>110</div>
              <div className={styles.label}>Active</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div className={styles.metric}>10</div>
              <div className={styles.label}>On Leave</div>
            </div>
          </div>
        </div>

        {/* Recruitment Status Widget */}
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Recruitment Status</h2>
          <div className={styles.metric}>3 Open Positions</div>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, width: "100%" }}>
            <li className={styles.label}>Software Engineer - 2 Candidates</li>
            <li className={styles.label}>HR Manager - 1 Candidate</li>
            <li className={styles.label}>Accountant - 1 Candidate</li>
          </ul>
        </div>

        {/* Attendance Summary Widget */}
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Attendance Summary</h2>
          <div className={styles.metric}>🕒 Clocked In</div>
          <div className={styles.label}>Today: 7h 45m</div>
          <div className={styles.label}>Last Clock In: 09:00 AM</div>
        </div>

        {/* Leave Requests Widget */}
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Leave Requests</h2>
          <div className={styles.metric}>2 Pending Approvals</div>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, width: "100%" }}>
            <li className={styles.label}>Alex Brown - Vacation</li>
            <li className={styles.label}>K. Akhil - Sick Leave</li>
          </ul>
        </div>

        {/* Birthdays Widget */}
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Upcoming Birthdays</h2>
          <div className={styles.metric}>🎂 1 Birthday This Week</div>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, width: "100%" }}>
            <li className={styles.label}>Sara Khan - Nov 30</li>
          </ul>
        </div>

        {/* Announcements Widget */}
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Announcements</h2>
          <div className={styles.metric}>Welcome to Interact Global HRM!</div>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, width: "100%" }}>
            <li className={styles.label}>New HR policies released</li>
            <li className={styles.label}>Company event on Dec 5</li>
          </ul>
        </div>

      </div>
    </LayoutDashboard>
  );
}

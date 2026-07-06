"use client";

import React from "react";
import LayoutDashboard from "../layout-dashboard";
import {
  NOTIFICATION_DEMO_PATH,
  dispatchDemoTicketToast,
  notificationDemoUrl,
  previewTicketToastOnPage,
} from "../../lib/ticket-toast-demo";
import { demoTicketEmployeeContext } from "../../lib/ticket-toast-photo";
import { warmTicketSound } from "../../lib/ticket-toast-sound";
import styles from "../demo-ticket-toast/demo-ticket-toast.module.css";

const DEMO_LINKS = [
  { label: "Notification demo (this page)", path: NOTIFICATION_DEMO_PATH },
  { label: "Admin dashboard + auto toast", path: notificationDemoUrl("/dashboard") },
  { label: "Ticket inbox + auto toast", path: notificationDemoUrl("/admin/tickets") },
  {
    label: "Employee dashboard + auto toast",
    path: notificationDemoUrl("/employee-dashboard"),
  },
];

export default function NotificationDemoPage() {
  const [origin, setOrigin] = React.useState("http://localhost:3000");
  const [shown, setShown] = React.useState(false);

  React.useEffect(() => {
    setOrigin(window.location.origin);
    warmTicketSound();
    const t = window.setTimeout(() => {
      dispatchDemoTicketToast({ ...demoTicketEmployeeContext() });
      setShown(true);
    }, 400);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <LayoutDashboard>
      <div className={styles.wrap}>
        <h1 className={styles.title}>Notification demo</h1>
        <p className={styles.sub}>
          Is page par open karte hi demo toast aani chahiye. Sound ke liye pehle ek click
          karein, phir &quot;Show demo again&quot; try karein.
        </p>
        <button
          type="button"
          className={styles.btn}
          onClick={() => {
            previewTicketToastOnPage({ ...demoTicketEmployeeContext() });
            setShown(true);
          }}
        >
          Show demo again
        </button>
        {shown ? (
          <p className={styles.hint}>Toast bottom-right par dikhna chahiye.</p>
        ) : null}
        <div className={styles.urls}>
          <p className={styles.urlsTitle}>Demo URLs (copy karein):</p>
          {DEMO_LINKS.map((link) => (
            <code key={link.path} className={styles.code}>
              {origin}
              {link.path}
              {" — "}
              {link.label}
            </code>
          ))}
        </div>
      </div>
    </LayoutDashboard>
  );
}

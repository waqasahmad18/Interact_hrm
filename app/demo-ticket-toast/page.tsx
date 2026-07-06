"use client";

import React from "react";
import LayoutDashboard from "../layout-dashboard";
import { notificationDemoUrl, previewTicketToastOnPage } from "../../lib/ticket-toast-demo";
import { demoTicketEmployeeContext } from "../../lib/ticket-toast-photo";
import styles from "./demo-ticket-toast.module.css";

export default function DemoTicketToastPage() {
  const [shown, setShown] = React.useState(false);

  const showDemo = React.useCallback(() => {
    previewTicketToastOnPage({ ...demoTicketEmployeeContext() });
    setShown(true);
  }, []);

  return (
    <LayoutDashboard>
      <div className={styles.wrap}>
        <h1 className={styles.title}>Ticket notification preview</h1>
        <p className={styles.sub}>
          Button click par page refresh nahi hoga — sirf bottom-right par notification
          aayegi (photo + sound ke sath).
        </p>
        <button type="button" className={styles.btn} onClick={showDemo}>
          Show demo notification
        </button>
        {shown ? (
          <p className={styles.hint}>Toast bottom-right par dikhna chahiye. × se band karein.</p>
        ) : null}
        <div className={styles.urls}>
          <p className={styles.urlsTitle}>Demo URLs:</p>
          <code className={styles.code}>/notification-demo</code>
          <code className={styles.code}>{notificationDemoUrl("/dashboard")}</code>
          <code className={styles.code}>Admin → Ticket inbox → Preview notification</code>
        </div>
      </div>
    </LayoutDashboard>
  );
}

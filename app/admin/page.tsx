import LayoutDashboard from "../layout-dashboard";
import styles from "./admin-page.module.css";
import { AdminWelcome } from "./AdminWelcome";

export default function AdminPage() {
  return (
    <LayoutDashboard>
      <div className={styles.page}>
        <div className={styles.inner}>
          <div className={styles.card}>
            <AdminWelcome />
          </div>
        </div>
      </div>
    </LayoutDashboard>
  );
}

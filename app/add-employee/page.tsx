import React from "react";
import AddEmployeeForm from "./AddEmployeeForm";
import LayoutDashboard from "../layout-dashboard";
import adminStyles from "../admin/admin-page.module.css";

export default function AddEmployeePage() {
  return (
    <LayoutDashboard>
      <div className={adminStyles.page}>
        <AddEmployeeForm />
      </div>
    </LayoutDashboard>
  );
}

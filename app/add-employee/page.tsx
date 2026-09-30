import React from "react";
import AddEmployeeForm from "./AddEmployeeForm";
import OptionalAdminShell from "@/app/components/OptionalAdminShell";
import adminStyles from "../admin/admin-page.module.css";

export default function AddEmployeePage() {
  return (
    <OptionalAdminShell>
      <div className={adminStyles.page}>
        <AddEmployeeForm />
      </div>
    </OptionalAdminShell>
  );
}

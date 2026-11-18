import { redirect } from "next/navigation";

/** Legacy route — summary now lives under Manage Leaves. */
export default function EmployeeMonthlyLeaveSummaryRedirect() {
  redirect("/employee-dashboard/manage-leaves?tab=summary");
}

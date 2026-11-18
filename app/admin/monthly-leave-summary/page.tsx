import { redirect } from "next/navigation";

/** Legacy route — summary now lives under Manage Leaves. */
export default function MonthlyLeaveSummaryRedirect() {
  redirect("/admin/manage-leaves?tab=summary");
}

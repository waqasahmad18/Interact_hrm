"use client";

import { FinancialRequestPage } from "../components/FinancialRequestPage";

export default function RequestAdvancePage() {
  return (
    <FinancialRequestPage
      requestType="advance"
      title="Request advance"
      subtitle="Submit a salary advance request. HR will review and notify you once approved."
      submitLabel="Submit advance request"
    />
  );
}

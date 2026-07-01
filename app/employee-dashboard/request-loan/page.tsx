"use client";

import { FinancialRequestPage } from "../components/FinancialRequestPage";

export default function RequestLoanPage() {
  return (
    <FinancialRequestPage
      requestType="loan"
      title="Request loan"
      subtitle="Apply for a loan with monthly installments deducted from payroll after approval."
      submitLabel="Submit loan request"
    />
  );
}

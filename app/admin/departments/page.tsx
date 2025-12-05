"use client";
import React from "react";
import LayoutDashboard from "../../layout-dashboard";
import DepartmentsTable from "../../components/DepartmentsTable";

export default function DepartmentsPage() {
  return (
    <LayoutDashboard>
      <div style={{ padding: 32 }}>
        <h1 style={{ fontWeight: 700, fontSize: "1.5rem", marginBottom: 24 }}>Departments</h1>
        <DepartmentsTable />
      </div>
    </LayoutDashboard>
  );
}

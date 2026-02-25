"use client";



import React, { useEffect, useState } from "react";
import LayoutDashboard from "../../layout-dashboard";
import styles from "../../attendance-summary/attendance-summary.module.css";

interface Employee {
  id: number;
  first_name: string;
  last_name: string;
  pseudonym?: string;
  department_name?: string;
  basic_salary?: number;
  ot_hours?: string;
  tw_days?: number;
  tunpaid_days?: number;
}

export default function PayrollPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [searchName, setSearchName] = useState("");
  const [selectedDepartment, setSelectedDepartment] = useState("");
  const today = new Date();
  const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
  const todayStr = today.toISOString().split('T')[0];
  const [fromDate, setFromDate] = useState(firstDayOfMonth);
  const [toDate, setToDate] = useState(todayStr);
  const [loading, setLoading] = useState(false);

  const fetchEmployees = async () => {
    setLoading(true);
    let url = "/api/employee-list";
    const params = new URLSearchParams();
    if (selectedDepartment) params.append("departmentName", selectedDepartment);
    if (searchName) params.append("employeeName", searchName);
    if (fromDate) params.append("fromDate", fromDate);
    if (toDate) params.append("toDate", toDate);
    if (params.toString()) {
      url += "?" + params.toString();
    }
    try {
      // Fetch deduction summary for all employees for the month
      const deductionRes = await fetch(`/api/monthly-attendance-accurate-summary?fromDate=${fromDate}&toDate=${toDate}`);
      const deductionData = await deductionRes.json();

      const res = await fetch(url, { cache: "no-store" });
      const data = await res.json();
      if (data.success && Array.isArray(data.employees)) {
        // Fetch salary and attach deduction summary
        const employeesWithSalaryAndDeduction = await Promise.all(
          data.employees.map(async (emp: any) => {
            let basic_salary;
            try {
              const salaryRes = await fetch(`/api/employee_salaries?employeeId=${emp.id}`);
              const salaryData = await salaryRes.json();
              basic_salary = salaryData.success && salaryData.salary && salaryData.salary.amount ? salaryData.salary.amount : undefined;
            } catch { basic_salary = undefined; }

            // Map tunpaid_days from monthly-attendance-accurate-summary API
            const summary = deductionData.data.find((item: any) => String(item.employee_id) === String(emp.id));
            let tunpaid = summary && typeof summary.tunpaid_days === 'number' ? summary.tunpaid_days : '-';
            // Only show .0 if it is a half day (e.g. 11.5), otherwise show as integer
            if (typeof tunpaid === 'number') {
              if (Number.isInteger(tunpaid)) tunpaid = tunpaid.toString();
              else tunpaid = tunpaid.toFixed(1);
            }
            return {
              ...emp,
              basic_salary,
              // tw_days: summary?.tw_days, // If you want to show working days, add this
              tunpaid_days: tunpaid,
            };
          })
        );
        setEmployees(employeesWithSalaryAndDeduction);
      } else {
        setEmployees([]);
      }
      setLoading(false);
    } catch {
      setEmployees([]);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmployees();
    // eslint-disable-next-line
  }, [fromDate, toDate, selectedDepartment, searchName]);

  return (
    <LayoutDashboard>
      <div className={styles.attendanceSummaryContainer}>
        <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 0 }}>Payroll</h1>
        <div style={{ color: "#4A5568", marginBottom: 32 }}>View and manage all employee payroll records</div>
        <div className={styles.attendanceSummaryFilters}>
          <input
            type="text"
            placeholder="Search by name..."
            value={searchName}
            onChange={e => setSearchName(e.target.value)}
            className={styles.attendanceSummaryInput}
          />
          <select
            value={selectedDepartment}
            onChange={e => setSelectedDepartment(e.target.value)}
            className={styles.attendanceSummaryInput}
          >
            <option value="">All Departments</option>
            {departments.map((d: any) => (
              <option key={d.id} value={d.name}>{d.name}</option>
            ))}
          </select>
          <span style={{ color: '#718096', fontWeight: 500 }}>From</span>
          <input
            type="date"
            value={fromDate}
            onChange={e => setFromDate(e.target.value)}
            className={styles.attendanceSummaryDate}
          />
          <span style={{ color: '#718096', fontWeight: 500 }}>to</span>
          <input
            type="date"
            value={toDate}
            onChange={e => setToDate(e.target.value)}
            className={styles.attendanceSummaryDate}
          />
          <button
            onClick={fetchEmployees}
            className={styles.attendanceSummaryXLSButton}
          >
            Search
          </button>
          <button
            className={styles.attendanceSummaryXLSButton}
            style={{ background: '#19c37d', marginLeft: 8 }}
          >
            <span style={{ marginRight: 8, fontSize: 20 }}>📥</span> Export Excel
          </button>
        </div>
        <div className={styles.attendanceSummaryTableWrapper}>
          <table className={styles.attendanceSummaryTable} style={{ tableLayout: "fixed", width: "100%" }}>
            <thead>
              <tr>
                <th style={{ width: 60, padding: "6px 4px", fontSize: 13 }}>ID</th>
                <th style={{ width: 140, padding: "6px 4px", fontSize: 13 }}>Employee Name</th>
                <th style={{ width: 110, padding: "6px 4px", fontSize: 13 }}>Pseudonym</th>
                <th style={{ width: 110, padding: "6px 4px", fontSize: 13 }}>Department</th>
                <th style={{ width: 110, padding: "6px 4px", fontSize: 13 }}>Basic Salary</th>
                <th style={{ width: 110, padding: "6px 4px", fontSize: 13 }}>T.W Days</th>
                <th style={{ width: 110, padding: "6px 4px", fontSize: 13 }}>T.Unpaid Days</th>
                <th style={{ width: 110, padding: "6px 4px", fontSize: 13 }}>O. T Hours</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={4} className={styles.attendanceSummaryNoRecords}>Loading...</td></tr>
              ) : employees.length === 0 ? (
                <tr><td colSpan={4} className={styles.attendanceSummaryNoRecords}>No records found.</td></tr>
              ) : (
                employees.map(emp => (
                  <tr key={emp.id}>
                    <td style={{ width: 60, padding: "6px 4px", fontSize: 13 }}>{emp.id}</td>
                    <td style={{ width: 140, padding: "6px 4px", fontSize: 13 }}>{emp.first_name} {emp.last_name}</td>
                    <td style={{ width: 110, padding: "6px 4px", fontSize: 13 }}>{emp.pseudonym || "-"}</td>
                    <td style={{ width: 110, padding: "6px 4px", fontSize: 13 }}>{emp.department_name || "-"}</td>
                    <td style={{ width: 110, padding: "6px 4px", fontSize: 13 }}>{emp.basic_salary !== undefined ? emp.basic_salary : '-'}</td>
                    <td style={{ width: 110, padding: "6px 4px", fontSize: 13 }}>{emp.tw_days !== undefined ? emp.tw_days : '-'}</td>
                    <td style={{ width: 110, padding: "6px 4px", fontSize: 13 }}>{emp.tunpaid_days !== undefined ? emp.tunpaid_days : '-'}</td>
                    <td style={{ width: 110, padding: "6px 4px", fontSize: 13 }}>{emp.ot_hours !== undefined ? emp.ot_hours : '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </LayoutDashboard>
  );
}

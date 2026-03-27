"use client";
import React, { useEffect, useRef, useState } from "react";
import LayoutDashboard from "../../layout-dashboard";
import styles from "../advance/advance-summary.module.css";
import { FaSave, FaTrash } from "react-icons/fa";

type Employee = {
	id: number;
	first_name: string;
	last_name: string;
	employee_code?: string;
	pseudonym?: string;
	department_name?: string;
};

type LoanRecord = {
	loan_key?: string;
	employee_id: number;
	month: string;
	original_amount: number;
	paid_amount: number;
	payable_this_month: number;
	status: string;
	created_at: string;
	updated_at: string;
	employee?: Employee;
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const getCurrentMonth = () => {
	const today = new Date();
	return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
};

const LOAN_COLUMNS_STORAGE_KEY = "loan-page-column-visibility";

function loadSavedColumnState() {
	if (typeof window === "undefined") return null;
	try {
		const s = localStorage.getItem(LOAN_COLUMNS_STORAGE_KEY);
		if (!s) return null;
		const parsed = JSON.parse(s) as Record<string, boolean>;
		return parsed;
	} catch {
		return null;
	}
}

function saveColumnState(state: Record<string, boolean>) {
	try {
		localStorage.setItem(LOAN_COLUMNS_STORAGE_KEY, JSON.stringify(state));
	} catch (_) {}
}

export default function LoanManagementPage() {
	// State for employees and loans
	const [employees, setEmployees] = useState<Employee[]>([]);
	const [loans, setLoans] = useState<LoanRecord[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");

	// Add Loan Form State
	const [selectedEmployee, setSelectedEmployee] = useState<string>("");
	const [loanAmount, setLoanAmount] = useState("");
	const [installments, setInstallments] = useState("");
	const [startMonth, setStartMonth] = useState(getCurrentMonth);
	const [formLoading, setFormLoading] = useState(false);
	const [formSuccess, setFormSuccess] = useState("");
	const [savingRowKey, setSavingRowKey] = useState<string>("");
	const [dropdownOpen, setDropdownOpen] = useState(false);
	const [employeeDropdownOpen, setEmployeeDropdownOpen] = useState(false);
	const [employeeSearchTerm, setEmployeeSearchTerm] = useState("");
	const employeeDropdownRef = React.useRef<HTMLDivElement>(null);

	// Close employee dropdown when clicking outside
	useEffect(() => {
		const fn = (e: MouseEvent) => {
			if (employeeDropdownRef.current && !employeeDropdownRef.current.contains(e.target as Node)) {
				setEmployeeDropdownOpen(false);
			}
		};
		if (employeeDropdownOpen) {
			document.addEventListener("mousedown", fn);
			return () => document.removeEventListener("mousedown", fn);
		}
	}, [employeeDropdownOpen]);
	const [showIdCol, setShowIdCol] = useState(true);
	const [showFullNameCol, setShowFullNameCol] = useState(true);
	const [showPNameCol, setShowPNameCol] = useState(true);
	const [showDepartmentCol, setShowDepartmentCol] = useState(true);
	const [showInstallmentsCol, setShowInstallmentsCol] = useState(true);
	const [showLoanAmountCol, setShowLoanAmountCol] = useState(true);
	const [showMonthCol, setShowMonthCol] = useState(true);
	const [showPerInstallmentCol, setShowPerInstallmentCol] = useState(true);
	const [showPayableThisMonthCol, setShowPayableThisMonthCol] = useState(true);
	const [showPaidAmountCol, setShowPaidAmountCol] = useState(true);
	const [showStatusCol, setShowStatusCol] = useState(true);

	// Load saved column visibility from localStorage on mount
	useEffect(() => {
		const saved = loadSavedColumnState();
		if (!saved) return;
		if (typeof saved.id === "boolean") setShowIdCol(saved.id);
		if (typeof saved.fullName === "boolean") setShowFullNameCol(saved.fullName);
		if (typeof saved.pName === "boolean") setShowPNameCol(saved.pName);
		if (typeof saved.department === "boolean") setShowDepartmentCol(saved.department);
		if (typeof saved.installments === "boolean") setShowInstallmentsCol(saved.installments);
		if (typeof saved.loanAmount === "boolean") setShowLoanAmountCol(saved.loanAmount);
		if (typeof saved.month === "boolean") setShowMonthCol(saved.month);
		if (typeof saved.perInstallment === "boolean") setShowPerInstallmentCol(saved.perInstallment);
		if (typeof saved.payableThisMonth === "boolean") setShowPayableThisMonthCol(saved.payableThisMonth);
		if (typeof saved.paidAmount === "boolean") setShowPaidAmountCol(saved.paidAmount);
		if (typeof saved.status === "boolean") setShowStatusCol(saved.status);
	}, []);

	// Persist column visibility to localStorage when it changes (skip initial mount to avoid overwriting loaded state)
	const isFirstColumnSave = useRef(true);
	useEffect(() => {
		if (isFirstColumnSave.current) {
			isFirstColumnSave.current = false;
			return;
		}
		saveColumnState({
			id: showIdCol,
			fullName: showFullNameCol,
			pName: showPNameCol,
			department: showDepartmentCol,
			installments: showInstallmentsCol,
			loanAmount: showLoanAmountCol,
			month: showMonthCol,
			perInstallment: showPerInstallmentCol,
			payableThisMonth: showPayableThisMonthCol,
			paidAmount: showPaidAmountCol,
			status: showStatusCol,
		});
	}, [
		showIdCol, showFullNameCol, showPNameCol, showDepartmentCol,
		showInstallmentsCol, showLoanAmountCol, showMonthCol,
		showPerInstallmentCol, showPayableThisMonthCol, showPaidAmountCol, showStatusCol,
	]);

	// Filters: search by name, ID, P.Name; filter by department
	const [search, setSearch] = useState("");
	const [departmentFilter, setDepartmentFilter] = useState("");
	const [monthFilter, setMonthFilter] = useState(getCurrentMonth);
	const [extendModalOpen, setExtendModalOpen] = useState(false);
	const [extendMonthsInput, setExtendMonthsInput] = useState("0");
	const [pendingSave, setPendingSave] = useState<{ loan: LoanRecord; payable: number; status: string } | null>(null);
	const [payableDraftByKey, setPayableDraftByKey] = useState<Record<string, string>>({});

	// Fetch employees and loans from API
	useEffect(() => {
		setLoading(true);
		setError("");

		const loadData = async () => {
			try {
				// Fetch all employees via /api/employee-list
				const empRes = await fetch("/api/employee-list");
				const empData = await empRes.json();
				if (empData.success && Array.isArray(empData.employees)) {
					// Deduplicate by id (API may return duplicates from JOINs)
					const seen = new Set<number>();
					const unique = empData.employees.filter((e: Employee) => {
						if (seen.has(e.id)) return false;
						seen.add(e.id);
						return true;
					});
					setEmployees(unique);
				}
			} catch {
				setError("Failed to fetch employees");
			}

			// Fetch loan records
			try {
				const loanRes = await fetch("/api/loan-installments");
				const loanData = await loanRes.json();
				if (loanData.success && Array.isArray(loanData.records)) {
					setLoans(loanData.records);
				}
			} catch {
				// Loans API may not exist yet; employees still work
			} finally {
				setLoading(false);
			}
		};

		loadData();
	}, []);

	// Close column dropdown on outside click
	useEffect(() => {
		if (!dropdownOpen) return;
		const handleClick = (e: MouseEvent) => {
			const menu = document.getElementById("loan-columns-menu");
			const dots = document.getElementById("loan-columns-dots");
			if (menu && !menu.contains(e.target as Node) && dots && !dots.contains(e.target as Node)) {
				setDropdownOpen(false);
			}
		};
		document.addEventListener("mousedown", handleClick);
		return () => document.removeEventListener("mousedown", handleClick);
	}, [dropdownOpen]);

	const loadLoans = async () => {
		try {
			const res = await fetch("/api/loan-installments");
			const data = await res.json();
			if (data.success && Array.isArray(data.records)) setLoans(data.records);
		} catch {}
	};

	// Add Loan Handler - real API call
	const handleAddLoan = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!selectedEmployee) {
			setError("Please select an employee");
			return;
		}
		setFormLoading(true);
		setFormSuccess("");
		setError("");
		try {
			const res = await fetch("/api/loan-installments", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					employee_id: parseInt(selectedEmployee, 10),
					loan_amount: parseFloat(loanAmount),
					installments: parseInt(installments, 10),
					start_month: startMonth,
				}),
			});
			const data = await res.json();
			if (data.success) {
				setFormSuccess("Loan added successfully");
				setLoanAmount("");
				setInstallments("");
				setSelectedEmployee("");
				await loadLoans();
			} else {
				setError(data.error || "Failed to add loan");
			}
		} catch {
			setError("Failed to add loan");
		} finally {
			setFormLoading(false);
		}
	};

	const runSave = async (loan: LoanRecord, payableValue: number, statusValue: string, extendMonths: number) => {
		try {
			setSavingRowKey(`${loan.employee_id}-${loan.month}`);
			const normalizedPayable = round2(payableValue);
			const res = await fetch("/api/loan-installments", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					employee_id: loan.employee_id,
					month: loan.month,
					payable_this_month: normalizedPayable,
					status: statusValue,
					adjust_remaining: true,
					extend_months: extendMonths,
				}),
			});
			const data = await res.json();
			if (data.success) {
				// Reload to reflect any auto-adjustment in remaining months from backend.
				await loadLoans();
				setFormSuccess(extendMonths > 0 ? `Record updated, installments extended by ${extendMonths}` : "Record updated");
				setTimeout(() => setFormSuccess(""), 2000);
			} else setError(data.error || "Failed to update");
		} catch {
			setError("Failed to update");
		} finally {
			setSavingRowKey("");
		}
	};

	const handleSave = async (loan: LoanRecord, payableValue: number, statusValue: string) => {
		const normalizedPayable = round2(payableValue);
		const baselineInstallment = Number(loan.original_amount ?? loan.payable_this_month ?? 0);
		const shouldAskExtend = statusValue === "pending" && normalizedPayable < baselineInstallment;
		if (shouldAskExtend) {
			setPendingSave({ loan, payable: normalizedPayable, status: statusValue });
			setExtendMonthsInput("0");
			setExtendModalOpen(true);
			return;
		}
		await runSave(loan, normalizedPayable, statusValue, 0);
	};

	const confirmExtendAndSave = async () => {
		if (!pendingSave) return;
		const parsed = parseInt(extendMonthsInput, 10);
		const extendMonths = !isNaN(parsed) && parsed > 0 ? parsed : 0;
		setExtendModalOpen(false);
		await runSave(pendingSave.loan, pendingSave.payable, pendingSave.status, extendMonths);
		setPendingSave(null);
	};

	const handleStatusChange = async (loan: LoanRecord, newStatus: string) => {
		try {
			setSavingRowKey(`${loan.employee_id}-${loan.month}`);
			const res = await fetch("/api/loan-installments", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					employee_id: loan.employee_id,
					month: loan.month,
					status: newStatus,
				}),
			});
			const data = await res.json();
			if (data.success) {
				await loadLoans(); // status affects paid_amount; refresh row values from DB
				setFormSuccess("Status updated");
				setTimeout(() => setFormSuccess(""), 2000);
			} else setError(data.error || "Failed to update status");
		} catch {
			setError("Failed to update status");
		} finally {
			setSavingRowKey("");
		}
	};

	const handleDelete = async (employeeId: number, month: string) => {
		if (!confirm("Delete this loan installment?")) return;
		try {
			const res = await fetch("/api/loan-installments", {
				method: "DELETE",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ employee_id: employeeId, month }),
			});
			const data = await res.json();
			if (data.success) {
				setLoans((prev) => prev.filter((l) => !(l.employee_id === employeeId && l.month === month)));
				setFormSuccess("Record deleted");
				setTimeout(() => setFormSuccess(""), 2000);
			} else setError(data.error || "Failed to delete");
		} catch {
			setError("Failed to delete");
		}
	};

	// Helper: Get employee name
	const getEmployeeName = (id: number) => {
		const emp = employees.find(e => e.id === id);
		return emp ? `${emp.first_name} ${emp.last_name}` : id;
	};

	const getEmployeeById = (id: number) => employees.find(e => e.id === id);
	const visibleDataColsCount =
		(showIdCol ? 1 : 0) +
		(showFullNameCol ? 1 : 0) +
		(showPNameCol ? 1 : 0) +
		(showDepartmentCol ? 1 : 0) +
		(showInstallmentsCol ? 1 : 0) +
		(showLoanAmountCol ? 1 : 0) +
		(showMonthCol ? 1 : 0) +
		(showPerInstallmentCol ? 1 : 0) +
		(showPayableThisMonthCol ? 1 : 0) +
		(showPaidAmountCol ? 1 : 0) +
		(showStatusCol ? 1 : 0) +
		1; // Actions (always visible)

	const uniqueDepartments = Array.from(new Set(employees.map((e) => e.department_name).filter(Boolean))) as string[];

	const filteredEmployees = employees.filter((emp) => {
		const searchLower = search.toLowerCase();
		const fullName = `${emp.first_name || ""} ${emp.last_name || ""}`.trim();
		const matchesSearch =
			!search ||
			(emp.employee_code || "").toString().toLowerCase().includes(searchLower) ||
			(emp.id || "").toString().includes(searchLower) ||
			fullName.toLowerCase().includes(searchLower) ||
			(emp.pseudonym || "").toLowerCase().includes(searchLower);
		const matchesDept = !departmentFilter || emp.department_name === departmentFilter;
		return matchesSearch && matchesDept;
	});
	// Filter for Add Loan employee dropdown search (by name, ID, P.Name)
	const employeeSearchLower = employeeSearchTerm.toLowerCase().trim();
	const employeesForSelect = employeeSearchLower
		? employees.filter((emp) => {
				const fullName = `${emp.first_name || ""} ${emp.last_name || ""}`.trim();
				return (
					fullName.toLowerCase().includes(employeeSearchLower) ||
					(emp.employee_code || "").toString().toLowerCase().includes(employeeSearchLower) ||
					(emp.id || "").toString().includes(employeeSearchLower) ||
					(emp.pseudonym || "").toLowerCase().includes(employeeSearchLower)
				);
		  })
		: employees;
	const employeesForSelectWithSelected: Employee[] = selectedEmployee && !employeesForSelect.find(e => String(e.id) === selectedEmployee)
		? [...employeesForSelect, employees.find(e => String(e.id) === selectedEmployee)].filter((e): e is Employee => Boolean(e))
		: employeesForSelect;

	const filteredLoans = loans.filter((loan) => {
		const emp = employees.find(e => e.id === loan.employee_id);
		if (!emp) return true;
		const searchLower = search.toLowerCase();
		const fullName = `${emp.first_name || ""} ${emp.last_name || ""}`.trim();
		const matchesSearch =
			!search ||
			(emp.employee_code || "").toString().toLowerCase().includes(searchLower) ||
			(emp.id || "").toString().includes(searchLower) ||
			fullName.toLowerCase().includes(searchLower) ||
			(emp.pseudonym || "").toLowerCase().includes(searchLower);
		const matchesDept = !departmentFilter || emp.department_name === departmentFilter;
		return matchesSearch && matchesDept;
	});
	const loanMetaByEmployee = loans.reduce<Record<number, { installments: number; loanAmount: number }>>((acc, loan) => {
		if (!acc[loan.employee_id]) acc[loan.employee_id] = { installments: 0, loanAmount: 0 };
		acc[loan.employee_id].installments += 1;
		// Keep total loan fixed to original schedule amount.
		acc[loan.employee_id].loanAmount += Number(loan.original_amount ?? 0);
		return acc;
	}, {});

	return (
		<LayoutDashboard>
			<div className={styles.breakSummaryContainer} style={{ position: "relative", maxWidth: 1200, margin: "0 auto", overflow: "visible" }}>
				<div className={styles.breakSummaryHeader} style={{ fontSize: 24, fontWeight: 700, marginBottom: 16 }}>
					Loan Management
				</div>

				{formSuccess && <div style={{ color: "#38A169", marginBottom: 8 }}>{formSuccess}</div>}
				{error && <div style={{ color: "#e53e3e", marginBottom: 8 }}>{error}</div>}

				{/* Filters */}
				<div className={styles.breakSummaryFilters} style={{ marginBottom: 20, flexWrap: "wrap" }}>
					<input
						type="text"
						placeholder="Search by name, ID or P.Name..."
						value={search}
						onChange={e => setSearch(e.target.value)}
						className={styles.breakSummaryInput}
						style={{ width: 220, fontSize: 15 }}
					/>
					<select
						value={departmentFilter}
						onChange={e => setDepartmentFilter(e.target.value)}
						className={styles.breakSummaryInput}
						style={{ width: 180, fontSize: 15 }}
					>
						<option value="">All Departments</option>
						{uniqueDepartments.map((dept) => (
							<option key={dept} value={dept}>{dept}</option>
						))}
					</select>
					<input
						type="month"
						value={monthFilter}
						onChange={(e) => setMonthFilter(e.target.value)}
						disabled
						className={styles.breakSummaryInput}
						style={{ width: 170, fontSize: 15, opacity: 0.6, cursor: "not-allowed" }}
					/>
				</div>

				{/* Add New Loan Section */}
				<div className={styles.breakSummaryFilters} style={{ marginBottom: 24, flexWrap: "wrap" }}>
					<label style={{ fontWeight: 600 }}>Add New Loan</label>
				</div>
				<form onSubmit={handleAddLoan} className={styles.breakSummaryFilters} style={{ alignItems: "flex-end", marginBottom: 32 }}>
					<div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end", minHeight: 78 }} ref={employeeDropdownRef}>
						<label style={{ fontWeight: 500, display: "block", marginBottom: 4 }}>Employee</label>
						<div style={{ position: "relative", width: 220 }}>
							<button
								type="button"
								onClick={() => { setEmployeeDropdownOpen(v => !v); setEmployeeSearchTerm(""); }}
								className={styles.breakSummaryInput}
								style={{
									width: "100%",
									textAlign: "left",
									display: "flex",
									alignItems: "center",
									justifyContent: "space-between",
									background: "#fff",
									cursor: "pointer",
								}}
							>
								<span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
									{selectedEmployee
										? (() => {
												const emp = employees.find(e => String(e.id) === selectedEmployee);
												return emp ? `${emp.first_name} ${emp.last_name}${emp.pseudonym ? ` (${emp.pseudonym})` : ""}` : "Select Employee";
										  })()
										: "Select Employee"}
								</span>
								<span style={{ marginLeft: 8, fontSize: 12 }}>▼</span>
							</button>
							{employeeDropdownOpen && (
								<div
									style={{
										position: "absolute",
										top: "100%",
										left: 0,
										right: 0,
										marginTop: 4,
										background: "#fff",
										border: "2px solid #E2E8F0",
										borderRadius: 10,
										boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
										zIndex: 400,
										maxHeight: 260,
										overflow: "hidden",
										display: "flex",
										flexDirection: "column",
									}}
								>
									<div style={{ padding: 8, borderBottom: "1px solid #E2E8F0" }}>
										<input
											type="text"
											placeholder="Search by name, ID or P.Name..."
											value={employeeSearchTerm}
											onChange={e => setEmployeeSearchTerm(e.target.value)}
											onClick={e => e.stopPropagation()}
											className={styles.breakSummaryInput}
											style={{ width: "100%", fontSize: 13, padding: "8px 12px" }}
											autoFocus
										/>
									</div>
									<div style={{ overflowY: "auto", maxHeight: 200 }}>
										{employeesForSelectWithSelected.length === 0 ? (
											<div style={{ padding: 12, color: "#4A5568", fontSize: 13 }}>No match found</div>
										) : (
											employeesForSelectWithSelected.map(emp => (
												<div
													key={emp.id}
													onClick={() => {
														setSelectedEmployee(String(emp.id));
														setEmployeeDropdownOpen(false);
														setEmployeeSearchTerm("");
													}}
													style={{
														padding: "10px 12px",
														cursor: "pointer",
														fontSize: 14,
														background: selectedEmployee === String(emp.id) ? "#EFF6FF" : "#fff",
														borderBottom: "1px solid #f1f5f9",
													}}
													onMouseEnter={(e) => { e.currentTarget.style.background = "#F1F5F9"; }}
													onMouseLeave={(e) => { e.currentTarget.style.background = selectedEmployee === String(emp.id) ? "#EFF6FF" : "#fff"; }}
												>
													{emp.employee_code ? `[${emp.employee_code}] ` : `[${emp.id}] `}
													{emp.first_name} {emp.last_name}
													{emp.pseudonym ? ` (${emp.pseudonym})` : ""}
													{emp.department_name ? ` - ${emp.department_name}` : ""}
												</div>
											))
										)}
									</div>
								</div>
							)}
						</div>
					</div>
					<div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end", minHeight: 78 }}>
						<label style={{ fontWeight: 500, display: "block", marginBottom: 4 }}>Loan Amount</label>
						<input
							type="number"
							value={loanAmount}
							onChange={e => setLoanAmount(e.target.value)}
							required
							min={1}
							className={styles.breakSummaryInput}
							style={{ width: 140 }}
							placeholder="Amount"
						/>
					</div>
					<div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end", minHeight: 78 }}>
						<label style={{ fontWeight: 500, display: "block", marginBottom: 4 }}>Installments</label>
						<input
							type="number"
							value={installments}
							onChange={e => setInstallments(e.target.value)}
							required
							min={1}
							className={styles.breakSummaryInput}
							style={{ width: 120 }}
							placeholder="Months"
						/>
					</div>
					<div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end", minHeight: 78 }}>
						<label style={{ fontWeight: 500, display: "block", marginBottom: 4 }}>Start Month</label>
						<input
							type="month"
							value={startMonth}
							onChange={e => setStartMonth(e.target.value)}
							required
							className={styles.breakSummaryInput}
							style={{ width: 160 }}
						/>
					</div>
					<div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, position: "relative" }}>
						<button
							id="loan-columns-dots"
							type="button"
							title="Show/Hide Columns"
							onClick={() => setDropdownOpen(open => !open)}
							style={{
								zIndex: 200,
								background: "white",
								border: "1.5px solid #e2e8f0",
								borderRadius: "50%",
								width: 40,
								height: 40,
								boxShadow: "0 2px 8px rgba(0,82,204,0.10)",
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
								cursor: "pointer",
							}}
						>
							<svg width="22" height="22" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
								<circle cx="7" cy="14" r="2.5" fill="#0052CC" />
								<circle cx="14" cy="14" r="2.5" fill="#0052CC" />
								<circle cx="21" cy="14" r="2.5" fill="#0052CC" />
							</svg>
						</button>
						{dropdownOpen && (
							<div
								id="loan-columns-menu"
								style={{
									position: "absolute",
									top: 44,
									right: -10,
									background: "#f8fafc",
									borderRadius: 12,
									boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
									border: "1px solid #e2e8f0",
									padding: "12px 14px",
									zIndex: 300,
									minWidth: 200,
									maxHeight: 400,
									overflowY: "auto",
									display: "flex",
									flexDirection: "column",
									gap: 8,
								}}
							>
								<label><input type="checkbox" checked={showIdCol} onChange={() => setShowIdCol(v => !v)} /> ID</label>
								<label><input type="checkbox" checked={showFullNameCol} onChange={() => setShowFullNameCol(v => !v)} /> Full Name</label>
								<label><input type="checkbox" checked={showPNameCol} onChange={() => setShowPNameCol(v => !v)} /> P.Name</label>
								<label><input type="checkbox" checked={showDepartmentCol} onChange={() => setShowDepartmentCol(v => !v)} /> Department</label>
								<label><input type="checkbox" checked={showInstallmentsCol} onChange={() => setShowInstallmentsCol(v => !v)} /> Installments</label>
								<label><input type="checkbox" checked={showLoanAmountCol} onChange={() => setShowLoanAmountCol(v => !v)} /> Loan Amount</label>
								<label><input type="checkbox" checked={showMonthCol} onChange={() => setShowMonthCol(v => !v)} /> Month</label>
								<label><input type="checkbox" checked={showPerInstallmentCol} onChange={() => setShowPerInstallmentCol(v => !v)} /> Per Installment</label>
								<label><input type="checkbox" checked={showPayableThisMonthCol} onChange={() => setShowPayableThisMonthCol(v => !v)} /> Payable This Month</label>
								<label><input type="checkbox" checked={showPaidAmountCol} onChange={() => setShowPaidAmountCol(v => !v)} /> Paid Amount</label>
								<label><input type="checkbox" checked={showStatusCol} onChange={() => setShowStatusCol(v => !v)} /> Status</label>
							</div>
						)}
						<button
							type="submit"
							disabled={formLoading}
							style={{ background: "#0052CC", color: "#fff", border: "none", borderRadius: 10, padding: "12px 28px", fontWeight: 600, fontSize: "1rem", cursor: "pointer" }}
						>
							{formLoading ? "Adding..." : "Add Loan"}
						</button>
					</div>
				</form>

				{/* Loan Records Table */}
				<div style={{ marginBottom: 12 }}>
					<label style={{ fontWeight: 600 }}>Loan Records</label>
				</div>

				<div className={styles.breakSummaryTableWrapper} style={{ width: "100%", overflowX: "auto" }}>
					<table
						className={styles.breakSummaryTable}
						style={{ width: "100%", minWidth: 960, tableLayout: "fixed" }}
					>
						<colgroup>
							{showIdCol && <col style={{ width: "4%" }} />}
							{showFullNameCol && <col style={{ width: "11%" }} />}
							{showPNameCol && <col style={{ width: "8%" }} />}
							{showDepartmentCol && <col style={{ width: "9%" }} />}
							{showInstallmentsCol && <col style={{ width: "8%" }} />}
							{showLoanAmountCol && <col style={{ width: "10%" }} />}
							{showMonthCol && <col style={{ width: "8%" }} />}
							{showPerInstallmentCol && <col style={{ width: "8%" }} />}
							{showPayableThisMonthCol && <col style={{ width: "10%" }} />}
							{showPaidAmountCol && <col style={{ width: "8%" }} />}
							{showStatusCol && <col style={{ width: "8%" }} />}
							<col style={{ width: "10%" }} />
						</colgroup>
						<thead>
							<tr>
								{showIdCol && <th style={{ padding: "8px 10px", borderRight: "1px solid rgba(255,255,255,0.22)", overflow: "hidden" }}>ID</th>}
								{showFullNameCol && <th style={{ padding: "8px 10px", borderRight: "1px solid rgba(255,255,255,0.22)", overflow: "hidden" }}>Full Name</th>}
								{showPNameCol && <th style={{ padding: "8px 10px", borderRight: "1px solid rgba(255,255,255,0.22)", overflow: "hidden" }}>P.Name</th>}
								{showDepartmentCol && <th style={{ padding: "8px 10px", borderRight: "1px solid rgba(255,255,255,0.22)", overflow: "hidden" }}>Department</th>}
								{showInstallmentsCol && <th style={{ padding: "8px 12px 8px 10px", borderRight: "1px solid rgba(255,255,255,0.22)", overflow: "hidden" }}>Installments</th>}
								{showLoanAmountCol && <th style={{ padding: "8px 10px 8px 12px", borderRight: "1px solid rgba(255,255,255,0.22)", overflow: "hidden" }}>Loan Amount</th>}
								{showMonthCol && <th style={{ padding: "8px 10px", borderRight: "1px solid rgba(255,255,255,0.22)", overflow: "hidden" }}>Month</th>}
								{showPerInstallmentCol && <th style={{ padding: "8px 10px", borderRight: "1px solid rgba(255,255,255,0.22)", overflow: "hidden" }}>P. Installment</th>}
								{showPayableThisMonthCol && <th style={{ padding: "8px 10px", borderRight: "1px solid rgba(255,255,255,0.22)", overflow: "hidden" }}>Payable T.M</th>}
								{showPaidAmountCol && <th style={{ padding: "8px 10px", borderRight: "1px solid rgba(255,255,255,0.22)", overflow: "hidden" }}>Paid Amount</th>}
								{showStatusCol && <th style={{ padding: "8px 10px", borderRight: "1px solid rgba(255,255,255,0.22)", overflow: "hidden" }}>Status</th>}
								<th style={{ padding: "8px 10px", width: "9%", overflow: "hidden" }}>Actions</th>
							</tr>
						</thead>
						<tbody>
							{loading ? (
								<tr><td colSpan={visibleDataColsCount} className={styles.breakSummaryNoRecords}>Loading...</td></tr>
							) : error ? (
								<tr><td colSpan={visibleDataColsCount} className={styles.breakSummaryNoRecords} style={{ color: "#e53e3e" }}>{error}</td></tr>
							) : filteredLoans.length === 0 ? (
								<tr><td colSpan={visibleDataColsCount} className={styles.breakSummaryNoRecords}>No loan records found.</td></tr>
							) : (
								filteredLoans.map((loan) => (
									<tr key={loan.loan_key ?? `${loan.employee_id}-${loan.month}`}>
										{showIdCol && <td>{loan.employee_id}</td>}
										{showFullNameCol && <td>{getEmployeeName(loan.employee_id)}</td>}
										{showPNameCol && <td>{getEmployeeById(loan.employee_id)?.pseudonym || "--"}</td>}
										{showDepartmentCol && <td>{getEmployeeById(loan.employee_id)?.department_name || "--"}</td>}
										{showInstallmentsCol && <td>{loanMetaByEmployee[loan.employee_id]?.installments ?? 0}</td>}
										{showLoanAmountCol && <td>{round2(loanMetaByEmployee[loan.employee_id]?.loanAmount ?? 0)}</td>}
										{showMonthCol && <td>{loan.month}</td>}
										{showPerInstallmentCol && <td>{round2(loan.payable_this_month ?? loan.original_amount)}</td>}
										{showPayableThisMonthCol && (
										<td>
											{(() => {
												const rowKey = `${loan.employee_id}-${loan.month}`;
												const draft = payableDraftByKey[rowKey];
												const valueToShow = draft !== undefined ? draft : String(loan.payable_this_month ?? loan.original_amount ?? "");
												return (
											<input
												type="number"
												value={valueToShow}
												onChange={(e) => {
													const raw = e.target.value;
													setPayableDraftByKey((prev) => ({ ...prev, [rowKey]: raw }));
													const v = parseFloat(raw);
													if (raw !== "" && !isNaN(v) && v >= 0) {
														setLoans((prev) => {
															// Find all loans for this employee, sorted by month
															const allLoans = prev.filter(l => l.employee_id === loan.employee_id).sort((a, b) => a.month.localeCompare(b.month));
															const origTotal = allLoans.reduce((sum, l) => sum + (l.original_amount ?? 0), 0);
															const idx = allLoans.findIndex(l => l.month === loan.month);
															// Calculate paid so far (including new value)
															const paidSoFar = allLoans.slice(0, idx).reduce((sum, l) => sum + (l.payable_this_month ?? l.original_amount ?? 0), 0) + v;
															let remaining = origTotal - paidSoFar;
															const afterIdx = allLoans.slice(idx + 1);
															let perInstall = afterIdx.length > 0 ? Math.floor((remaining / afterIdx.length) * 100) / 100 : 0;
															let distributed = 0;
															// Build new loans array with updated values
															return prev.map(l => {
																if (l.employee_id !== loan.employee_id) return l;
																// If this is the changed month
																if (l.month === loan.month) return { ...l, payable_this_month: v };
																// If this is a future month
																const afterIdxIndex = afterIdx.findIndex(a => a.month === l.month);
																if (afterIdxIndex === -1) return l;
																// Last installment: assign all remaining
																if (afterIdxIndex === afterIdx.length - 1) {
																	return { ...l, payable_this_month: Math.max(0, Math.round((remaining - distributed) * 100) / 100) };
																} else {
																	distributed = Math.round((distributed + perInstall) * 100) / 100;
																	return { ...l, payable_this_month: Math.max(0, perInstall) };
																}
															});
														});
													}
												}}
												onBlur={(e) => {
													const raw = e.target.value;
													setPayableDraftByKey((prev) => {
														const next = { ...prev };
														delete next[rowKey];
														return next;
													});
													const v = parseFloat(raw);
													if (!isNaN(v) && v >= 0) {
														handleSave(
															loan,
															v,
															(loan.status || "pending").toLowerCase()
														);
													}
												}}
												min={0}
												step={0.01}
												className={styles.breakSummaryInput}
												style={{ width: 90, fontSize: 12, padding: "6px 8px" }}
											/>
												);
											})()}
										</td>
										)}
										{showPaidAmountCol && <td>{loan.paid_amount}</td>}
										{showStatusCol && (
										<td>
											<select
												value={(loan.status || "pending").toLowerCase()}
												onChange={(e) => handleStatusChange(loan, e.target.value)}
												className={styles.breakSummaryInput}
												style={{
													width: 90,
													fontSize: 12,
													padding: "6px 8px",
													fontWeight: 600,
													borderColor: (loan.status || "pending").toLowerCase() === "paid" ? "#38A169" : (loan.status || "pending").toLowerCase() === "stop" ? "#E53E3E" : "#DD6B20",
													background: (loan.status || "pending").toLowerCase() === "paid" ? "#F0FFF4" : (loan.status || "pending").toLowerCase() === "stop" ? "#FFF5F5" : "#FFFAF0",
													color: (loan.status || "pending").toLowerCase() === "paid" ? "#276749" : (loan.status || "pending").toLowerCase() === "stop" ? "#C53030" : "#C05621",
												}}
											>
												<option value="pending">Pending</option>
												<option value="paid">Paid</option>
												<option value="stop">Stop</option>
											</select>
										</td>
										)}
										<td
											style={{
												minWidth: 98,
												whiteSpace: "nowrap",
												textAlign: "center",
												verticalAlign: "middle",
											}}
										>
											<div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
											<button
												type="button"
												onClick={() =>
													handleSave(
														loan,
														loan.payable_this_month ?? loan.original_amount,
														(loan.status || "pending").toLowerCase()
													)
												}
												title="Save"
												disabled={savingRowKey === `${loan.employee_id}-${loan.month}`}
												style={{
													background: "none",
													border: "none",
													cursor: "pointer",
													padding: 3,
													width: 26,
													height: 26,
													display: "inline-flex",
													alignItems: "center",
													justifyContent: "center",
													color: "#0052CC",
													opacity: savingRowKey === `${loan.employee_id}-${loan.month}` ? 0.6 : 1,
												}}
											>
												<FaSave size={18} />
											</button>
											<button
												type="button"
												onClick={() => handleDelete(loan.employee_id, loan.month)}
												title="Delete"
												style={{
													background: "none",
													border: "none",
													cursor: "pointer",
													padding: 3,
													width: 26,
													height: 26,
													display: "inline-flex",
													alignItems: "center",
													justifyContent: "center",
													color: "#e53e3e",
												}}
											>
												<FaTrash size={18} />
											</button>
											</div>
										</td>
									</tr>
								))
							)}
						</tbody>
					</table>
				</div>

				{extendModalOpen && (
					<div
						style={{
							position: "fixed",
							inset: 0,
							background: "rgba(15,23,42,0.35)",
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							zIndex: 1200,
						}}
					>
						<div
							style={{
								width: 360,
								background: "#fff",
								borderRadius: 12,
								padding: 18,
								boxShadow: "0 12px 28px rgba(0,0,0,0.2)",
								border: "1px solid #e2e8f0",
							}}
						>
							<div style={{ fontWeight: 700, marginBottom: 8, color: "#1f2937" }}>Increase Installments</div>
							<div style={{ fontSize: 13, color: "#475569", marginBottom: 12 }}>
								You reduced this month payable. Add extra months to further divide remaining loan amount.
							</div>
							<label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>
								Extra months
							</label>
							<input
								type="number"
								min={0}
								step={1}
								value={extendMonthsInput}
								onChange={(e) => setExtendMonthsInput(e.target.value)}
								className={styles.breakSummaryInput}
								style={{ width: "100%", marginBottom: 14 }}
							/>
							<div style={{ display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
								<button
									type="button"
									onClick={() => {
										setExtendModalOpen(false);
										setPendingSave(null);
									}}
									style={{
										border: "1px solid #cbd5e1",
										background: "#fff",
										color: "#334155",
										padding: "6px 10px",
										borderRadius: 8,
										cursor: "pointer",
										fontWeight: 600,
										fontSize: 12,
										lineHeight: 1.1,
									}}
								>
									Close
								</button>
								<button
									type="button"
									onClick={async () => {
										if (!pendingSave) return;
										setExtendModalOpen(false);
										await runSave(pendingSave.loan, pendingSave.payable, pendingSave.status, 0);
										setPendingSave(null);
									}}
									style={{
										border: "1px solid #93c5fd",
										background: "#eff6ff",
										color: "#1d4ed8",
										padding: "6px 10px",
										borderRadius: 8,
										cursor: "pointer",
										fontWeight: 600,
										fontSize: 12,
										lineHeight: 1.1,
									}}
								>
									Readjust
								</button>
								<button
									type="button"
									onClick={confirmExtendAndSave}
									style={{
										border: "none",
										background: "#0052CC",
										color: "#fff",
										padding: "6px 10px",
										borderRadius: 8,
										cursor: "pointer",
										fontWeight: 600,
										fontSize: 12,
										lineHeight: 1.1,
									}}
								>
									Extend
								</button>
							</div>
						</div>
					</div>
				)}
			</div>
		</LayoutDashboard>
	);
}

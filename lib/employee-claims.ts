import { query } from "@/lib/db";
import {
  medicalIpdEntitlementForPackage,
  medicalOpdEntitlement,
  normalizeMedicalPackage,
  type MedicalPackageId,
} from "@/lib/medical-package";

/** opd = pharmacy/medicine; ipd = hospital admit; medical = legacy alias of opd. */
export type ClaimType = "opd" | "ipd" | "medical" | "travel" | "other";
export type ClaimStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "paid"
  | "cancelled";

export type EmployeeClaim = {
  id: number;
  employee_id: number;
  claim_year: string;
  claim_type: ClaimType;
  title: string | null;
  amount: number;
  claim_date: string;
  status: ClaimStatus;
  notes: string | null;
  receipt_path: string | null;
  created_by: string | null;
  created_by_employee_id: number | null;
  approved_by_employee_id: number | null;
  approved_at: string | null;
  payroll_month: string | null;
  created_at: string;
  updated_at: string;
  employee_name?: string;
  pseudonym?: string | null;
  department_name?: string | null;
};

export type ClaimBalance = {
  employee_id: number;
  year: string;
  claim_type: ClaimType;
  medical_package: MedicalPackageId | null;
  entitlement: number;
  entitlement_source: "package" | "override" | "none" | "policy";
  used: number;
  pending: number;
  remaining: number;
  claims_count: number;
};

const COUNTS_AS_USED: ClaimStatus[] = ["approved", "paid"];
const COUNTS_AS_PENDING: ClaimStatus[] = ["pending"];

function money(n: unknown): number {
  const v = Number(n);
  return Number.isFinite(v) ? Math.round(v * 100) / 100 : 0;
}

function yearOrCurrent(raw?: string | null): string {
  if (raw && /^\d{4}$/.test(raw)) return raw;
  return String(new Date().getFullYear());
}

export function normalizeClaimType(raw: unknown): ClaimType {
  const v = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (v === "ipd") return "ipd";
  if (v === "travel" || v === "other") return v;
  if (v === "medical") return "medical";
  return "opd";
}

/** Pool key used for entitlement / usage (legacy medical → opd). */
export function claimBalancePool(type: ClaimType): "opd" | "ipd" | "travel" | "other" {
  if (type === "ipd") return "ipd";
  if (type === "travel") return "travel";
  if (type === "other") return "other";
  return "opd";
}

export function normalizeClaimStatus(raw: unknown): ClaimStatus {
  const v = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (
    v === "pending" ||
    v === "approved" ||
    v === "rejected" ||
    v === "paid" ||
    v === "cancelled"
  ) {
    return v;
  }
  return "approved";
}

/** @deprecated Use medicalOpdEntitlement / medicalIpdEntitlementForPackage. */
export function yearlyEntitlementFromPackage(
  pkg: MedicalPackageId | null | undefined,
): number {
  return medicalIpdEntitlementForPackage(pkg);
}

function usageTypesForPool(pool: "opd" | "ipd" | "travel" | "other"): string[] {
  if (pool === "opd") return ["opd", "medical"];
  return [pool];
}

async function ensureClaimsTables(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS employee_claims (
      id int(11) NOT NULL AUTO_INCREMENT,
      employee_id int(11) NOT NULL,
      claim_year varchar(4) NOT NULL,
      claim_type varchar(40) NOT NULL DEFAULT 'medical',
      title varchar(255) DEFAULT NULL,
      amount decimal(12,2) NOT NULL,
      claim_date date NOT NULL,
      status varchar(20) NOT NULL DEFAULT 'approved',
      notes varchar(500) DEFAULT NULL,
      receipt_path varchar(512) DEFAULT NULL,
      created_by varchar(100) DEFAULT NULL,
      created_by_employee_id int(11) DEFAULT NULL,
      approved_by_employee_id int(11) DEFAULT NULL,
      approved_at datetime DEFAULT NULL,
      payroll_month varchar(7) DEFAULT NULL,
      created_at timestamp NOT NULL DEFAULT current_timestamp(),
      updated_at timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
      PRIMARY KEY (id),
      KEY idx_claims_employee_year (employee_id, claim_year),
      KEY idx_claims_status (status),
      KEY idx_claims_date (claim_date),
      KEY idx_claims_type (claim_type)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS employee_claim_entitlements (
      id int(11) NOT NULL AUTO_INCREMENT,
      employee_id int(11) NOT NULL,
      claim_year varchar(4) NOT NULL,
      claim_type varchar(40) NOT NULL DEFAULT 'medical',
      entitlement_amount decimal(12,2) NOT NULL,
      notes varchar(255) DEFAULT NULL,
      updated_by varchar(100) DEFAULT NULL,
      created_at timestamp NOT NULL DEFAULT current_timestamp(),
      updated_at timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
      PRIMARY KEY (id),
      UNIQUE KEY uq_entitlement_emp_year_type (employee_id, claim_year, claim_type)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  `);
}

export async function getEmployeeMedicalPackage(
  employeeId: number,
): Promise<MedicalPackageId | null> {
  const [rows]: any = await query(
    `SELECT medical_package FROM employee_salaries
     WHERE employee_id = ?
     ORDER BY id DESC LIMIT 1`,
    [employeeId],
  );
  const list = Array.isArray(rows) ? rows : [];
  return normalizeMedicalPackage(list[0]?.medical_package);
}

async function getEntitlementOverride(
  employeeId: number,
  year: string,
  claimType: ClaimType,
): Promise<number | null> {
  const [rows]: any = await query(
    `SELECT entitlement_amount FROM employee_claim_entitlements
     WHERE employee_id = ? AND claim_year = ? AND claim_type = ?
     LIMIT 1`,
    [employeeId, year, claimType],
  );
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) return null;
  return money(list[0].entitlement_amount);
}

export async function resolveClaimBalance(input: {
  employeeId: number;
  year?: string;
  claimType?: ClaimType;
}): Promise<ClaimBalance> {
  await ensureClaimsTables();
  const year = yearOrCurrent(input.year);
  const claimType = normalizeClaimType(input.claimType || "opd");
  const pool = claimBalancePool(claimType);
  const employeeId = Number(input.employeeId);

  const override = await getEntitlementOverride(
    employeeId,
    year,
    pool === "opd" ? "opd" : claimType,
  );
  const pkg = await getEmployeeMedicalPackage(employeeId);

  let entitlement = 0;
  let entitlement_source: ClaimBalance["entitlement_source"] = "none";
  if (override != null) {
    entitlement = override;
    entitlement_source = "override";
  } else if (pool === "opd") {
    // All employees get fixed OPD pool (150k), independent of package.
    entitlement = medicalOpdEntitlement();
    entitlement_source = "policy";
  } else if (pool === "ipd") {
    entitlement = medicalIpdEntitlementForPackage(pkg);
    entitlement_source = pkg ? "package" : "none";
  }

  const types = usageTypesForPool(pool);
  const placeholders = types.map(() => "?").join(",");
  const [rows]: any = await query(
    `SELECT status, amount FROM employee_claims
     WHERE employee_id = ? AND claim_year = ? AND claim_type IN (${placeholders})
       AND status NOT IN ('cancelled','rejected')`,
    [employeeId, year, ...types],
  );
  const list = Array.isArray(rows) ? rows : [];
  let used = 0;
  let pending = 0;
  for (const r of list) {
    const st = normalizeClaimStatus(r.status);
    const amt = money(r.amount);
    if (COUNTS_AS_USED.includes(st)) used += amt;
    else if (COUNTS_AS_PENDING.includes(st)) pending += amt;
  }

  const remaining = Math.max(0, Math.round((entitlement - used) * 100) / 100);

  return {
    employee_id: employeeId,
    year,
    claim_type: pool === "opd" ? "opd" : claimType,
    medical_package: pkg,
    entitlement,
    entitlement_source,
    used: Math.round(used * 100) / 100,
    pending: Math.round(pending * 100) / 100,
    remaining,
    claims_count: list.length,
  };
}

/** OPD + IPD balances for an employee (package-aware). */
export async function resolveMedicalClaimBalances(input: {
  employeeId: number;
  year?: string;
}): Promise<{
  year: string;
  medical_package: MedicalPackageId | null;
  opd: ClaimBalance;
  ipd: ClaimBalance;
}> {
  const year = yearOrCurrent(input.year);
  const [opd, ipd] = await Promise.all([
    resolveClaimBalance({
      employeeId: input.employeeId,
      year,
      claimType: "opd",
    }),
    resolveClaimBalance({
      employeeId: input.employeeId,
      year,
      claimType: "ipd",
    }),
  ]);
  return {
    year,
    medical_package: opd.medical_package ?? ipd.medical_package,
    opd,
    ipd,
  };
}

function mapClaimRow(r: any): EmployeeClaim {
  return {
    id: Number(r.id),
    employee_id: Number(r.employee_id),
    claim_year: String(r.claim_year || ""),
    claim_type: normalizeClaimType(r.claim_type),
    title: r.title ?? null,
    amount: money(r.amount),
    claim_date: String(r.claim_date || "").slice(0, 10),
    status: normalizeClaimStatus(r.status),
    notes: r.notes ?? null,
    receipt_path: r.receipt_path ?? null,
    created_by: r.created_by ?? null,
    created_by_employee_id:
      r.created_by_employee_id != null ? Number(r.created_by_employee_id) : null,
    approved_by_employee_id:
      r.approved_by_employee_id != null
        ? Number(r.approved_by_employee_id)
        : null,
    approved_at: r.approved_at ? String(r.approved_at) : null,
    payroll_month: r.payroll_month ?? null,
    created_at: String(r.created_at || ""),
    updated_at: String(r.updated_at || ""),
    employee_name: r.employee_name || undefined,
    pseudonym: r.pseudonym ?? null,
    department_name: r.department_name ?? null,
  };
}

export async function listClaims(input?: {
  year?: string;
  employeeId?: number | null;
  status?: string | null;
  claimType?: string | null;
}): Promise<EmployeeClaim[]> {
  await ensureClaimsTables();
  const year = yearOrCurrent(input?.year);
  const params: any[] = [year];
  let sql = `
    SELECT c.*,
      TRIM(CONCAT(COALESCE(e.first_name,''),' ',COALESCE(e.middle_name,''),' ',COALESCE(e.last_name,''))) AS employee_name,
      e.pseudonym,
      d.name AS department_name
    FROM employee_claims c
    LEFT JOIN hrm_employees e ON e.id = c.employee_id
    LEFT JOIN employee_jobs j ON j.employee_id = e.id
    LEFT JOIN departments d ON d.id = j.department_id
    WHERE c.claim_year = ?
  `;
  if (input?.employeeId != null && Number.isFinite(input.employeeId)) {
    sql += ` AND c.employee_id = ?`;
    params.push(Number(input.employeeId));
  }
  if (input?.status) {
    sql += ` AND c.status = ?`;
    params.push(normalizeClaimStatus(input.status));
  }
  if (input?.claimType) {
    sql += ` AND c.claim_type = ?`;
    params.push(normalizeClaimType(input.claimType));
  }
  sql += ` ORDER BY c.claim_date DESC, c.id DESC`;

  const [rows]: any = await query(sql, params);
  return (Array.isArray(rows) ? rows : []).map(mapClaimRow);
}

export async function createClaim(input: {
  employeeId: number;
  amount: number;
  claimDate?: string;
  claimType?: ClaimType;
  title?: string | null;
  notes?: string | null;
  status?: ClaimStatus;
  createdBy?: string | null;
  createdByEmployeeId?: number | null;
  allowOverBalance?: boolean;
}): Promise<{ claim: EmployeeClaim; balance: ClaimBalance }> {
  await ensureClaimsTables();
  const employeeId = Number(input.employeeId);
  const amount = money(input.amount);
  if (!Number.isFinite(employeeId) || employeeId <= 0) {
    throw new Error("employee_id required");
  }
  if (!(amount > 0)) throw new Error("amount must be greater than 0");

  const claimDate = (input.claimDate || new Date().toISOString().slice(0, 10)).slice(
    0,
    10,
  );
  if (!/^\d{4}-\d{2}-\d{2}$/.test(claimDate)) {
    throw new Error("claim_date must be YYYY-MM-DD");
  }
  const claimYear = claimDate.slice(0, 4);
  const claimType = normalizeClaimType(input.claimType || "opd");
  const status = normalizeClaimStatus(input.status || "approved");

  const balance = await resolveClaimBalance({
    employeeId,
    year: claimYear,
    claimType,
  });

  if (
    !input.allowOverBalance &&
    COUNTS_AS_USED.includes(status) &&
    amount > balance.remaining + 0.001
  ) {
    throw new Error(
      `Amount exceeds remaining balance (${balance.remaining.toLocaleString()}).`,
    );
  }

  const approvedAt =
    status === "approved" || status === "paid"
      ? new Date().toISOString().slice(0, 19).replace("T", " ")
      : null;
  const payrollMonth = claimDate.slice(0, 7);

  const [result]: any = await query(
    `INSERT INTO employee_claims
      (employee_id, claim_year, claim_type, title, amount, claim_date, status, notes,
       created_by, created_by_employee_id, approved_by_employee_id, approved_at, payroll_month)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      employeeId,
      claimYear,
      claimType,
      input.title?.trim() || null,
      amount,
      claimDate,
      status,
      input.notes?.trim() || null,
      input.createdBy?.trim() || null,
      input.createdByEmployeeId ?? null,
      approvedAt && input.createdByEmployeeId ? input.createdByEmployeeId : null,
      approvedAt,
      payrollMonth,
    ],
  );

  const insertId = Number(result?.insertId || 0);
  const rows = await listClaims({ year: claimYear, employeeId });
  const claim = rows.find((c) => c.id === insertId) || rows[0];
  if (!claim) throw new Error("Claim created but could not reload");

  const nextBalance = await resolveClaimBalance({
    employeeId,
    year: claimYear,
    claimType,
  });
  return { claim, balance: nextBalance };
}

export async function getClaimById(id: number): Promise<EmployeeClaim | null> {
  await ensureClaimsTables();
  const [rows]: any = await query(
    `SELECT c.*,
      TRIM(CONCAT(COALESCE(e.first_name,''),' ',COALESCE(e.middle_name,''),' ',COALESCE(e.last_name,''))) AS employee_name,
      e.pseudonym,
      d.name AS department_name
     FROM employee_claims c
     LEFT JOIN hrm_employees e ON e.id = c.employee_id
     LEFT JOIN employee_jobs j ON j.employee_id = e.id
     LEFT JOIN departments d ON d.id = j.department_id
     WHERE c.id = ? LIMIT 1`,
    [Number(id)],
  );
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) return null;
  return mapClaimRow(list[0]);
}

export async function updateClaimStatus(input: {
  id: number;
  status: ClaimStatus;
  notes?: string | null;
  approvedByEmployeeId?: number | null;
}): Promise<EmployeeClaim> {
  await ensureClaimsTables();
  const id = Number(input.id);
  const status = normalizeClaimStatus(input.status);
  const approvedAt =
    status === "approved" || status === "paid"
      ? new Date().toISOString().slice(0, 19).replace("T", " ")
      : null;

  await query(
    `UPDATE employee_claims
     SET status = ?,
         notes = COALESCE(?, notes),
         approved_by_employee_id = COALESCE(?, approved_by_employee_id),
         approved_at = COALESCE(?, approved_at),
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [
      status,
      input.notes?.trim() || null,
      input.approvedByEmployeeId ?? null,
      approvedAt,
      id,
    ],
  );

  const claim = await getClaimById(id);
  if (!claim) throw new Error("Claim not found");
  return claim;
}

export async function companyClaimsSummary(year?: string): Promise<{
  year: string;
  total_claims: number;
  total_approved_amount: number;
  total_pending_amount: number;
  employees_with_claims: number;
}> {
  await ensureClaimsTables();
  const y = yearOrCurrent(year);
  const [rows]: any = await query(
    `SELECT
       COUNT(*) AS total_claims,
       COUNT(DISTINCT employee_id) AS employees_with_claims,
       COALESCE(SUM(CASE WHEN status IN ('approved','paid') THEN amount ELSE 0 END),0) AS total_approved_amount,
       COALESCE(SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END),0) AS total_pending_amount
     FROM employee_claims
     WHERE claim_year = ? AND status <> 'cancelled'`,
    [y],
  );
  const r = Array.isArray(rows) ? rows[0] : null;
  return {
    year: y,
    total_claims: Number(r?.total_claims || 0),
    total_approved_amount: money(r?.total_approved_amount),
    total_pending_amount: money(r?.total_pending_amount),
    employees_with_claims: Number(r?.employees_with_claims || 0),
  };
}

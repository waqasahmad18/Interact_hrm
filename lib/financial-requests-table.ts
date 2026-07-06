import { pool } from "@/lib/db";

export const FINANCIAL_REQUESTS_TABLE = "employee_financial_requests";

export type FinancialRequestType = "advance" | "loan";
export type FinancialRequestStatus = "pending" | "approved" | "rejected";

export type FinancialRequestRow = {
  id: number;
  employee_id: string;
  employee_name: string;
  request_type: FinancialRequestType;
  amount: number;
  installments: number | null;
  start_month: string | null;
  reason: string | null;
  status: FinancialRequestStatus;
  admin_remark: string | null;
  requested_at: string;
  updated_at: string;
};

export async function ensureFinancialRequestsTable() {
  const conn = await pool.getConnection();
  try {
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS ${FINANCIAL_REQUESTS_TABLE} (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT,
        employee_id VARCHAR(64) NOT NULL,
        employee_name VARCHAR(255) NOT NULL,
        request_type ENUM('advance', 'loan') NOT NULL,
        amount DECIMAL(12,2) NOT NULL,
        installments INT UNSIGNED NULL,
        start_month VARCHAR(7) NULL,
        reason TEXT NULL,
        status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
        admin_remark TEXT NULL,
        requested_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_efr_status (status),
        KEY idx_efr_employee (employee_id),
        KEY idx_efr_type (request_type)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  } finally {
    conn.release();
  }
}

import { broadcastWsEvent } from "@/lib/ws-broadcast";

export function broadcastFinancialRequestUpdate() {
  broadcastWsEvent({ type: "financial_request_update" });
}

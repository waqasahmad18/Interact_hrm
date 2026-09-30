import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { pool } from "@/lib/db";

function viewerIdFrom(req: NextRequest) {
  return (
    req.headers.get("x-hrm-employee-id") ||
    req.headers.get("x-employee-id") ||
    req.nextUrl.searchParams.get("viewerId") ||
    ""
  ).trim();
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim();
    const departmentId = searchParams.get("departmentId");

    let sql = `SELECT e.id, e.first_name, e.last_name, e.employee_code, e.pseudonym,
                      d.name AS department_name,
                      COUNT(DISTINCT doc.id) AS document_count,
                      SUM(CASE WHEN doc.folder_type = 'personal_upload' THEN 1 ELSE 0 END) AS upload_count,
                      SUM(CASE WHEN doc.source_type IN ('warning','appraisal','hr_upload') THEN 1 ELSE 0 END) AS hr_issued_count
               FROM hrm_employees e
               LEFT JOIN employee_jobs j ON j.employee_id = e.id
               LEFT JOIN departments d ON d.id = j.department_id
               LEFT JOIN hrm_employee_documents doc
                 ON doc.employee_id = e.id AND doc.deleted_at IS NULL
               WHERE 1=1`;
    const params: (string | number)[] = [];

    if (q) {
      sql += ` AND (
        CONCAT(e.first_name, ' ', e.last_name) LIKE ?
        OR CAST(e.id AS CHAR) LIKE ?
        OR e.employee_code LIKE ?
        OR e.pseudonym LIKE ?
      )`;
      const like = `%${q}%`;
      params.push(like, like, like, like);
    }
    if (departmentId) {
      sql += ` AND j.department_id = ?`;
      params.push(Number(departmentId));
    }

    sql += ` GROUP BY e.id, e.first_name, e.last_name, e.employee_code, e.pseudonym, d.name
             ORDER BY e.first_name, e.last_name
             LIMIT 500`;

    const [rows] = await pool.execute<RowDataPacket[]>(sql, params);
    let employees = rows as RowDataPacket[];

    const viewerId = viewerIdFrom(req);
    if (viewerId) {
      try {
        const { resolveViewerDataScope, rowInViewerScope } = await import(
          "@/lib/access-control/data-scope"
        );
        const scope = await resolveViewerDataScope(viewerId);
        if (scope.mode !== "all") {
          employees = employees.filter((e) =>
            rowInViewerScope(scope, {
              employeeId: e.id,
              departmentName: e.department_name,
            }),
          );
        }
      } catch {
        /* keep list if scope helper fails */
      }
    }

    return NextResponse.json({ success: true, employees });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Failed" },
      { status: 500 }
    );
  }
}

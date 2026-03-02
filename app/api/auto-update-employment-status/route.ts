import { NextRequest, NextResponse } from "next/server";
import { pool } from "../../../lib/db";

type EligibleEmployee = {
	employee_id: string;
	employee_code: string | null;
	joined_date: string;
	days_since_joining: number;
};

async function runAutoUpdate() {
	let conn;
	try {
		conn = await pool.getConnection();

		const [allProbationRows] = await conn.execute(
			`SELECT
				 CAST(e.id AS CHAR) AS employee_id,
				 e.employee_code,
				 j.joined_date,
				 DATEDIFF(CURDATE(), j.joined_date) AS days_since_joining
			 FROM hrm_employees e
			 LEFT JOIN employee_jobs j ON e.id = j.employee_id
			 WHERE LOWER(TRIM(COALESCE(e.employment_status, ''))) = 'probation'
				 AND j.joined_date IS NOT NULL
			 ORDER BY j.joined_date ASC`
		);

		const probationEmployees = (allProbationRows as any[]).map((row) => ({
			employee_id: String(row.employee_id),
			employee_code: row.employee_code || null,
			joined_date: String(row.joined_date).slice(0, 10),
			days_since_joining: Number(row.days_since_joining || 0),
		}));

		const [eligibleRows] = await conn.execute(
			`SELECT
				 CAST(e.id AS CHAR) AS employee_id,
				 e.employee_code,
				 j.joined_date,
				 DATEDIFF(CURDATE(), j.joined_date) AS days_since_joining
			 FROM hrm_employees e
			 JOIN employee_jobs j ON e.id = j.employee_id
			 WHERE LOWER(TRIM(COALESCE(e.employment_status, ''))) = 'probation'
				 AND j.joined_date IS NOT NULL
				 AND DATE_ADD(j.joined_date, INTERVAL 3 MONTH) <= CURDATE()
			 ORDER BY j.joined_date ASC`
		);

		const eligibleEmployees: EligibleEmployee[] = (eligibleRows as any[]).map(
			(row) => ({
				employee_id: String(row.employee_id),
				employee_code: row.employee_code || null,
				joined_date: String(row.joined_date).slice(0, 10),
				days_since_joining: Number(row.days_since_joining || 0),
			})
		);

		if (eligibleEmployees.length === 0) {
			return {
				success: true,
				message:
					"Auto-update completed. 0 employees promoted from Probation to Permanent.",
				updated_count: 0,
				total_probation_employees: probationEmployees.length,
				updated_employees: [],
			};
		}

		await conn.beginTransaction();
		await conn.execute(
			`UPDATE hrm_employees e
			 JOIN employee_jobs j ON e.id = j.employee_id
			 SET e.employment_status = 'Permanent',
					 j.employment_status = 'Permanent'
			 WHERE LOWER(TRIM(COALESCE(e.employment_status, ''))) = 'probation'
				 AND j.joined_date IS NOT NULL
				 AND DATE_ADD(j.joined_date, INTERVAL 3 MONTH) <= CURDATE()`
		);
		await conn.commit();

		return {
			success: true,
			message: `Auto-update completed. ${eligibleEmployees.length} employees promoted from Probation to Permanent.`,
			updated_count: eligibleEmployees.length,
			total_probation_employees: probationEmployees.length,
			updated_employees: eligibleEmployees,
		};
	} catch (error) {
		if (conn) {
			try {
				await conn.rollback();
			} catch {
			}
		}
		throw error;
	} finally {
		if (conn) conn.release();
	}
}

export async function GET(_req: NextRequest) {
	try {
		const result = await runAutoUpdate();
		return NextResponse.json(result);
	} catch (error) {
		const errMsg = error instanceof Error ? error.message : String(error);
		console.error("auto-update-employment-status GET error:", error);
		return NextResponse.json({ success: false, error: errMsg }, { status: 500 });
	}
}

export async function POST(_req: NextRequest) {
	try {
		const result = await runAutoUpdate();
		return NextResponse.json(result);
	} catch (error) {
		const errMsg = error instanceof Error ? error.message : String(error);
		console.error("auto-update-employment-status POST error:", error);
		return NextResponse.json({ success: false, error: errMsg }, { status: 500 });
	}
}

import { NextRequest, NextResponse } from "next/server";
import type { PoolConnection } from "mysql2/promise";
import { upsertShiftAssignment } from "@/lib/shift-assignment-upsert";
import { pool, query } from "../../../lib/db";

function parseAllowOvertime(value: unknown, defaultValue = false): boolean {
  if (value === undefined || value === null || value === "") return defaultValue;
  if (value === true || value === 1 || value === "1") return true;
  return false;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const employeeId = searchParams.get("employeeId");

    if (employeeId) {
      // Get specific employee's shift assignment
      const [result] = (await query(
        `SELECT 
          sa.id,
          sa.employee_id,
          e.first_name,
          e.last_name,
          e.employee_code,
          sa.shift_name,
          sa.start_time,
          sa.end_time,
          sa.assigned_date,
          sa.allow_overtime,
          sa.created_at,
          sa.updated_at
        FROM shift_assignments sa
        JOIN hrm_employees e ON sa.employee_id = e.id
        WHERE sa.employee_id = ?
        ORDER BY sa.assigned_date DESC
        LIMIT 1`,
        [employeeId]
      )) as any;
      return NextResponse.json({ success: true, assignment: result[0] || null });
    }

    // Merge in JS — correlated subquery JOIN breaks on Mongo SQL adapter
    // (staging/prod), so assign succeeds but list still shows "Not assigned".
    const [empRows] = (await query(
      `SELECT id, first_name, last_name, status
       FROM hrm_employees
       WHERE status IS NOT NULL
       ORDER BY id ASC`,
    )) as any;
    const [assignRows] = (await query(
      `SELECT id, employee_id, shift_name, start_time, end_time, assigned_date, allow_overtime, created_at
       FROM shift_assignments`,
    )) as any;

    const dateKey = (v: unknown) => {
      if (!v) return "";
      if (v instanceof Date && !Number.isNaN(v.getTime())) {
        const y = v.getFullYear();
        const m = String(v.getMonth() + 1).padStart(2, "0");
        const d = String(v.getDate()).padStart(2, "0");
        return `${y}-${m}-${d}`;
      }
      return String(v).slice(0, 10);
    };
    const isComplete = (a: any) =>
      Boolean(a?.shift_name && a?.start_time && a?.end_time);
    const betterThan = (a: any, b: any) => {
      const aOk = isComplete(a) ? 0 : 1;
      const bOk = isComplete(b) ? 0 : 1;
      if (aOk !== bOk) return aOk < bOk;
      const da = dateKey(a.assigned_date);
      const db = dateKey(b.assigned_date);
      if (da !== db) return da > db;
      return Number(a.id || 0) > Number(b.id || 0);
    };

    const bestByEmp = new Map<string, any>();
    for (const row of assignRows || []) {
      const empId = String(row.employee_id ?? "").trim();
      if (!empId) continue;
      const prev = bestByEmp.get(empId);
      if (!prev || betterThan(row, prev)) bestByEmp.set(empId, row);
    }

    const employees = (empRows || []).map((e: any) => {
      const a = bestByEmp.get(String(e.id));
      return {
        id: e.id,
        first_name: e.first_name,
        last_name: e.last_name,
        status: e.status,
        assignment_id: a?.id ?? null,
        shift_name: a?.shift_name ?? null,
        start_time: a?.start_time ?? null,
        end_time: a?.end_time ?? null,
        assigned_date: a?.assigned_date ?? null,
        allow_overtime: a?.allow_overtime ?? null,
        created_at: a?.created_at ?? null,
      };
    });

    return NextResponse.json({ success: true, employees });
  } catch (error: any) {
    console.error("Error fetching shift assignments:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  let conn: PoolConnection | undefined;
  try {
    const body = await req.json();
    const {
      employee_id,
      employee_ids,
      shift_name,
      start_time,
      end_time,
      assigned_date,
      assign_all,
      department_id,
      allow_overtime,
    } = body;

    if (!shift_name || !start_time || !end_time) {
      return NextResponse.json(
        { success: false, error: "Missing required fields" },
        { status: 400 }
      );
    }

    const assignDate = assigned_date || new Date().toISOString().split("T")[0];
    const allowOT = parseAllowOvertime(allow_overtime, false);
    const shiftName = String(shift_name).trim();
    const startTime = String(start_time).trim();
    const endTime = String(end_time).trim();

    conn = await pool.getConnection();

    const upsertOne = async (rawEmpId: number | string) => {
      const empId = Number(rawEmpId);
      if (!Number.isFinite(empId) || empId <= 0) {
        throw new Error(`Invalid employee id: ${rawEmpId}`);
      }
      await upsertShiftAssignment(
        conn!,
        empId,
        shiftName,
        startTime,
        endTime,
        assignDate,
        allowOT,
      );
    };

    // Assign to all active employees
    if (assign_all) {
      const [allEmployees] = await conn.execute(
        `SELECT id FROM hrm_employees WHERE status IN ('enabled', 'active')`,
      );
      for (const row of allEmployees as { id: number }[]) {
        await upsertOne(row.id);
      }

      return NextResponse.json({ success: true, message: "Shift assigned to all employees" });
    }

    // Assign to a department
    if (department_id) {
      let [deptEmployees] = await conn.execute(
        `SELECT DISTINCT employee_id FROM employee_jobs WHERE department_id = ?`,
        [department_id],
      );

      if ((deptEmployees as unknown[]).length === 0) {
        const [deptEmployeesFallback] = await conn.execute(
          `SELECT id as employee_id FROM hrm_employees WHERE department_id = ? AND status IN ('enabled', 'active')`,
          [department_id],
        );
        deptEmployees = deptEmployeesFallback;
      }

      const deptRows = deptEmployees as { employee_id: number }[];
      if (deptRows.length === 0) {
        return NextResponse.json(
          { success: false, error: "No employees found for this department" },
          { status: 404 },
        );
      }

      for (const row of deptRows) {
        await upsertOne(row.employee_id);
      }

      return NextResponse.json({
        success: true,
        message: `Shift assigned to ${deptRows.length} employee(s) in department`,
      });
    }

    // Multiple specific employees
    if (employee_ids && Array.isArray(employee_ids) && employee_ids.length > 0) {
      for (const empId of employee_ids) {
        await upsertOne(empId);
      }

      return NextResponse.json({ success: true, message: "Shift assigned to selected employees" });
    }

    // Single employee assignment
    if (!employee_id) {
      return NextResponse.json(
        { success: false, error: "Employee ID is required" },
        { status: 400 },
      );
    }

    await upsertOne(employee_id);

    return NextResponse.json({
      success: true,
      message: "Shift assignment saved successfully",
    });
  } catch (error: any) {
    console.error("Error saving shift assignment:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 },
    );
  } finally {
    conn?.release();
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, employee_id, employee_ids, shift_name, start_time, end_time, allow_overtime, assigned_date } = body;

    const hasBulkEmployees = Array.isArray(employee_ids) && employee_ids.length > 0;
    const hasSingleEmployee = !!employee_id;

    // Bulk/single update by employee id(s): update latest assignment OT flag, or create OT-only row if no assignment exists
    if (!id && (hasBulkEmployees || hasSingleEmployee)) {
      if (allow_overtime === undefined) {
        return NextResponse.json(
          { success: false, error: "allow_overtime is required for employee-based overtime update" },
          { status: 400 }
        );
      }

      const targetEmployeeIds = hasBulkEmployees
        ? employee_ids.map((empId: any) => Number(empId)).filter((empId: number) => Number.isFinite(empId) && empId > 0)
        : [Number(employee_id)].filter((empId: number) => Number.isFinite(empId) && empId > 0);

      if (targetEmployeeIds.length === 0) {
        return NextResponse.json(
          { success: false, error: "Valid employee id(s) are required" },
          { status: 400 }
        );
      }

      const allowOTValue = allow_overtime ? 1 : 0;
      const assignDate = new Date().toISOString().split("T")[0];

      for (const empId of targetEmployeeIds) {
        const [latestAssignment] = (await query(
          `SELECT id FROM shift_assignments WHERE employee_id = ? ORDER BY assigned_date DESC, id DESC LIMIT 1`,
          [empId]
        )) as any;

        if (latestAssignment.length > 0) {
          await query(
            `UPDATE shift_assignments
             SET allow_overtime = ?, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [allowOTValue, latestAssignment[0].id]
          );
        }
      }

      return NextResponse.json({ success: true, updated: targetEmployeeIds.length });
    }

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Assignment ID is required" },
        { status: 400 }
      );
    }

    const [existingAssignmentRows] = (await query(
      `SELECT id, employee_id, shift_name, start_time, end_time, assigned_date, allow_overtime
       FROM shift_assignments
       WHERE id = ?
       LIMIT 1`,
      [id]
    )) as any;

    if (existingAssignmentRows.length === 0) {
      return NextResponse.json(
        { success: false, error: "Assignment not found" },
        { status: 404 }
      );
    }

    const existingAssignment = existingAssignmentRows[0];
    const currentAssignedDate = existingAssignment.assigned_date instanceof Date
      ? existingAssignment.assigned_date.toISOString().split("T")[0]
      : String(existingAssignment.assigned_date).slice(0, 10);
    const effectiveDate = assigned_date || new Date().toISOString().split("T")[0];

    const nextShiftName = shift_name !== undefined ? shift_name : existingAssignment.shift_name;
    const nextStartTime = start_time !== undefined ? start_time : existingAssignment.start_time;
    const nextEndTime = end_time !== undefined ? end_time : existingAssignment.end_time;
    const nextAllowOvertime = allow_overtime !== undefined
      ? (allow_overtime ? 1 : 0)
      : existingAssignment.allow_overtime;

    const shouldCreateEffectiveDatedAssignment = currentAssignedDate < effectiveDate;

    if (shouldCreateEffectiveDatedAssignment) {
      const [sameDayAssignmentRows] = (await query(
        `SELECT id
         FROM shift_assignments
         WHERE employee_id = ? AND assigned_date = ?
         ORDER BY id DESC
         LIMIT 1`,
        [existingAssignment.employee_id, effectiveDate]
      )) as any;

      if (sameDayAssignmentRows.length > 0) {
        await query(
          `UPDATE shift_assignments
           SET shift_name = ?, start_time = ?, end_time = ?, allow_overtime = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [nextShiftName, nextStartTime, nextEndTime, nextAllowOvertime, sameDayAssignmentRows[0].id]
        );
      } else {
        await query(
          `INSERT INTO shift_assignments
           (employee_id, shift_name, start_time, end_time, assigned_date, allow_overtime)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [existingAssignment.employee_id, nextShiftName, nextStartTime, nextEndTime, effectiveDate, nextAllowOvertime]
        );
      }

      return NextResponse.json({
        success: true,
        effective_from: effectiveDate,
        preserved_history: true,
      });
    }

    // Build dynamic update query based on what fields are provided
    let updateFields = [];
    let updateValues = [];
    
    if (shift_name !== undefined) {
      updateFields.push('shift_name = ?');
      updateValues.push(shift_name);
    }
    if (start_time !== undefined) {
      updateFields.push('start_time = ?');
      updateValues.push(start_time);
    }
    if (end_time !== undefined) {
      updateFields.push('end_time = ?');
      updateValues.push(end_time);
    }
    if (allow_overtime !== undefined) {
      updateFields.push('allow_overtime = ?');
      updateValues.push(nextAllowOvertime);
    }
    
    updateFields.push('updated_at = CURRENT_TIMESTAMP');
    updateValues.push(id);

    await query(
      `UPDATE shift_assignments 
       SET ${updateFields.join(', ')}
       WHERE id = ?`,
      updateValues
    );

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error updating shift assignment:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Assignment ID is required" },
        { status: 400 }
      );
    }

    await query(`DELETE FROM shift_assignments WHERE id = ?`, [id]);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error deleting shift assignment:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

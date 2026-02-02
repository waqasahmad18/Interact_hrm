import { NextRequest, NextResponse } from "next/server";
import { query } from "../../../lib/db";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const employeeId = searchParams.get("employeeId");

    if (employeeId) {
      // Get specific employee's shift assignment
      const result = (await query(
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
          sa.created_at,
          sa.updated_at
        FROM shift_assignments sa
        JOIN hrm_employees e ON sa.employee_id = e.id
        WHERE sa.employee_id = ?
        ORDER BY sa.assigned_date DESC
        LIMIT 1`,
        [employeeId]
      )) as any[];
      return NextResponse.json({ success: true, assignment: result[0] || null });
    }

    // Get all employees with their shift assignments
    const employees = (await query(
      `SELECT 
        e.id,
        e.first_name,
        e.last_name,
        e.status,
        sa.id as assignment_id,
        sa.shift_name,
        sa.start_time,
        sa.end_time,
        sa.assigned_date,
        sa.created_at
      FROM hrm_employees e
      LEFT JOIN shift_assignments sa ON e.id = sa.employee_id
      WHERE e.status IN ('enabled', 'active')
      ORDER BY e.id, sa.assigned_date DESC`
    )) as any[];

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
    } = body;

    if (!shift_name || !start_time || !end_time) {
      return NextResponse.json(
        { success: false, error: "Missing required fields" },
        { status: 400 }
      );
    }

    const assignDate = assigned_date || new Date().toISOString().split("T")[0];

    // Helper to upsert one employee
    const upsertOne = async (empId: number) => {
      const existing = (await query(
        `SELECT id FROM shift_assignments 
         WHERE employee_id = ? AND assigned_date = ?`,
        [empId, assignDate]
      )) as any[];

      if (existing.length > 0) {
        await query(
          `UPDATE shift_assignments 
           SET shift_name = ?, start_time = ?, end_time = ?, updated_at = CURRENT_TIMESTAMP
           WHERE employee_id = ? AND assigned_date = ?`,
          [shift_name, start_time, end_time, empId, assignDate]
        );
      } else {
        await query(
          `INSERT INTO shift_assignments 
           (employee_id, shift_name, start_time, end_time, assigned_date) 
           VALUES (?, ?, ?, ?, ?)`,
          [empId, shift_name, start_time, end_time, assignDate]
        );
      }
    };

    // Assign to all active employees
    if (assign_all) {
      const allEmployees = (await query(
        `SELECT id FROM hrm_employees WHERE status IN ('enabled', 'active')`
      )) as any[];

      await Promise.all(allEmployees.map((row) => upsertOne(row.id)));

      return NextResponse.json({ success: true, message: "Shift assigned to all employees" });
    }

    // Assign to a department
    if (department_id) {
      // First try employee_jobs table
      let deptEmployees = (await query(
        `SELECT DISTINCT employee_id FROM employee_jobs WHERE department_id = ?`,
        [department_id]
      )) as any[];

      // If no employees found, try hrm_employees table directly
      if (deptEmployees.length === 0) {
        deptEmployees = (await query(
          `SELECT id as employee_id FROM hrm_employees WHERE department_id = ? AND status IN ('enabled', 'active')`,
          [department_id]
        )) as any[];
      }

      if (deptEmployees.length === 0) {
        return NextResponse.json(
          { success: false, error: "No employees found for this department" },
          { status: 404 }
        );
      }

      await Promise.all(deptEmployees.map((row) => upsertOne(row.employee_id)));

      return NextResponse.json({ 
        success: true, 
        message: `Shift assigned to ${deptEmployees.length} employee(s) in department` 
      });
    }

    // Multiple specific employees
    if (employee_ids && Array.isArray(employee_ids) && employee_ids.length > 0) {
      await Promise.all(employee_ids.map((empId: number) => upsertOne(empId)));

      return NextResponse.json({ success: true, message: "Shift assigned to selected employees" });
    }

    // Single employee assignment
    if (!employee_id) {
      return NextResponse.json(
        { success: false, error: "Employee ID is required" },
        { status: 400 }
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
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, shift_name, start_time, end_time } = body;

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Assignment ID is required" },
        { status: 400 }
      );
    }

    await query(
      `UPDATE shift_assignments 
       SET shift_name = ?, start_time = ?, end_time = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [shift_name, start_time, end_time, id]
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

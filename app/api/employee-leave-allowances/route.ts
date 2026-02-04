import { NextRequest, NextResponse } from "next/server";
import { pool } from "../../../lib/db";

// GET: Fetch all employees with their leave allowances
export async function GET(req: NextRequest) {
  let conn;
  try {
    conn = await pool.getConnection();

    // Fetch all employees with fixed allowances, used leaves, and adjustments
    const [rows]: any = await conn.execute(`
      SELECT 
        e.id,
        e.first_name,
        e.last_name,
        e.employee_code,
        e.employment_status,
        CASE WHEN e.employment_status = 'Probation' THEN 3 ELSE 20 END as annual_allowance,
        3 as bereavement_allowance,
        COALESCE(ela.annual_balance_adjustment, 0) as annual_balance_adjustment,
        COALESCE(ela.bereavement_balance_adjustment, 0) as bereavement_balance_adjustment,
        COALESCE(
          (SELECT SUM(total_days) 
           FROM employee_leaves 
           WHERE employee_id = e.id 
           AND status = 'approved' 
           AND leave_category != 'bereavement'), 0
        ) as annual_used,
        COALESCE(
          (SELECT SUM(total_days) 
           FROM employee_leaves 
           WHERE employee_id = e.id 
           AND status = 'approved' 
           AND leave_category = 'bereavement'), 0
        ) as bereavement_used
      FROM hrm_employees e
      LEFT JOIN employee_leave_allowances ela ON e.id = ela.employee_id
      WHERE e.status IN ('enabled', 'active')
      ORDER BY e.id
    `);
    
    // Calculate current balances with adjustments
    const employeesWithBalance = rows.map((emp: any) => ({
      ...emp,
      annual_current_balance: emp.annual_allowance - emp.annual_used + emp.annual_balance_adjustment,
      bereavement_current_balance: emp.bereavement_allowance - emp.bereavement_used + emp.bereavement_balance_adjustment
    }));

    await conn.end();

    return NextResponse.json({
      success: true,
      employees: employeesWithBalance
    });
  } catch (error) {
    console.error("Error fetching employee leave allowances:", error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  } finally {
    if (conn) conn.release();
  }
}

// POST: Update current balance for an employee
export async function POST(req: NextRequest) {
  let conn;
  try {
    const { employee_id, annual_current_balance, bereavement_current_balance } = await req.json();

    if (!employee_id) {
      return NextResponse.json({
        success: false,
        error: "employee_id is required"
      }, { status: 400 });
    }

    conn = await pool.getConnection();

    // Get employee info and calculate adjustments needed
    const [empRows]: any = await conn.execute(`
      SELECT 
        e.id,
        e.employment_status,
        CASE WHEN e.employment_status = 'Probation' THEN 3 ELSE 20 END as annual_allowance,
        3 as bereavement_allowance,
        COALESCE(
          (SELECT SUM(total_days) 
           FROM employee_leaves 
           WHERE employee_id = e.id 
           AND status = 'approved' 
           AND leave_category != 'bereavement'), 0
        ) as annual_used,
        COALESCE(
          (SELECT SUM(total_days) 
           FROM employee_leaves 
           WHERE employee_id = e.id 
           AND status = 'approved' 
           AND leave_category = 'bereavement'), 0
        ) as bereavement_used
      FROM hrm_employees e
      WHERE e.id = ?
    `, [employee_id]);

    if (empRows.length === 0) {
      await conn.end();
      return NextResponse.json({
        success: false,
        error: "Employee not found"
      }, { status: 404 });
    }

    const emp = empRows[0];
    
    // Calculate balance adjustments
    // current_balance = (allowance - used) + adjustment
    // So: adjustment = current_balance - (allowance - used)
    const annualAdjustment = annual_current_balance - (emp.annual_allowance - emp.annual_used);
    const bereavementAdjustment = bereavement_current_balance - (emp.bereavement_allowance - emp.bereavement_used);

    // Insert or update balance adjustments
    const [result]: any = await conn.execute(`
      INSERT INTO employee_leave_allowances 
        (employee_id, annual_balance_adjustment, bereavement_balance_adjustment, annual_allowance, bereavement_allowance, casual_allowance, sick_allowance)
      VALUES (?, ?, ?, ?, ?, 10, 15)
      ON DUPLICATE KEY UPDATE
        annual_balance_adjustment = VALUES(annual_balance_adjustment),
        bereavement_balance_adjustment = VALUES(bereavement_balance_adjustment),
        updated_at = CURRENT_TIMESTAMP
    `, [employee_id, annualAdjustment, bereavementAdjustment, emp.annual_allowance, emp.bereavement_allowance]);

    return NextResponse.json({
      success: true,
      message: "Leave balance updated successfully"
    });
  } catch (error) {
    console.error("Error updating leave allowance:", error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  } finally {
    if (conn) conn.release();
  }
}

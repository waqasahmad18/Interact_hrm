export async function PATCH(req: NextRequest) {
  try {
    const { id, status } = await req.json();
    if (!id || !status) return NextResponse.json({ success: false, error: 'id and status required' }, { status: 400 });
    await pool.execute('UPDATE hrm_employees SET status = ? WHERE id = ?', [status, id]);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
import { NextRequest, NextResponse } from 'next/server';
import { pool } from '../../../lib/db';

export async function GET(req: NextRequest) {
  try {
    const [rows] = await pool.query('SELECT id, first_name, pseudonym, last_name, employee_code, dob, gender, nationality, status, employment_status FROM hrm_employees ORDER BY id DESC');
    return NextResponse.json({ success: true, employees: rows });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { id } = await req.json();
    if (!id) return NextResponse.json({ success: false, error: 'id required' }, { status: 400 });
    
    // Delete all related records first (ignore errors if tables don't exist)
    const tables = [
      'employee_contacts',
      'employee_emergency_contacts', 
      'employee_jobs',
      'employee_salaries',
      'employee_attachments',
      'employee_attendance',
      'employee_breaks',
      'employee_leaves',
      'hrm_shifts_assignments',
      'prayer_breaks'
    ];
    
    for (const table of tables) {
      try {
        await pool.execute(`DELETE FROM ${table} WHERE employee_id = ?`, [id]);
      } catch (e) {
        // Ignore if table doesn't exist
      }
    }
    
    // Finally delete the employee
    await pool.execute('DELETE FROM hrm_employees WHERE id = ?', [id]);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

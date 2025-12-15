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
    const [rows] = await pool.query('SELECT id, first_name, middle_name, last_name, employee_code, gender, nationality, status FROM hrm_employees ORDER BY id DESC');
    return NextResponse.json({ success: true, employees: rows });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { id } = await req.json();
    if (!id) return NextResponse.json({ success: false, error: 'id required' }, { status: 400 });
    await pool.execute('DELETE FROM hrm_employees WHERE id = ?', [id]);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { pool } from '../../../lib/db';

export async function POST(req: NextRequest) {
  try {
    const { loginId, password } = await req.json();
    if (!loginId || !password) {
      return NextResponse.json({ success: false, error: 'Missing credentials' }, { status: 400 });
    }
    // Check admin
    if ((loginId === 'admin@interact.com' || loginId === 'interactadmin' || loginId === 'admin') && password === 'interact123') {
      return NextResponse.json({ success: true, isAdmin: true });
    }
    // Check employee
    const [rows] = await pool.query('SELECT * FROM employees WHERE (employee_id = ? OR email = ?) AND password = ?', [loginId, loginId, password]);
    if (Array.isArray(rows) && rows.length > 0) {
      const emp = rows[0];
      if (emp.status === 'inactive' || emp.status === 'disabled') {
        return NextResponse.json({ success: false, error: 'Your account is inactive. Please contact admin.' }, { status: 403 });
      }
      return NextResponse.json({ success: true, isAdmin: false, employee: { id: emp.id, employee_id: emp.employee_id, name: emp.first_name + ' ' + emp.last_name } });
    }
    return NextResponse.json({ success: false, error: 'Invalid credentials' }, { status: 401 });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

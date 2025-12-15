
import { NextRequest, NextResponse } from 'next/server';
import { pool } from '../../../lib/db';
import bcrypt from 'bcryptjs';

export async function POST(req: NextRequest) {
  try {
    const { loginId, password } = await req.json();
    if (!loginId || !password) {
      return NextResponse.json({ success: false, error: 'Missing credentials' }, { status: 400 });
    }
    // Check employee by username, email, or employee_id
    const [rows]: any = await pool.query(
      'SELECT * FROM employees WHERE (username = ? OR email = ? OR employee_id = ?) LIMIT 1',
      [loginId, loginId, loginId]
    );
    if (!rows.length) {
      return NextResponse.json({ success: false, error: 'Invalid credentials' }, { status: 401 });
    }
    const employee = rows[0];
    // Check password (hashed)
    if (typeof employee.password !== 'string') {
      return NextResponse.json({ success: false, error: 'Password not set for this user.' }, { status: 401 });
    }
    const passwordMatch = await bcrypt.compare(password, employee.password);
    if (!passwordMatch) {
      return NextResponse.json({ success: false, error: 'Invalid credentials' }, { status: 401 });
    }
    // Check status
    if (employee.status !== 'active' && employee.status !== 'enabled') {
      return NextResponse.json({ success: false, error: 'Account is inactive. Please contact admin.' }, { status: 403 });
    }
    // Success - return username for dashboard lookups
    return NextResponse.json({ 
      success: true, 
      employee,
      username: employee.username || employee.email || loginId 
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

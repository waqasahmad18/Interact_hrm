import { NextRequest, NextResponse } from 'next/server';
import { pool } from '../../../lib/db';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const employeeId = searchParams.get('employeeId');
    
    if (!employeeId) {
      return NextResponse.json({ success: false, error: 'employeeId required' }, { status: 400 });
    }

    // Fetch employee data from hrm_employees
    const [empRows]: any = await pool.query(
      'SELECT id, employee_code, first_name, last_name, pseudonym, cnic_number, cnic_address, employment_status FROM hrm_employees WHERE employee_code = ? OR id = ?',
      [employeeId, employeeId]
    );

    if (!empRows || empRows.length === 0) {
      return NextResponse.json({ success: false, error: 'Employee not found' }, { status: 404 });
    }

    const employee = empRows[0];

    // Fetch contact details
    const [contactRows]: any = await pool.query(
      'SELECT email_work, email_other, phone_mobile FROM employee_contacts WHERE employee_id = ?',
      [employee.employee_code || employee.id]
    );

    const contact = contactRows && contactRows.length > 0 ? contactRows[0] : null;

    // Combine data
    const result = {
      employee_id: employee.employee_code || employee.id,
      first_name: employee.first_name,
      last_name: employee.last_name,
      pseudonym: employee.pseudonym,
      cnic_number: employee.cnic_number,
      cnic_address: employee.cnic_address,
      employment_status: employee.employment_status,
      email_work: contact?.email_work || '',
      email_other: contact?.email_other || '',
      phone_mobile: contact?.phone_mobile || ''
    };

    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    console.error('My Info API Error:', err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

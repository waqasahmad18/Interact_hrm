import { NextRequest, NextResponse } from 'next/server';
import mysql from 'mysql2/promise';

const dbConfig = {
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'interact_hrm',
};

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const employeeId = searchParams.get('employeeId');
    if (!employeeId) {
      return NextResponse.json({ success: false, error: 'employeeId is required' }, { status: 400 });
    }
    const conn = await mysql.createConnection(dbConfig);
    // Search by employee_code, id, or username
    const [rows]: any = await conn.execute(
      'SELECT * FROM hrm_employees WHERE employee_code = ? OR CAST(id AS CHAR) = ? OR username = ?',
      [employeeId, employeeId, employeeId]
    );
    await conn.end();
    if (rows && rows.length > 0) {
      return NextResponse.json({ success: true, employee: rows[0] });
    } else {
      return NextResponse.json({ success: false, error: 'Employee not found' }, { status: 404 });
    }
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const data = await req.json();
    console.log('Received data:', data);
    const {
      first_name,
      middle_name,
      last_name,
      employee_code,
      dob,
      gender,
      marital_status,
      nationality,
      profile_img,
      username,
      password,
      status,
      role,
      cnic_number,
      cnic_address,
      employment_status
    } = data;
    const conn = await mysql.createConnection(dbConfig);
    // Convert empty employee_code to null to avoid duplicate key constraint
    const empCode = employee_code && employee_code.trim() !== '' ? employee_code : null;
    const [result]: any = await conn.execute(
      `INSERT INTO hrm_employees (first_name, pseudonym, last_name, employee_code, dob, gender, marital_status, nationality, profile_img, username, password, status, role, cnic_number, cnic_address, employment_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [first_name, middle_name, last_name, empCode, dob, gender, marital_status, nationality, profile_img, username, password, status, role, cnic_number, cnic_address, employment_status]
    );
    const insertedId = result.insertId;
    await conn.end();
    console.log('Insert successful, ID:', insertedId);
    return NextResponse.json({ success: true, id: insertedId });
  } catch (err) {
    console.error('POST Error:', err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const data = await req.json();
    console.log('PUT Received data:', data);
    const {
      id,
      first_name,
      middle_name,
      last_name,
      employee_code,
      dob,
      gender,
      marital_status,
      nationality,
      profile_img,
      username,
      password,
      status,
      role,
      cnic_number,
      cnic_address,
      employment_status
    } = data;
    if (!id && !employee_code && !username) {
      return NextResponse.json({ success: false, error: 'id or employee_code or username is required' }, { status: 400 });
    }
    const conn = await mysql.createConnection(dbConfig);
    const whereClause = id ? 'id = ?' : (employee_code ? 'employee_code = ?' : 'username = ?');
    const whereValue = id ? id : (employee_code ? employee_code : username);
    
    // Convert empty employee_code to null to avoid duplicate key constraint
    const empCode = employee_code && employee_code.trim() !== '' ? employee_code : null;
    
    console.log('Update Query:', `UPDATE hrm_employees SET first_name = ?, pseudonym = ?, last_name = ?, employee_code = ?, dob = ?, gender = ?, marital_status = ?, nationality = ?, profile_img = ?, username = ?, password = ?, status = ?, role = ?, cnic_number = ?, cnic_address = ?, employment_status = ? WHERE ${whereClause}`);
    console.log('Parameters:', [first_name, middle_name, last_name, empCode, dob, gender, marital_status, nationality, profile_img, username, password, status, role, cnic_number, cnic_address, employment_status, whereValue]);
    
    const [result]: any = await conn.execute(
      `UPDATE hrm_employees SET first_name = ?, pseudonym = ?, last_name = ?, employee_code = ?, dob = ?, gender = ?, marital_status = ?, nationality = ?, profile_img = ?, username = ?, password = ?, status = ?, role = ?, cnic_number = ?, cnic_address = ?, employment_status = ? WHERE ${whereClause}`,
      [first_name, middle_name, last_name, empCode, dob, gender, marital_status, nationality, profile_img, username, password, status, role, cnic_number, cnic_address, employment_status, whereValue]
    );
    
    console.log('Affected rows:', result.affectedRows);
    await conn.end();
    console.log('Update successful');
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('PUT Error:', err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

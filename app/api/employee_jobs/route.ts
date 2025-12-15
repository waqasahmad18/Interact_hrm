import { NextRequest, NextResponse } from 'next/server';
import { pool } from '../../../lib/db';

export async function GET(req: NextRequest) {
	try {
		const { searchParams } = new URL(req.url);
		const employeeId = searchParams.get('employeeId');
		if (!employeeId) {
			return NextResponse.json({ success: false, error: 'employeeId is required' }, { status: 400 });
		}
		const [rows]: any = await pool.execute(
			'SELECT * FROM employee_jobs WHERE employee_id = ?',
			[employeeId]
		);
		if (rows && rows.length > 0) {
			return NextResponse.json({ success: true, job: rows[0] });
		} else {
			return NextResponse.json({ success: false, error: 'Job not found' });
		}
	} catch (err) {
		return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
	}
}

export async function POST(req: NextRequest) {
	try {
		const body = await req.json();
		const { employee_id, joinedDate, jobTitle, jobSpecification, jobCategory, subUnit, location, employmentStatus, includeContract } = body;
		if (!employee_id) {
			return NextResponse.json({ success: false, error: 'employee_id is required' }, { status: 400 });
		}
		await pool.execute(
			`INSERT INTO employee_jobs (employee_id, joined_date, job_title, job_specification, job_category, sub_unit, location, employment_status, include_contract)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)` ,
			[employee_id, joinedDate, jobTitle, jobSpecification, jobCategory, subUnit, location, employmentStatus, includeContract ? 1 : 0]
		);
		return NextResponse.json({ success: true });
	} catch (err) {
		return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
	}
}

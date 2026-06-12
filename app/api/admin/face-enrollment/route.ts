import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";
import { v4 as uuidv4 } from "uuid";
import { pool } from "@/lib/db";
import { isValidDescriptor } from "@/lib/face-matching";
import {
  defaultSubjectForEmployee,
  RECOMMENDED_ENROLLMENT_MAX,
} from "@/lib/face-verify";
import {
  countDescriptorsForEmployee,
  countEnrollmentForEmployee,
  getEnrollmentRowsForEmployee,
  insertEnrollmentRow,
} from "@/lib/face-enrollment-table";
import { RECOMMENDED_ENROLLMENT_MIN } from "@/lib/face-types";

const UPLOAD_ROOT = path.join(process.cwd(), "public", "uploads", "face-enrollment");

export async function GET(req: NextRequest) {
  try {
    const employeeId = new URL(req.url).searchParams.get("employeeId")?.trim();
    if (!employeeId) {
      return NextResponse.json(
        { success: false, error: "employeeId is required" },
        { status: 400 }
      );
    }

    const [empRows] = await pool.execute(
      `SELECT id, first_name, last_name, pseudonym, employee_code
       FROM hrm_employees WHERE CAST(id AS CHAR) = ? OR employee_code = ? LIMIT 1`,
      [employeeId, employeeId]
    );
    const emp = (empRows as Array<Record<string, unknown>>)[0];
    if (!emp) {
      return NextResponse.json({ success: false, error: "Employee not found" }, { status: 404 });
    }

    const id = String(emp.id);
    const name = [emp.first_name, emp.last_name]
      .map((v) => String(v || "").trim())
      .filter(Boolean)
      .join(" ");

    const photos = await getEnrollmentRowsForEmployee(id);
    const descriptorCount = await countDescriptorsForEmployee(id);
    const subject: string | null =
      photos[0]?.compreface_subject ?? defaultSubjectForEmployee(id, name);

    return NextResponse.json({
      success: true,
      employee: {
        id,
        name,
        employee_code: emp.employee_code ?? null,
      },
      subject,
      photoCount: photos.length,
      descriptorCount,
      recommendedMin: RECOMMENDED_ENROLLMENT_MIN,
      recommendedMax: RECOMMENDED_ENROLLMENT_MAX,
      ready: descriptorCount >= RECOMMENDED_ENROLLMENT_MIN,
      needsDescriptorRefresh:
        photos.length >= RECOMMENDED_ENROLLMENT_MIN &&
        descriptorCount < RECOMMENDED_ENROLLMENT_MIN,
      photos,
      faceEngineReady: true,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to load enrollment";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const employeeId = String(form.get("employee_id") || "").trim();
    const employeeName = String(form.get("employee_name") || "").trim() || undefined;
    const source = String(form.get("source") || "upload") === "webcam" ? "webcam" : "upload";
    const enrolledBy = String(form.get("enrolled_by") || "").trim() || null;
    const file = form.get("file");
    const descriptorRaw = form.get("descriptor");

    if (!employeeId) {
      return NextResponse.json({ success: false, error: "employee_id is required" }, { status: 400 });
    }
    if (!file || !(file instanceof Blob) || file.size === 0) {
      return NextResponse.json({ success: false, error: "Image file is required" }, { status: 400 });
    }

    let descriptor: number[] | null = null;
    if (descriptorRaw) {
      try {
        const parsed = JSON.parse(String(descriptorRaw)) as number[];
        if (isValidDescriptor(parsed)) descriptor = parsed;
      } catch {
        // ignore
      }
    }
    if (!descriptor) {
      return NextResponse.json(
        {
          success: false,
          error: "No face detected in image. Use a clear front-facing photo with one face only.",
        },
        { status: 400 }
      );
    }

    const currentCount = await countEnrollmentForEmployee(employeeId);
    if (currentCount >= RECOMMENDED_ENROLLMENT_MAX) {
      return NextResponse.json(
        {
          success: false,
          error: `Maximum ${RECOMMENDED_ENROLLMENT_MAX} enrollment photos per employee. Delete one to add another.`,
        },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const subject = defaultSubjectForEmployee(employeeId, employeeName);
    const imageId = uuidv4();

    const dir = path.join(UPLOAD_ROOT, employeeId);
    await fs.mkdir(dir, { recursive: true });
    const localName = `${uuidv4()}.jpg`;
    const diskPath = path.join(dir, localName);
    await fs.writeFile(diskPath, buffer);
    const localUrl = `/uploads/face-enrollment/${employeeId}/${localName}`;

    await insertEnrollmentRow({
      employeeId,
      subject,
      imageId,
      localPath: localUrl,
      descriptor,
      source,
      enrolledBy,
    });

    const photos = await getEnrollmentRowsForEmployee(employeeId);

    return NextResponse.json({
      success: true,
      subject,
      imageId,
      localPath: localUrl,
      photoCount: photos.length,
      ready: photos.length >= 3,
      photos,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Enrollment failed";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

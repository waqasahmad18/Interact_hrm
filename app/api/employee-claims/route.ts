import { NextRequest, NextResponse } from "next/server";
import {
  resolveViewerDataScope,
  rowInViewerScope,
} from "@/lib/access-control/data-scope";
import {
  createClaim,
  listClaims,
  normalizeClaimStatus,
  normalizeClaimType,
  resolveClaimBalance,
  type EmployeeClaim,
} from "@/lib/employee-claims";

function summaryFromClaims(year: string, claims: EmployeeClaim[]) {
  const emp = new Set<number>();
  let total_approved_amount = 0;
  let total_pending_amount = 0;
  for (const c of claims) {
    if (c.status === "cancelled") continue;
    emp.add(c.employee_id);
    if (c.status === "approved" || c.status === "paid") {
      total_approved_amount += c.amount;
    } else if (c.status === "pending") {
      total_pending_amount += c.amount;
    }
  }
  return {
    year,
    total_claims: claims.filter((c) => c.status !== "cancelled").length,
    total_approved_amount: Math.round(total_approved_amount * 100) / 100,
    total_pending_amount: Math.round(total_pending_amount * 100) / 100,
    employees_with_claims: emp.size,
  };
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function viewerIdFrom(req: NextRequest, body?: any): string {
  return String(
    body?.viewerId ??
      body?.viewer_id ??
      req.nextUrl.searchParams.get("viewerId") ??
      req.headers.get("x-employee-id") ??
      req.headers.get("x-hrm-employee-id") ??
      "",
  ).trim();
}

async function assertEmployeeInScope(
  viewerId: string,
  employeeId: number,
  departmentName?: string | null,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  if (!viewerId || !/^\d+$/.test(viewerId)) {
    return { ok: false, status: 401, error: "viewerId required" };
  }
  const scope = await resolveViewerDataScope(viewerId);
  if (
    !rowInViewerScope(scope, {
      employeeId,
      departmentName: departmentName ?? null,
    })
  ) {
    return { ok: false, status: 403, error: "Out of scope" };
  }
  return { ok: true };
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const year = searchParams.get("year") || undefined;
    const employeeIdRaw = searchParams.get("employee_id");
    const employeeId =
      employeeIdRaw && /^\d+$/.test(employeeIdRaw)
        ? Number(employeeIdRaw)
        : null;
    const status = searchParams.get("status");
    const claimType = searchParams.get("claim_type");
    const balanceOnly = searchParams.get("balance") === "1";
    const viewerId = viewerIdFrom(req);

    if (balanceOnly) {
      if (employeeId == null) {
        return NextResponse.json(
          { success: false, error: "employee_id required for balance" },
          { status: 400 },
        );
      }
      const scoped = await assertEmployeeInScope(viewerId, employeeId);
      if (!scoped.ok) {
        return NextResponse.json(
          { success: false, error: scoped.error },
          { status: scoped.status },
        );
      }
      const balance = await resolveClaimBalance({
        employeeId,
        year,
        claimType: normalizeClaimType(claimType || "medical"),
      });
      return NextResponse.json({ success: true, balance });
    }

    let claims = await listClaims({
      year,
      employeeId,
      status,
      claimType,
    });

    if (viewerId && /^\d+$/.test(viewerId)) {
      const scope = await resolveViewerDataScope(viewerId);
      claims = claims.filter((c) =>
        rowInViewerScope(scope, {
          employeeId: c.employee_id,
          departmentName: c.department_name,
        }),
      );
    } else {
      return NextResponse.json(
        { success: false, error: "viewerId required" },
        { status: 401 },
      );
    }

    const summary = summaryFromClaims(
      year || String(new Date().getFullYear()),
      claims,
    );

    return NextResponse.json({ success: true, claims, summary });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Failed to load claims",
      },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const employeeId = Number(body.employee_id ?? body.employeeId);
    const amount = Number(body.amount);
    const viewerId = viewerIdFrom(req, body);

    if (!Number.isFinite(employeeId) || employeeId <= 0) {
      return NextResponse.json(
        { success: false, error: "employee_id required" },
        { status: 400 },
      );
    }

    const scoped = await assertEmployeeInScope(viewerId, employeeId);
    if (!scoped.ok) {
      return NextResponse.json(
        { success: false, error: scoped.error },
        { status: scoped.status },
      );
    }

    const result = await createClaim({
      employeeId,
      amount,
      claimDate: body.claim_date ? String(body.claim_date) : undefined,
      claimType: normalizeClaimType(body.claim_type ?? body.claimType),
      title: body.title != null ? String(body.title) : null,
      notes: body.notes != null ? String(body.notes) : null,
      status: normalizeClaimStatus(body.status || "approved"),
      createdBy:
        body.created_by != null
          ? String(body.created_by)
          : viewerId
            ? `employee:${viewerId}`
            : "hr",
      createdByEmployeeId: /^\d+$/.test(viewerId) ? Number(viewerId) : null,
      allowOverBalance: body.allow_over_balance === true,
    });

    return NextResponse.json({
      success: true,
      claim: result.claim,
      balance: result.balance,
      message: "Claim added.",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to create claim";
    const over = /exceeds remaining/i.test(msg);
    return NextResponse.json(
      { success: false, error: msg },
      { status: over ? 400 : 500 },
    );
  }
}

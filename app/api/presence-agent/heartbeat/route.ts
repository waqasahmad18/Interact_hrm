import { NextRequest, NextResponse } from "next/server";
import { upsertAgentHeartbeat } from "@/lib/presence-agents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clientIp(req: NextRequest): string {
  const xf = req.headers.get("x-forwarded-for");
  if (xf) return xf.split(",")[0]?.trim() || "";
  return req.headers.get("x-real-ip")?.trim() || "";
}

/** Public: desktop agents POST heartbeat every ~15–60s. */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      machine_id?: string;
      hostname?: string;
      windows_user?: string;
      hrm_base_url?: string;
      local_employee_id?: string;
      agent_version?: string;
      agent_product?: string;
    };

    const result = await upsertAgentHeartbeat({
      machineId: String(body.machine_id ?? ""),
      hostname: body.hostname,
      windowsUser: body.windows_user,
      hrmBaseUrl: body.hrm_base_url,
      localEmployeeId: body.local_employee_id,
      agentVersion: body.agent_version,
      agentProduct: body.agent_product,
      clientIp: clientIp(req) || undefined,
    });

    return NextResponse.json(
      {
        success: true,
        assigned_employee_id: result.assignedEmployeeId,
        assigned_employee_name: result.assignedEmployeeName,
        pseudonym: result.pseudonym,
        command: result.command,
        admin_enabled: result.adminEnabled,
        idle_seconds: result.idleSeconds,
        recheck_while_idle_seconds: result.recheckWhileIdleSeconds,
        exit_password: result.exitPassword,
        presence_enabled: result.presenceEnabled,
        camera_verification_enabled: result.cameraVerificationEnabled,
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
          Pragma: "no-cache",
        },
      },
    );
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Heartbeat failed",
      },
      { status: 400 },
    );
  }
}

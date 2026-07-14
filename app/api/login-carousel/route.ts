import { NextResponse } from "next/server";
import { getPublicLoginCarousel } from "@/lib/login-carousel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public: auth page carousel payload (no auth). */
export async function GET() {
  try {
    const data = await getPublicLoginCarousel();
    return NextResponse.json(
      { success: true, ...data },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
          Pragma: "no-cache",
        },
      }
    );
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Failed to load carousel",
      },
      { status: 500 }
    );
  }
}

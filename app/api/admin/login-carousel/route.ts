import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";
import { v4 as uuidv4 } from "uuid";
import {
  LOGIN_CAROUSEL_UPLOAD_DIR,
  addLoginCarouselSlide,
  deleteLoginCarouselSlide,
  getLoginCarouselSettings,
  listLoginCarouselSlides,
  saveLoginCarouselSettings,
  updateLoginCarouselSlide,
  type LoginCarouselAnimation,
} from "@/lib/login-carousel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 12 * 1024 * 1024;
const ALLOWED_MIMES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
]);
const EXT_BY_MIME: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/webp": ".webp",
};

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
      Pragma: "no-cache",
    },
  });
}

export async function GET() {
  try {
    const [settings, slides] = await Promise.all([
      getLoginCarouselSettings(),
      listLoginCarouselSlides(),
    ]);
    return noStore({ success: true, settings, slides });
  } catch (err) {
    return noStore(
      {
        success: false,
        error: err instanceof Error ? err.message : "Failed to load carousel",
      },
      500
    );
  }
}

/** Save animation / speed settings (JSON body). */
export async function PUT(req: NextRequest) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const animation = body.animation;
    const settings = await saveLoginCarouselSettings({
      enabled: typeof body.enabled === "boolean" ? body.enabled : undefined,
      intervalMs:
        typeof body.intervalMs === "number"
          ? body.intervalMs
          : typeof body.intervalMs === "string"
            ? parseInt(body.intervalMs, 10)
            : undefined,
      animation:
        animation === "fade" || animation === "fade-zoom" || animation === "slide"
          ? (animation as LoginCarouselAnimation)
          : undefined,
      includeBrandSlide:
        typeof body.includeBrandSlide === "boolean"
          ? body.includeBrandSlide
          : undefined,
    });
    return noStore({ success: true, settings });
  } catch (err) {
    return noStore(
      {
        success: false,
        error: err instanceof Error ? err.message : "Failed to save settings",
      },
      500
    );
  }
}

/** Upload a slide image (multipart). */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return noStore({ success: false, error: "file is required" }, 400);
    }
    const mime = (file.type || "").toLowerCase();
    if (!ALLOWED_MIMES.has(mime)) {
      return noStore(
        { success: false, error: "Upload PNG, JPG, or WEBP (max 12 MB)." },
        400
      );
    }
    if (file.size > MAX_BYTES) {
      return noStore({ success: false, error: "Image must be 12 MB or smaller." }, 400);
    }

    await fs.mkdir(LOGIN_CAROUSEL_UPLOAD_DIR, { recursive: true });
    const ext = EXT_BY_MIME[mime] || ".jpg";
    const fileName = `${uuidv4()}${ext}`;
    const absPath = path.join(LOGIN_CAROUSEL_UPLOAD_DIR, fileName);
    await fs.writeFile(absPath, Buffer.from(await file.arrayBuffer()));

    const slide = await addLoginCarouselSlide({
      fileName,
      originalName: file.name,
      mimeType: mime,
      fileSize: file.size,
    });
    return noStore({ success: true, slide });
  } catch (err) {
    return noStore(
      {
        success: false,
        error: err instanceof Error ? err.message : "Upload failed",
      },
      500
    );
  }
}

/** Update or delete a slide. */
export async function PATCH(req: NextRequest) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const id = typeof body.id === "number" ? body.id : parseInt(String(body.id ?? ""), 10);
    if (!Number.isFinite(id)) {
      return noStore({ success: false, error: "id is required" }, 400);
    }
    const slide = await updateLoginCarouselSlide(id, {
      isActive: typeof body.isActive === "boolean" ? body.isActive : undefined,
      sortOrder:
        typeof body.sortOrder === "number"
          ? body.sortOrder
          : typeof body.sortOrder === "string"
            ? parseInt(body.sortOrder, 10)
            : undefined,
    });
    if (!slide) return noStore({ success: false, error: "Slide not found" }, 404);
    return noStore({ success: true, slide });
  } catch (err) {
    return noStore(
      {
        success: false,
        error: err instanceof Error ? err.message : "Update failed",
      },
      500
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = parseInt(new URL(req.url).searchParams.get("id") ?? "", 10);
    if (!Number.isFinite(id)) {
      return noStore({ success: false, error: "id is required" }, 400);
    }
    const removed = await deleteLoginCarouselSlide(id);
    if (!removed) return noStore({ success: false, error: "Slide not found" }, 404);
    try {
      await fs.unlink(path.join(LOGIN_CAROUSEL_UPLOAD_DIR, removed.fileName));
    } catch {
      /* file already gone */
    }
    return noStore({ success: true });
  } catch (err) {
    return noStore(
      {
        success: false,
        error: err instanceof Error ? err.message : "Delete failed",
      },
      500
    );
  }
}

import path from "path";
import { pool } from "@/lib/db";

export const LOGIN_CAROUSEL_UPLOAD_DIR = path.join(
  process.cwd(),
  "public",
  "uploads",
  "login-carousel"
);

export type LoginCarouselAnimation = "fade" | "fade-zoom" | "slide";

export type LoginCarouselSettings = {
  enabled: boolean;
  intervalMs: number;
  animation: LoginCarouselAnimation;
  includeBrandSlide: boolean;
};

export type LoginCarouselSlide = {
  id: number;
  fileName: string;
  originalName: string | null;
  mimeType: string | null;
  fileSize: number;
  sortOrder: number;
  isActive: boolean;
  url: string;
};

export const DEFAULT_LOGIN_CAROUSEL_SETTINGS: LoginCarouselSettings = {
  enabled: true,
  intervalMs: 5000,
  animation: "fade",
  includeBrandSlide: true,
};

const KEYS = {
  enabled: "enabled",
  intervalMs: "interval_ms",
  animation: "animation",
  includeBrandSlide: "include_brand_slide",
} as const;

export function loginCarouselFileUrl(fileName: string): string {
  return `/api/login-carousel/file/${encodeURIComponent(fileName)}`;
}

async function ensureTables(): Promise<void> {
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS hrm_login_carousel_slides (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      file_name VARCHAR(191) NOT NULL,
      original_name VARCHAR(255) NULL,
      mime_type VARCHAR(64) NULL,
      file_size INT UNSIGNED NOT NULL DEFAULT 0,
      sort_order INT NOT NULL DEFAULT 0,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_login_carousel_file (file_name),
      KEY idx_login_carousel_active_sort (is_active, sort_order, id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS hrm_login_carousel_settings (
      setting_key VARCHAR(64) NOT NULL PRIMARY KEY,
      setting_value TEXT NOT NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

async function getRaw(key: string): Promise<string | null> {
  await ensureTables();
  const [rows] = await pool.execute(
    `SELECT setting_value FROM hrm_login_carousel_settings WHERE setting_key = ? LIMIT 1`,
    [key]
  );
  const list = rows as { setting_value: string }[];
  return list[0]?.setting_value ?? null;
}

async function setRaw(key: string, value: string): Promise<void> {
  await ensureTables();
  await pool.execute(
    `INSERT INTO hrm_login_carousel_settings (setting_key, setting_value) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
    [key, value]
  );
}

function parseBool(raw: string | null, fallback: boolean): boolean {
  if (raw == null || raw === "") return fallback;
  const v = raw.trim().toLowerCase();
  if (v === "1" || v === "true" || v === "yes" || v === "on") return true;
  if (v === "0" || v === "false" || v === "no" || v === "off") return false;
  return fallback;
}

function parseAnimation(raw: string | null): LoginCarouselAnimation {
  if (raw === "fade-zoom" || raw === "slide" || raw === "fade") return raw;
  return DEFAULT_LOGIN_CAROUSEL_SETTINGS.animation;
}

function clampInterval(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_LOGIN_CAROUSEL_SETTINGS.intervalMs;
  return Math.min(30000, Math.max(2000, Math.round(n)));
}

export async function getLoginCarouselSettings(): Promise<LoginCarouselSettings> {
  const d = DEFAULT_LOGIN_CAROUSEL_SETTINGS;
  const [enabled, intervalMs, animation, includeBrandSlide] = await Promise.all([
    getRaw(KEYS.enabled),
    getRaw(KEYS.intervalMs),
    getRaw(KEYS.animation),
    getRaw(KEYS.includeBrandSlide),
  ]);
  return {
    enabled: parseBool(enabled, d.enabled),
    intervalMs: clampInterval(parseInt(intervalMs ?? String(d.intervalMs), 10)),
    animation: parseAnimation(animation),
    includeBrandSlide: parseBool(includeBrandSlide, d.includeBrandSlide),
  };
}

export async function saveLoginCarouselSettings(
  input: Partial<LoginCarouselSettings>
): Promise<LoginCarouselSettings> {
  const current = await getLoginCarouselSettings();
  const next: LoginCarouselSettings = {
    enabled:
      typeof input.enabled === "boolean" ? input.enabled : current.enabled,
    intervalMs: clampInterval(
      typeof input.intervalMs === "number"
        ? input.intervalMs
        : current.intervalMs
    ),
    animation:
      input.animation === "fade" ||
      input.animation === "fade-zoom" ||
      input.animation === "slide"
        ? input.animation
        : current.animation,
    includeBrandSlide:
      typeof input.includeBrandSlide === "boolean"
        ? input.includeBrandSlide
        : current.includeBrandSlide,
  };
  await Promise.all([
    setRaw(KEYS.enabled, next.enabled ? "true" : "false"),
    setRaw(KEYS.intervalMs, String(next.intervalMs)),
    setRaw(KEYS.animation, next.animation),
    setRaw(KEYS.includeBrandSlide, next.includeBrandSlide ? "true" : "false"),
  ]);
  return next;
}

type SlideRow = {
  id: number;
  file_name: string;
  original_name: string | null;
  mime_type: string | null;
  file_size: number;
  sort_order: number;
  is_active: number | boolean;
};

function mapSlide(r: SlideRow): LoginCarouselSlide {
  return {
    id: r.id,
    fileName: r.file_name,
    originalName: r.original_name,
    mimeType: r.mime_type,
    fileSize: Number(r.file_size) || 0,
    sortOrder: r.sort_order,
    isActive: Boolean(r.is_active),
    url: loginCarouselFileUrl(r.file_name),
  };
}

export async function listLoginCarouselSlides(opts?: {
  activeOnly?: boolean;
}): Promise<LoginCarouselSlide[]> {
  await ensureTables();
  const activeOnly = opts?.activeOnly === true;
  const [rows] = await pool.execute(
    activeOnly
      ? `SELECT id, file_name, original_name, mime_type, file_size, sort_order, is_active
         FROM hrm_login_carousel_slides
         WHERE is_active = 1
         ORDER BY sort_order ASC, id ASC`
      : `SELECT id, file_name, original_name, mime_type, file_size, sort_order, is_active
         FROM hrm_login_carousel_slides
         ORDER BY sort_order ASC, id ASC`
  );
  return (rows as SlideRow[]).map(mapSlide);
}

export async function addLoginCarouselSlide(input: {
  fileName: string;
  originalName?: string | null;
  mimeType?: string | null;
  fileSize: number;
}): Promise<LoginCarouselSlide> {
  await ensureTables();
  const [maxRows] = await pool.execute(
    `SELECT COALESCE(MAX(sort_order), -1) AS m FROM hrm_login_carousel_slides`
  );
  const max = Number((maxRows as { m: number }[])[0]?.m ?? -1);
  const sortOrder = max + 1;
  const [result] = await pool.execute(
    `INSERT INTO hrm_login_carousel_slides
      (file_name, original_name, mime_type, file_size, sort_order, is_active)
     VALUES (?, ?, ?, ?, ?, 1)`,
    [
      input.fileName,
      input.originalName ?? null,
      input.mimeType ?? null,
      input.fileSize,
      sortOrder,
    ]
  );
  const id = Number((result as { insertId: number }).insertId);
  return {
    id,
    fileName: input.fileName,
    originalName: input.originalName ?? null,
    mimeType: input.mimeType ?? null,
    fileSize: input.fileSize,
    sortOrder,
    isActive: true,
    url: loginCarouselFileUrl(input.fileName),
  };
}

export async function updateLoginCarouselSlide(
  id: number,
  patch: { isActive?: boolean; sortOrder?: number }
): Promise<LoginCarouselSlide | null> {
  await ensureTables();
  const fields: string[] = [];
  const values: unknown[] = [];
  if (typeof patch.isActive === "boolean") {
    fields.push("is_active = ?");
    values.push(patch.isActive ? 1 : 0);
  }
  if (typeof patch.sortOrder === "number" && Number.isFinite(patch.sortOrder)) {
    fields.push("sort_order = ?");
    values.push(Math.round(patch.sortOrder));
  }
  if (fields.length === 0) {
    const all = await listLoginCarouselSlides();
    return all.find((s) => s.id === id) ?? null;
  }
  values.push(id);
  await pool.execute(
    `UPDATE hrm_login_carousel_slides SET ${fields.join(", ")} WHERE id = ?`,
    values
  );
  const all = await listLoginCarouselSlides();
  return all.find((s) => s.id === id) ?? null;
}

export async function deleteLoginCarouselSlide(
  id: number
): Promise<{ fileName: string } | null> {
  await ensureTables();
  const [rows] = await pool.execute(
    `SELECT file_name FROM hrm_login_carousel_slides WHERE id = ? LIMIT 1`,
    [id]
  );
  const list = rows as { file_name: string }[];
  const fileName = list[0]?.file_name;
  if (!fileName) return null;
  await pool.execute(`DELETE FROM hrm_login_carousel_slides WHERE id = ?`, [id]);
  return { fileName };
}

export async function getPublicLoginCarousel(): Promise<{
  settings: LoginCarouselSettings;
  slides: LoginCarouselSlide[];
}> {
  const [settings, slides] = await Promise.all([
    getLoginCarouselSettings(),
    listLoginCarouselSlides({ activeOnly: true }),
  ]);
  return { settings, slides };
}

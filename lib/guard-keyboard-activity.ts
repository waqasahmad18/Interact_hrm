import type { Collection, Document, Filter } from "mongodb";
import { mongoCollection } from "@/lib/mongo";

export type KeyboardActivityRow = {
  id: number;
  batchId: string;
  employeeId: string;
  employeeName: string | null;
  pseudonym: string | null;
  machineId: string | null;
  hostname: string | null;
  windowsUser: string | null;
  appName: string;
  appPath: string | null;
  keyDownCount: number;
  typingActiveMs: number;
  keyboardIdleMs: number;
  periodStart: string;
  periodEnd: string;
};

export type KeyboardActivitySegment = {
  appName: string;
  appPath?: string | null;
  keyDownCount: number;
  typingActiveMs: number;
  keyboardIdleMs: number;
};

export type IngestKeyboardActivityInput = {
  batchId: string;
  employeeId: string;
  employeeName?: string | null;
  pseudonym?: string | null;
  machineId?: string | null;
  hostname?: string | null;
  windowsUser?: string | null;
  periodStart: Date;
  periodEnd: Date;
  segments: KeyboardActivitySegment[];
};

type KeyboardActivityDoc = Document & {
  id: number;
  batch_id: string;
  employee_id: string;
  employee_name: string | null;
  pseudonym: string | null;
  machine_id: string | null;
  hostname: string | null;
  windows_user: string | null;
  app_name: string;
  app_path: string | null;
  key_down_count: number;
  typing_active_ms: number;
  keyboard_idle_ms: number;
  period_start: Date;
  period_end: Date;
  created_at: Date;
};

/** Reject payloads that look like typed-text / key-code capture. */
export const FORBIDDEN_KEYBOARD_BODY_KEYS = [
  "text",
  "typed_text",
  "typedText",
  "keys",
  "keystrokes",
  "key_codes",
  "keyCodes",
  "vk_codes",
  "vkCodes",
  "characters",
  "clipboard",
  "password",
  "passwords",
  "message",
  "messages",
  "content",
] as const;

export function findForbiddenKeyboardFields(
  body: Record<string, unknown>
): string[] {
  const hit: string[] = [];
  for (const key of FORBIDDEN_KEYBOARD_BODY_KEYS) {
    if (Object.prototype.hasOwnProperty.call(body, key) && body[key] != null) {
      hit.push(key);
    }
  }
  for (const seg of Array.isArray(body.segments) ? body.segments : []) {
    if (!seg || typeof seg !== "object") continue;
    const s = seg as Record<string, unknown>;
    for (const key of FORBIDDEN_KEYBOARD_BODY_KEYS) {
      if (Object.prototype.hasOwnProperty.call(s, key) && s[key] != null) {
        hit.push(`segments[].${key}`);
      }
    }
  }
  return [...new Set(hit)];
}

function trim(v: unknown, max: number): string {
  return String(v ?? "")
    .trim()
    .slice(0, max);
}

function toIso(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  const d = new Date(String(v ?? ""));
  return Number.isFinite(d.getTime()) ? d.toISOString() : new Date().toISOString();
}

function clampUint(n: unknown, max = 86_400_000): number {
  const v = Math.floor(Number(n));
  if (!Number.isFinite(v) || v < 0) return 0;
  return Math.min(max, v);
}

function mapRow(r: KeyboardActivityDoc): KeyboardActivityRow {
  return {
    id: Number(r.id),
    batchId: String(r.batch_id ?? ""),
    employeeId: String(r.employee_id ?? ""),
    employeeName: r.employee_name != null ? String(r.employee_name) : null,
    pseudonym: r.pseudonym != null ? String(r.pseudonym) : null,
    machineId: r.machine_id != null ? String(r.machine_id) : null,
    hostname: r.hostname != null ? String(r.hostname) : null,
    windowsUser: r.windows_user != null ? String(r.windows_user) : null,
    appName: String(r.app_name ?? ""),
    appPath: r.app_path != null ? String(r.app_path) : null,
    keyDownCount: Number(r.key_down_count) || 0,
    typingActiveMs: Number(r.typing_active_ms) || 0,
    keyboardIdleMs: Number(r.keyboard_idle_ms) || 0,
    periodStart: toIso(r.period_start),
    periodEnd: toIso(r.period_end),
  };
}

let indexesReady: Promise<void> | null = null;

async function col(): Promise<Collection<KeyboardActivityDoc>> {
  const c = await mongoCollection<KeyboardActivityDoc>("guard_keyboard_activity");
  if (!indexesReady) {
    indexesReady = (async () => {
      try {
        await c.createIndex(
          { batch_id: 1, app_name: 1 },
          { unique: true, name: "uq_gka_batch_app" }
        );
        await c.createIndex(
          { employee_id: 1, period_start: -1 },
          { name: "idx_gka_emp_period" }
        );
        await c.createIndex({ period_end: -1 }, { name: "idx_gka_period_end" });
        await c.createIndex({ app_name: 1 }, { name: "idx_gka_app" });
        await c.createIndex({ machine_id: 1 }, { name: "idx_gka_machine" });
        await c.createIndex({ id: 1 }, { unique: true, name: "uq_gka_id" });
      } catch {
        /* indexes may already exist */
      }
    })();
  }
  await indexesReady;
  return c;
}

async function nextId(): Promise<number> {
  const counters = await mongoCollection<{ _id: string; seq: number }>("counters");
  const res = await counters.findOneAndUpdate(
    { _id: "guard_keyboard_activity" },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: "after" }
  );
  // Driver 6 returns the doc directly; older shapes used { value }.
  const doc = (res as { seq?: number; value?: { seq?: number } } | null) ?? null;
  const seq = Number(doc?.seq ?? doc?.value?.seq);
  if (Number.isFinite(seq) && seq > 0) return seq;
  const again = await counters.findOne({ _id: "guard_keyboard_activity" });
  return Math.max(1, Number(again?.seq) || Date.now());
}

function isDupKeyError(err: unknown): boolean {
  const e = err as { code?: number; message?: string };
  return e?.code === 11000 || /E11000|duplicate key/i.test(String(e?.message || ""));
}

/**
 * Insert batch segments into MongoDB. Duplicate (batch_id, app_name) is skipped.
 */
export async function ingestKeyboardActivity(
  input: IngestKeyboardActivityInput
): Promise<{ inserted: number; skipped: number }> {
  const employeeId = trim(input.employeeId, 64);
  const batchId = trim(input.batchId, 64);
  if (!employeeId) throw new Error("employee_id required");
  if (!batchId) throw new Error("batch_id required");
  if (!input.segments?.length) throw new Error("segments required");

  const periodStart = input.periodStart;
  const periodEnd = input.periodEnd;
  if (
    !Number.isFinite(periodStart.getTime()) ||
    !Number.isFinite(periodEnd.getTime())
  ) {
    throw new Error("period_start / period_end invalid");
  }
  if (periodEnd.getTime() < periodStart.getTime()) {
    throw new Error("period_end before period_start");
  }
  if (periodEnd.getTime() - periodStart.getTime() > 15 * 60 * 1000) {
    throw new Error("period window too large");
  }

  const employeeName = trim(input.employeeName, 255) || null;
  const pseudonym = trim(input.pseudonym, 255) || null;
  const machineId = trim(input.machineId, 128) || null;
  const hostname = trim(input.hostname, 255) || null;
  const windowsUser = trim(input.windowsUser, 255) || null;

  const c = await col();
  let inserted = 0;
  let skipped = 0;

  for (const seg of input.segments.slice(0, 40)) {
    const appName = trim(seg.appName, 255) || "Unknown";
    const appPath = trim(seg.appPath, 512) || null;
    const keyDownCount = clampUint(seg.keyDownCount, 500_000);
    const typingActiveMs = clampUint(seg.typingActiveMs);
    const keyboardIdleMs = clampUint(seg.keyboardIdleMs);
    if (keyDownCount === 0 && typingActiveMs === 0 && keyboardIdleMs === 0) {
      skipped += 1;
      continue;
    }

    const doc: KeyboardActivityDoc = {
      id: await nextId(),
      batch_id: batchId,
      employee_id: employeeId,
      employee_name: employeeName,
      pseudonym,
      machine_id: machineId,
      hostname,
      windows_user: windowsUser,
      app_name: appName,
      app_path: appPath,
      key_down_count: keyDownCount,
      typing_active_ms: typingActiveMs,
      keyboard_idle_ms: keyboardIdleMs,
      period_start: periodStart,
      period_end: periodEnd,
      created_at: new Date(),
    };

    try {
      await c.insertOne(doc);
      inserted += 1;
    } catch (err) {
      if (isDupKeyError(err)) {
        skipped += 1;
        continue;
      }
      throw err;
    }
  }

  return { inserted, skipped };
}

export type ListKeyboardActivityOpts = {
  employeeId?: string;
  appQuery?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
};

export async function listKeyboardActivity(
  opts: ListKeyboardActivityOpts = {}
): Promise<{
  rows: KeyboardActivityRow[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const page = Math.max(1, Math.floor(opts.page || 1));
  const pageSize = Math.min(100, Math.max(1, Math.floor(opts.pageSize || 50)));
  const filter: Filter<KeyboardActivityDoc> = {};

  if (opts.employeeId?.trim()) {
    filter.employee_id = opts.employeeId.trim();
  }
  if (opts.appQuery?.trim()) {
    filter.app_name = { $regex: opts.appQuery.trim(), $options: "i" };
  }
  if (opts.search?.trim()) {
    const q = opts.search.trim();
    const rx = { $regex: q, $options: "i" as const };
    filter.$or = [
      { employee_name: rx },
      { pseudonym: rx },
      { app_name: rx },
      { hostname: rx },
    ];
  }
  const period: { $gte?: Date; $lte?: Date } = {};
  if (opts.dateFrom && /^\d{4}-\d{2}-\d{2}$/.test(opts.dateFrom)) {
    period.$gte = new Date(`${opts.dateFrom}T00:00:00.000`);
  }
  if (opts.dateTo && /^\d{4}-\d{2}-\d{2}$/.test(opts.dateTo)) {
    period.$lte = new Date(`${opts.dateTo}T23:59:59.999`);
  }
  if (period.$gte || period.$lte) {
    filter.period_start = period;
  }

  const c = await col();
  const total = await c.countDocuments(filter);
  const offset = (page - 1) * pageSize;
  const rows = await c
    .find(filter)
    .sort({ period_end: -1, id: -1 })
    .skip(offset)
    .limit(pageSize)
    .toArray();

  return {
    rows: rows.map(mapRow),
    total,
    page,
    pageSize,
  };
}

import { computeShiftEndEpochMs, parseAttendanceDateTimeMs, wallClockToEpochMs } from "./shift-timing";
import {
  getDateStringInTimeZone,
  getTimeStringInTimeZone,
  SERVER_TIMEZONE,
} from "./timezone";
import { parseZkbioDateTimeMs } from "./zkbio-time";
import {
  buildPinProfilesFromRows,
  hrmMapFromEmployees,
  hrmIdMapFromEmployees,
  profileMapsFromApi,
  resolveZkIdentity,
  type HrmCodeProfile,
  type PinProfile,
} from "./zkbio-employee-resolve";

export const MAX_SESSION_MS = 24 * 60 * 60 * 1000;
const TUNGSTEN_AFTER_CLOCK_GRACE_MS = 30 * 60 * 1000;
/** Exit window: up to 1h before shift end through 2h after (overnight AM outs). */
const EXIT_BEFORE_SHIFT_END_MS = 60 * 60 * 1000;
const EXIT_AFTER_SHIFT_END_MS = 2 * 60 * 60 * 1000;

export type TungstenPunchContext = {
  zkRows: Record<string, unknown>[];
  batchPinProfiles: Map<string, PinProfile>;
  dbPinProfiles: Map<string, PinProfile>;
  hrmByCode: Map<string, HrmCodeProfile>;
  hrmById: Map<string, HrmCodeProfile>;
  hrmEmployees: HrmEmployeeRef[];
};

export type HrmEmployeeRef = {
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  departmentName: string;
  pseudonym: string;
  gender: string;
};

/** Match Tungsten punches to an HRM employee by PIN (employee_code) and/or name. */
export type EmployeeMatchKeys = {
  employeeName: string;
  employeeCode?: string | null;
  employeeId?: string | null;
  pseudonym?: string | null;
};

export type ShiftDayTiming = {
  startTime: string;
  endTime: string;
};

export type EmployeeShiftResolver = (
  sessionDate: string,
) => ShiftDayTiming | null | undefined;

function resolveHrmPinMatch(ctx: TungstenPunchContext, pin: string) {
  if (!pin) return undefined;
  return ctx.hrmByCode.get(pin) || ctx.hrmById.get(pin);
}

/** One row = one Employee Report session (same punch in/out logic). */
export type EmployeeReportSession = {
  sessionDate: string;
  tungstenPunchIn: string;
  hrmClockIn: string;
  hrmClockOut: string;
  tungstenPunchOut: string;
};

type InternalRow = {
  source: "H" | "T";
  sortAt: string;
  date: string;
  time: string;
  detail: string;
};

function normalizeName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function rawZkNameFromRow(z: Record<string, unknown>) {
  const first = String(z.first_name ?? "").trim();
  const last = String(z.last_name ?? "").trim();
  return `${first} ${last}`.trim();
}

function formatPunchTimeFromMs(ms: number) {
  return getTimeStringInTimeZone(new Date(ms), SERVER_TIMEZONE);
}

/** PIN match, exact name, or partial name (e.g. Tungsten "Zahid Ali" vs HRM "Zahid Ali Parviz"). */
function namesLooselyMatch(a: string, b: string) {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  // "NA" must not match "Naveed" / "Hussain" via 2-letter substring.
  if (na.length < 3 || nb.length < 3) return false;
  if (na.includes(nb) || nb.includes(na)) return true;
  const ta = na.split(" ").filter((t) => t.length >= 3);
  const tb = nb.split(" ").filter((t) => t.length >= 3);
  if (ta.length >= 2 && tb.length >= 2) {
    const shared = tb.filter((t) => ta.includes(t)).length;
    if (shared >= 2) return true;
    if (ta[0] === tb[0] && ta[ta.length - 1] === tb[tb.length - 1]) return true;
  }
  return false;
}

export function punchMatchesEmployee(
  pin: string,
  zkResolvedName: string,
  hrmPinMatch: HrmCodeProfile | undefined,
  target: EmployeeMatchKeys,
  rawZkRowName?: string,
): boolean {
  const empId = String(target.employeeId ?? "").trim();
  const code = String(target.employeeCode ?? "").trim();
  // When HRM has a PIN/code or numeric id, never fall through to name/pseudonym.
  if (code || empId) {
    if (code && pin && pin === code) return true;
    if (empId && pin && pin === empId) return true;
    return false;
  }

  const candidates = [
    hrmPinMatch?.employeeName || "",
    zkResolvedName,
    rawZkRowName || "",
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (namesLooselyMatch(target.employeeName, candidate)) return true;
  }

  if (
    hrmPinMatch?.employeeId &&
    empId &&
    hrmPinMatch.employeeId === empId
  ) {
    return true;
  }

  return false;
}

/** Punch-only employees: match ZK rows by PIN only (no loose name matching). */
export function punchMatchesEmployeePinOnly(
  pin: string,
  target: EmployeeMatchKeys,
): boolean {
  const code = String(target.employeeCode ?? "").trim();
  if (code && pin && pin === code) return true;
  const empId = String(target.employeeId ?? "").trim();
  if (empId && pin && pin === empId) return true;
  return false;
}

export function employeeHasZkPunchesInRange(
  ctx: TungstenPunchContext,
  target: EmployeeMatchKeys,
  dateFrom: string,
  dateTo: string,
): boolean {
  for (const z of ctx.zkRows) {
    const pin = String(z.pin ?? "").trim();
    const { employeeName: zkName } = resolveZkIdentity(
      z,
      ctx.batchPinProfiles,
      ctx.dbPinProfiles,
      ctx.hrmByCode,
    );
    const hrmMatch = resolveHrmPinMatch(ctx, pin);
    const rawName = rawZkNameFromRow(z);
    if (!punchMatchesEmployee(pin, zkName, hrmMatch, target, rawName)) continue;

    const rawVal = z.event_time ?? z.imported_at;
    if (rawVal == null || rawVal === "") continue;
    const punchMs = parseZkbioDateTimeMs(z);
    if (punchMs == null) continue;
    const eventDate = getDateStringInTimeZone(punchMs, SERVER_TIMEZONE);
    if (eventDate < dateFrom || eventDate > dateTo) continue;
    return true;
  }
  return false;
}

export function hrmEmployeesFromList(
  employees: {
    id?: string | number;
    first_name?: string;
    last_name?: string;
    employee_code?: string | null;
    department_name?: string | null;
    pseudonym?: string | null;
    gender?: string | null;
  }[],
): HrmEmployeeRef[] {
  return employees
    .map((e) => {
      const employeeId = e.id != null ? String(e.id) : "";
      if (!employeeId) return null;
      const first = String(e.first_name ?? "").trim();
      const last = String(e.last_name ?? "").trim();
      const employeeName = `${first} ${last}`.trim() || "—";
      return {
        employeeId,
        employeeName,
        employeeCode: String(e.employee_code ?? "").trim(),
        departmentName: String(e.department_name ?? "").trim() || "-",
        pseudonym: String(e.pseudonym ?? "").trim() || "-",
        gender: String(e.gender ?? "").trim(),
      };
    })
    .filter((e): e is HrmEmployeeRef => e != null);
}

export function addDaysToDateKey(dateKey: string, days: number) {
  const [y, m, d] = dateKey.split("-").map(Number);
  if (!y || !m || !d) return dateKey;
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

/** HRM + ZKBio timestamps — prefer device-local eventTime for Tungsten rows. */
function rowFromIso(source: "H" | "T", isoOrMs: string | number, detail: string): InternalRow | null {
  const ms =
    typeof isoOrMs === "number"
      ? isoOrMs
      : parseAttendanceDateTimeMs(isoOrMs);
  if (ms == null) return null;
  const at = new Date(ms);
  return {
    source,
    sortAt: at.toISOString(),
    date: getDateStringInTimeZone(ms, SERVER_TIMEZONE),
    time: getTimeStringInTimeZone(ms, SERVER_TIMEZONE),
    detail,
  };
}

export async function fetchAllZkRows(baseParams: URLSearchParams): Promise<{
  rows: Record<string, unknown>[];
  departments: string[];
}> {
  const all: Record<string, unknown>[] = [];
  const deptSet = new Set<string>();
  let page = 1;
  let total = 0;

  do {
    const params = new URLSearchParams(baseParams);
    params.set("employeeReport", "1");
    params.set("page", String(page));
    params.set("pageSize", "2000");
    const res = await fetch(`/api/zkbio-punch-log?${params}`);
    const data = await res.json();
    if (!data.success) break;
    total = Number(data.total) || 0;
    const batch = (data.rows || []) as Record<string, unknown>[];
    all.push(...batch);
    if (Array.isArray(data.departments)) {
      data.departments.forEach((d: string) => deptSet.add(d));
    }
    if (batch.length === 0) break;
    page += 1;
  } while (all.length < total && page <= 250);

  return { rows: all, departments: [...deptSet] };
}

/** One bulk ZK fetch (like Employee Report) — identity resolved client-side via pin profiles. */
export async function loadTungstenPunchContext(
  dateFrom: string,
  dateTo: string,
  dept?: string,
): Promise<TungstenPunchContext> {
  const zkParams = new URLSearchParams({
    dateFrom: addDaysToDateKey(dateFrom, -1),
    dateTo: addDaysToDateKey(dateTo, 1),
  });
  if (dept) zkParams.set("dept", dept);

  const [zkResult, pinProfRes, empListRes] = await Promise.all([
    fetchAllZkRows(zkParams),
    fetch("/api/zkbio-pin-profiles"),
    fetch("/api/employee-list"),
  ]);

  const pinProfData = await pinProfRes.json();
  const empListData = await empListRes.json();

  return {
    zkRows: zkResult.rows,
    batchPinProfiles: buildPinProfilesFromRows(zkResult.rows),
    dbPinProfiles: pinProfData.success
      ? profileMapsFromApi(pinProfData.profiles || [])
      : new Map(),
    hrmByCode:
      empListData.success && empListData.employees
        ? hrmMapFromEmployees(empListData.employees)
        : new Map(),
    hrmById:
      empListData.success && empListData.employees
        ? hrmIdMapFromEmployees(empListData.employees)
        : new Map(),
    hrmEmployees:
      empListData.success && empListData.employees
        ? hrmEmployeesFromList(empListData.employees)
        : [],
  };
}

function appendTungstenRows(
  merged: InternalRow[],
  target: EmployeeMatchKeys,
  ctx: TungstenPunchContext,
  zkDateFrom: string,
  zkDateTo: string,
) {
  for (const z of ctx.zkRows) {
    const pin = String(z.pin ?? "").trim();
    const { employeeName: zkName } = resolveZkIdentity(
      z,
      ctx.batchPinProfiles,
      ctx.dbPinProfiles,
      ctx.hrmByCode,
    );
    const hrmMatch = resolveHrmPinMatch(ctx, pin);
    const rawName = rawZkNameFromRow(z);
    if (!punchMatchesEmployee(pin, zkName, hrmMatch, target, rawName)) continue;

    const rawVal = z.event_time ?? z.imported_at;
    if (rawVal == null || rawVal === "") continue;
    const raw = String(rawVal);
    const punchMs = parseZkbioDateTimeMs(z);
    if (punchMs == null) continue;
    const eventDate = getDateStringInTimeZone(punchMs, SERVER_TIMEZONE);
    if (eventDate < zkDateFrom || eventDate > zkDateTo) continue;

    const reader = String(z.reader_name || "").trim() || "-";
    const event = String(z.event_name || "").trim() || "Punch";
    const r = rowFromIso("T", punchMs, `${reader} — ${event}`);
    if (r) merged.push(r);
  }
}

type HrmEvent = { sortAt: string; date: string; time: string };
type TungstenEvent = { atMs: number; time: string; date: string };

function parseShiftTimeToHms(value: string | null | undefined) {
  if (!value) return null;
  const match = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(String(value).trim());
  if (!match) return null;
  return {
    h: Number(match[1]),
    m: Number(match[2]),
    s: Number(match[3] || "0"),
  };
}

/**
 * Arrival thumb for a shift day: skip early-morning punches (overnight carry-over
 * after midnight). Prefer first punch before shift start (aty hoye); else first at/after shift start.
 */
function firstArrivalPunchForShiftDay(
  tungstenByTime: TungstenEvent[],
  sessionDate: string,
  shiftStart: string | null | undefined,
): string | undefined {
  const shiftMs = wallClockToEpochMs(sessionDate, shiftStart || "14:00:00");
  const noonMs = wallClockToEpochMs(sessionDate, "12:00:00");
  if (shiftMs == null || noonMs == null) return undefined;

  const onDay = tungstenByTime.filter((t) => t.date === sessionDate);
  if (!onDay.length) return undefined;

  for (const t of onDay) {
    if (t.atMs < noonMs) continue;
    if (t.atMs < shiftMs) return t.time;
  }
  for (const t of onDay) {
    if (t.atMs >= noonMs && t.atMs >= shiftMs) return t.time;
  }
  return undefined;
}

function isExitCandidate(
  t: TungstenEvent,
  cinMs: number,
  usedPunchAt: Set<number>,
  excludeExitAtMs?: number,
) {
  return (
    t.atMs >= cinMs &&
    !usedPunchAt.has(t.atMs) &&
    (excludeExitAtMs == null || t.atMs !== excludeExitAtMs)
  );
}

/**
 * T.Punch out: last exit Tungsten for this session.
 * 1) Last punch in 30 min after clock-out
 * 2) Else last door punch before clock-out
 * 3) Else last same-day punch after clock-out (late ZK / just past grace)
 */
function assignSessionPunchOut(
  tungstenByTime: TungstenEvent[],
  sessionDate: string,
  cinMs: number,
  outMs: number,
  nowMs: number,
  usedPunchAt: Set<number>,
  excludeExitAtMs?: number,
): string | undefined {
  if (Number.isNaN(cinMs) || Number.isNaN(outMs)) return undefined;

  const graceEnd = outMs + TUNGSTEN_AFTER_CLOCK_GRACE_MS;
  const searchEnd = Math.min(nowMs, graceEnd);

  const afterOutGrace = tungstenByTime.filter(
    (t) =>
      isExitCandidate(t, cinMs, usedPunchAt, excludeExitAtMs) &&
      t.atMs >= outMs &&
      t.atMs <= searchEnd,
  );
  if (afterOutGrace.length) {
    const pick = afterOutGrace[afterOutGrace.length - 1];
    usedPunchAt.add(pick.atMs);
    return pick.time;
  }

  const beforeOut = tungstenByTime.filter(
    (t) =>
      isExitCandidate(t, cinMs, usedPunchAt, excludeExitAtMs) &&
      t.atMs < outMs,
  );
  if (beforeOut.length) {
    const pick = beforeOut[beforeOut.length - 1];
    usedPunchAt.add(pick.atMs);
    return pick.time;
  }

  const sameDayLateExit = tungstenByTime.filter(
    (t) =>
      t.date === sessionDate &&
      isExitCandidate(t, cinMs, usedPunchAt, excludeExitAtMs) &&
      t.atMs > outMs,
  );
  if (sameDayLateExit.length) {
    const pick = sameDayLateExit[sameDayLateExit.length - 1];
    usedPunchAt.add(pick.atMs);
    return pick.time;
  }

  return undefined;
}

/** Shift-day punches: include next-morning exits for overnight shifts. */
function collectShiftDayPunches(
  tungstenByTime: TungstenEvent[],
  sessionDate: string,
  shift?: ShiftDayTiming | null,
): TungstenEvent[] {
  const onDay = tungstenByTime.filter((t) => t.date === sessionDate);
  if (!shift?.startTime || !shift?.endTime) return onDay;

  const start = parseShiftTimeToHms(shift.startTime);
  const end = parseShiftTimeToHms(shift.endTime);
  if (!start || !end) return onDay;

  const overnight = end.h * 60 + end.m <= start.h * 60 + start.m;
  if (!overnight) return onDay;

  const nextDate = addDaysToDateKey(sessionDate, 1);
  const shiftEndMs = computeShiftEndEpochMs(
    {
      start_time: shift.startTime,
      end_time: shift.endTime,
      assigned_date: sessionDate,
    },
    sessionDate,
  );
  const nextDay = tungstenByTime.filter(
    (t) => t.date === nextDate && shiftEndMs != null && t.atMs <= shiftEndMs,
  );
  return [...onDay, ...nextDay];
}

type ShiftDayPunchOptions = {
  /**
   * When true, T.Punch Out must be a real punch at/after shift end.
   * No fallback to "day last punch" before shift end.
   */
  requireOutAfterShiftEnd?: boolean;
};

/** Simple shift-day T.Punch: first punch at/after shift start; last punch near shift end (± window). */
function firstLastPunchForShiftDay(
  tungstenByTime: TungstenEvent[],
  sessionDate: string,
  shift?: ShiftDayTiming | null,
  options?: ShiftDayPunchOptions,
): { punchIn: string; punchOut: string } {
  if (!shift?.startTime || !shift?.endTime) {
    const onDay = [...tungstenByTime.filter((t) => t.date === sessionDate)].sort(
      (a, b) => a.atMs - b.atMs,
    );
    if (!onDay.length) return { punchIn: "-", punchOut: "-" };
    const punchIn = onDay[0].time;
    const punchOut = onDay.length > 1 ? onDay[onDay.length - 1].time : "-";
    return { punchIn, punchOut: punchOut === punchIn ? "-" : punchOut };
  }

  const shiftStartMs = wallClockToEpochMs(sessionDate, shift.startTime);
  const shiftEndMs = computeShiftEndEpochMs(
    {
      start_time: shift.startTime,
      end_time: shift.endTime,
      assigned_date: sessionDate,
    },
    sessionDate,
  );
  if (shiftStartMs == null || shiftEndMs == null) return { punchIn: "-", punchOut: "-" };

  const collectUntilMs = shiftEndMs + EXIT_AFTER_SHIFT_END_MS;
  const dayPunches = tungstenByTime
    .filter((t) => t.atMs >= shiftStartMs && t.atMs <= collectUntilMs)
    .sort((a, b) => a.atMs - b.atMs);
  if (!dayPunches.length) return { punchIn: "-", punchOut: "-" };

  const punchIn = dayPunches[0].time;
  const requireOutAfterShiftEnd = options?.requireOutAfterShiftEnd === true;
  const exitFromMs = requireOutAfterShiftEnd
    ? shiftEndMs
    : shiftEndMs - EXIT_BEFORE_SHIFT_END_MS;
  const exitCandidates = dayPunches.filter(
    (t) => t.atMs >= exitFromMs && t.atMs !== dayPunches[0].atMs,
  );
  let punchOut = "-";
  if (exitCandidates.length) {
    punchOut = exitCandidates[exitCandidates.length - 1].time;
  } else if (!requireOutAfterShiftEnd && dayPunches.length > 1) {
    punchOut = dayPunches[dayPunches.length - 1].time;
  }
  if (punchOut === punchIn) punchOut = "-";
  return { punchIn, punchOut };
}

function punchesInShiftWindow(
  tungstenByTime: TungstenEvent[],
  sessionDate: string,
  shift?: ShiftDayTiming | null,
): TungstenEvent[] {
  if (!shift?.startTime || !shift?.endTime) {
    return [...tungstenByTime.filter((t) => t.date === sessionDate)].sort((a, b) => a.atMs - b.atMs);
  }
  const shiftStartMs = wallClockToEpochMs(sessionDate, shift.startTime);
  const shiftEndMs = computeShiftEndEpochMs(
    {
      start_time: shift.startTime,
      end_time: shift.endTime,
      assigned_date: sessionDate,
    },
    sessionDate,
  );
  if (shiftStartMs == null || shiftEndMs == null) {
    return [...tungstenByTime.filter((t) => t.date === sessionDate)].sort((a, b) => a.atMs - b.atMs);
  }
  const collectUntilMs = shiftEndMs + EXIT_AFTER_SHIFT_END_MS;
  return tungstenByTime
    .filter((t) => t.atMs >= shiftStartMs && t.atMs <= collectUntilMs)
    .sort((a, b) => a.atMs - b.atMs);
}

function appendZkOnlyDaySessions(
  sessions: EmployeeReportSession[],
  tungstenByTime: TungstenEvent[],
  zkDateFrom: string,
  zkDateTo: string,
  resolveShift?: EmployeeShiftResolver,
): EmployeeReportSession[] {
  const coveredDates = new Set(sessions.map((s) => s.sessionDate));
  const punchDates = new Set(tungstenByTime.map((t) => t.date));
  const extra: EmployeeReportSession[] = [];

  for (const date of punchDates) {
    if (date < zkDateFrom || date > zkDateTo) continue;
    if (coveredDates.has(date)) continue;
    const { punchIn, punchOut } = firstLastPunchForShiftDay(
      tungstenByTime,
      date,
      resolveShift?.(date) ?? null,
    );
    if (punchIn === "-" && punchOut === "-") continue;
    extra.push({
      sessionDate: date,
      tungstenPunchIn: punchIn,
      hrmClockIn: "-",
      hrmClockOut: "-",
      tungstenPunchOut: punchOut,
    });
  }

  if (!extra.length) return sessions;
  return [...sessions, ...extra].sort((a, b) =>
    a.sessionDate.localeCompare(b.sessionDate),
  );
}

function collectEmployeeTungstenEvents(
  target: EmployeeMatchKeys,
  ctx: TungstenPunchContext,
  zkDateFrom: string,
  zkDateTo: string,
  pinOnly = false,
): TungstenEvent[] {
  const tungsten: TungstenEvent[] = [];
  for (const z of ctx.zkRows) {
    const pin = String(z.pin ?? "").trim();
    if (pinOnly) {
      if (!punchMatchesEmployeePinOnly(pin, target)) continue;
    } else {
      const { employeeName: zkName } = resolveZkIdentity(
        z,
        ctx.batchPinProfiles,
        ctx.dbPinProfiles,
        ctx.hrmByCode,
      );
      const hrmMatch = resolveHrmPinMatch(ctx, pin);
      const rawName = rawZkNameFromRow(z);
      if (!punchMatchesEmployee(pin, zkName, hrmMatch, target, rawName)) continue;
    }

    const punchMs = parseZkbioDateTimeMs(z);
    if (punchMs == null) continue;
    const eventDate = getDateStringInTimeZone(punchMs, SERVER_TIMEZONE);
    if (eventDate < zkDateFrom || eventDate > zkDateTo) continue;

    tungsten.push({
      atMs: punchMs,
      time: formatPunchTimeFromMs(punchMs),
      date: eventDate,
    });
  }
  return tungsten.sort((a, b) => a.atMs - b.atMs);
}

/**
 * Punch-only employees (no HRM clock in/out): per shift day,
 * T.Punch In = first punch at/after shift start; T.Punch Out = last punch in shift window
 * (overnight exits on next calendar morning count for the previous shift day).
 */
export function buildShiftPunchOnlySessions(
  target: EmployeeMatchKeys,
  ctx: TungstenPunchContext | null,
  dateFrom: string,
  dateTo: string,
  resolveShift: EmployeeShiftResolver,
): EmployeeReportSession[] {
  if (!ctx || !dateFrom || !dateTo) return [];

  const tungsten = collectEmployeeTungstenEvents(
    target,
    ctx,
    addDaysToDateKey(dateFrom, -1),
    addDaysToDateKey(dateTo, 1),
    true, // punch-only rows must stay strict: pin(employee_code) or employee id only
  );

  const sessions: EmployeeReportSession[] = [];
  let day = dateFrom;
  while (day <= dateTo) {
    const shift = resolveShift(day);
    if (shift) {
      const { punchIn, punchOut } = firstLastPunchForShiftDay(tungsten, day, shift, {
        requireOutAfterShiftEnd: true,
      });
      if (punchIn !== "-" || punchOut !== "-") {
        sessions.push({
          sessionDate: day,
          tungstenPunchIn: punchIn,
          hrmClockIn: "-",
          hrmClockOut: "-",
          tungstenPunchOut: punchOut,
        });
      }
    }
    day = addDaysToDateKey(day, 1);
  }
  return sessions;
}

/**
 * T.Punch in: first Tungsten entry of the shift day.
 * T.Punch out: last exit punch for the session (never the day-first arrival).
 */
export function pairTungstenWithSessions(
  hrmIns: HrmEvent[],
  hrmOuts: HrmEvent[],
  tungsten: TungstenEvent[],
  todayKey: string,
  nowMs: number = Date.now(),
  resolveShiftStart?: (sessionDate: string) => string | null | undefined,
  resolveShift?: EmployeeShiftResolver,
): EmployeeReportSession[] {
  const tungstenByTime = [...tungsten].sort((a, b) => a.atMs - b.atMs);
  const arrivalPunchByShiftDay = new Map<string, string>();

  const hrmInsSorted = [...hrmIns].sort((a, b) => a.sortAt.localeCompare(b.sortAt));
  const usedOutIdx = new Set<number>();
  const usedPunchAt = new Set<number>();

  type SessionDraft = EmployeeReportSession & {
    cinMs: number;
    outMs: number | null;
    excludeExitAtMs?: number;
    shiftTiming?: ShiftDayTiming | null;
  };

  const drafts: SessionDraft[] = [];

  for (let i = 0; i < hrmInsSorted.length; i += 1) {
    const cin = hrmInsSorted[i];
    const sessionDate = cin.date;
    const cinMs = parseAttendanceDateTimeMs(cin.sortAt) ?? Number.NaN;

    let hrmOut: HrmEvent | null = null;
    let matchedOutIdx = -1;
    for (let j = 0; j < hrmOuts.length; j += 1) {
      if (usedOutIdx.has(j)) continue;
      const outMs = parseAttendanceDateTimeMs(hrmOuts[j].sortAt) ?? Number.NaN;
      if (Number.isNaN(cinMs) || Number.isNaN(outMs)) continue;
      if (outMs >= cinMs && outMs - cinMs <= MAX_SESSION_MS) {
        hrmOut = hrmOuts[j];
        matchedOutIdx = j;
        break;
      }
    }
    if (!hrmOut) {
      let bestIdx = -1;
      let bestOutMs = Number.POSITIVE_INFINITY;
      for (let j = 0; j < hrmOuts.length; j += 1) {
        if (usedOutIdx.has(j)) continue;
        const outMs = parseAttendanceDateTimeMs(hrmOuts[j].sortAt) ?? Number.NaN;
        if (Number.isNaN(cinMs) || Number.isNaN(outMs) || outMs < cinMs) continue;
        if (outMs < bestOutMs) {
          bestOutMs = outMs;
          bestIdx = j;
        }
      }
      if (bestIdx >= 0) {
        hrmOut = hrmOuts[bestIdx];
        matchedOutIdx = bestIdx;
      }
    }
    if (matchedOutIdx >= 0) usedOutIdx.add(matchedOutIdx);

    let punchIn = "-";
    let excludeExitAtMs: number | undefined;

    const shiftTiming =
      resolveShift?.(sessionDate) ??
      (resolveShiftStart?.(sessionDate)
        ? {
            startTime: String(resolveShiftStart(sessionDate)),
            endTime: "",
          }
        : null);

    if (shiftTiming?.startTime) {
      const inWindow = punchesInShiftWindow(tungstenByTime, sessionDate, shiftTiming);
      if (inWindow.length) {
        punchIn = inWindow[0].time;
        excludeExitAtMs = inWindow[0].atMs;
      }
    } else {
      const shiftStart = resolveShiftStart?.(sessionDate);
      const cacheKey = `${sessionDate}|${shiftStart ?? ""}`;
      let arrival = arrivalPunchByShiftDay.get(cacheKey);
      if (arrival === undefined) {
        const found = firstArrivalPunchForShiftDay(tungstenByTime, sessionDate, shiftStart);
        arrival = found ?? "";
        arrivalPunchByShiftDay.set(cacheKey, arrival);
      }
      if (arrival) {
        punchIn = arrival;
        const arrivalEvent = tungstenByTime.find(
          (t) => t.date === sessionDate && t.time === arrival,
        );
        if (arrivalEvent) excludeExitAtMs = arrivalEvent.atMs;
      }
    }

    const outMs =
      hrmOut != null ? parseAttendanceDateTimeMs(hrmOut.sortAt) ?? null : null;

    drafts.push({
      sessionDate,
      tungstenPunchIn: punchIn,
      hrmClockIn: cin.time,
      hrmClockOut: hrmOut ? hrmOut.time : "-",
      tungstenPunchOut: "-",
      cinMs,
      outMs: outMs != null && !Number.isNaN(outMs) ? outMs : null,
      excludeExitAtMs,
      shiftTiming: shiftTiming?.endTime ? shiftTiming : null,
    });
  }

  // Newest session picks exit punches first (avoids long session stealing evening punches).
  const exitOrder = [...drafts]
    .filter((d) => d.outMs != null || d.shiftTiming?.endTime)
    .sort((a, b) => b.cinMs - a.cinMs);

  for (const draft of exitOrder) {
    const shiftEndMs =
      draft.shiftTiming?.startTime && draft.shiftTiming?.endTime
        ? computeShiftEndEpochMs(
            {
              start_time: draft.shiftTiming.startTime,
              end_time: draft.shiftTiming.endTime,
              assigned_date: draft.sessionDate,
            },
            draft.sessionDate,
          )
        : null;
    const exitAnchorMs =
      shiftEndMs != null && !Number.isNaN(shiftEndMs)
        ? shiftEndMs
        : (draft.outMs as number);

    const { punchOut: last } = firstLastPunchForShiftDay(
      tungstenByTime,
      draft.sessionDate,
      draft.shiftTiming,
    );
    if (last && last !== draft.tungstenPunchIn) {
      draft.tungstenPunchOut = last;
      continue;
    }

    const lastPunch = assignSessionPunchOut(
      tungstenByTime,
      draft.sessionDate,
      draft.cinMs,
      exitAnchorMs,
      nowMs,
      usedPunchAt,
      draft.excludeExitAtMs,
    );
    if (lastPunch) draft.tungstenPunchOut = lastPunch;
  }

  return drafts.map(({ cinMs: _c, outMs: _o, excludeExitAtMs: _e, shiftTiming: _s, ...session }) => session);
}

export function buildEmployeeReportSessions(
  target: EmployeeMatchKeys | string,
  attendanceRecords: {
    clock_in?: string | null;
    clock_out?: string | null;
    shift_start_time?: string | null;
    shift_end_time?: string | null;
  }[],
  ctx: TungstenPunchContext | null,
  todayKey: string,
  nowMs: number = Date.now(),
  zkDateFrom?: string,
  zkDateTo?: string,
  resolveShift?: EmployeeShiftResolver,
): EmployeeReportSession[] {
  const match: EmployeeMatchKeys =
    typeof target === "string" ? { employeeName: target } : target;
  const shiftTimingByDate = new Map<string, ShiftDayTiming>();
  for (const a of attendanceRecords) {
    if (!a.shift_start_time || !a.shift_end_time || !a.clock_in) continue;
    const dk = getDateStringInTimeZone(new Date(String(a.clock_in)), SERVER_TIMEZONE);
    if (dk && !shiftTimingByDate.has(dk)) {
      shiftTimingByDate.set(dk, {
        startTime: String(a.shift_start_time),
        endTime: String(a.shift_end_time),
      });
    }
  }

  const getShift = (sessionDate: string): ShiftDayTiming | null =>
    shiftTimingByDate.get(sessionDate) ?? resolveShift?.(sessionDate) ?? null;

  const merged: InternalRow[] = [];

  for (const a of attendanceRecords) {
    if (a.clock_in) {
      const r = rowFromIso("H", String(a.clock_in), "Clock In");
      if (r) merged.push(r);
    }
    if (a.clock_out) {
      const r = rowFromIso("H", String(a.clock_out), "Clock Out");
      if (r) merged.push(r);
    }
  }

  if (ctx) {
    const from = zkDateFrom || "0000-01-01";
    const to = zkDateTo || "9999-12-31";
    appendTungstenRows(merged, match, ctx, from, to);
  }

  merged.sort((a, b) => a.sortAt.localeCompare(b.sortAt));

  const hrmIns: HrmEvent[] = [];
  const hrmOuts: HrmEvent[] = [];
  const tungsten: TungstenEvent[] = [];

  for (const r of merged) {
    if (r.source === "H") {
      if (r.detail === "Clock In") {
        hrmIns.push({ sortAt: r.sortAt, date: r.date, time: r.time });
      } else {
        hrmOuts.push({ sortAt: r.sortAt, date: r.date, time: r.time });
      }
    } else {
      const atMs = parseAttendanceDateTimeMs(r.sortAt);
      if (atMs != null) {
        tungsten.push({ atMs, time: r.time, date: r.date });
      }
    }
  }

  const paired = pairTungstenWithSessions(
    hrmIns,
    hrmOuts,
    tungsten,
    todayKey,
    nowMs,
    (sessionDate) => getShift(sessionDate)?.startTime ?? null,
    (sessionDate) => getShift(sessionDate),
  );

  const from = zkDateFrom || "0000-01-01";
  const to = zkDateTo || "9999-12-31";
  return appendZkOnlyDaySessions(paired, tungsten, from, to, (sessionDate) =>
    getShift(sessionDate),
  );
}

export function monthlyDash(value: string) {
  return value === "-" || value === "" ? "---" : value;
}

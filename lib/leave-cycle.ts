// Use UTC consistently to avoid timezone issues
function toYmdUTC(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseYmd(input: string | Date | null | undefined): { year: number; month: number; day: number } | null {
  if (!input) return null;

  if (typeof input === "string") {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(input.trim());
    if (m) {
      return {
        year: Number(m[1]),
        month: Number(m[2]),
        day: Number(m[3]),
      };
    }
    // Try to parse as ISO string (which is UTC)
    const parsed = new Date(input);
    if (Number.isNaN(parsed.getTime())) return null;
    // Always use UTC for consistency
    return {
      year: parsed.getUTCFullYear(),
      month: parsed.getUTCMonth() + 1,
      day: parsed.getUTCDate(),
    };
  }

  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) return null;
    // Always use UTC for consistency
    return {
      year: input.getUTCFullYear(),
      month: input.getUTCMonth() + 1,
      day: input.getUTCDate(),
    };
  }

  return null;
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function normalizeAnniversaryDay(year: number, month: number, day: number): number {
  // Handle Feb 29 for non-leap years.
  if (month === 2 && day === 29 && !isLeapYear(year)) {
    return 28;
  }
  return day;
}

function buildYmd(year: number, month: number, day: number): string {
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

export function getLeaveCycleStartYmd(
  joinedDate: string | Date | null | undefined,
  now: Date = new Date()
): string | null {
  const joined = parseYmd(joinedDate);
  if (!joined) return null;

  const todayYmd = toYmdUTC(now);
  const thisYear = now.getUTCFullYear();

  const thisYearDay = normalizeAnniversaryDay(thisYear, joined.month, joined.day);
  const annivThisYear = buildYmd(thisYear, joined.month, thisYearDay);

  const cycleYear = todayYmd >= annivThisYear ? thisYear : thisYear - 1;
  const cycleDay = normalizeAnniversaryDay(cycleYear, joined.month, joined.day);
  const cycleStart = buildYmd(cycleYear, joined.month, cycleDay);

  const joinedYmd = buildYmd(joined.year, joined.month, joined.day);
  return cycleStart < joinedYmd ? joinedYmd : cycleStart;
}

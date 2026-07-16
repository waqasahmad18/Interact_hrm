/** US federal holidays + common American calendar observances. */

import { EVENT_CHIP_COLORS, US_HOLIDAY_COLOR } from "./event-colors";

export type UsHoliday = {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  start_at: string; // ISO-ish local midnight for sorting
  source: "us_holiday";
  color: string;
  is_all_day: true;
};

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function ymd(year: number, month: number, day: number) {
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** Shift Sat→Fri, Sun→Mon for federal observed holidays. */
function observed(year: number, month: number, day: number): string {
  const d = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  const dow = d.getUTCDay(); // 0 Sun … 6 Sat
  if (dow === 6) d.setUTCDate(d.getUTCDate() - 1);
  else if (dow === 0) d.setUTCDate(d.getUTCDate() + 1);
  return ymd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

function nthWeekday(year: number, month: number, weekday: number, n: number): string {
  // weekday: 0=Sun … 6=Sat; n: 1=first, 2=second, … -1=last
  if (n > 0) {
    const first = new Date(Date.UTC(year, month - 1, 1, 12, 0, 0));
    const firstDow = first.getUTCDay();
    const delta = (weekday - firstDow + 7) % 7;
    const day = 1 + delta + (n - 1) * 7;
    return ymd(year, month, day);
  }
  const last = new Date(Date.UTC(year, month, 0, 12, 0, 0));
  const lastDow = last.getUTCDay();
  const delta = (lastDow - weekday + 7) % 7;
  const day = last.getUTCDate() - delta;
  return ymd(year, month, day);
}

/** Western (Gregorian) Easter Sunday. */
function easterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return ymd(year, month, day);
}

function holiday(id: string, title: string, date: string, colorIndex: number): UsHoliday {
  return {
    id,
    title,
    date,
    start_at: `${date}T00:00:00`,
    source: "us_holiday",
    color: EVENT_CHIP_COLORS[colorIndex % EVENT_CHIP_COLORS.length] || US_HOLIDAY_COLOR,
    is_all_day: true,
  };
}

/**
 * US federal holidays + popular American calendar events for a year.
 * Colors cycle the shared palette so sidebar chips stay distinct.
 */
export function getUsFederalHolidays(year: number): UsHoliday[] {
  const easter = easterSunday(year);
  const easterDate = new Date(`${easter}T12:00:00Z`);
  const goodFriday = new Date(easterDate);
  goodFriday.setUTCDate(goodFriday.getUTCDate() - 2);
  const goodFridayYmd = ymd(
    goodFriday.getUTCFullYear(),
    goodFriday.getUTCMonth() + 1,
    goodFriday.getUTCDate()
  );

  const list: UsHoliday[] = [
    holiday(`us-${year}-new-year`, "New Year's Day", observed(year, 1, 1), 0),
    holiday(`us-${year}-mlk`, "Martin Luther King Jr. Day", nthWeekday(year, 1, 1, 3), 1),
    holiday(`us-${year}-valentine`, "Valentine's Day", ymd(year, 2, 14), 2),
    holiday(`us-${year}-presidents`, "Presidents' Day", nthWeekday(year, 2, 1, 3), 3),
    holiday(`us-${year}-st-patrick`, "St. Patrick's Day", ymd(year, 3, 17), 4),
    holiday(`us-${year}-good-friday`, "Good Friday", goodFridayYmd, 0),
    holiday(`us-${year}-easter`, "Easter Sunday", easter, 1),
    holiday(`us-${year}-mother`, "Mother's Day", nthWeekday(year, 5, 0, 2), 2),
    holiday(`us-${year}-memorial`, "Memorial Day", nthWeekday(year, 5, 1, -1), 3),
    holiday(`us-${year}-juneteenth`, "Juneteenth", observed(year, 6, 19), 4),
    holiday(`us-${year}-father`, "Father's Day", nthWeekday(year, 6, 0, 3), 0),
    holiday(`us-${year}-independence`, "Independence Day", observed(year, 7, 4), 1),
    holiday(`us-${year}-labor`, "Labor Day", nthWeekday(year, 9, 1, 1), 2),
    holiday(`us-${year}-columbus`, "Columbus Day", nthWeekday(year, 10, 1, 2), 3),
    holiday(`us-${year}-halloween`, "Halloween", ymd(year, 10, 31), 4),
    holiday(`us-${year}-veterans`, "Veterans Day", observed(year, 11, 11), 0),
    holiday(`us-${year}-thanksgiving`, "Thanksgiving Day", nthWeekday(year, 11, 4, 4), 1),
    holiday(`us-${year}-black-friday`, "Black Friday", (() => {
      const thanks = nthWeekday(year, 11, 4, 4);
      const d = new Date(`${thanks}T12:00:00Z`);
      d.setUTCDate(d.getUTCDate() + 1);
      return ymd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
    })(), 2),
    holiday(`us-${year}-christmas-eve`, "Christmas Eve", ymd(year, 12, 24), 3),
    holiday(`us-${year}-christmas`, "Christmas Day", observed(year, 12, 25), 4),
    holiday(`us-${year}-nye`, "New Year's Eve", ymd(year, 12, 31), 0),
  ];

  return list.sort((a, b) => a.date.localeCompare(b.date));
}

/** Holidays spanning year-1 … year+1 (for month nav near year boundaries). */
export function getUsFederalHolidaysAround(year: number): UsHoliday[] {
  return [
    ...getUsFederalHolidays(year - 1),
    ...getUsFederalHolidays(year),
    ...getUsFederalHolidays(year + 1),
  ];
}

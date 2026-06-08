export const BREAK_DATA_CHANGED = "hrm:break-data-changed";
export const PRAYER_DATA_CHANGED = "hrm:prayer-data-changed";
export const ATTENDANCE_DATA_CHANGED = "hrm:attendance-data-changed";

export function notifyBreakDataChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(BREAK_DATA_CHANGED));
  }
}

export function notifyPrayerDataChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(PRAYER_DATA_CHANGED));
  }
}

export function notifyAttendanceDataChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(ATTENDANCE_DATA_CHANGED));
  }
}

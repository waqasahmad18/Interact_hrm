/** Shared palette for Upcoming Events chips + calendar highlights (PDF colors). */
export const EVENT_CHIP_COLORS = [
  "#25c6da",
  "#45aef0",
  "#ffb22c",
  "#e03756",
  "#7c4dff",
] as const;

export const US_HOLIDAY_COLOR = "#e03756";

export function stableEventColor(id: string | number, fallbackIndex = 0): string {
  const s = String(id);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return EVENT_CHIP_COLORS[h % EVENT_CHIP_COLORS.length] || EVENT_CHIP_COLORS[fallbackIndex % EVENT_CHIP_COLORS.length];
}

export function resolveEventColor(
  event: { id?: string | number; color?: string | null; source?: string },
  index = 0
): string {
  const custom = typeof event.color === "string" ? event.color.trim() : "";
  if (custom) return custom;
  if (event.source === "us_holiday") return US_HOLIDAY_COLOR;
  if (event.id != null) return stableEventColor(event.id, index);
  return EVENT_CHIP_COLORS[index % EVENT_CHIP_COLORS.length];
}

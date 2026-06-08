/** MySQL TINYINT(1) may arrive as 0/1, boolean, or string. */
export function isAutoClockOutRecord(
  value: boolean | number | string | null | undefined,
): boolean {
  return value === true || value === 1 || value === "1";
}

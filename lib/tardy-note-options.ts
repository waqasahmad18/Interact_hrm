export type TardyNoteOption = {
  code: string;
  label: string;
};

export const TARDY_NOTE_OTHER_CODE = "other";
export const TARDY_NOTE_OTHER_MAX_WORDS = 200;

export const TARDY_NOTE_OPTIONS: TardyNoteOption[] = [
  { code: "traffic_delay", label: "Traffic or transportation delay" },
  { code: "medical_illness", label: "Medical appointment or illness" },
  { code: "family_emergency", label: "Family or personal emergency" },
  { code: "weather", label: "Weather conditions" },
  { code: "work_travel", label: "Work-related travel" },
  { code: "other", label: "Other" },
];

export function tardyNoteLabelForCode(code: string): string {
  const found = TARDY_NOTE_OPTIONS.find((o) => o.code === code);
  return found?.label || code;
}

export function isValidTardyNoteCode(code: string): boolean {
  return TARDY_NOTE_OPTIONS.some((o) => o.code === code);
}

export function countWords(text: string): number {
  return String(text || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

export function normalizeTardyOtherText(text: string): string {
  return String(text || "")
    .trim()
    .replace(/\s+/g, " ");
}

export function validateTardyOtherText(text: string): { ok: true; value: string } | { ok: false; error: string } {
  const value = normalizeTardyOtherText(text);
  const words = countWords(value);
  if (words < 1) {
    return { ok: false, error: "Please write your reason (up to 200 words)." };
  }
  if (words > TARDY_NOTE_OTHER_MAX_WORDS) {
    return { ok: false, error: `Maximum ${TARDY_NOTE_OTHER_MAX_WORDS} words allowed.` };
  }
  return { ok: true, value };
}

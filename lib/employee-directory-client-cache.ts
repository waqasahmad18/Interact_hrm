/** Client cache: employee emails, departments, and latest shift times for profile popups. */

export type EmployeeDirectoryEntry = {
  id: string;
  name: string;
  pseudonym: string | null;
  department: string | null;
  email: string | null;
  shiftStart: string | null;
  shiftEnd: string | null;
};

const CACHE_TTL_MS = 5 * 60 * 1000;

type EmployeeDirectoryCache = {
  at: number;
  byId: Map<string, EmployeeDirectoryEntry>;
  byCode: Map<string, EmployeeDirectoryEntry>;
  byName: Map<string, EmployeeDirectoryEntry>;
};

let cache: EmployeeDirectoryCache | null = null;

let inflight: Promise<EmployeeDirectoryCache> | null = null;

function normalizeName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function buildEntry(
  id: string | number,
  name: string,
  pseudonym: string | null | undefined,
  department: string | null | undefined,
  emailWork: string | null | undefined,
  emailOther: string | null | undefined,
  shiftStart: string | null | undefined,
  shiftEnd: string | null | undefined
): EmployeeDirectoryEntry {
  const email = (emailWork || emailOther || "").trim() || null;
  return {
    id: String(id),
    name: name.trim(),
    pseudonym: pseudonym?.trim() || null,
    department: department?.trim() || null,
    email,
    shiftStart: shiftStart?.trim() || null,
    shiftEnd: shiftEnd?.trim() || null,
  };
}

export function clearEmployeeDirectoryClientCache() {
  cache = null;
  inflight = null;
}

export async function fetchEmployeeDirectoryMaps() {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_TTL_MS) return cache;

  if (inflight) return inflight;

  inflight = (async () => {
    const byId = new Map<string, EmployeeDirectoryEntry>();
    const byCode = new Map<string, EmployeeDirectoryEntry>();
    const byName = new Map<string, EmployeeDirectoryEntry>();

    try {
      const [empRes, shiftRes] = await Promise.all([
        fetch("/api/employee-list"),
        fetch("/api/hrm-shifts-assignments"),
      ]);
      const empData = await empRes.json();
      const shiftData = await shiftRes.json();

      const shiftById = new Map<string, { start: string | null; end: string | null }>();
      if (shiftData.success && Array.isArray(shiftData.employees)) {
        for (const row of shiftData.employees) {
          const id = String(row.id ?? "");
          if (!id) continue;
          shiftById.set(id, {
            start: row.start_time ?? null,
            end: row.end_time ?? null,
          });
        }
      }

      if (empData.success && Array.isArray(empData.employees)) {
        for (const emp of empData.employees) {
          const id = String(emp.id ?? "");
          if (!id) continue;
          const name = `${emp.first_name || ""} ${emp.last_name || ""}`.trim();
          const shift = shiftById.get(id);
          const entry = buildEntry(
            id,
            name,
            emp.pseudonym,
            emp.department_name,
            emp.email_work,
            emp.email_other,
            shift?.start,
            shift?.end
          );
          byId.set(id, entry);
          const code = String(emp.employee_code ?? "").trim();
          if (code) byCode.set(code, entry);
          if (entry.name) byName.set(normalizeName(entry.name), entry);
        }
      }
    } catch {
      /* keep partial/empty maps */
    }

    cache = { at: Date.now(), byId, byCode, byName };
    return cache;
  })();

  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

export async function lookupEmployeeDirectory(
  employeeId?: string | number | null,
  employeeName?: string | null
): Promise<EmployeeDirectoryEntry | null> {
  const maps = await fetchEmployeeDirectoryMaps();
  if (!maps) return null;

  const id = employeeId !== null && employeeId !== undefined ? String(employeeId).trim() : "";
  if (id && maps.byId.has(id)) return maps.byId.get(id)!;
  if (id && maps.byCode.has(id)) return maps.byCode.get(id)!;

  const nameKey = employeeName ? normalizeName(employeeName) : "";
  if (nameKey && maps.byName.has(nameKey)) return maps.byName.get(nameKey)!;

  return null;
}

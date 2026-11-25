export type StaffRoleType = "원장님" | "선생님" | "조교쌤" | "실장님";

export interface AcademyStaffMember {
  id: string;
  name: string;
  role: StaffRoleType;
  assignedClasses: string;
  duties: string;
  createdAt: string;
}

const LOCAL_STAFF_KEY = "cosmath:academy-staff:v1";

export function loadAcademyStaff(): AcademyStaffMember[] {
  try {
    const raw = typeof window !== "undefined" ? localStorage.getItem(LOCAL_STAFF_KEY) : null;
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter(
          (item): item is AcademyStaffMember =>
            Boolean(item && typeof item.id === "string" && typeof item.name === "string")
        );
      }
    }
  } catch {
    // Ignore
  }
  return [];
}

export function saveAcademyStaff(list: AcademyStaffMember[]): AcademyStaffMember[] {
  try {
    if (typeof window !== "undefined") {
      localStorage.setItem(LOCAL_STAFF_KEY, JSON.stringify(list));
      window.dispatchEvent(new CustomEvent("cosmath-staff-changed", { detail: list }));
    }
  } catch {
    // Ignore
  }
  return list;
}

export function normalizeStaffRole(rawRole?: string): StaffRoleType {
  const r = (rawRole || "").trim();
  if (/원장/.test(r)) return "원장님";
  if (/조교/.test(r)) return "조교쌤";
  if (/실장|상담|행정|데스크/.test(r)) return "실장님";
  return "선생님";
}

export function addOrUpdateAcademyStaffMember(input: {
  name: string;
  role?: string;
  assignedClasses?: string;
  duties?: string;
}): AcademyStaffMember[] {
  const cleanName = input.name.trim();
  if (!cleanName) return loadAcademyStaff();
  const role = normalizeStaffRole(input.role);
  const current = loadAcademyStaff();
  const existingIdx = current.findIndex(
    m => m.name === cleanName || (m.name.includes(cleanName) && m.role === role)
  );
  if (existingIdx !== -1) {
    const prev = current[existingIdx];
    const updated: AcademyStaffMember = {
      ...prev,
      name: cleanName,
      role: input.role ? role : prev.role,
      assignedClasses:
        input.assignedClasses !== undefined ? input.assignedClasses.trim() : prev.assignedClasses,
      duties: input.duties !== undefined ? input.duties.trim() : prev.duties,
    };
    const next = [...current];
    next[existingIdx] = updated;
    return saveAcademyStaff(next);
  }
  const created: AcademyStaffMember = {
    id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `staff-${Date.now()}`,
    name: cleanName,
    role,
    assignedClasses: (input.assignedClasses || "").trim(),
    duties: (input.duties || "").trim(),
    createdAt: new Date().toISOString(),
  };
  return saveAcademyStaff([...current, created]);
}

export function removeAcademyStaffMember(idOrName: string): AcademyStaffMember[] {
  const target = idOrName.trim();
  const current = loadAcademyStaff();
  const next = current.filter(m => m.id !== target && m.name !== target && !m.name.includes(target));
  return saveAcademyStaff(next);
}

import { supabase } from "./supabase";
import { usesLocalStorage } from "./report-storage";

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
let staffTableMissing = false;

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

export async function fetchAcademyStaffFromDb(): Promise<AcademyStaffMember[]> {
  const local = loadAcademyStaff();
  if (usesLocalStorage() || staffTableMissing) return local;
  try {
    const { data, error } = await supabase
      .from("cosmath_academy_staff")
      .select("id, name, role, assigned_classes, duties, created_at")
      .order("created_at", { ascending: true });
    if (error) {
      staffTableMissing = true;
      return local;
    }
    if (Array.isArray(data)) {
      const remote: AcademyStaffMember[] = data.map(row => ({
        id: String(row.id),
        name: String(row.name || ""),
        role: normalizeStaffRole(String(row.role || "선생님")),
        assignedClasses: String(row.assigned_classes || ""),
        duties: String(row.duties || ""),
        createdAt: String(row.created_at || new Date().toISOString()),
      }));
      saveAcademyStaff(remote);
      return remote;
    }
  } catch {
    // Ignore network error and use local cache
  }
  return local;
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
  let targetMember: AcademyStaffMember;
  let next: AcademyStaffMember[];

  if (existingIdx !== -1) {
    const prev = current[existingIdx];
    targetMember = {
      ...prev,
      name: cleanName,
      role: input.role ? role : prev.role,
      assignedClasses:
        input.assignedClasses !== undefined ? input.assignedClasses.trim() : prev.assignedClasses,
      duties: input.duties !== undefined ? input.duties.trim() : prev.duties,
    };
    next = [...current];
    next[existingIdx] = targetMember;
  } else {
    targetMember = {
      id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : crypto.randomUUID(),
      name: cleanName,
      role,
      assignedClasses: (input.assignedClasses || "").trim(),
      duties: (input.duties || "").trim(),
      createdAt: new Date().toISOString(),
    };
    next = [...current, targetMember];
  }

  saveAcademyStaff(next);

  if (!usesLocalStorage() && !staffTableMissing) {
    void supabase
      .from("cosmath_academy_staff")
      .upsert(
        {
          id: targetMember.id,
          name: targetMember.name,
          role: targetMember.role,
          assigned_classes: targetMember.assignedClasses,
          duties: targetMember.duties,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" }
      )
      .then(({ error }) => {
        if (error) staffTableMissing = true;
      });
  }

  return next;
}

export async function syncAllAcademyStaffToDb(list: AcademyStaffMember[]): Promise<void> {
  saveAcademyStaff(list);
  if (usesLocalStorage() || staffTableMissing || list.length === 0) return;
  try {
    const rows = list.map(m => ({
      id: m.id,
      name: m.name,
      role: m.role,
      assigned_classes: m.assignedClasses || "",
      duties: m.duties || "",
      updated_at: new Date().toISOString(),
    }));
    const { error } = await supabase.from("cosmath_academy_staff").upsert(rows, { onConflict: "id" });
    if (error) staffTableMissing = true;
  } catch {
    staffTableMissing = true;
  }
}

export function removeAcademyStaffMember(idOrName: string): AcademyStaffMember[] {
  const target = idOrName.trim();
  const current = loadAcademyStaff();
  const removed = current.filter(m => m.id === target || m.name === target || m.name.includes(target));
  const next = current.filter(m => m.id !== target && m.name !== target && !m.name.includes(target));
  saveAcademyStaff(next);

  if (!usesLocalStorage() && !staffTableMissing && removed.length > 0) {
    const ids = removed.map(r => r.id);
    void supabase
      .from("cosmath_academy_staff")
      .delete()
      .in("id", ids)
      .then(({ error }) => {
        if (error) staffTableMissing = true;
      });
  }

  return next;
}

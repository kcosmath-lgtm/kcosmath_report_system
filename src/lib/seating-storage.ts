import type {
  AdjacencyMode,
  GridSeatCoord,
  SeatAssignment,
  SeatingHistoryEntry,
  SeatingRules,
  SeatingWorkspaceRecord,
} from "../types/seating";

const DB_NAME = "cosmath-seating-v1";
const STORE_NAME = "seatingWorkspaces";
const DB_VERSION = 1;
const LAST_LAYOUT_IDB_KEY = "__global_last_seat_layout__";
const LAST_LAYOUT_STORAGE_KEY = "cosmath-last-seat-layout-v1";

interface SavedSeatLayout {
  id: string;
  gridCols: number;
  gridRows: number;
  seatCoords: GridSeatCoord[];
  updatedAt: string;
}

function readCachedLastLayout(): Pick<SavedSeatLayout, "gridCols" | "gridRows" | "seatCoords"> {
  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(LAST_LAYOUT_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<SavedSeatLayout>;
        if (
          typeof parsed.gridCols === "number" &&
          parsed.gridCols >= 2 &&
          typeof parsed.gridRows === "number" &&
          parsed.gridRows >= 2 &&
          Array.isArray(parsed.seatCoords)
        ) {
          return {
            gridCols: parsed.gridCols,
            gridRows: parsed.gridRows,
            seatCoords: parsed.seatCoords.map(c => ({ ...c })),
          };
        }
      }
    } catch {
      // Ignore storage access errors
    }
  }
  return {
    gridCols: 6,
    gridRows: 10,
    seatCoords: COSMATH_DEFAULT_SEAT_COORDS.map(c => ({ ...c })),
  };
}

function writeCachedLastLayout(layout: Pick<SavedSeatLayout, "gridCols" | "gridRows" | "seatCoords">) {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(LAST_LAYOUT_STORAGE_KEY, JSON.stringify(layout));
    } catch {
      // Ignore storage access errors
    }
  }
}

// cosmath_random_seat 의 기본 좌석 좌표 (총 31석 + 보조 3석 = 34석, 6열 x 10행 격자)
export const PRIMARY_SEAT_COORDS: GridSeatCoord[] = [
  // Top Row (y=0): 6석 붙어 있음
  { x: 0, y: 0, tier: "primary" },
  { x: 1, y: 0, tier: "primary" },
  { x: 2, y: 0, tier: "primary" },
  { x: 3, y: 0, tier: "primary" },
  { x: 4, y: 0, tier: "primary" },
  { x: 5, y: 0, tier: "primary" },

  // Left Col (x=0, y=1..9): 9석 붙어 있음 (x=1 열은 비워져서 중앙과 띄워짐)
  { x: 0, y: 1, tier: "primary" },
  { x: 0, y: 2, tier: "primary" },
  { x: 0, y: 3, tier: "primary" },
  { x: 0, y: 4, tier: "primary" },
  { x: 0, y: 5, tier: "primary" },
  { x: 0, y: 6, tier: "primary" },
  { x: 0, y: 7, tier: "primary" },
  { x: 0, y: 8, tier: "primary" },
  { x: 0, y: 9, tier: "primary" },

  // Center Group 1 (x=2..5, y=2..3): 4x2 = 8석 (y=1 행이 비워져서 상단과 띄워짐)
  { x: 2, y: 2, tier: "primary" },
  { x: 3, y: 2, tier: "primary" },
  { x: 4, y: 2, tier: "primary" },
  { x: 5, y: 2, tier: "primary" },
  { x: 2, y: 3, tier: "primary" },
  { x: 3, y: 3, tier: "primary" },
  { x: 4, y: 3, tier: "primary" },
  { x: 5, y: 3, tier: "primary" },

  // Center Group 2 (x=2..5, y=5..6): 4x2 = 8석 (y=4 행이 비워져서 위 모둠과 띄워짐)
  { x: 2, y: 5, tier: "primary" },
  { x: 3, y: 5, tier: "primary" },
  { x: 4, y: 5, tier: "primary" },
  { x: 5, y: 5, tier: "primary" },
  { x: 2, y: 6, tier: "primary" },
  { x: 3, y: 6, tier: "primary" },
  { x: 4, y: 6, tier: "primary" },
  { x: 5, y: 6, tier: "primary" },
];

export const SECONDARY_SEAT_COORDS: GridSeatCoord[] = [
  // 하단 보조 3석 (y=8, x=3..5)
  { x: 3, y: 8, tier: "secondary" },
  { x: 4, y: 8, tier: "secondary" },
  { x: 5, y: 8, tier: "secondary" },
];

export const COSMATH_DEFAULT_SEAT_COORDS: GridSeatCoord[] = [
  ...PRIMARY_SEAT_COORDS,
  ...SECONDARY_SEAT_COORDS,
];

export function coordKey(x: number, y: number): string {
  return `${x},${y}`;
}

export function parseCoordKey(key: string): { x: number; y: number } | null {
  const parts = key.split(",");
  if (parts.length !== 2) return null;
  const x = Number(parts[0]);
  const y = Number(parts[1]);
  if (Number.isNaN(x) || Number.isNaN(y)) return null;
  return { x, y };
}

export const DEFAULT_SEATING_RULES: SeatingRules = {
  separateSameGrade: true,
  targetGrades: [],
  adjacencyMode: "orthogonal",
  avoidPreviousSeat: false,
  separatedPairs: [],
};

export function createDefaultSeatingRecord(id: string): SeatingWorkspaceRecord {
  const layout = readCachedLastLayout();
  return {
    id,
    gridCols: layout.gridCols,
    gridRows: layout.gridRows,
    seatCoords: layout.seatCoords,
    rules: { ...DEFAULT_SEATING_RULES },
    currentSeats: {},
    history: [],
    updatedAt: new Date().toISOString(),
  };
}

function openSeatingDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("브라우저에서 IndexedDB를 사용할 수 없습니다."));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function loadSeatingWorkspace(id: string): Promise<SeatingWorkspaceRecord> {
  try {
    const db = await openSeatingDatabase();
    return await new Promise<SeatingWorkspaceRecord>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const reqRecord = store.get(id);
      const reqGlobalLayout = store.get(LAST_LAYOUT_IDB_KEY);

      tx.oncomplete = () => {
        db.close();
        const found = reqRecord.result as Partial<SeatingWorkspaceRecord> | undefined;
        const globalLayout = reqGlobalLayout.result as Partial<SavedSeatLayout> | undefined;

        const base = createDefaultSeatingRecord(id);

        // 마지막으로 편집한 전역 자리 구조가 있으면 항상 해당 구조를 기본으로 적용
        const resolvedCols =
          typeof globalLayout?.gridCols === "number" && globalLayout.gridCols >= 2
            ? globalLayout.gridCols
            : typeof found?.gridCols === "number" && found.gridCols >= 2
              ? found.gridCols
              : base.gridCols;

        const resolvedRows =
          typeof globalLayout?.gridRows === "number" && globalLayout.gridRows >= 2
            ? globalLayout.gridRows
            : typeof found?.gridRows === "number" && found.gridRows >= 2
              ? found.gridRows
              : base.gridRows;

        const resolvedCoords = Array.isArray(globalLayout?.seatCoords)
          ? globalLayout.seatCoords
          : Array.isArray(found?.seatCoords)
            ? found.seatCoords
            : base.seatCoords;

        writeCachedLastLayout({
          gridCols: resolvedCols,
          gridRows: resolvedRows,
          seatCoords: resolvedCoords,
        });

        if (!found) {
          resolve({
            ...base,
            gridCols: resolvedCols,
            gridRows: resolvedRows,
            seatCoords: resolvedCoords,
          });
          return;
        }

        const rawMode = found.rules?.adjacencyMode as string | undefined;
        const adjacencyMode: AdjacencyMode =
          rawMode === "horizontal" ? "horizontal" : "orthogonal";

        resolve({
          ...base,
          ...found,
          gridCols: resolvedCols,
          gridRows: resolvedRows,
          seatCoords: resolvedCoords,
          rules: {
            ...DEFAULT_SEATING_RULES,
            ...(found.rules ?? {}),
            adjacencyMode,
          },
          currentSeats: found.currentSeats ?? {},
          history: Array.isArray(found.history) ? found.history : [],
        });
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
      tx.onabort = () => {
        db.close();
        reject(tx.error);
      };
    });
  } catch {
    return createDefaultSeatingRecord(id);
  }
}

export async function saveSeatingWorkspace(record: SeatingWorkspaceRecord): Promise<SeatingWorkspaceRecord> {
  const nowIso = new Date().toISOString();
  const updated: SeatingWorkspaceRecord = {
    ...record,
    updatedAt: nowIso,
  };
  const globalLayout: SavedSeatLayout = {
    id: LAST_LAYOUT_IDB_KEY,
    gridCols: record.gridCols,
    gridRows: record.gridRows,
    seatCoords: record.seatCoords.map(c => ({ ...c })),
    updatedAt: nowIso,
  };
  writeCachedLastLayout({
    gridCols: globalLayout.gridCols,
    gridRows: globalLayout.gridRows,
    seatCoords: globalLayout.seatCoords,
  });

  const db = await openSeatingDatabase();
  return new Promise<SeatingWorkspaceRecord>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.put(updated);
    store.put(globalLayout);
    tx.oncomplete = () => {
      db.close();
      resolve(updated);
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error ?? new Error("자리 배치 정보를 IndexedDB에 저장하지 못했습니다."));
    };
    tx.onabort = () => {
      db.close();
      reject(tx.error ?? new Error("자리 배치 저장이 중단되었습니다."));
    };
  });
}

export interface SeatingStudentInfo {
  id: string;
  name: string;
  grade: string;
  groupId: string;
  groupName: string;
}

export interface GradeColorPalette {
  bg: string;
  border: string;
  text: string;
  badgeBg: string;
  badgeText: string;
  dot: string;
  accent: string;
}

const GRADE_PALETTES: GradeColorPalette[] = [
  // 0: 중1 / 1학년 (Flat Soft Rose)
  {
    bg: "#fff1f2",
    border: "#fb7185",
    text: "#881337",
    badgeBg: "#ffe4e6",
    badgeText: "#be123c",
    dot: "#f43f5e",
    accent: "#f43f5e",
  },
  // 1: 중2 / 2학년 (Flat Soft Green)
  {
    bg: "#ecfdf5",
    border: "#34d399",
    text: "#064e3b",
    badgeBg: "#d1fae5",
    badgeText: "#047857",
    dot: "#10b981",
    accent: "#10b981",
  },
  // 2: 중3 / 3학년 (Flat Soft Blue)
  {
    bg: "#eff6ff",
    border: "#60a5fa",
    text: "#1e3a8a",
    badgeBg: "#dbeafe",
    badgeText: "#1d4ed8",
    dot: "#3b82f6",
    accent: "#2563eb",
  },
  // 3: 초6 (Flat Soft Violet)
  {
    bg: "#f5f3ff",
    border: "#a78bfa",
    text: "#4c1d95",
    badgeBg: "#ede9fe",
    badgeText: "#6d28d9",
    dot: "#8b5cf6",
    accent: "#7c3aed",
  },
  // 4: 초5 (Flat Soft Teal)
  {
    bg: "#f0fdfa",
    border: "#2dd4bf",
    text: "#134e4a",
    badgeBg: "#ccfbf1",
    badgeText: "#0f766e",
    dot: "#14b8a6",
    accent: "#0d9488",
  },
  // 5: 초4 / 초등 (Flat Soft Amber)
  {
    bg: "#fffbeb",
    border: "#fbbf24",
    text: "#78350f",
    badgeBg: "#fef3c7",
    badgeText: "#b45309",
    dot: "#f59e0b",
    accent: "#d97706",
  },
  // 6: 고1 (Flat Soft Pink)
  {
    bg: "#fdf2f8",
    border: "#f472b6",
    text: "#831843",
    badgeBg: "#fce7f3",
    badgeText: "#be185d",
    dot: "#ec4899",
    accent: "#db2777",
  },
  // 7: 고2 (Flat Soft Cyan)
  {
    bg: "#ecfeff",
    border: "#22d3ee",
    text: "#164e63",
    badgeBg: "#cffafe",
    badgeText: "#0e7490",
    dot: "#06b6d4",
    accent: "#0891b2",
  },
  // 8: 고3 (Flat Soft Indigo)
  {
    bg: "#eef2ff",
    border: "#818cf8",
    text: "#312e81",
    badgeBg: "#e0e7ff",
    badgeText: "#4338ca",
    dot: "#6366f1",
    accent: "#4f46e5",
  },
];

export const EMPTY_ACTIVE_SEAT_PALETTE = {
  bg: "#f8fafc",
  border: "#cbd5e1",
  text: "#94a3b8",
};

export function normalizeGradeKey(grade: string): string {
  const raw = grade.trim().replace(/\s+/g, "");
  if (raw === "1" || raw === "1학년" || raw === "중등1") return "중1";
  if (raw === "2" || raw === "2학년" || raw === "중등2") return "중2";
  if (raw === "3" || raw === "3학년" || raw === "중등3") return "중3";
  return raw;
}

export function getGradePalette(grade: string): GradeColorPalette {
  const key = normalizeGradeKey(grade);
  if (!key) return GRADE_PALETTES[8];
  if (key.includes("중1")) return GRADE_PALETTES[0];
  if (key.includes("중2")) return GRADE_PALETTES[1];
  if (key.includes("중3")) return GRADE_PALETTES[2];
  if (key.includes("초6") || key === "6학년") return GRADE_PALETTES[3];
  if (key.includes("초5") || key === "5학년") return GRADE_PALETTES[4];
  if (key.includes("초4") || key === "4학년" || key.startsWith("초")) return GRADE_PALETTES[5];
  if (key.includes("고1")) return GRADE_PALETTES[6];
  if (key.includes("고2")) return GRADE_PALETTES[7];
  if (key.includes("고3")) return GRADE_PALETTES[8];

  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return GRADE_PALETTES[hash % GRADE_PALETTES.length];
}

/**
 * 두 좌석 좌표가 격자상에서 붙어 있는지(인접 이웃인지) 판정합니다.
 * 사이에 빈 칸(통로)이 있으면 dx > 1 또는 dy > 1 이므로 인접하지 않은 것(띄운 자리)으로 처리됩니다.
 */
function areCoordsNeighbors(
  a: { x: number; y: number },
  b: { x: number; y: number },
  mode: AdjacencyMode
): boolean {
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  if (mode === "horizontal") {
    return dy === 0 && dx === 1;
  }
  // orthogonal: 상하좌우 1칸 인접 (대각선 dx=1, dy=1 은 허용)
  return (dx === 1 && dy === 0) || (dx === 0 && dy === 1);
}

/**
 * 직전 히스토리에서 학생별 좌석 좌표 키(studentId -> "x,y")를 추출합니다.
 */
export function getPreviousStudentCoordMap(history: SeatingHistoryEntry[]): Map<string, string> {
  const map = new Map<string, string>();
  const latest = history[0];
  if (!latest) return map;
  for (const [key, studentId] of Object.entries(latest.seats)) {
    if (studentId) {
      map.set(studentId, key);
    }
  }
  return map;
}

export function evaluateSeatingViolations(params: {
  assignments: Record<string, SeatAssignment>;
  seatCoords: GridSeatCoord[];
  studentsById: Map<string, SeatingStudentInfo>;
  rules: SeatingRules;
  previousCoordMap: Map<string, string>;
}): { conflictCount: number; violationsByCoord: Map<string, string[]> } {
  const { assignments, seatCoords, studentsById, rules, previousCoordMap } = params;
  const violationsByCoord = new Map<string, string[]>();
  let conflictCount = 0;

  const addReason = (key: string, reason: string) => {
    const list = violationsByCoord.get(key) ?? [];
    if (!list.includes(reason)) list.push(reason);
    violationsByCoord.set(key, list);
  };

  const activeCoords = seatCoords
    .map(c => ({ ...c, key: coordKey(c.x, c.y), studentId: assignments[coordKey(c.x, c.y)]?.studentId ?? null }))
    .filter(c => c.studentId !== null && studentsById.has(c.studentId));

  const targetGradeSet = new Set(rules.targetGrades.map(normalizeGradeKey).filter(Boolean));
  const separatedPairSet = new Set(
    rules.separatedPairs.flatMap(([a, b]) => [`${a}::${b}`, `${b}::${a}`])
  );

  // 1. 이전 자리 중복 검사
  if (rules.avoidPreviousSeat && previousCoordMap.size > 0) {
    for (const c of activeCoords) {
      const prevKey = previousCoordMap.get(c.studentId!);
      if (prevKey && prevKey === c.key) {
        conflictCount += 1;
        addReason(c.key, "직전과 동일한 자리");
      }
    }
  }

  // 2. 상하좌우 인접 좌석 간 조건 검사
  for (let i = 0; i < activeCoords.length; i++) {
    const a = activeCoords[i];
    const studentA = studentsById.get(a.studentId!)!;
    const gradeA = normalizeGradeKey(studentA.grade);

    for (let j = i + 1; j < activeCoords.length; j++) {
      const b = activeCoords[j];
      const studentB = studentsById.get(b.studentId!)!;
      const gradeB = normalizeGradeKey(studentB.grade);

      // 특정 학생 쌍 분리 (상하좌우 인접 금지)
      if (
        separatedPairSet.has(`${a.studentId}::${b.studentId}`) &&
        areCoordsNeighbors(a, b, "orthogonal")
      ) {
        conflictCount += 2;
        addReason(a.key, `${studentB.name} 학생과 인접 금지`);
        addReason(b.key, `${studentA.name} 학생과 인접 금지`);
      }

      // 동일 학년 인접 금지 (cosmath_random_seat 핵심 규칙)
      if (rules.separateSameGrade && gradeA && gradeA === gradeB) {
        const subjectToRule = targetGradeSet.size === 0 || targetGradeSet.has(gradeA);
        if (subjectToRule && areCoordsNeighbors(a, b, rules.adjacencyMode)) {
          conflictCount += 1;
          addReason(a.key, `동일 학년(${studentA.grade}) 인접: ${studentB.name}`);
          addReason(b.key, `동일 학년(${studentB.grade}) 인접: ${studentA.name}`);
        }
      }
    }
  }

  return { conflictCount, violationsByCoord };
}

/**
 * cosmath_random_seat/src/utils/seatAlgorithm.ts 의 20,000회 Simulated Annealing / Hill-Climbing
 * 최적화 알고리즘을 확장하여, 빈 자리('X', null)와 학생들을 함께 스왑하며
 * 동일 학년 상하좌우 인접 충돌이 0이 되는 배치를 찾습니다.
 */
export function generateOptimalSeating(params: {
  students: SeatingStudentInfo[];
  seatCoords: GridSeatCoord[];
  currentSeats: Record<string, SeatAssignment>;
  rules: SeatingRules;
  history: SeatingHistoryEntry[];
}): {
  assignments: Record<string, SeatAssignment>;
  conflictCount: number;
  violationsByCoord: Map<string, string[]>;
  unassignedCount: number;
} {
  const { students, seatCoords, currentSeats, rules, history } = params;
  const studentsById = new Map(students.map(s => [s.id, s]));
  const previousCoordMap = getPreviousStudentCoordMap(history);

  // primary 좌석과 secondary(보조) 좌석 분리
  const primaryCoords = seatCoords.filter(c => c.tier !== "secondary");
  const secondaryCoords = seatCoords.filter(c => c.tier === "secondary");
  const orderedCoords = [...primaryCoords, ...secondaryCoords];

  // 사용할 좌석 수 결정: 기본(primary) 좌석은 모두 활성화하고, 학생 수가 더 많으면 보조 좌석까지 확장
  const basePrimaryCount = primaryCoords.length > 0 ? primaryCoords.length : orderedCoords.length;
  const numSeatsToUse = Math.min(
    orderedCoords.length,
    Math.max(basePrimaryCount, students.length)
  );
  const availableCoords = orderedCoords.slice(0, numSeatsToUse);
  const unusedCoords = orderedCoords.slice(numSeatsToUse);

  // 핀 고정된 좌석 유지
  const pinnedMap = new Map<string, string>(); // key -> studentId
  const pinnedStudentIds = new Set<string>();
  const availableKeySet = new Set(availableCoords.map(c => coordKey(c.x, c.y)));

  for (const [key, item] of Object.entries(currentSeats)) {
    if (
      item?.pinned &&
      item.studentId &&
      availableKeySet.has(key) &&
      studentsById.has(item.studentId) &&
      !pinnedStudentIds.has(item.studentId)
    ) {
      pinnedMap.set(key, item.studentId);
      pinnedStudentIds.add(item.studentId);
    }
  }

  const swappableCoords = availableCoords.filter(
    c => !pinnedMap.has(coordKey(c.x, c.y))
  );
  const unpinnedStudents = students.filter(s => !pinnedStudentIds.has(s.id));
  const placedUnpinnedStudents = unpinnedStudents.slice(0, swappableCoords.length);
  const unassignedCount = Math.max(0, unpinnedStudents.length - swappableCoords.length);

  // 이웃 인덱스 사전 계산 (20,000회 루프 고속화)
  const N = availableCoords.length;
  const keyToIndex = new Map<string, number>();
  availableCoords.forEach((c, idx) => keyToIndex.set(coordKey(c.x, c.y), idx));

  const gradeNeighbors: number[][] = Array.from({ length: N }, () => []);
  const orthoNeighbors: number[][] = Array.from({ length: N }, () => []);

  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      if (areCoordsNeighbors(availableCoords[i], availableCoords[j], rules.adjacencyMode)) {
        gradeNeighbors[i].push(j);
        gradeNeighbors[j].push(i);
      }
      if (areCoordsNeighbors(availableCoords[i], availableCoords[j], "orthogonal")) {
        orthoNeighbors[i].push(j);
        orthoNeighbors[j].push(i);
      }
    }
  }

  const targetGradeSet = new Set(rules.targetGrades.map(normalizeGradeKey).filter(Boolean));
  const separatedPairSet = new Set(
    rules.separatedPairs.flatMap(([a, b]) => [`${a}::${b}`, `${b}::${a}`])
  );

  const studentGradeMap = new Map<string, string>();
  for (const s of students) {
    const g = normalizeGradeKey(s.grade);
    studentGradeMap.set(s.id, g);
  }

  const countFastConflicts = (pool: (string | null)[]): number => {
    let conflicts = 0;
    for (let i = 0; i < N; i++) {
      const sA = pool[i];
      if (!sA) continue;

      if (rules.avoidPreviousSeat && previousCoordMap.size > 0) {
        const prevKey = previousCoordMap.get(sA);
        const currKey = coordKey(availableCoords[i].x, availableCoords[i].y);
        if (prevKey === currKey) conflicts += 1;
      }

      if (rules.separateSameGrade) {
        const gA = studentGradeMap.get(sA) ?? "";
        if (gA && (targetGradeSet.size === 0 || targetGradeSet.has(gA))) {
          for (const nIdx of gradeNeighbors[i]) {
            if (nIdx > i) {
              const sB = pool[nIdx];
              if (sB && studentGradeMap.get(sB) === gA) {
                conflicts += 1;
              }
            }
          }
        }
      }

      if (separatedPairSet.size > 0) {
        for (const nIdx of orthoNeighbors[i]) {
          if (nIdx > i) {
            const sB = pool[nIdx];
            if (sB && separatedPairSet.has(`${sA}::${sB}`)) {
              conflicts += 2;
            }
          }
        }
      }
    }
    return conflicts;
  };

  const swappableIndices = swappableCoords.map(
    c => keyToIndex.get(coordKey(c.x, c.y))!
  );
  const M = swappableIndices.length;

  let bestPool: (string | null)[] | null = null;
  let bestConflicts = Number.POSITIVE_INFINITY;

  // 최대 3번 재시작 x 20,000회 이터레이션 (cosmath_random_seat 알고리즘 동일 방식)
  const MAX_RESTARTS = 3;
  const MAX_ITERATIONS = 20000;

  for (let restart = 0; restart < MAX_RESTARTS; restart++) {
    const pool: (string | null)[] = Array(N).fill(null);
    // 핀 고정 좌석 배치
    for (const [key, sId] of pinnedMap.entries()) {
      const idx = keyToIndex.get(key);
      if (idx !== undefined) pool[idx] = sId;
    }

    // 나머지 학생 + 빈 좌석(null = 'X') 패딩 후 무작위 셔플
    const unpinnedPool: (string | null)[] = placedUnpinnedStudents.map(s => s.id);
    while (unpinnedPool.length < M) {
      unpinnedPool.push(null);
    }
    for (let i = unpinnedPool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [unpinnedPool[i], unpinnedPool[j]] = [unpinnedPool[j], unpinnedPool[i]];
    }
    for (let i = 0; i < M; i++) {
      pool[swappableIndices[i]] = unpinnedPool[i];
    }

    let currentConflicts = countFastConflicts(pool);

    if (M > 1) {
      for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
        if (currentConflicts === 0) break;

        const r1 = Math.floor(Math.random() * M);
        const r2 = Math.floor(Math.random() * M);
        if (r1 === r2) continue;

        const idx1 = swappableIndices[r1];
        const idx2 = swappableIndices[r2];

        const val1 = pool[idx1];
        const val2 = pool[idx2];
        if (val1 === val2) continue;

        pool[idx1] = val2;
        pool[idx2] = val1;

        const newConflicts = countFastConflicts(pool);

        if (newConflicts < currentConflicts) {
          currentConflicts = newConflicts;
        } else if (newConflicts === currentConflicts && Math.random() < 0.1) {
          // 10% 확률로 중립 이동을 허용해 지역 최적점(plateau) 탈출 (cosmath_random_seat 방식)
        } else {
          pool[idx1] = val1;
          pool[idx2] = val2;
        }
      }
    }

    if (currentConflicts < bestConflicts) {
      bestConflicts = currentConflicts;
      bestPool = [...pool];
      if (bestConflicts === 0) break;
    }
  }

  const finalAssignments: Record<string, SeatAssignment> = {};
  if (bestPool) {
    availableCoords.forEach((c, idx) => {
      const key = coordKey(c.x, c.y);
      finalAssignments[key] = {
        studentId: bestPool![idx],
        pinned: pinnedMap.has(key),
      };
    });
  }
  unusedCoords.forEach(c => {
    const key = coordKey(c.x, c.y);
    finalAssignments[key] = {
      studentId: null,
      pinned: false,
    };
  });

  const finalEval = evaluateSeatingViolations({
    assignments: finalAssignments,
    seatCoords,
    studentsById,
    rules,
    previousCoordMap,
  });

  return {
    assignments: finalAssignments,
    conflictCount: finalEval.conflictCount,
    violationsByCoord: finalEval.violationsByCoord,
    unassignedCount,
  };
}

export type AdjacencyMode = "orthogonal" | "horizontal";

export interface GridSeatCoord {
  /** 0-based grid column */
  x: number;
  /** 0-based grid row */
  y: number;
  /** 'primary' (기본 좌석) | 'secondary' (인원 초과 시 사용하는 보조 좌석, 기본 배치의 하단 3석 등) */
  tier?: "primary" | "secondary";
}

export interface SeatingRules {
  separateSameGrade: boolean;
  /** 비어 있으면 모든 학년에 대해 동일 학년 인접 금지, 값이 있으면 해당 학년(예: ["중1"])만 인접 금지 */
  targetGrades: string[];
  /** 'orthogonal': 상하좌우 인접 금지(대각선 허용, cosmath_random_seat 기본 규칙), 'horizontal': 좌우만 금지 */
  adjacencyMode: AdjacencyMode;
  avoidPreviousSeat: boolean;
  /** 서로 떨어뜨려 앉힐 학생 ID 쌍 목록 */
  separatedPairs: [string, string][];
}

export interface SeatAssignment {
  /** null 이면 책상은 있지만 학생이 배정되지 않은 빈 좌석('X' 표시) */
  studentId: string | null;
  pinned?: boolean;
}

export interface SeatingHistoryEntry {
  id: string;
  savedAt: string;
  label: string;
  gridCols: number;
  gridRows: number;
  seatCoords: GridSeatCoord[];
  /** coordKey ("x,y") -> studentId | null */
  seats: Record<string, string | null>;
  /** studentId -> "이름 (학년)" 스냅샷 */
  studentNames: Record<string, string>;
}

export interface SeatingWorkspaceRecord {
  /** scope key (예: 단일 반 ID, 합반 키, 또는 'default') */
  id: string;
  /** 격자 가로 칸 수 (기본 6) */
  gridCols: number;
  /** 격자 세로 칸 수 (기본 10) */
  gridRows: number;
  /** 격자 내 실제 책상이 놓인 좌표 목록 (이웃한 칸에 놓으면 붙은 자리, 빈 칸을 사이에 두면 띄운 자리) */
  seatCoords: GridSeatCoord[];
  rules: SeatingRules;
  /** coordKey ("x,y") -> SeatAssignment */
  currentSeats: Record<string, SeatAssignment>;
  history: SeatingHistoryEntry[];
  updatedAt: string;
}

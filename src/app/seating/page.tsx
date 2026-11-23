"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  AlertCircle,
  ArrowLeftRight,
  BookmarkCheck,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  Dices,
  History,
  LayoutGrid,
  Maximize2,
  Menu,
  Minimize2,
  PencilRuler,
  Pin,
  Plus,
  RefreshCw,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  UserRoundCog,
  Users,
  X,
} from "lucide-react";
import logo from "../../../public/logo.png";
import LandingMenu from "../../components/LandingMenu";
import { loadStudents } from "../../lib/report-storage";
import { useRosterRefresh } from "../../lib/use-roster-refresh";
import {
  COSMATH_DEFAULT_SEAT_COORDS,
  coordKey,
  createDefaultSeatingRecord,
  evaluateSeatingViolations,
  generateOptimalSeating,
  getGradePalette,
  getPreviousStudentCoordMap,
  loadSeatingWorkspace,
  normalizeGradeKey,
  saveSeatingWorkspace,
  type SeatingStudentInfo,
} from "../../lib/seating-storage";
import type { StudentGroup } from "../../types/student";
import type {
  AdjacencyMode,
  GridSeatCoord,
  SeatAssignment,
  SeatingHistoryEntry,
  SeatingWorkspaceRecord,
} from "../../types/seating";
import styles from "./seating.module.css";

export default function SeatingPage() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [groups, setGroups] = useState<StudentGroup[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loadingRoster, setLoadingRoster] = useState(true);
  const [rosterError, setRosterError] = useState("");

  // Seating workspace state (persisted in IndexedDB)
  const [record, setRecord] = useState<SeatingWorkspaceRecord>(() =>
    createDefaultSeatingRecord("default")
  );
  const [editLayoutMode, setEditLayoutMode] = useState(false);
  const [largeViewOpen, setLargeViewOpen] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);
  const [statusNotice, setStatusNotice] = useState<{
    tone: "ok" | "warn" | "info";
    text: string;
  } | null>(null);

  // Click-to-swap between two seats on the grid
  const [selectedCoordForSwap, setSelectedCoordForSwap] = useState<string | null>(null);

  // Separated pair form state
  const [pairStudentA, setPairStudentA] = useState("");
  const [pairStudentB, setPairStudentB] = useState("");

  function formatHistoryDateLabel(
    entry: SeatingHistoryEntry,
    allEntries: SeatingHistoryEntry[]
  ): string {
    const parseDate = (iso: string) => {
      const d = new Date(iso);
      return Number.isNaN(d.getTime()) ? new Date() : d;
    };
    const d = parseDate(entry.savedAt);
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    const day = d.getDate();
    const weekday = ["일", "월", "화", "수", "목", "금", "토"][d.getDay()];
    const dateKey = `${year}-${month}-${day}`;
    const baseText = `${year}. ${month}. ${day}. (${weekday})`;

    const sameDay = allEntries
      .filter(item => {
        const id = parseDate(item.savedAt);
        return `${id.getFullYear()}-${id.getMonth() + 1}-${id.getDate()}` === dateKey;
      })
      .sort((a, b) => a.savedAt.localeCompare(b.savedAt));

    if (sameDay.length <= 1) return baseText;
    const seq = sameDay.findIndex(item => item.id === entry.id) + 1;
    return `${baseText} (${seq})`;
  }

  useEffect(() => {
    if (!largeViewOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLargeViewOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [largeViewOpen]);

  const refreshSequence = useRef(0);
  const refreshRoster = useCallback(async () => {
    const seq = ++refreshSequence.current;
    setLoadingRoster(true);
    setRosterError("");
    try {
      const rows = await loadStudents();
      if (seq !== refreshSequence.current) return;
      setGroups(rows);
      const allIds = new Set(rows.flatMap(g => g.students.map(s => s.id)));
      setSelectedIds(prev => {
        const valid = prev.filter(id => allIds.has(id));
        if (valid.length > 0) return valid;
        return rows[0]?.students.map(s => s.id) ?? [];
      });
      setExpandedGroups(prev => {
        const valid = prev.filter(id => rows.some(g => g.id === id));
        return valid.length > 0 ? valid : rows[0] ? [rows[0].id] : [];
      });
    } catch (e) {
      if (seq === refreshSequence.current) {
        setRosterError(e instanceof Error ? e.message : "학생 목록을 불러오지 못했습니다.");
      }
    } finally {
      if (seq === refreshSequence.current) setLoadingRoster(false);
    }
  }, []);

  useRosterRefresh(refreshRoster, false, false);
  useEffect(() => {
    void refreshRoster();
  }, [refreshRoster]);

  // All students mapped by ID
  const allStudentsMap = useMemo(() => {
    const map = new Map<string, SeatingStudentInfo>();
    for (const group of groups) {
      for (const student of group.students) {
        map.set(student.id, {
          id: student.id,
          name: student.name,
          grade: student.grade,
          groupId: group.id,
          groupName: group.group,
        });
      }
    }
    return map;
  }, [groups]);

  // Currently selected students from left sidebar
  const selectedStudents = useMemo(() => {
    const list: SeatingStudentInfo[] = [];
    for (const id of selectedIds) {
      const info = allStudentsMap.get(id);
      if (info) list.push(info);
    }
    return list;
  }, [selectedIds, allStudentsMap]);

  const selectedStudentsMap = useMemo(
    () => new Map(selectedStudents.map(s => [s.id, s])),
    [selectedStudents]
  );

  // Distinct grades among selected students
  const selectedGrades = useMemo(() => {
    const counts = new Map<string, { label: string; count: number }>();
    for (const s of selectedStudents) {
      const key = normalizeGradeKey(s.grade);
      if (!key) continue;
      const existing = counts.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        counts.set(key, { label: key, count: 1 });
      }
    }
    if (counts.size === 0) {
      return ["중1", "중2", "중3"].map(g => ({
        key: g,
        label: g,
        count: 0,
        palette: getGradePalette(g),
      }));
    }
    return Array.from(counts.entries()).map(([key, val]) => ({
      key,
      label: val.label,
      count: val.count,
      palette: getGradePalette(val.label),
    }));
  }, [selectedStudents]);

  // Derive IndexedDB scope key from selected classes
  const scopeKey = useMemo(() => {
    const groupIds = Array.from(new Set(selectedStudents.map(s => s.groupId))).sort();
    return groupIds.length > 0 ? `group:${groupIds.join("+")}` : "default";
  }, [selectedStudents]);

  const scopeTitle = useMemo(() => {
    const groupNames = Array.from(new Set(selectedStudents.map(s => s.groupName)));
    if (groupNames.length === 0) return "반·학생 미선택";
    if (groupNames.length <= 2) return groupNames.join(" · ");
    return `${groupNames[0]} 외 ${groupNames.length - 1}개 반`;
  }, [selectedStudents]);

  useEffect(() => {
    let cancelled = false;
    void loadSeatingWorkspace(scopeKey).then(loaded => {
      if (cancelled) return;
      setRecord(loaded);
      setSelectedCoordForSwap(null);
      setStatusNotice(null);
    });
    return () => {
      cancelled = true;
    };
  }, [scopeKey]);

  const persistRecord = useCallback(async (next: SeatingWorkspaceRecord) => {
    setRecord(next);
    try {
      await saveSeatingWorkspace(next);
    } catch {
      // Ignore transient IndexedDB errors
    }
  }, []);

  // Fast lookup map for active seat coordinates ("x,y" -> GridSeatCoord)
  const seatCoordMap = useMemo(() => {
    const map = new Map<string, GridSeatCoord>();
    for (const c of record.seatCoords) {
      if (c.x >= 0 && c.x < record.gridCols && c.y >= 0 && c.y < record.gridRows) {
        map.set(coordKey(c.x, c.y), c);
      }
    }
    return map;
  }, [record.seatCoords, record.gridCols, record.gridRows]);

  // Cleaned current seat assignments
  const activeSeatAssignments = useMemo(() => {
    const cleaned: Record<string, SeatAssignment> = {};
    const seenStudents = new Set<string>();
    for (const c of record.seatCoords) {
      const key = coordKey(c.x, c.y);
      const item = record.currentSeats[key];
      if (
        item?.studentId &&
        selectedStudentsMap.has(item.studentId) &&
        !seenStudents.has(item.studentId)
      ) {
        cleaned[key] = { studentId: item.studentId, pinned: item.pinned };
        seenStudents.add(item.studentId);
      } else {
        cleaned[key] = { studentId: null, pinned: false };
      }
    }
    return cleaned;
  }, [record.seatCoords, record.currentSeats, selectedStudentsMap]);

  const assignedStudentCount = useMemo(
    () =>
      Object.values(activeSeatAssignments).filter(item => item.studentId !== null).length,
    [activeSeatAssignments]
  );

  const previousCoordMap = useMemo(
    () => getPreviousStudentCoordMap(record.history),
    [record.history]
  );

  const evaluation = useMemo(
    () =>
      evaluateSeatingViolations({
        assignments: activeSeatAssignments,
        seatCoords: record.seatCoords,
        studentsById: selectedStudentsMap,
        rules: record.rules,
        previousCoordMap,
      }),
    [
      activeSeatAssignments,
      record.seatCoords,
      selectedStudentsMap,
      record.rules,
      previousCoordMap,
    ]
  );

  // Run random seating algorithm
  function handleAssign() {
    if (selectedStudents.length === 0) {
      setStatusNotice({
        tone: "warn",
        text: "왼쪽 목록에서 자리 배치할 반이나 학생을 먼저 선택해 주세요.",
      });
      return;
    }
    if (record.seatCoords.length === 0) {
      setStatusNotice({
        tone: "warn",
        text: "배치할 좌석이 없습니다. [자리 구조 편집]에서 좌석을 추가해 주세요.",
      });
      return;
    }

    setIsAssigning(true);
    setSelectedCoordForSwap(null);

    window.setTimeout(() => {
      const result = generateOptimalSeating({
        students: selectedStudents,
        seatCoords: record.seatCoords,
        currentSeats: activeSeatAssignments,
        rules: record.rules,
        history: record.history,
      });

      void persistRecord({
        ...record,
        currentSeats: result.assignments,
      });

      if (result.conflictCount === 0) {
        setStatusNotice({
          tone: "ok",
          text:
            result.unassignedCount > 0
              ? `모든 조건에 맞춰 배치를 완료했습니다. (좌석 초과 미배정 ${result.unassignedCount}명)`
              : `선택한 학생 ${selectedStudents.length}명을 설정된 조건에 맞춰 완벽하게 배치했습니다.`,
        });
      } else {
        setStatusNotice({
          tone: "warn",
          text: `인원 비율상 완전히 분리하기 어려운 좌석이 ${result.violationsByCoord.size}곳 있어 최적의 배치로 완성했습니다.`,
        });
      }
      setIsAssigning(false);
    }, 90);
  }

  // Click seat in normal mode -> swap two seats
  function handleSeatClick(key: string) {
    if (editLayoutMode) return;

    if (selectedCoordForSwap === null) {
      setSelectedCoordForSwap(key);
      return;
    }
    if (selectedCoordForSwap === key) {
      setSelectedCoordForSwap(null);
      return;
    }

    const nextSeats = { ...activeSeatAssignments };
    const fromItem = nextSeats[selectedCoordForSwap] ?? { studentId: null, pinned: false };
    const toItem = nextSeats[key] ?? { studentId: null, pinned: false };

    nextSeats[selectedCoordForSwap] = {
      studentId: toItem.studentId,
      pinned: fromItem.pinned && Boolean(toItem.studentId),
    };
    nextSeats[key] = {
      studentId: fromItem.studentId,
      pinned: toItem.pinned && Boolean(fromItem.studentId),
    };

    void persistRecord({
      ...record,
      currentSeats: nextSeats,
    });
    setSelectedCoordForSwap(null);
  }

  function handleTogglePin(key: string, e: React.MouseEvent) {
    e.stopPropagation();
    const item = activeSeatAssignments[key];
    if (!item?.studentId) return;
    const nextSeats = {
      ...activeSeatAssignments,
      [key]: { ...item, pinned: !item.pinned },
    };
    void persistRecord({
      ...record,
      currentSeats: nextSeats,
    });
  }

  // Edit layout mode: click any (x, y) cell on the grid to add a seat (붙이기) or remove a seat (띄우기)
  function handleToggleGridCell(x: number, y: number) {
    const key = coordKey(x, y);
    const exists = seatCoordMap.has(key);
    let nextCoords: GridSeatCoord[];
    const nextSeats = { ...record.currentSeats };

    if (exists) {
      nextCoords = record.seatCoords.filter(c => !(c.x === x && c.y === y));
      delete nextSeats[key];
    } else {
      nextCoords = [...record.seatCoords, { x, y, tier: "primary" }];
    }

    void persistRecord({
      ...record,
      seatCoords: nextCoords,
      currentSeats: nextSeats,
    });
  }

  function handleToggleSeatTier(x: number, y: number, e: React.MouseEvent) {
    e.stopPropagation();
    const nextCoords = record.seatCoords.map(c =>
      c.x === x && c.y === y
        ? { ...c, tier: c.tier === "secondary" ? ("primary" as const) : ("secondary" as const) }
        : c
    );
    void persistRecord({
      ...record,
      seatCoords: nextCoords,
    });
  }

  function handleResetDefaultLayout() {
    void persistRecord({
      ...record,
      gridCols: 6,
      gridRows: 10,
      seatCoords: COSMATH_DEFAULT_SEAT_COORDS.map(c => ({ ...c })),
      currentSeats: {},
    });
    setStatusNotice({
      tone: "info",
      text: "기본 좌석 구조(기본 31석 + 보조 3석)로 복원했습니다.",
    });
  }

  function handleFillAllGridCells() {
    const all: GridSeatCoord[] = [];
    for (let y = 0; y < record.gridRows; y++) {
      for (let x = 0; x < record.gridCols; x++) {
        all.push({ x, y, tier: "primary" });
      }
    }
    void persistRecord({
      ...record,
      seatCoords: all,
    });
  }

  function handleClearAllGridCells() {
    void persistRecord({
      ...record,
      seatCoords: [],
      currentSeats: {},
    });
  }

  // Save current seating to IndexedDB history
  function handleSaveToHistory(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (assignedStudentCount === 0) {
      setStatusNotice({
        tone: "warn",
        text: "먼저 학생들을 좌석에 배치한 뒤 [기억하기]를 눌러주세요.",
      });
      return;
    }

    const seatsSnapshot: Record<string, string | null> = {};
    const namesSnapshot: Record<string, string> = {};
    for (const [key, item] of Object.entries(activeSeatAssignments)) {
      seatsSnapshot[key] = item.studentId;
      if (item.studentId) {
        const st = selectedStudentsMap.get(item.studentId);
        if (st) namesSnapshot[item.studentId] = `${st.name} (${st.grade})`;
      }
    }

    const now = new Date();
    const weekday = ["일", "월", "화", "수", "목", "금", "토"][now.getDay()];
    const defaultDateLabel = `${now.getFullYear()}. ${now.getMonth() + 1}. ${now.getDate()}. (${weekday})`;

    const entry: SeatingHistoryEntry = {
      id: crypto.randomUUID(),
      savedAt: now.toISOString(),
      label: defaultDateLabel,
      gridCols: record.gridCols,
      gridRows: record.gridRows,
      seatCoords: record.seatCoords.map(c => ({ ...c })),
      seats: seatsSnapshot,
      studentNames: namesSnapshot,
    };

    void persistRecord({
      ...record,
      history: [entry, ...record.history].slice(0, 15),
    });
    setStatusNotice({
      tone: "ok",
      text: "현재 자리 배치를 브라우저(IndexedDB)에 기억했습니다.",
    });
  }

  function handleRestoreHistory(entry: SeatingHistoryEntry) {
    const restoredSeats: Record<string, SeatAssignment> = {};
    const nextSelectedIds = new Set(selectedIds);
    for (const [key, studentId] of Object.entries(entry.seats)) {
      if (studentId && allStudentsMap.has(studentId)) {
        restoredSeats[key] = { studentId, pinned: false };
        nextSelectedIds.add(studentId);
      } else {
        restoredSeats[key] = { studentId: null, pinned: false };
      }
    }
    setSelectedIds(Array.from(nextSelectedIds));
    void persistRecord({
      ...record,
      gridCols: entry.gridCols || record.gridCols,
      gridRows: entry.gridRows || record.gridRows,
      seatCoords:
        Array.isArray(entry.seatCoords) && entry.seatCoords.length > 0
          ? entry.seatCoords
          : record.seatCoords,
      currentSeats: restoredSeats,
    });
    setStatusNotice({
      tone: "info",
      text: `[${formatHistoryDateLabel(entry, record.history)}] 자리 배치를 불러왔습니다.`,
    });
  }

  function handleDeleteHistory(id: string) {
    void persistRecord({
      ...record,
      history: record.history.filter(h => h.id !== id),
    });
  }

  function toggleTargetGrade(gradeKey: string) {
    const current = record.rules.targetGrades;
    const next = current.includes(gradeKey)
      ? current.filter(g => g !== gradeKey)
      : [...current, gradeKey];
    void persistRecord({
      ...record,
      rules: { ...record.rules, targetGrades: next },
    });
  }

  function handleAddSeparatedPair() {
    if (!pairStudentA || !pairStudentB || pairStudentA === pairStudentB) return;
    const exists = record.rules.separatedPairs.some(
      ([a, b]) =>
        (a === pairStudentA && b === pairStudentB) ||
        (a === pairStudentB && b === pairStudentA)
    );
    if (exists) return;
    void persistRecord({
      ...record,
      rules: {
        ...record.rules,
        separatedPairs: [...record.rules.separatedPairs, [pairStudentA, pairStudentB]],
      },
    });
    setPairStudentA("");
    setPairStudentB("");
  }

  function handleRemoveSeparatedPair(index: number) {
    void persistRecord({
      ...record,
      rules: {
        ...record.rules,
        separatedPairs: record.rules.separatedPairs.filter((_, idx) => idx !== index),
      },
    });
  }

  const validSeatCoords = useMemo(
    () =>
      record.seatCoords.filter(
        c => c.x >= 0 && c.x < record.gridCols && c.y >= 0 && c.y < record.gridRows
      ),
    [record.seatCoords, record.gridCols, record.gridRows]
  );

  // Reusable Seat Grid Renderer (used both in normal studio view & full-screen large view)
  function renderSeatGrid(allowEditLayout: boolean) {
    return (
      <div
        className={styles.seatGrid}
        style={{
          gridTemplateColumns: `repeat(${record.gridCols}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${record.gridRows}, minmax(0, 1fr))`,
        }}
      >
        {allowEditLayout && editLayoutMode
          ? Array.from({ length: record.gridRows }, (_, y) =>
              Array.from({ length: record.gridCols }, (_, x) => {
                const key = coordKey(x, y);
                const coord = seatCoordMap.get(key);
                if (coord) {
                  return (
                    <div
                      key={key}
                      role="button"
                      tabIndex={0}
                      className={styles.editCellActive}
                      data-tier={coord.tier ?? "primary"}
                      style={{ gridColumn: x + 1, gridRow: y + 1 }}
                      onClick={() => handleToggleGridCell(x, y)}
                      title="클릭하면 이 좌석을 비워 통로(띄움)로 만듭니다"
                    >
                      <strong style={{ fontSize: 11 }}>
                        {coord.tier === "secondary" ? "보조석" : "좌석"}
                      </strong>
                      <button
                        type="button"
                        className={styles.tierToggleBtn}
                        onClick={e => handleToggleSeatTier(x, y, e)}
                      >
                        {coord.tier === "secondary" ? "기본석 전환" : "보조석 전환"}
                      </button>
                    </div>
                  );
                }
                return (
                  <button
                    key={key}
                    type="button"
                    className={styles.editCellEmpty}
                    style={{ gridColumn: x + 1, gridRow: y + 1 }}
                    onClick={() => handleToggleGridCell(x, y)}
                    title="클릭하면 여기에 좌석을 배치합니다"
                  >
                    <Plus size={12} />
                    <span>자리 추가</span>
                  </button>
                );
              })
            )
          : validSeatCoords.map((coord, idx) => {
              const key = coordKey(coord.x, coord.y);
              const assignment = activeSeatAssignments[key];
              const student = assignment?.studentId
                ? selectedStudentsMap.get(assignment.studentId)
                : undefined;
              const palette = student ? getGradePalette(student.grade) : null;
              const reasons = evaluation.violationsByCoord.get(key) ?? [];

              return (
                <div
                  key={key}
                  role="button"
                  tabIndex={0}
                  className={styles.seatBox}
                  data-empty={!student}
                  data-selected-swap={selectedCoordForSwap === key}
                  data-conflict={reasons.length > 0}
                  title={
                    reasons.length > 0
                      ? `조건 겹침: ${reasons.join(", ")}`
                      : student
                        ? `${student.name} (${student.grade}) · 클릭하여 자리 교환`
                        : `좌석 #${idx + 1} (빈 좌석) · 클릭하여 학생 이동`
                  }
                  style={{
                    gridColumn: coord.x + 1,
                    gridRow: coord.y + 1,
                    ...(palette
                      ? {
                          backgroundColor: palette.bg,
                          borderColor: palette.border,
                          color: palette.text,
                        }
                      : {}),
                  }}
                  onClick={() => handleSeatClick(key)}
                  onKeyDown={e => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleSeatClick(key);
                    }
                  }}
                >
                  {student && (
                    <div
                      className={styles.seatCornerActions}
                      data-pinned={Boolean(assignment?.pinned)}
                    >
                      <button
                        type="button"
                        className={styles.pinBtn}
                        data-pinned={Boolean(assignment?.pinned)}
                        title={
                          assignment?.pinned
                            ? "좌석 고정 해제"
                            : "이 좌석에 고정 (랜덤 배치 시 유지)"
                        }
                        onClick={e => handleTogglePin(key, e)}
                      >
                        <Pin size={10} />
                      </button>
                    </div>
                  )}

                  {student && palette ? (
                    <>
                      <span className={styles.seatGradeText}>
                        {normalizeGradeKey(student.grade) || student.grade}
                      </span>
                      <span className={styles.seatNameText}>{student.name}</span>
                    </>
                  ) : (
                    <span className={styles.emptySeatLabel}>-</span>
                  )}
                </div>
              );
            })}
      </div>
    );
  }

  return (
    <main className={styles.page} data-sidebar-open={sidebarOpen}>
      <header>
        <div className={styles.identity}>
          {!sidebarOpen && (
            <button
              className={styles.sidebarToggle}
              onClick={() => setSidebarOpen(true)}
              aria-label="반·학생 목록 열기"
              aria-expanded={sidebarOpen}
              aria-controls="seating-student-roster"
            >
              <Menu size={19} />
            </button>
          )}
          <Link href="/" aria-label="홈으로 이동">
            <Image src={logo} alt="UNIDESK" priority />
          </Link>
          <span>
            <LayoutGrid size={16} /> 스마트 자리 배치 스튜디오
          </span>
        </div>
        <div className={styles.headerActions}>
          <Link href="/students" className={styles.navButton}>
            <UserRoundCog size={15} /> 학생 · 수업 관리
          </Link>
          <LandingMenu />
        </div>
      </header>

      <div className={styles.workspace}>
        {/* 좌측 사이드바: 반 · 재원생 선택 목록 */}
        <nav
          id="seating-student-roster"
          inert={!sidebarOpen}
          className={styles.studentNav}
          aria-label="반별 학생 목록"
        >
          <div className={styles.navHeader}>
            <Users size={19} />
            <h2>반 · 재원생 목록</h2>
            <div className={styles.navActions}>
              <button
                onClick={() => void refreshRoster()}
                disabled={loadingRoster}
                aria-label="학생 목록 새로고침"
                title="학생 목록 새로고침"
              >
                <RefreshCw size={14} className={loadingRoster ? "animate-spin" : ""} />
              </button>
              <button
                onClick={() => setSidebarOpen(false)}
                aria-label="학생 목록 닫기"
                aria-expanded={sidebarOpen}
                aria-controls="seating-student-roster"
              >
                <ChevronLeft size={17} />
              </button>
            </div>
          </div>

          <div className={styles.navList}>
            {rosterError && (
              <p role="alert" style={{ color: "#be123c", fontSize: 12, padding: 8 }}>
                {rosterError}
              </p>
            )}
            {loadingRoster && groups.length === 0 ? (
              <p style={{ color: "#94a3b8", fontSize: 12, textAlign: "center", padding: 24 }}>
                학생 목록을 불러오는 중…
              </p>
            ) : groups.length === 0 ? (
              <p style={{ color: "#94a3b8", fontSize: 12, textAlign: "center", padding: 24 }}>
                등록된 반과 학생이 없습니다.
              </p>
            ) : (
              groups.map(group => {
                const isExpanded = expandedGroups.includes(group.id);
                const groupStudentIds = group.students.map(s => s.id);
                const allChecked =
                  groupStudentIds.length > 0 &&
                  groupStudentIds.every(id => selectedIds.includes(id));
                const someChecked =
                  !allChecked && groupStudentIds.some(id => selectedIds.includes(id));

                return (
                  <div key={group.id} className={styles.navGroup}>
                    <div className={styles.groupRow}>
                      <input
                        type="checkbox"
                        className={styles.checkbox}
                        aria-label={`${group.group} 학생 전체 선택`}
                        checked={allChecked}
                        disabled={groupStudentIds.length === 0}
                        ref={input => {
                          if (input) input.indeterminate = someChecked;
                        }}
                        onChange={e => {
                          const checked = e.target.checked;
                          setSelectedIds(curr =>
                            checked
                              ? Array.from(new Set([...curr, ...groupStudentIds]))
                              : curr.filter(id => !groupStudentIds.includes(id))
                          );
                          if (checked && !isExpanded) {
                            setExpandedGroups(curr => [...curr, group.id]);
                          }
                        }}
                      />
                      <button
                        type="button"
                        className={styles.groupToggle}
                        aria-expanded={isExpanded}
                        onClick={() =>
                          setExpandedGroups(curr =>
                            curr.includes(group.id)
                              ? curr.filter(id => id !== group.id)
                              : [...curr, group.id]
                          )
                        }
                      >
                        <span>{group.group}</span>
                        <small>({group.students.length})</small>
                        <ChevronDown size={13} />
                      </button>
                    </div>

                    {isExpanded &&
                      (group.students.length === 0 ? (
                        <p style={{ padding: "8px 11px", fontSize: 11, color: "#94a3b8", margin: 0 }}>
                          등록된 학생 없음
                        </p>
                      ) : (
                        group.students.map(student => {
                          const isSelected = selectedIds.includes(student.id);
                          const palette = getGradePalette(student.grade);
                          return (
                            <div
                              key={student.id}
                              className={styles.studentRow}
                              data-selected={isSelected}
                            >
                              <input
                                type="checkbox"
                                className={styles.checkbox}
                                aria-label={`${student.name} 선택`}
                                checked={isSelected}
                                onChange={e => {
                                  const checked = e.target.checked;
                                  setSelectedIds(curr =>
                                    checked
                                      ? Array.from(new Set([...curr, student.id]))
                                      : curr.filter(id => id !== student.id)
                                  );
                                }}
                              />
                              <button
                                type="button"
                                className={styles.studentButton}
                                onClick={() =>
                                  setSelectedIds(curr =>
                                    curr.includes(student.id)
                                      ? curr.filter(id => id !== student.id)
                                      : [...curr, student.id]
                                  )
                                }
                              >
                                <strong>{student.name}</strong>
                                <span
                                  className={styles.gradeBadge}
                                  style={{
                                    backgroundColor: palette.bg,
                                    color: palette.text,
                                    border: `1px solid ${palette.border}`,
                                  }}
                                >
                                  {normalizeGradeKey(student.grade) || student.grade}
                                </span>
                              </button>
                            </div>
                          );
                        })
                      ))}
                  </div>
                );
              })
            )}
          </div>

          <div className={styles.navSelection}>
            <span>
              선택한 학생 <strong>{selectedStudents.length}</strong>명
            </span>
            {selectedStudents.length > 0 && (
              <button
                type="button"
                className={styles.clearBtn}
                onClick={() => setSelectedIds([])}
              >
                선택 해제
              </button>
            )}
          </div>
        </nav>

        {/* 우측 메인 워크스페이스 (스크롤 없이 한 화면에 모든 좌석과 기능이 들어감) */}
        <div className={styles.mainArea}>
          <div className={styles.boardLayout}>
            {/* 좌측: 좌석 배치 캔버스 카드 */}
            <section className={styles.canvasCard} aria-label="좌석 배치 캔버스">
              <div className={styles.canvasTopHeader}>
                <div className={styles.titleArea}>
                  <h1>교실 좌석 배치</h1>
                  <span className={styles.scopePill}>
                    {scopeTitle} · 선택 {selectedStudents.length}명 / 좌석 {validSeatCoords.length}석
                  </span>
                  <div className={styles.legendList}>
                    {selectedGrades.map(g => (
                      <span
                        key={g.key}
                        className={styles.gradeBadge}
                        style={{
                          backgroundColor: g.palette.bg,
                          color: g.palette.text,
                          border: `1px solid ${g.palette.border}`,
                        }}
                      >
                        {g.label} ({g.count})
                      </span>
                    ))}
                  </div>
                </div>

                <div className={styles.toolbarBtns}>
                  <button
                    type="button"
                    className={styles.secondaryActionBtn}
                    onClick={() => setLargeViewOpen(true)}
                    title="자리 배치판을 화면 전체로 크게 확대해 봅니다"
                  >
                    <Maximize2 size={14} /> 자리 크게 보기
                  </button>

                  <button
                    type="button"
                    className={styles.secondaryActionBtn}
                    data-active={editLayoutMode}
                    onClick={() => {
                      setEditLayoutMode(v => !v);
                      setSelectedCoordForSwap(null);
                    }}
                  >
                    <PencilRuler size={14} />
                    {editLayoutMode ? "편집 완료" : "자리 구조 편집"}
                  </button>

                  <button
                    type="button"
                    className={styles.secondaryActionBtn}
                    disabled={assignedStudentCount === 0}
                    onClick={() => handleSaveToHistory()}
                  >
                    <BookmarkCheck size={14} /> 현재 자리 기억
                  </button>

                  <button
                    type="button"
                    className={styles.primaryActionBtn}
                    disabled={isAssigning || selectedStudents.length === 0}
                    onClick={handleAssign}
                  >
                    <Dices size={16} className={isAssigning ? "animate-spin" : ""} />
                    {isAssigning ? "배치 중…" : "랜덤 자리 배치"}
                  </button>
                </div>
              </div>

              {statusNotice && (
                <div
                  role="status"
                  className={`${styles.statusBanner} ${
                    statusNotice.tone === "ok"
                      ? styles.statusOk
                      : statusNotice.tone === "warn"
                        ? styles.statusWarn
                        : styles.statusInfo
                  }`}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {statusNotice.tone === "ok" ? (
                      <CheckCircle2 size={14} />
                    ) : (
                      <AlertCircle size={14} />
                    )}
                    {statusNotice.text}
                  </span>
                  <button
                    type="button"
                    onClick={() => setStatusNotice(null)}
                    style={{
                      border: 0,
                      background: "transparent",
                      color: "inherit",
                      cursor: "pointer",
                    }}
                    aria-label="알림 닫기"
                  >
                    <X size={14} />
                  </button>
                </div>
              )}

              {editLayoutMode && (
                <div className={styles.editToolbar}>
                  <div className={styles.editToolbarGroup}>
                    <strong>칸 클릭으로 좌석 추가(붙이기) · 비우기(띄우기)</strong>
                  </div>
                  <div className={styles.editToolbarGroup}>
                    <label>
                      가로{" "}
                      <select
                        value={record.gridCols}
                        onChange={e =>
                          void persistRecord({
                            ...record,
                            gridCols: Number(e.target.value),
                          })
                        }
                      >
                        {[4, 5, 6, 7, 8, 9, 10, 12].map(n => (
                          <option key={n} value={n}>
                            {n}열
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      세로{" "}
                      <select
                        value={record.gridRows}
                        onChange={e =>
                          void persistRecord({
                            ...record,
                            gridRows: Number(e.target.value),
                          })
                        }
                      >
                        {[4, 5, 6, 7, 8, 9, 10, 12, 14].map(n => (
                          <option key={n} value={n}>
                            {n}행
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      className={styles.smallActionBtn}
                      onClick={handleResetDefaultLayout}
                    >
                      <RotateCcw size={11} /> 기본 배치 복원
                    </button>
                    <button
                      type="button"
                      className={styles.smallActionBtn}
                      onClick={handleFillAllGridCells}
                    >
                      전체 채우기
                    </button>
                    <button
                      type="button"
                      className={styles.smallActionBtn}
                      onClick={handleClearAllGridCells}
                    >
                      전체 비우기
                    </button>
                  </div>
                </div>
              )}

              {selectedCoordForSwap !== null && !editLayoutMode && (
                <div className={`${styles.statusBanner} ${styles.statusInfo}`}>
                  <span>
                    <ArrowLeftRight size={13} style={{ display: "inline", marginRight: 5 }} />
                    맞바꿀 다른 좌석(또는 빈 좌석)을 클릭하세요.
                  </span>
                  <button
                    type="button"
                    className={styles.clearBtn}
                    onClick={() => setSelectedCoordForSwap(null)}
                  >
                    취소
                  </button>
                </div>
              )}

              {/* 도트 매트릭스 플로어 위 2D 좌석 그리드 (남은 화면 높이에 100% 자동 맞춤) */}
              <div className={styles.floorCanvas}>{renderSeatGrid(true)}</div>
            </section>

            {/* 우측 인스펙터 사이드 패널 (플랫 & 미니멀 디자인) */}
            <aside className={styles.sidePanel} aria-label="배치 조건 및 기록">
              {/* 1. 스마트 배치 조건 카드 */}
              <div className={styles.panelCard}>
                <div className={styles.panelHeader}>
                  <h3>배치 조건</h3>
                </div>

                <div className={styles.ruleList}>
                  {/* 조건 1: 동일 학년 인접 방지 */}
                  <div className={styles.ruleSection}>
                    <div
                      className={styles.ruleRow}
                      onClick={() =>
                        void persistRecord({
                          ...record,
                          rules: {
                            ...record.rules,
                            separateSameGrade: !record.rules.separateSameGrade,
                          },
                        })
                      }
                    >
                      <span className={styles.ruleLabelText}>동일 학년 붙어 앉기 방지</span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={record.rules.separateSameGrade}
                        aria-label="동일 학년 붙어 앉기 방지"
                        className={styles.switchBtn}
                        onClick={e => {
                          e.stopPropagation();
                          void persistRecord({
                            ...record,
                            rules: {
                              ...record.rules,
                              separateSameGrade: !record.rules.separateSameGrade,
                            },
                          });
                        }}
                      >
                        <span className={styles.switchThumb} />
                      </button>
                    </div>

                    {record.rules.separateSameGrade && (
                      <>
                        <div className={styles.segmentedRow}>
                          <span className={styles.segmentedLabel}>인접 방향</span>
                          <div className={styles.segmentedControl} role="group" aria-label="인접 방향">
                            <button
                              type="button"
                              className={styles.segmentedBtn}
                              data-active={record.rules.adjacencyMode === "orthogonal"}
                              onClick={() =>
                                void persistRecord({
                                  ...record,
                                  rules: {
                                    ...record.rules,
                                    adjacencyMode: "orthogonal" as AdjacencyMode,
                                  },
                                })
                              }
                            >
                              상하좌우
                            </button>
                            <button
                              type="button"
                              className={styles.segmentedBtn}
                              data-active={record.rules.adjacencyMode === "horizontal"}
                              onClick={() =>
                                void persistRecord({
                                  ...record,
                                  rules: {
                                    ...record.rules,
                                    adjacencyMode: "horizontal" as AdjacencyMode,
                                  },
                                })
                              }
                            >
                              좌우만
                            </button>
                          </div>
                        </div>

                        <div className={styles.gradeFilterRow}>
                          <button
                            type="button"
                            className={styles.gradeFilterChip}
                            data-active={record.rules.targetGrades.length === 0}
                            onClick={() =>
                              void persistRecord({
                                ...record,
                                rules: { ...record.rules, targetGrades: [] },
                              })
                            }
                          >
                            전체 학년
                          </button>
                          {selectedGrades.map(g => {
                            const active = record.rules.targetGrades.includes(g.key);
                            return (
                              <button
                                key={g.key}
                                type="button"
                                className={styles.gradeFilterChip}
                                data-active={active}
                                onClick={() => toggleTargetGrade(g.key)}
                              >
                                {g.label}
                              </button>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>

                  {/* 조건 2: 직전 자리 피하기 */}
                  <div className={styles.ruleSection}>
                    <div
                      className={styles.ruleRow}
                      onClick={() =>
                        void persistRecord({
                          ...record,
                          rules: {
                            ...record.rules,
                            avoidPreviousSeat: !record.rules.avoidPreviousSeat,
                          },
                        })
                      }
                    >
                      <span className={styles.ruleLabelText}>직전 기억된 자리 피하기</span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={record.rules.avoidPreviousSeat}
                        aria-label="직전 기억된 자리 피하기"
                        className={styles.switchBtn}
                        onClick={e => {
                          e.stopPropagation();
                          void persistRecord({
                            ...record,
                            rules: {
                              ...record.rules,
                              avoidPreviousSeat: !record.rules.avoidPreviousSeat,
                            },
                          });
                        }}
                      >
                        <span className={styles.switchThumb} />
                      </button>
                    </div>
                  </div>

                  {/* 조건 3: 특정 학생 분리 */}
                  <div className={styles.ruleSection}>
                    <span className={styles.ruleLabelText}>특정 학생 분리 배치</span>
                    <div className={styles.pairAdder}>
                      <select
                        aria-label="분리할 첫 번째 학생"
                        value={pairStudentA}
                        onChange={e => setPairStudentA(e.target.value)}
                      >
                        <option value="">학생 A</option>
                        {selectedStudents.map(s => (
                          <option key={s.id} value={s.id}>
                            {s.name} ({normalizeGradeKey(s.grade)})
                          </option>
                        ))}
                      </select>
                      <select
                        aria-label="분리할 두 번째 학생"
                        value={pairStudentB}
                        onChange={e => setPairStudentB(e.target.value)}
                      >
                        <option value="">학생 B</option>
                        {selectedStudents
                          .filter(s => s.id !== pairStudentA)
                          .map(s => (
                            <option key={s.id} value={s.id}>
                              {s.name} ({normalizeGradeKey(s.grade)})
                            </option>
                          ))}
                      </select>
                      <button type="button" onClick={handleAddSeparatedPair}>
                        추가
                      </button>
                    </div>
                    {record.rules.separatedPairs.length > 0 && (
                      <div className={styles.pairTags}>
                        {record.rules.separatedPairs.map(([idA, idB], idx) => {
                          const nameA = allStudentsMap.get(idA)?.name ?? "학생";
                          const nameB = allStudentsMap.get(idB)?.name ?? "학생";
                          return (
                            <span key={`${idA}-${idB}`} className={styles.pairTag}>
                              {nameA} · {nameB}
                              <button
                                type="button"
                                onClick={() => handleRemoveSeparatedPair(idx)}
                                aria-label="분리 조건 삭제"
                              >
                                <X size={11} />
                              </button>
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* 2. 이전 자리 기록 (IndexedDB) */}
              <div className={`${styles.panelCard} ${styles.panelCardFlex}`}>
                <div className={styles.panelHeader}>
                  <h3>이전 자리 기록</h3>
                  <button
                    type="button"
                    className={styles.recordSaveBtn}
                    disabled={assignedStudentCount === 0}
                    onClick={() => handleSaveToHistory()}
                  >
                    + 현재 자리 기억
                  </button>
                </div>

                {record.history.length === 0 ? (
                  <p style={{ fontSize: 11.5, color: "#94a3b8", margin: 0, lineHeight: 1.5 }}>
                    자리를 배치한 뒤 <strong>[+ 현재 자리 기억]</strong>을 누르면 날짜별로 기록됩니다.
                  </p>
                ) : (
                  <div className={styles.historyList}>
                    {record.history.map((entry, idx) => {
                      const displayLabel = formatHistoryDateLabel(entry, record.history);
                      return (
                        <div
                          key={entry.id}
                          className={styles.historyItem}
                          data-latest={idx === 0}
                        >
                          <div className={styles.historyDateWrap}>
                            {idx === 0 && <span className={styles.latestDot} title="직전 자리 기준" />}
                            <strong title={displayLabel}>{displayLabel}</strong>
                          </div>
                          <div className={styles.historyActions}>
                            <button
                              type="button"
                              className={styles.historyRestoreBtn}
                              onClick={() => handleRestoreHistory(entry)}
                            >
                              불러오기
                            </button>
                            <button
                              type="button"
                              className={styles.historyDeleteBtn}
                              onClick={() => handleDeleteHistory(entry.id)}
                              aria-label="기록 삭제"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </aside>
          </div>
        </div>
      </div>

      {/* 자리 크게 보기 (Full-Screen Presentation Overlay) */}
      {largeViewOpen && (
        <div
          className={styles.largeModalBackdrop}
          role="dialog"
          aria-modal="true"
          aria-label="자리 배치 크게 보기"
        >
          <div className={styles.largeModalHeader}>
            <div className={styles.titleArea}>
              <h1 style={{ fontSize: 17 }}>교실 좌석 배치표 ({scopeTitle})</h1>
              <div className={styles.legendList}>
                {selectedGrades.map(g => (
                  <span
                    key={g.key}
                    className={styles.gradeBadge}
                    style={{
                      backgroundColor: g.palette.bg,
                      color: g.palette.text,
                      border: `1px solid ${g.palette.border}`,
                      fontSize: 11.5,
                      padding: "2px 9px",
                    }}
                  >
                    {g.label} ({g.count}명)
                  </span>
                ))}
              </div>
            </div>

            <div className={styles.toolbarBtns}>
              <button
                type="button"
                className={styles.primaryActionBtn}
                disabled={isAssigning || selectedStudents.length === 0}
                onClick={handleAssign}
              >
                <Dices size={17} className={isAssigning ? "animate-spin" : ""} />
                {isAssigning ? "배치 중…" : "랜덤 자리 배치"}
              </button>

              <button
                type="button"
                className={styles.secondaryActionBtn}
                disabled={assignedStudentCount === 0}
                onClick={() => handleSaveToHistory()}
              >
                <BookmarkCheck size={15} /> 현재 자리 기억
              </button>

              <button
                type="button"
                className={styles.secondaryActionBtn}
                onClick={() => setLargeViewOpen(false)}
              >
                <Minimize2 size={15} /> 크게 보기 닫기 (ESC)
              </button>
            </div>
          </div>

          <div className={styles.largeModalCanvas}>{renderSeatGrid(false)}</div>
        </div>
      )}
    </main>
  );
}

"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowUp,
  BookOpen,
  Check,
  ChevronDown,
  Compass,
  FileDown,
  FileText,
  FolderOpen,
  LayoutTemplate,
  Loader2,
  MessageSquare,
  PanelLeft,
  PanelLeftClose,
  Plus,
  ScanText,
  Search,
  Sparkles,
  SquarePen,
  Trash2,
  X,
} from "lucide-react";
import "katex/dist/katex.min.css";
import { useAuth } from "./AuthProvider";
import LandingMenu from "./LandingMenu";
import TypingMath from "./TypingMath";
import ReportSheets, { type Preview as ReportPreview } from "../app/report/new/ReportSheets";
import {
  buildStructuredTemplate,
  defaultKindsFor,
  kinds as reportKindLabels,
  periods as reportPeriodLabels,
  themes as reportThemeLabels,
  type Kind as ReportKind,
  type Period as ReportPeriod,
  type Template as ReportTemplate,
  type Theme as ReportTheme,
} from "../app/report/new/templates";
import {
  deleteAiReportTemplate,
  deleteGeneratedProblem,
  loadActiveAiReportTemplate,
  loadAiReportTemplates,
  loadGeneratedProblems,
  saveActiveAiReportTemplate,
  saveAiReportTemplate,
  saveGeneratedProblems,
  sendAiCopilotMessage,
  type AiCopilotAction,
  type GeneratedMathProblem,
} from "../lib/ai-copilot";
import { fetchAiQuotaStatus, type AiQuotaSnapshot } from "../lib/ai-quota-client";
import {
  choiceLabels,
  formatBoxContent,
  formatChoiceContent,
  normalizeProblems,
  type ExamDocument,
  type ExamProblem,
} from "../lib/typing-model";
import { readSource, cropFigure, paddedFigureBox, type SourcePage } from "../lib/typing-upload";
import { supabase } from "../lib/supabase";
import { buildDocx, buildHwpx, downloadBlob, prepareExportDocument } from "../lib/typing-export";
import {
  MATH_GEO_PRESETS,
  renderMathGeoPngDataUrl,
  renderMathGeoSvg,
  type MathGeoSpec,
} from "../lib/math-geometry-engine";
import catalogData from "../data/mock-exams.json";
import mockProblemStoreData from "../data/mock-exam-problems.json";
import type { MockExamCatalog, MockExamProblemStore, MockExamProblemToken } from "../types/mock-exam";
import styles from "./AiProblemStudio.module.css";

type StudioMode = "default" | "generate" | "typing" | "geometry" | "report";
type CanvasPanel = "none" | "exam" | "geometry" | "library" | "report";

const STUDIO_MODES: Array<{
  id: StudioMode;
  label: string;
  desc: string;
  icon: typeof Sparkles;
}> = [
  { id: "default", label: "기본 모드", desc: "자유로운 AI 대화 및 수학 질문·업무 보조", icon: MessageSquare },
  { id: "generate", label: "문제 제작", desc: "모의고사·EBS 변형 및 신규 문항 출제", icon: Sparkles },
  { id: "typing", label: "타이핑", desc: "시험지 PDF·이미지 수식/문항 추출", icon: ScanText },
  { id: "geometry", label: "도형 작도", desc: "알지오매스·지오지브라형 함수·기하 작도", icon: Compass },
];

const STUDIO_REPORT_SAMPLE_PREVIEW: ReportPreview = {
  id: "studio-sample",
  name: "김코스",
  grade: "고2",
  group: "수학I 심화반",
  start: "2026-10-01",
  end: "2026-10-31",
  books: [
    {
      id: "sample-book",
      student_id: "studio-sample",
      title: "수학I 실전 개념완성",
      curriculum: "고등",
      course: "수학I",
      units: [],
      states: {},
      version: 1,
    },
  ],
  daily: [76, 84, 92, 96].map((score, i) => ({
    id: `daily-${i}`,
    student_id: "studio-sample",
    record_date: `2026-10-${String(7 * (i + 1)).padStart(2, "0")}`,
    attendance: "출석",
    reason: "",
    version: 1,
    exams: [
      {
        id: `exam-${i}`,
        name: `${i + 1}주차 단원 평가`,
        score,
        max_score: 100,
        scope: "삼각함수와 수열",
        memo: "",
      },
    ],
  })),
  wrong: [10, 8, 6, 4].map((total_wrong, i) => ({
    id: `wrong-${i}`,
    student_id: "studio-sample",
    record_date: `2026-10-${String(7 * (i + 1)).padStart(2, "0")}`,
    total_wrong,
    corrected_count: total_wrong - (i === 0 ? 2 : 0),
    homework_status: i === 0 ? "△" : "O",
    memo: "",
    version: 1,
  })),
  entries: [
    {
      id: "sample-entry",
      book_id: "sample-book",
      record_date: "2026-10-28",
      unit_ids: [],
      scope: "등차·등비수열의 합과 귀납법 심화",
      homework: "워크북 64~72쪽 오답 유사문항 풀이",
      due_date: "2026-10-31",
      memo: "킬러 문항 접근 속도가 눈에 띄게 빨라졌습니다. 다음 주에는 수능 기출 4점 변형 문제에 도전합니다.",
      states: {},
      created_at: "2026-10-28",
      total_pages_snapshot: 120,
      completed_page: 92,
    },
  ],
};

interface StudioChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  mode?: StudioMode;
  problems?: GeneratedMathProblem[];
  reportTemplate?: ReportTemplate;
  attachmentNames?: string[];
  createdAt: string;
}

interface StudioChatThread {
  id: string;
  title: string;
  updatedAt: string;
  messages: StudioChatMessage[];
}

export default function AiProblemStudio({ fullScreen = false }: { fullScreen?: boolean }) {
  const { user, workspace } = useAuth();
  const router = useRouter();
  const catalog = catalogData as MockExamCatalog;
  const mockProblemStore = mockProblemStoreData as unknown as MockExamProblemStore;
  const allProblemTokens = mockProblemStore.problems || [];

  // Sidebar & Canvas state
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [canvasPanel, setCanvasPanel] = useState<CanvasPanel>("none");
  const [libraryTab, setLibraryTab] = useState<"tokens" | "vault" | "mock">("tokens");

  // Chat threads & messages
  const [threads, setThreads] = useState<StudioChatThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string>("");
  const [messages, setMessages] = useState<StudioChatMessage[]>([]);

  // Composer state
  const [mode, setMode] = useState<StudioMode>("default");
  const [modeMenuOpen, setModeMenuOpen] = useState(false);
  const modeMenuRef = useRef<HTMLDivElement>(null);
  const [grade, setGrade] = useState<1 | 2 | 3>(3);
  const [subject, setSubject] = useState("미적분");
  const [difficulty, setDifficulty] = useState<"하" | "중" | "상" | "킬러">("킬러");
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [busyStep, setBusyStep] = useState("");
  const [quota, setQuota] = useState<AiQuotaSnapshot | null>(null);

  // Saved problems & Active Exam Paper
  const [savedProblems, setSavedProblems] = useState<GeneratedMathProblem[]>([]);
  const [examTitle, setExamTitle] = useState("2026 수학 실전 모의고사");
  const [examProblems, setExamProblems] = useState<GeneratedMathProblem[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [originCompareId, setOriginCompareId] = useState<string | null>(null);
  const [expandedTokenId, setExpandedTokenId] = useState<string | null>(null);
  const [exportBusy, setExportBusy] = useState("");

  // AI Report Template Studio state
  const [savedReportTemplates, setSavedReportTemplates] = useState<ReportTemplate[]>([]);
  const [activeReportTemplate, setActiveReportTemplate] = useState<ReportTemplate>(() =>
    buildStructuredTemplate({
      cycle: "month",
      focus: "balanced",
      theme: "unidesk",
      orientation: "portrait",
      enabledKinds: defaultKindsFor("month", "balanced"),
    })
  );
  const [templateSaveMsg, setTemplateSaveMsg] = useState("");

  // OCR Attachments
  const [sources, setSources] = useState<SourcePage[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // AlgeoMath / GeoGebra Plotter state
  const [geoPresetIdx, setGeoPresetIdx] = useState<number>(0);
  const [geoSpec, setGeoSpec] = useState<MathGeoSpec>(() => MATH_GEO_PRESETS[0].spec);
  const [geoFn1, setGeoFn1] = useState("abs(x^3 - 3*x + 1)");
  const [geoFn1Label, setGeoFn1Label] = useState("y=|f(x)|");
  const [geoFn2, setGeoFn2] = useState("3");
  const [geoFn2Label, setGeoFn2Label] = useState("y=t");
  const [geoShadeFrom, setGeoShadeFrom] = useState("-1");
  const [geoShadeTo, setGeoShadeTo] = useState("2");
  const [geoShadeEnabled, setGeoShadeEnabled] = useState(false);
  const [geoEqualAspect, setGeoEqualAspect] = useState(false);
  const [geoAutoIntersections, setGeoAutoIntersections] = useState(true);
  const [geoTangentX, setGeoTangentX] = useState("");
  const [geoDomainMin, setGeoDomainMin] = useState("-2.2");
  const [geoDomainMax, setGeoDomainMax] = useState("3.6");
  const [geoRangeMin, setGeoRangeMin] = useState("-1.2");
  const [geoRangeMax, setGeoRangeMax] = useState("5.2");
  const [geoJsonText, setGeoJsonText] = useState(() => JSON.stringify(MATH_GEO_PRESETS[0].spec, null, 2));
  const [targetProblemId, setTargetProblemId] = useState<string>("latest");

  // Mock Exam Archive & Token Library filter state
  const [mockGrade, setMockGrade] = useState<1 | 2 | 3>(3);
  const [mockSearch, setMockSearch] = useState("");

  const threadsKey = `cosmath:ai-studio:threads:${workspace?.id || "local"}`;
  const examDraftKey = `cosmath:typing:${workspace?.id}:${user?.id}`;

  useEffect(() => {
    void loadGeneratedProblems().then(setSavedProblems);
    void fetchAiQuotaStatus().then(setQuota);
    const loadedTemplates = loadAiReportTemplates();
    setSavedReportTemplates(loadedTemplates);
    const activeTpl = loadActiveAiReportTemplate() ?? loadedTemplates[0];
    if (activeTpl) setActiveReportTemplate(activeTpl);

    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("mode") === "report") {
        setMode("report");
        setCanvasPanel("report");
      }
    }

    try {
      const raw = localStorage.getItem(threadsKey);
      if (raw) {
        const parsed = JSON.parse(raw) as StudioChatThread[];
        if (Array.isArray(parsed)) setThreads(parsed);
      }
    } catch {
      // ignore storage errors
    }
  }, [threadsKey]);

  useEffect(() => {
    const onTemplateUpdated = (e: Event) => {
      const built = (e as CustomEvent<ReportTemplate>).detail;
      if (!built) return;
      setActiveReportTemplate(built);
      setSavedReportTemplates(loadAiReportTemplates());
      setCanvasPanel("report");
    };
    window.addEventListener("cosmath-ai-template-updated", onTemplateUpdated);
    return () => window.removeEventListener("cosmath-ai-template-updated", onTemplateUpdated);
  }, []);

  useEffect(() => {
    if (messages.length > 0) {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [messages.length, busy]);

  useEffect(() => {
    if (!modeMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (modeMenuRef.current && !modeMenuRef.current.contains(e.target as Node)) {
        setModeMenuOpen(false);
      }
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [modeMenuOpen]);

  function persistThread(nextMessages: StudioChatMessage[], customTitle?: string) {
    if (nextMessages.length === 0) return;
    const firstUserMsg = nextMessages.find(m => m.role === "user")?.content || customTitle || "새 수학 문제 대화";
    const title = firstUserMsg.replace(/\s+/g, " ").slice(0, 28);
    const id = activeThreadId || `thread-${Date.now()}`;
    if (!activeThreadId) setActiveThreadId(id);

    const updatedThread: StudioChatThread = {
      id,
      title,
      updatedAt: new Date().toISOString(),
      messages: nextMessages,
    };

    setThreads(prev => {
      const next = [updatedThread, ...prev.filter(t => t.id !== id)].slice(0, 30);
      try {
        localStorage.setItem(threadsKey, JSON.stringify(next));
      } catch {
        // ignore quota errors
      }
      return next;
    });
  }

  function startNewChat() {
    setActiveThreadId("");
    setMessages([]);
    setPrompt("");
    setSources([]);
  }

  function selectThread(thread: StudioChatThread) {
    setActiveThreadId(thread.id);
    setMessages(thread.messages);
  }

  function deleteThread(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    setThreads(prev => {
      const next = prev.filter(t => t.id !== id);
      try {
        localStorage.setItem(threadsKey, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
    if (activeThreadId === id) {
      startNewChat();
    }
  }

  function selectGeoPreset(index: number) {
    const preset = MATH_GEO_PRESETS[index];
    if (!preset) return;
    setGeoPresetIdx(index);
    setGeoSpec(preset.spec);
    setGeoJsonText(JSON.stringify(preset.spec, null, 2));
    setGeoEqualAspect(Boolean(preset.spec.equalAspect));
    setGeoAutoIntersections(Boolean(preset.spec.autoIntersections));
    setGeoTangentX(preset.spec.tangents?.[0] ? String(preset.spec.tangents[0].atX) : "");
    setGeoDomainMin(String(preset.spec.xRange?.[0] ?? -4));
    setGeoDomainMax(String(preset.spec.xRange?.[1] ?? 4));
    setGeoRangeMin(String(preset.spec.yRange?.[0] ?? -3));
    setGeoRangeMax(String(preset.spec.yRange?.[1] ?? 4));
    if (preset.spec.functions?.[0]) {
      setGeoFn1(preset.spec.functions[0].expr);
      setGeoFn1Label(preset.spec.functions[0].label || "y=f(x)");
    } else {
      setGeoFn1("");
      setGeoFn1Label("");
    }
    if (preset.spec.functions?.[1]) {
      setGeoFn2(preset.spec.functions[1].expr);
      setGeoFn2Label(preset.spec.functions[1].label || "y=g(x)");
    } else {
      setGeoFn2("");
      setGeoFn2Label("");
    }
    if (preset.spec.shadedRegions?.[0]) {
      setGeoShadeEnabled(true);
      setGeoShadeFrom(String(preset.spec.shadedRegions[0].from));
      setGeoShadeTo(String(preset.spec.shadedRegions[0].to));
    } else {
      setGeoShadeEnabled(false);
    }
  }

  function applyQuickFormulaSpec() {
    const functions = [];
    if (geoFn1.trim()) functions.push({ expr: geoFn1.trim(), label: geoFn1Label.trim() || undefined });
    if (geoFn2.trim()) functions.push({ expr: geoFn2.trim(), label: geoFn2Label.trim() || undefined });

    const nextSpec: MathGeoSpec = {
      ...geoSpec,
      equalAspect: geoEqualAspect,
      autoIntersections: geoAutoIntersections,
      xRange: [Number(geoDomainMin) || -4, Number(geoDomainMax) || 4],
      yRange: [Number(geoRangeMin) || -3, Number(geoRangeMax) || 4],
      functions,
      tangents:
        geoTangentX.trim() !== "" && Number.isFinite(Number(geoTangentX)) && geoFn1.trim()
          ? [
              {
                fn: geoFn1.trim(),
                atX: Number(geoTangentX),
                label: "l",
                style: "dashed",
                pointLabel: `P(${geoTangentX})`,
                dropToX: true,
                xTick: geoTangentX.trim(),
              },
            ]
          : [],
      shadedRegions:
        geoShadeEnabled && geoFn1.trim()
          ? [
              {
                f1: geoFn1.trim(),
                f2: geoFn2.trim() || undefined,
                from: Number(geoShadeFrom) || -1,
                to: Number(geoShadeTo) || 2,
              },
            ]
          : [],
    };
    setGeoSpec(nextSpec);
    setGeoJsonText(JSON.stringify(nextSpec, null, 2));
  }

  async function attachCurrentGraphToProblem() {
    const pngUrl = await renderMathGeoPngDataUrl(geoSpec);
    const allProblems = messages.flatMap(m => m.problems || []);
    const target =
      targetProblemId === "latest"
        ? allProblems[allProblems.length - 1]
        : allProblems.find(p => p.id === targetProblemId) || savedProblems.find(p => p.id === targetProblemId);

    if (target) {
      const updated: GeneratedMathProblem = { ...target, geoSpec, figure: pngUrl };
      setMessages(prev => {
        const next = prev.map(m => ({
          ...m,
          problems: m.problems?.map(p => (p.id === target.id ? updated : p)),
        }));
        persistThread(next);
        return next;
      });
      await saveGeneratedProblems([updated]);
      setSavedProblems(await loadGeneratedProblems());
    } else {
      const created = await saveGeneratedProblems([
        {
          title: "알지오매스/지오지브라 작도 문항",
          grade,
          subject,
          unit: "함수와 기하 도형",
          difficulty,
          sourceLabel: "AI 스튜디오 작도기",
          question: "다음 그림과 같이 좌표평면 위의 함수 그래프와 도형에 대하여 물음에 답하시오.",
          boxContent: "",
          choices: ["$1$", "$2$", "$3$", "$4$", "$5$"],
          answer: "③",
          solution: "작도된 함수 그래프의 교점과 정적분 넓이 관계를 이용하여 값을 구한다.",
          geoSpec,
          figure: pngUrl,
        },
      ]);
      setSavedProblems(await loadGeneratedProblems());
      setMessages(prev => {
        const next: StudioChatMessage[] = [
          ...prev,
          {
            id: `msg-geo-${Date.now()}`,
            role: "assistant",
            content: "작도하신 알지오매스/지오지브라 도형을 문항 카드로 생성해 대화창과 보관함에 추가했습니다.",
            mode: "geometry",
            problems: created,
            createdAt: new Date().toISOString(),
          },
        ];
        persistThread(next, "함수·기하 도형 작도");
        return next;
      });
    }
  }

  async function handleFileSelect(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setBusyStep("시험지 PDF·이미지 페이지를 불러오는 중...");
    try {
      const loaded: SourcePage[] = [];
      for (const file of Array.from(files)) {
        loaded.push(...(await readSource(file)));
      }
      setSources(prev => [...prev, ...loaded]);
      setMode("typing");
    } catch (err) {
      setMessages(prev => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: "assistant",
          content: err instanceof Error ? err.message : "파일을 읽지 못했습니다.",
          createdAt: new Date().toISOString(),
        },
      ]);
    } finally {
      setBusy(false);
      setBusyStep("");
    }
  }

  async function handleExtractSourcesInChat(userInstruction?: string) {
    if (!sources.length || busy) return;
    const text = userInstruction?.trim() || `${sources.map(s => s.name).join(", ")} 시험지 스캔 타이핑`;
    const userMsg: StudioChatMessage = {
      id: `user-ocr-${Date.now()}`,
      role: "user",
      content: text,
      mode: "typing",
      attachmentNames: sources.map(s => s.name),
      createdAt: new Date().toISOString(),
    };
    const nextWithUser = [...messages, userMsg];
    setMessages(nextWithUser);
    setBusy(true);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token ?? "";
      const extractedInputs: Omit<GeneratedMathProblem, "id" | "createdAt">[] = [];
      const pageErrors: string[] = [];

      for (let i = 0; i < sources.length; i++) {
        const page = sources[i];
        setBusyStep(`시험지 페이지 OCR 수식·문항 인식 중 (${i + 1}/${sources.length}: ${page.name})...`);
        const base64 = page.image.includes(",") ? page.image.split(",")[1] : page.image;
        const res = await fetch("/api/typing/extract", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ image: base64, mimeType: "image/jpeg" }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          pageErrors.push(
            data?.error
              ? `${page.name}: ${data.error}${data.code ? ` [${data.code}]` : ""}`
              : `${page.name}: 서버가 OCR 응답을 반환하지 못했습니다 (HTTP ${res.status}).`
          );
          continue;
        }
        if (Array.isArray(data?.problems)) {
          const normalized = normalizeProblems(data.problems, i + 1);
          for (const p of normalized) {
            let figure: string | undefined;
            if (p.figureBox) {
              try {
                figure = await cropFigure(page.image, paddedFigureBox(p.figureBox));
              } catch {
                // ignore crop failure
              }
            }
            extractedInputs.push({
              title: `${page.name} ${p.number}번`,
              grade,
              subject,
              unit: "시험지 타이핑 추출",
              difficulty: "상",
              sourceLabel: page.name,
              question: p.question,
              boxContent: p.boxContent,
              choices: p.choices,
              figure,
              answer: "",
              solution: "",
            });
          }
        }
      }

      const savedList = extractedInputs.length > 0 ? await saveGeneratedProblems(extractedInputs) : [];
      setSavedProblems(await loadGeneratedProblems());
      void fetchAiQuotaStatus().then(setQuota);
      if (savedList.length > 0) {
        setExamProblems(prev => [...prev, ...savedList]);
      }

      const assistantMsg: StudioChatMessage = {
        id: `ast-ocr-${Date.now()}`,
        role: "assistant",
        content:
          savedList.length > 0
            ? `첨부하신 시험지(${sources.length}쪽)에서 총 **${savedList.length}문항**을 추출해 시험지 캔버스와 라이브러리에 담았습니다.${pageErrors.length ? `\n\n*(일부 페이지 오류: ${pageErrors.join(" / ")})*` : ""} 우측 **시험지 캔버스**에서 바로 한글(HWPX)·Word로 내려받거나 변형 문제를 요청해 보세요.`
            : pageErrors.length > 0
              ? `OCR 인식 요청이 실패했습니다:\n- ${pageErrors.join("\n- ")}`
              : "첨부된 이미지에서 문항을 찾지 못했습니다. 해상도가 선명한 시험지 이미지를 다시 첨부해 주세요.",
        mode: "typing",
        problems: savedList,
        createdAt: new Date().toISOString(),
      };
      const finalMessages = [...nextWithUser, assistantMsg];
      setMessages(finalMessages);
      persistThread(finalMessages, text);
      setSources([]);
      if (savedList.length > 0) setCanvasPanel("exam");
    } catch (err) {
      setMessages(prev => [
        ...prev,
        {
          id: `err-ocr-${Date.now()}`,
          role: "assistant",
          content: err instanceof Error ? err.message : "OCR 인식 중 오류가 발생했습니다.",
          createdAt: new Date().toISOString(),
        },
      ]);
    } finally {
      setBusy(false);
      setBusyStep("");
    }
  }

  async function handleSend(customPrompt?: string, forcedMode?: StudioMode, sourceTokenId?: string) {
    const activeMode = forcedMode || mode;
    const text = (customPrompt ?? prompt).trim();

    if (sources.length > 0 && activeMode === "typing" && !customPrompt) {
      setPrompt("");
      await handleExtractSourcesInChat(text || undefined);
      return;
    }

    if (!text || busy) return;
    if (!customPrompt) setPrompt("");

    const userMsg: StudioChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content: text,
      mode: activeMode,
      attachmentNames: sources.length ? sources.map(s => s.name) : undefined,
      createdAt: new Date().toISOString(),
    };
    const nextWithUser = [...messages, userMsg];
    setMessages(nextWithUser);
    setBusy(true);
    setBusyStep(
      activeMode === "report"
        ? "학생 성취도·출결·오답·진도에 맞춘 보고서 템플릿을 설계하는 중..."
        : activeMode === "geometry"
          ? "알지오매스/지오지브라 1:1 등축 좌표계와 도형을 작도하는 중..."
          : activeMode === "typing"
            ? "문항 수식(LaTeX)과 레이아웃을 구성하는 중..."
            : activeMode === "generate"
              ? `기출 1:1 매칭 토큰 참조 및 고${grade} ${subject} (${difficulty}) 쌍둥이 변형 설계 중...`
              : "AI가 답변을 준비하고 있습니다..."
    );

    const enrichedPrompt =
      activeMode === "report"
        ? `[학생 성장 보고서 템플릿 설계 요청] ${text}. 반드시 update_report_template 액션을 사용해 orientation(portrait|landscape), theme(saebom|miricheck|mirireport|mirigraph|unidesk|notebook|summary|timeline|briefing|planner|letter|clean), period(day|week|month|1month|3months), blocks 배열을 완성도 높게 구성해줘. 사용자가 특정 항목(예: 오답, 성적 등)을 빼달라고 하면 blocks에서 해당 kind를 반드시 제외해줘.`
        : activeMode === "geometry"
          ? `[알지오매스/지오지브라 도형 작도 및 문항 출제 요청] ${text}. 반드시 geoSpec(함수 그래프, 접선, 적분 색칠 영역, 주요 좌표점과 수선의 발 점선, 원/다각형 등)을 정교하게 포함하여 문항을 생성해줘.`
          : activeMode === "typing"
            ? `[시험지 타이핑 및 문항 정밀 편집 요청] ${text}. 시험지에 바로 넣을 수 있도록 깔끔한 LaTeX 수식과 5지선다를 포함해 문항을 만들어줘.`
            : text;

    const firstSource = sources[0];
    if (sources.length > 0) setSources([]);

    try {
      const response = await sendAiCopilotMessage({
        prompt: enrichedPrompt,
        mode:
          activeMode === "report"
            ? "report_template"
            : activeMode === "typing"
              ? "typing"
              : activeMode === "default"
                ? "general"
                : "problem_studio",
        pathname: "/ai-studio",
        contextData: {
          grade,
          subject,
          difficulty,
          ...(sourceTokenId ? { sourceTokenId } : {}),
        },
        ...(firstSource
          ? {
              imageBase64: firstSource.image.includes(",")
                ? firstSource.image.split(",")[1]
                : firstSource.image,
              imageMimeType: "image/jpeg",
            }
          : {}),
        history: messages.slice(-8).map(m => ({ role: m.role, content: m.content })),
      });

      const createdProblems: GeneratedMathProblem[] = [];
      let createdReportTemplate: ReportTemplate | undefined;
      for (const action of response.actions as AiCopilotAction[]) {
        if (action.type === "generate_problems" && action.problems?.length) {
          for (const p of action.problems) {
            if (p.geoSpec) {
              setGeoSpec(p.geoSpec);
              setGeoJsonText(JSON.stringify(p.geoSpec, null, 2));
            }
          }
        } else if (action.type === "update_report_template") {
          const latestTpl = loadActiveAiReportTemplate() ?? loadAiReportTemplates()[0];
          if (latestTpl) {
            createdReportTemplate = latestTpl;
            setActiveReportTemplate(latestTpl);
            setSavedReportTemplates(loadAiReportTemplates());
            setCanvasPanel("report");
          }
        }
      }

      const latestVault = await loadGeneratedProblems();
      setSavedProblems(latestVault);
      // Pick the newly generated problems from this turn directly from response.createdProblems
      if (response.createdProblems && response.createdProblems.length > 0) {
        createdProblems.push(...response.createdProblems);
      } else {
        const genCount = response.actions.reduce(
          (acc, a) =>
            acc +
            (a.type === "generate_problems"
              ? a.problems.length
              : a.type === "typing_update_problems"
                ? a.problems.length
                : 0),
          0
        );
        if (genCount > 0) {
          createdProblems.push(...latestVault.slice(0, genCount));
        }
      }

      if (createdProblems.length > 0) {
        setExamProblems(prev => {
          const existingIds = new Set(prev.map(p => p.id));
          return [...prev, ...createdProblems.filter(cp => !existingIds.has(cp.id))];
        });
        if (createdProblems.length >= 2) {
          setCanvasPanel("exam");
        }
      }

      if (response.quota) {
        setQuota(response.quota);
      } else {
        void fetchAiQuotaStatus().then(setQuota);
      }

      const assistantMsg: StudioChatMessage = {
        id: `a-${Date.now()}`,
        role: "assistant",
        content: response.reply,
        mode: activeMode,
        problems: createdProblems.length > 0 ? createdProblems : undefined,
        reportTemplate: createdReportTemplate,
        createdAt: new Date().toISOString(),
      };

      const finalMessages = [...nextWithUser, assistantMsg];
      setMessages(finalMessages);
      persistThread(finalMessages, text);
    } catch (err) {
      setMessages(prev => [
        ...prev,
        {
          id: `err-send-${Date.now()}`,
          role: "assistant",
          content: err instanceof Error ? err.message : "AI 스튜디오 요청 처리 중 오류가 발생했습니다.",
          createdAt: new Date().toISOString(),
        },
      ]);
    } finally {
      setBusy(false);
      setBusyStep("");
    }
  }

  function handleSaveCurrentReportTemplate(tplToSave = activeReportTemplate) {
    const next = saveAiReportTemplate(tplToSave);
    saveActiveAiReportTemplate(tplToSave);
    setSavedReportTemplates(next);
    setTemplateSaveMsg(`'${tplToSave.name}' 템플릿을 보관함에 저장했습니다.`);
    setTimeout(() => setTemplateSaveMsg(""), 3000);
  }

  function handleApplyTemplateToReportPage(tplToApply = activeReportTemplate) {
    saveAiReportTemplate(tplToApply);
    saveActiveAiReportTemplate(tplToApply);
    router.push("/report/new?from=ai-studio");
  }

  function addProblemToExam(problem: GeneratedMathProblem) {
    setExamProblems(prev => {
      if (prev.some(p => p.id === problem.id)) return prev;
      return [...prev, problem];
    });
    setCanvasPanel("exam");
  }

  function addTokenToExam(token: MockExamProblemToken) {
    const converted: GeneratedMathProblem = {
      id: `token-${token.id}`,
      title: `${token.examTitle} ${token.number}번`,
      grade: token.grade,
      subject: token.subject,
      unit: token.intent || token.subject,
      difficulty: token.difficulty,
      points: token.points,
      question: token.question,
      boxContent: token.boxContent || "",
      choices: token.choices || [],
      answer: token.answer,
      solution: token.solution,
      sourceLabel: `${token.year}.${String(token.month).padStart(2, "0")} 고${token.grade} ${token.number}번 원본`,
      sourceTokenId: token.id,
      sourceOrigin: token,
      intent: token.intent,
      createdAt: new Date().toISOString(),
    };
    addProblemToExam(converted);
  }

  function removeProblemFromExam(id: string) {
    setExamProblems(prev => prev.filter(p => p.id !== id));
  }

  function buildExamDocumentFromList(problemsToUse: GeneratedMathProblem[]): ExamDocument {
    const mapped: ExamProblem[] = problemsToUse.map((p, idx) => ({
      id: p.id || `prob-${idx + 1}`,
      number: String(idx + 1),
      sourceYear: new Date(p.createdAt).getFullYear().toString(),
      sourceSchool: p.sourceLabel || `고${p.grade} ${p.subject}`,
      points: p.difficulty === "킬러" || p.difficulty === "상" ? "4점" : "3점",
      question: p.question,
      boxContent: p.boxContent || "",
      choices: p.choices?.length ? p.choices : ["1", "2", "3", "4", "5"],
      choiceLayout: "auto",
      figure: p.figure,
    }));
    return {
      title: examTitle.trim() || "AI 스튜디오 모의고사",
      perPage: 4,
      problems: normalizeProblems(mapped).map((np, i) => ({
        ...np,
        id: mapped[i].id,
        figure: mapped[i].figure,
      })),
    };
  }

  async function handleDownloadExam(kind: "hwpx" | "docx") {
    const list = examProblems.length > 0 ? examProblems : savedProblems.slice(0, 4);
    if (!list.length || exportBusy) return;
    setExportBusy(kind);
    try {
      const rawDoc = buildExamDocumentFromList(list);
      const prepared = prepareExportDocument(rawDoc, kind);
      let blob: Blob;
      if (kind === "docx") {
        blob = await buildDocx(prepared.document);
      } else {
        const res = await fetch("/typing/blank.hwpx");
        if (!res.ok) throw new Error("한글 문서 양식을 불러오지 못했습니다.");
        blob = await buildHwpx(prepared.document, await res.arrayBuffer());
      }
      downloadBlob(blob, `${rawDoc.title}.${kind}`);
    } finally {
      setExportBusy("");
    }
  }

  function handleOpenInFullTypingEditor(problemsToSend: GeneratedMathProblem[]) {
    if (!problemsToSend.length) return;
    try {
      const nextDoc = buildExamDocumentFromList(problemsToSend);
      localStorage.setItem(examDraftKey, JSON.stringify({ doc: nextDoc, active: null }));
    } catch {
      // ignore storage error
    }
    router.push("/typing");
  }

  async function handleDeleteSavedProblem(id: string) {
    await deleteGeneratedProblem(id);
    setSavedProblems(await loadGeneratedProblems());
    setExamProblems(prev => prev.filter(p => p.id !== id));
  }

  const filteredThreads = useMemo(
    () =>
      threads.filter(t =>
        !searchQuery.trim() ? true : t.title.toLowerCase().includes(searchQuery.trim().toLowerCase())
      ),
    [threads, searchQuery]
  );

  const filteredMocks = useMemo(
    () =>
      catalog.exams
        .filter(exam => exam.grade === mockGrade)
        .filter(exam =>
          !mockSearch.trim()
            ? true
            : `${exam.title} ${exam.subject} ${exam.year}`.toLowerCase().includes(mockSearch.trim().toLowerCase())
        )
        .slice(0, 25),
    [catalog.exams, mockGrade, mockSearch]
  );

  const filteredTokens = useMemo(
    () =>
      allProblemTokens
        .filter(t => t.grade === mockGrade)
        .filter(t => {
          if (!mockSearch.trim()) return true;
          const q = mockSearch.trim().toLowerCase();
          return (
            `${t.number}번`.includes(q) ||
            `${t.examTitle} ${t.subject} ${t.intent || ""} ${t.question} ${t.solution}`
              .toLowerCase()
              .includes(q)
          );
        })
        .slice(0, 40),
    [allProblemTokens, mockGrade, mockSearch]
  );

  const problemTokenById = useMemo(
    () => new Map(allProblemTokens.map(t => [t.id, t])),
    [allProblemTokens]
  );

  const renderedGeoSvg = useMemo(() => renderMathGeoSvg(geoSpec), [geoSpec]);

  const currentModeMeta = STUDIO_MODES.find(m => m.id === mode) || STUDIO_MODES[0];
  const CurrentModeIcon = currentModeMeta.icon;

  const renderComposer = (isCentered: boolean) => (
    <div className={`${styles.composerContainer} ${isCentered ? styles.composerCentered : styles.composerDocked}`}>
      {sources.length > 0 && (
        <div className={styles.attachmentStrip}>
          <div className={styles.attachmentItems}>
            {sources.map(s => (
              <span key={s.id} className={styles.attachmentChip}>
                <ScanText size={13} />
                {s.name}
                <button
                  type="button"
                  onClick={() => setSources(prev => prev.filter(item => item.id !== s.id))}
                  aria-label={`${s.name} 첨부 제거`}
                >
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
          <button
            type="button"
            className={styles.extractNowBtn}
            onClick={() => void handleExtractSourcesInChat()}
            disabled={busy}
          >
            <ScanText size={13} /> 첨부 시험지 즉시 타이핑 ({sources.length}쪽)
          </button>
        </div>
      )}

      <form
        className={styles.pillForm}
        onSubmit={e => {
          e.preventDefault();
          void handleSend();
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,image/*"
          multiple
          hidden
          onChange={e => {
            void handleFileSelect(e.target.files);
            e.currentTarget.value = "";
          }}
        />
        <button
          type="button"
          className={styles.attachPlusBtn}
          onClick={() => fileInputRef.current?.click()}
          title="시험지 PDF 또는 이미지 첨부"
          aria-label="시험지 PDF 또는 이미지 첨부"
        >
          <Plus size={20} />
        </button>

        <textarea
          className={styles.pillInput}
          rows={1}
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void handleSend();
            }
          }}
          placeholder={
            mode === "report"
              ? "원하는 보고서 템플릿 구성(예: 성적 그래프와 오답 분석표 중심의 가로형 월간 리포트)을 입력하세요..."
              : mode === "typing"
                ? "시험지 PDF·이미지를 + 버튼으로 첨부하거나 타이핑할 수식/문항을 입력하세요..."
                : mode === "geometry"
                  ? "작도할 함수 그래프(예: 삼차함수와 접선의 넓이)나 기하 도형을 입력하세요..."
                  : mode === "generate"
                    ? "제작하거나 변형할 수학 문제 조건을 입력하세요..."
                    : "무엇이든 물어보세요..."
          }
          disabled={busy}
        />

        {/* Single Mode Dropdown Button (opens popover below) */}
        <div className={styles.modeDropdownWrap} ref={modeMenuRef}>
          <button
            type="button"
            className={`${styles.toolPill} ${mode !== "default" ? styles.toolPillActive : ""}`}
            onClick={() => setModeMenuOpen(v => !v)}
            aria-expanded={modeMenuOpen}
            aria-haspopup="menu"
          >
            <CurrentModeIcon size={14} />
            <span>{currentModeMeta.label}</span>
            <ChevronDown size={13} className={styles.modeChevron} />
          </button>

          {modeMenuOpen && (
            <div className={styles.modeMenuPopover} role="menu" aria-label="모드 선택">
              {STUDIO_MODES.map(item => {
                const Icon = item.icon;
                const active = mode === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="menuitem"
                    className={`${styles.modeMenuItem} ${active ? styles.modeMenuItemActive : ""}`}
                    onClick={() => {
                      setMode(item.id);
                      setModeMenuOpen(false);
                      if (item.id === "geometry") {
                        setCanvasPanel("geometry");
                      } else if (item.id === "report") {
                        setCanvasPanel("report");
                      }
                    }}
                  >
                    <span className={styles.modeMenuIcon}>
                      <Icon size={15} />
                    </span>
                    <div className={styles.modeMenuText}>
                      <strong>{item.label}</strong>
                      <small>{item.desc}</small>
                    </div>
                    {active && <Check size={14} className={styles.modeMenuCheck} />}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <button
          type="submit"
          className={styles.sendCircleBtn}
          disabled={busy || (!prompt.trim() && sources.length === 0)}
          aria-label="전송"
        >
          {busy ? <Loader2 size={17} className={styles.spin} /> : <ArrowUp size={18} />}
        </button>
      </form>
    </div>
  );

  return (
    <section
      className={`${styles.studioShell} ${fullScreen ? styles.studioFullScreen : ""}`}
      aria-label="AI 스튜디오"
    >
      {/* 1. Left ChatGPT-Style Sidebar */}
      {sidebarOpen && (
        <aside className={styles.sidebar}>
          <div className={styles.sidebarHeader}>
            <Link href="/ai-studio" className={styles.brandTitle}>
              <strong>AI 스튜디오</strong>
            </Link>
            <div className={styles.sidebarHeaderBtns}>
              <button
                type="button"
                className={styles.iconBtn}
                onClick={() => setShowSearch(v => !v)}
                aria-label="대화 검색"
                title="대화 검색"
              >
                <Search size={17} />
              </button>
              <button
                type="button"
                className={styles.iconBtn}
                onClick={() => setSidebarOpen(false)}
                aria-label="사이드바 닫기"
                title="사이드바 닫기"
              >
                <PanelLeftClose size={17} />
              </button>
            </div>
          </div>

          {showSearch && (
            <div className={styles.sidebarSearchBox}>
              <input
                type="search"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="대화 제목 검색..."
              />
            </div>
          )}

          <nav className={styles.sidebarNav}>
            <button
              type="button"
              className={`${styles.navItem} ${messages.length === 0 && canvasPanel === "none" ? styles.navItemActive : ""}`}
              onClick={startNewChat}
            >
              <SquarePen size={17} />
              <span>새 채팅</span>
            </button>
            <button
              type="button"
              className={`${styles.navItem} ${mode === "typing" ? styles.navItemActive : ""}`}
              onClick={() => {
                setMode("typing");
                fileInputRef.current?.click();
              }}
            >
              <ScanText size={17} />
              <span>시험지 타이핑 (OCR)</span>
            </button>
            <button
              type="button"
              className={`${styles.navItem} ${canvasPanel === "geometry" ? styles.navItemActive : ""}`}
              onClick={() => setCanvasPanel(c => (c === "geometry" ? "none" : "geometry"))}
            >
              <Compass size={17} />
              <span>함수·기하 작도기</span>
            </button>
            <button
              type="button"
              className={`${styles.navItem} ${canvasPanel === "library" ? styles.navItemActive : ""}`}
              onClick={() => {
                setLibraryTab("tokens");
                setCanvasPanel(c => (c === "library" ? "none" : "library"));
              }}
            >
              <BookOpen size={17} />
              <span>라이브러리 ({allProblemTokens.length + savedProblems.length})</span>
            </button>
            <button
              type="button"
              className={`${styles.navItem} ${canvasPanel === "exam" ? styles.navItemActive : ""}`}
              onClick={() => setCanvasPanel(c => (c === "exam" ? "none" : "exam"))}
            >
              <FileText size={17} />
              <span>시험지 캔버스 ({examProblems.length})</span>
            </button>
            <button
              type="button"
              className={`${styles.navItem} ${canvasPanel === "report" || mode === "report" ? styles.navItemActive : ""}`}
              onClick={() => {
                setMode("report");
                setCanvasPanel(c => (c === "report" ? "none" : "report"));
              }}
            >
              <LayoutTemplate size={17} />
              <span>보고서 템플릿 ({savedReportTemplates.length})</span>
            </button>
          </nav>

          <div className={styles.recentSection}>
            <span className={styles.sectionLabel}>최근</span>
            <div className={styles.threadList}>
              {filteredThreads.length === 0 ? (
                <p className={styles.emptyThreads}>진행한 대화가 여기에 기록됩니다.</p>
              ) : (
                filteredThreads.map(thread => (
                  <div
                    key={thread.id}
                    className={`${styles.threadItem} ${activeThreadId === thread.id ? styles.threadItemActive : ""}`}
                    onClick={() => selectThread(thread)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={e => {
                      if (e.key === "Enter") selectThread(thread);
                    }}
                  >
                    <MessageSquare size={14} className={styles.threadIcon} />
                    <span className={styles.threadTitle}>{thread.title}</span>
                    <button
                      type="button"
                      className={styles.threadDeleteBtn}
                      onClick={e => deleteThread(thread.id, e)}
                      aria-label="대화 삭제"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className={styles.sidebarFooter}>
            <div className={styles.accountProfile}>
              <span className={styles.accountAvatar}>
                {(workspace?.name || "코스매쓰").slice(0, 2)}
              </span>
              <div className={styles.accountMeta}>
                <strong>{workspace?.name || "코스매쓰 수학학원"}</strong>
                <small>오늘 AI {quota?.dailyPct ?? 0}% · 주간 {quota?.weeklyPct ?? 0}%</small>
              </div>
            </div>
            <Link href="/typing" className={styles.classicSwitchPill} title="기존 A4 시험지 편집기로 이동">
              A4 편집기
            </Link>
          </div>
        </aside>
      )}

      {/* 2. Center Main Chat Viewport (#ffffff) */}
      <div className={styles.mainViewport}>
        <header className={styles.topHeader}>
          <div className={styles.topHeaderLeft}>
            {!sidebarOpen && (
              <>
                <button
                  type="button"
                  className={styles.iconBtn}
                  onClick={() => setSidebarOpen(true)}
                  aria-label="사이드바 열기"
                >
                  <PanelLeft size={18} />
                </button>
                <button
                  type="button"
                  className={styles.iconBtn}
                  onClick={startNewChat}
                  aria-label="새 채팅"
                >
                  <SquarePen size={18} />
                </button>
              </>
            )}
            <span className={styles.modelLabel}>UNIDESK AI 스튜디오</span>
          </div>

          <div className={styles.topHeaderRight}>
            <span className={styles.quotaPill}>
              ✦ 학원 한도 오늘 <strong>{quota?.dailyPct ?? 0}%</strong>
            </span>
            <button
              type="button"
              className={`${styles.headerCanvasBtn} ${canvasPanel === "library" ? styles.headerCanvasBtnActive : ""}`}
              onClick={() => {
                setLibraryTab("tokens");
                setCanvasPanel(c => (c === "library" ? "none" : "library"));
              }}
            >
              <BookOpen size={14} /> 라이브러리 ({allProblemTokens.length + savedProblems.length})
            </button>
            <button
              type="button"
              className={`${styles.headerCanvasBtn} ${canvasPanel === "report" ? styles.headerCanvasBtnActive : ""}`}
              onClick={() => {
                setMode("report");
                setCanvasPanel(c => (c === "report" ? "none" : "report"));
              }}
            >
              <LayoutTemplate size={14} /> 보고서 템플릿 ({savedReportTemplates.length})
            </button>
            <button
              type="button"
              className={`${styles.headerCanvasBtn} ${canvasPanel === "exam" ? styles.headerCanvasBtnActive : ""}`}
              onClick={() => setCanvasPanel(c => (c === "exam" ? "none" : "exam"))}
            >
              <FileText size={14} /> 시험지 캔버스 ({examProblems.length})
            </button>
            <LandingMenu />
          </div>
        </header>

        {messages.length === 0 ? (
          <div className={styles.emptyStage}>
            <h1 className={styles.emptyHeading}>오늘은 무엇을 해볼까요?</h1>
            {renderComposer(true)}
          </div>
        ) : (
          <>
            <div className={styles.chatScrollArea}>
              <div className={styles.chatColumn}>
                {messages.map(msg => (
                  <div
                    key={msg.id}
                    className={`${styles.msgGroup} ${msg.role === "user" ? styles.msgGroupUser : styles.msgGroupAssistant}`}
                  >
                    {msg.role === "user" ? (
                      <div className={styles.userBubble}>
                        {msg.attachmentNames?.length ? (
                          <div className={styles.msgAttachments}>
                            {msg.attachmentNames.map(name => (
                              <span key={name}>📄 {name}</span>
                            ))}
                          </div>
                        ) : null}
                        <p>{msg.content}</p>
                      </div>
                    ) : (
                      <div className={styles.assistantBlock}>
                        <div className={styles.assistantHeader}>
                          <span className={styles.assistantBadge}>✦ AI 스튜디오</span>
                        </div>
                        <p className={styles.assistantText}>{msg.content}</p>

                        {msg.problems && msg.problems.length > 0 && (
                          <div className={styles.problemCardStack}>
                            {msg.problems.map((prob, pIdx) => {
                              const inExam = examProblems.some(item => item.id === prob.id);
                              const origin =
                                prob.sourceOrigin ||
                                (prob.sourceTokenId ? problemTokenById.get(prob.sourceTokenId) : undefined);
                              return (
                                <article key={prob.id} className={styles.problemCard}>
                                  <div className={styles.problemCardTop}>
                                    <div className={styles.problemMeta}>
                                      <span className={styles.metaBadge}>
                                        고{prob.grade} · {prob.subject}
                                      </span>
                                      <span className={styles.metaPoints}>
                                        {prob.points
                                          ? `${String(prob.points).endsWith("점") ? prob.points : `${prob.points}점`} · `
                                          : ""}
                                        {prob.difficulty}
                                      </span>
                                      <span className={styles.metaSource}>{prob.sourceLabel || prob.title}</span>
                                    </div>
                                    <div className={styles.problemCardBtns}>
                                      {origin && (
                                        <button
                                          type="button"
                                          className={styles.cardSmallBtn}
                                          style={{
                                            background: originCompareId === prob.id ? "#dbeafe" : "#eff6ff",
                                            borderColor: "#93c5fd",
                                            color: "#1d4ed8",
                                            fontWeight: 700,
                                          }}
                                          onClick={() =>
                                            setOriginCompareId(curr => (curr === prob.id ? null : prob.id))
                                          }
                                        >
                                          <BookOpen size={13} />{" "}
                                          {originCompareId === prob.id
                                            ? "원본 기출 1:1 비교 닫기 ▲"
                                            : `원본 기출(${origin.number}번) 1:1 비교 ▼`}
                                        </button>
                                      )}
                                      <button
                                        type="button"
                                        className={styles.cardSmallBtn}
                                        onClick={() => {
                                          if (prob.geoSpec) {
                                            setGeoSpec(prob.geoSpec);
                                            setGeoJsonText(JSON.stringify(prob.geoSpec, null, 2));
                                          }
                                          setTargetProblemId(prob.id);
                                          setCanvasPanel("geometry");
                                        }}
                                      >
                                        <Compass size={13} /> {prob.figure ? "도형 편집" : "도형 작도 추가"}
                                      </button>
                                      <button
                                        type="button"
                                        className={`${styles.cardPrimaryBtn} ${inExam ? styles.cardPrimaryBtnDone : ""}`}
                                        onClick={() => addProblemToExam(prob)}
                                      >
                                        {inExam ? (
                                          <>
                                            <Check size={13} /> 시험지에 담김
                                          </>
                                        ) : (
                                          <>
                                            <Plus size={13} /> 시험지에 담기
                                          </>
                                        )}
                                      </button>
                                    </div>
                                  </div>

                                  {origin && originCompareId === prob.id && (
                                    <div
                                      style={{
                                        marginTop: 10,
                                        marginBottom: 12,
                                        padding: "12px 14px",
                                        borderRadius: 12,
                                        background: "#f8fafc",
                                        border: "1px solid #bfdbfe",
                                        fontSize: 13,
                                      }}
                                    >
                                      <div
                                        style={{
                                          display: "flex",
                                          justifyContent: "space-between",
                                          alignItems: "center",
                                          flexWrap: "wrap",
                                          gap: 8,
                                          marginBottom: 8,
                                          paddingBottom: 8,
                                          borderBottom: "1px dashed #cbd5e1",
                                        }}
                                      >
                                        <div>
                                          <strong style={{ color: "#1e40af", fontSize: 13 }}>
                                            🔗 변형 원본 기출 토큰: {origin.examTitle} {origin.number}번 ({origin.points} ·{" "}
                                            {origin.difficulty})
                                          </strong>
                                          {origin.intent && (
                                            <span
                                              style={{
                                                marginLeft: 8,
                                                fontSize: 11.5,
                                                color: "#475569",
                                                background: "#e2e8f0",
                                                padding: "2px 8px",
                                                borderRadius: 999,
                                              }}
                                            >
                                              출제의도: {origin.intent}
                                            </span>
                                          )}
                                        </div>
                                        <div style={{ display: "flex", gap: 8, fontSize: 12 }}>
                                          {origin.problemPdfUrl && (
                                            <a
                                              href={origin.problemPdfUrl}
                                              target="_blank"
                                              rel="noreferrer"
                                              style={{ color: "#2563eb", fontWeight: 600 }}
                                            >
                                              원본 문제지 PDF ↗
                                            </a>
                                          )}
                                          {origin.explanationPdfUrl && (
                                            <a
                                              href={origin.explanationPdfUrl}
                                              target="_blank"
                                              rel="noreferrer"
                                              style={{ color: "#059669", fontWeight: 600 }}
                                            >
                                              원본 해설지 PDF ↗
                                            </a>
                                          )}
                                        </div>
                                      </div>

                                      <div style={{ display: "grid", gap: 10 }}>
                                        <div
                                          style={{
                                            background: "#ffffff",
                                            padding: "10px 12px",
                                            borderRadius: 8,
                                            border: "1px solid #e2e8f0",
                                          }}
                                        >
                                          <div
                                            style={{
                                              fontSize: 11.5,
                                              fontWeight: 700,
                                              color: "#1d4ed8",
                                              marginBottom: 4,
                                            }}
                                          >
                                            [원본 문제 ({origin.number}번)]
                                          </div>
                                          <div style={{ lineHeight: 1.65 }}>
                                            <TypingMath text={origin.question} />
                                          </div>
                                          {origin.boxContent && (
                                            <div
                                              style={{
                                                marginTop: 6,
                                                padding: "6px 10px",
                                                background: "#f8fafc",
                                                border: "1px solid #cbd5e1",
                                                borderRadius: 6,
                                                fontSize: 12.5,
                                              }}
                                            >
                                              <TypingMath text={origin.boxContent} />
                                            </div>
                                          )}
                                          {origin.choices && origin.choices.length > 0 && (
                                            <div
                                              style={{
                                                display: "flex",
                                                flexWrap: "wrap",
                                                gap: 10,
                                                marginTop: 6,
                                                fontSize: 12.5,
                                                color: "#334155",
                                              }}
                                            >
                                              {origin.choices.map((c, cIdx) => (
                                                <span key={cIdx}>
                                                  {choiceLabels[cIdx] || `(${cIdx + 1})`}{" "}
                                                  <TypingMath text={formatChoiceContent(c)} />
                                                </span>
                                              ))}
                                            </div>
                                          )}
                                        </div>

                                        <div
                                          style={{
                                            background: "#f0fdf4",
                                            padding: "10px 12px",
                                            borderRadius: 8,
                                            border: "1px solid #bbf7d0",
                                          }}
                                        >
                                          <div
                                            style={{
                                              fontSize: 11.5,
                                              fontWeight: 700,
                                              color: "#15803d",
                                              marginBottom: 4,
                                            }}
                                          >
                                            [원본 정답 및 1:1 매칭 해설] · 정답: <TypingMath text={origin.answer} />
                                          </div>
                                          <div style={{ lineHeight: 1.65, fontSize: 12.5, color: "#1e293b" }}>
                                            <TypingMath text={origin.solution} />
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  )}

                                  <div className={styles.problemStem}>
                                    <strong>{pIdx + 1}. </strong>
                                    <TypingMath text={prob.question} />
                                  </div>

                                  {prob.figure && (
                                    <div className={styles.problemFigureWrap}>
                                      <img
                                        src={prob.figure}
                                        alt={`${pIdx + 1}번 문항 수학 도형`}
                                        className={styles.problemFigure}
                                      />
                                    </div>
                                  )}

                                  {prob.boxContent && (
                                    <div className={styles.problemBox}>
                                      <div className={styles.problemBoxTitle}>〈보기〉</div>
                                      <div className={styles.problemBoxBody}>
                                        {formatBoxContent(prob.boxContent)
                                          .split("\n")
                                          .map((line, idx) => (
                                            <div key={idx}>
                                              <TypingMath text={line} />
                                            </div>
                                          ))}
                                      </div>
                                    </div>
                                  )}

                                  {prob.choices?.length > 0 && (
                                    <div className={styles.problemChoices}>
                                      {prob.choices.map((c, idx) => (
                                        <div key={idx} className={styles.problemChoiceItem}>
                                          <span>{choiceLabels[idx] || `(${idx + 1})`}</span>
                                          <TypingMath text={formatChoiceContent(c)} />
                                        </div>
                                      ))}
                                    </div>
                                  )}

                                  {(prob.answer || prob.solution) && (
                                    <div className={styles.problemFooter}>
                                      <button
                                        type="button"
                                        className={styles.solutionToggle}
                                        onClick={() =>
                                          setExpandedId(curr => (curr === prob.id ? null : prob.id))
                                        }
                                      >
                                        {expandedId === prob.id ? "정답 및 해설 접기 ▲" : "정답 및 해설 보기 ▼"}
                                      </button>
                                      {expandedId === prob.id && (
                                        <div className={styles.solutionBox}>
                                          <div>
                                            <strong>정답:</strong> <TypingMath text={prob.answer} />
                                          </div>
                                          <div>
                                            <strong>해설:</strong> <TypingMath text={prob.solution} />
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </article>
                              );
                            })}
                          </div>
                        )}

                        {msg.reportTemplate && (
                          <div className={styles.problemCardStack}>
                            <article className={styles.problemCard}>
                              <div className={styles.problemCardTop}>
                                <div className={styles.problemMeta}>
                                  <span className={styles.metaBadge}>
                                    {msg.reportTemplate.orientation === "landscape" ? "가로형" : "세로형"} ·{" "}
                                    {reportPeriodLabels[msg.reportTemplate.period] || msg.reportTemplate.period}
                                  </span>
                                  <span className={styles.metaPoints}>
                                    {reportThemeLabels[msg.reportTemplate.theme || "unidesk"] || msg.reportTemplate.theme}
                                  </span>
                                  <span className={styles.metaSource}>{msg.reportTemplate.name}</span>
                                </div>
                                <div className={styles.problemCardBtns}>
                                  <button
                                    type="button"
                                    className={styles.cardSmallBtn}
                                    onClick={() => {
                                      setActiveReportTemplate(msg.reportTemplate!);
                                      setCanvasPanel("report");
                                    }}
                                  >
                                    <LayoutTemplate size={13} /> 캔버스에서 미리보기·편집
                                  </button>
                                  <button
                                    type="button"
                                    className={styles.cardPrimaryBtn}
                                    onClick={() => handleApplyTemplateToReportPage(msg.reportTemplate!)}
                                  >
                                    <Check size={13} /> 보고서 페이지에 바로 적용 ↗
                                  </button>
                                </div>
                              </div>
                              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                                {msg.reportTemplate.blocks.map((b, idx) => (
                                  <span
                                    key={b.id || idx}
                                    style={{
                                      fontSize: 12,
                                      padding: "4px 10px",
                                      borderRadius: 999,
                                      background: b.emphasis ? "#eff6ff" : "#f8fafc",
                                      border: b.emphasis ? "1px solid #93c5fd" : "1px solid #e2e8f0",
                                      color: b.emphasis ? "#1d4ed8" : "#334155",
                                      fontWeight: b.emphasis ? 700 : 500,
                                    }}
                                  >
                                    {idx + 1}. {reportKindLabels[b.kind] || b.kind} (
                                    {b.view === "chart" ? "그래프/강조" : b.view === "table" ? "상세 표" : "카드"}
                                    {b.wide ? " · 전체너비" : ""})
                                  </span>
                                ))}
                              </div>
                            </article>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}

                {busy && (
                  <div className={styles.busyIndicator}>
                    <Loader2 size={16} className={styles.spin} />
                    <span>{busyStep || "AI 스튜디오가 응답을 생성하고 있습니다..."}</span>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>
            </div>

            {renderComposer(false)}
          </>
        )}
      </div>

      {/* 3. Right Split Canvas Panel */}
      {canvasPanel !== "none" && (
        <aside className={styles.canvasDrawer} aria-label="스튜디오 보조 캔버스">
          <div className={styles.canvasHeader}>
            <div className={styles.canvasTabs}>
              <button
                type="button"
                className={canvasPanel === "exam" ? styles.canvasTabActive : ""}
                onClick={() => setCanvasPanel("exam")}
              >
                <FileText size={14} /> 시험지 ({examProblems.length})
              </button>
              <button
                type="button"
                className={canvasPanel === "geometry" ? styles.canvasTabActive : ""}
                onClick={() => setCanvasPanel("geometry")}
              >
                <Compass size={14} /> 도형 작도기
              </button>
              <button
                type="button"
                className={canvasPanel === "report" ? styles.canvasTabActive : ""}
                onClick={() => {
                  setMode("report");
                  setCanvasPanel("report");
                }}
              >
                <LayoutTemplate size={14} /> 보고서 템플릿
              </button>
              <button
                type="button"
                className={canvasPanel === "library" ? styles.canvasTabActive : ""}
                onClick={() => setCanvasPanel("library")}
              >
                <FolderOpen size={14} /> 라이브러리
              </button>
            </div>
            <button
              type="button"
              className={styles.iconBtn}
              onClick={() => setCanvasPanel("none")}
              aria-label="캔버스 닫기"
            >
              <X size={17} />
            </button>
          </div>

          {canvasPanel === "exam" && (
            <div className={styles.canvasBody}>
              <div className={styles.examToolbar}>
                <input
                  type="text"
                  className={styles.examTitleInput}
                  value={examTitle}
                  onChange={e => setExamTitle(e.target.value)}
                  placeholder="시험지 제목 입력"
                  aria-label="시험지 제목"
                />
                <div className={styles.examExportRow}>
                  <button
                    type="button"
                    className={styles.exportBtn}
                    disabled={exportBusy !== "" || (examProblems.length === 0 && savedProblems.length === 0)}
                    onClick={() => void handleDownloadExam("hwpx")}
                  >
                    <FileDown size={14} /> 한글 HWPX
                  </button>
                  <button
                    type="button"
                    className={styles.exportBtn}
                    disabled={exportBusy !== "" || (examProblems.length === 0 && savedProblems.length === 0)}
                    onClick={() => void handleDownloadExam("docx")}
                  >
                    <FileDown size={14} /> Word
                  </button>
                  <button
                    type="button"
                    className={styles.exportPrimaryBtn}
                    disabled={examProblems.length === 0 && savedProblems.length === 0}
                    onClick={() =>
                      handleOpenInFullTypingEditor(examProblems.length > 0 ? examProblems : savedProblems.slice(0, 4))
                    }
                  >
                    A4 2단 편집기 열기
                  </button>
                </div>
              </div>

              <div className={styles.examPreviewPaper}>
                <div className={styles.examPaperHeader}>
                  <span>2026학년도 수학 영역</span>
                  <strong>{examTitle}</strong>
                  <span>제1교시</span>
                </div>
                {examProblems.length === 0 ? (
                  <div className={styles.examEmptyState}>
                    <p>채팅창에서 생성하거나 타이핑한 문항의 <strong>[+ 시험지에 담기]</strong> 버튼을 누르면 이곳에 A4 시험지가 구성됩니다.</p>
                    {savedProblems.length > 0 && (
                      <button
                        type="button"
                        className={styles.loadRecentBtn}
                        onClick={() => setExamProblems(savedProblems.slice(0, 4))}
                      >
                        최근 보관함 문항 {Math.min(4, savedProblems.length)}개 자동 불러오기
                      </button>
                    )}
                  </div>
                ) : (
                  <div className={styles.examProblemsList}>
                    {examProblems.map((p, idx) => (
                      <div key={p.id} className={styles.examProblemItem}>
                        <div className={styles.examProblemTop}>
                          <strong>{idx + 1}번</strong>
                          <span>[{p.difficulty}]</span>
                          <button
                            type="button"
                            onClick={() => removeProblemFromExam(p.id)}
                            aria-label="시험지에서 제거"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                        <div className={styles.examProblemText}>
                          <TypingMath text={p.question} />
                        </div>
                        {p.figure && (
                          <img src={p.figure} alt={`${idx + 1}번 도형`} className={styles.examProblemThumb} />
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {canvasPanel === "geometry" && (
            <div className={styles.canvasBody}>
              <div className={styles.geoPresetBar}>
                {MATH_GEO_PRESETS.map((item, idx) => (
                  <button
                    key={item.name}
                    type="button"
                    className={`${styles.geoPresetChip} ${geoPresetIdx === idx ? styles.geoPresetChipActive : ""}`}
                    onClick={() => selectGeoPreset(idx)}
                  >
                    {item.name}
                  </button>
                ))}
              </div>

              <div
                className={styles.geoSvgStage}
                dangerouslySetInnerHTML={{ __html: renderedGeoSvg }}
              />

              <div className={styles.geoActionRow}>
                <button
                  type="button"
                  className={styles.exportPrimaryBtn}
                  onClick={() => void attachCurrentGraphToProblem()}
                >
                  ✦ 이 도형을 문항에 삽입 / 새 문항 생성
                </button>
              </div>

              <div className={styles.geoFormGrid}>
                <label>
                  <span>함수 $f(x)$ 수식 (LaTeX/절댓값 지원)</span>
                  <input value={geoFn1} onChange={e => setGeoFn1(e.target.value)} placeholder="x^3 - 3x + 1 또는 |x^2 - 2|" />
                </label>
                <label>
                  <span>보조함수 $g(x)$ 수식</span>
                  <input value={geoFn2} onChange={e => setGeoFn2(e.target.value)} placeholder="0.5x + 0.5" />
                </label>
                <label>
                  <span>접선 자동 작도 ($x = a$에서의 접선)</span>
                  <input
                    value={geoTangentX}
                    onChange={e => setGeoTangentX(e.target.value)}
                    placeholder="예: 1 (비우면 표시 안 함)"
                  />
                </label>
                <label>
                  <span>적분 색칠 구간 $[a, b]$</span>
                  <div className={styles.inlineInputs}>
                    <input
                      type="checkbox"
                      checked={geoShadeEnabled}
                      onChange={e => setGeoShadeEnabled(e.target.checked)}
                    />
                    <input value={geoShadeFrom} onChange={e => setGeoShadeFrom(e.target.value)} />
                    <span>~</span>
                    <input value={geoShadeTo} onChange={e => setGeoShadeTo(e.target.value)} />
                  </div>
                </label>
                <label>
                  <span>좌표축 범위 ($x, y$)</span>
                  <div className={styles.inlineInputs}>
                    <input value={geoDomainMin} onChange={e => setGeoDomainMin(e.target.value)} />
                    <input value={geoDomainMax} onChange={e => setGeoDomainMax(e.target.value)} />
                    <input value={geoRangeMin} onChange={e => setGeoRangeMin(e.target.value)} />
                    <input value={geoRangeMax} onChange={e => setGeoRangeMax(e.target.value)} />
                  </div>
                </label>
                <div style={{ display: "flex", gap: 12, fontSize: 12, color: "#334155", alignItems: "center" }}>
                  <label style={{ display: "inline-flex", alignItems: "center", gap: 4, flexDirection: "row" }}>
                    <input
                      type="checkbox"
                      checked={geoEqualAspect}
                      onChange={e => setGeoEqualAspect(e.target.checked)}
                    />
                    <span>1:1 등축 비율 (원·직교 유지)</span>
                  </label>
                  <label style={{ display: "inline-flex", alignItems: "center", gap: 4, flexDirection: "row" }}>
                    <input
                      type="checkbox"
                      checked={geoAutoIntersections}
                      onChange={e => setGeoAutoIntersections(e.target.checked)}
                    />
                    <span>교점 자동 탐색·표시</span>
                  </label>
                </div>
                <button type="button" className={styles.exportBtn} onClick={applyQuickFormulaSpec}>
                  수식·작도 그래프 즉시 갱신
                </button>
              </div>

              <details className={styles.geoJsonDetails}>
                <summary>고급 도형 JSON 스펙 (원·다각형·접선·직각기호·점근선)</summary>
                <textarea
                  rows={5}
                  value={geoJsonText}
                  onChange={e => {
                    setGeoJsonText(e.target.value);
                    try {
                      const parsed = JSON.parse(e.target.value) as MathGeoSpec;
                      if (parsed && typeof parsed === "object") setGeoSpec(parsed);
                    } catch {
                      // ignore invalid JSON while typing
                    }
                  }}
                />
              </details>
            </div>
          )}

          {canvasPanel === "library" && (
            <div className={styles.canvasBody}>
              <div className={styles.librarySwitch}>
                <button
                  type="button"
                  className={libraryTab === "tokens" ? styles.libSwitchActive : ""}
                  onClick={() => setLibraryTab("tokens")}
                >
                  기출 문제·해설 토큰 ({allProblemTokens.length})
                </button>
                <button
                  type="button"
                  className={libraryTab === "vault" ? styles.libSwitchActive : ""}
                  onClick={() => setLibraryTab("vault")}
                >
                  우리 학원 문항 ({savedProblems.length})
                </button>
                <button
                  type="button"
                  className={libraryTab === "mock" ? styles.libSwitchActive : ""}
                  onClick={() => setLibraryTab("mock")}
                >
                  시험지 통째 ({catalog.exams.length})
                </button>
              </div>

              {libraryTab === "tokens" ? (
                <div className={styles.mockArchiveList}>
                  <div className={styles.mockFilterRow}>
                    {[1, 2, 3].map(g => (
                      <button
                        key={g}
                        type="button"
                        className={mockGrade === g ? styles.geoPresetChipActive : styles.geoPresetChip}
                        onClick={() => setMockGrade(g as 1 | 2 | 3)}
                      >
                        고{g}
                      </button>
                    ))}
                    <input
                      type="search"
                      value={mockSearch}
                      onChange={e => setMockSearch(e.target.value)}
                      placeholder="문항번호(예: 30번)·단원·수식·해설 검색..."
                    />
                  </div>
                  <div className={styles.vaultList}>
                    {filteredTokens.length === 0 ? (
                      <p className={styles.examEmptyState}>조건에 맞는 기출 문제·해설 토큰이 없습니다.</p>
                    ) : (
                      filteredTokens.map(token => {
                        const isExpanded = expandedTokenId === token.id;
                        return (
                          <div key={token.id} className={styles.vaultCard}>
                            <div className={styles.vaultCardHeader}>
                              <span>
                                <strong>
                                  {token.year}.{String(token.month).padStart(2, "0")} 고{token.grade} ·{" "}
                                  {token.subject} {token.number}번
                                </strong>{" "}
                                [{token.points} · {token.difficulty}]
                              </span>
                              <div className={styles.vaultCardActions}>
                                {token.problemPdfUrl && (
                                  <a
                                    href={token.problemPdfUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    style={{ fontSize: 11.5, color: "#2563eb" }}
                                  >
                                    문제PDF↗
                                  </a>
                                )}
                                {token.explanationPdfUrl && (
                                  <a
                                    href={token.explanationPdfUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    style={{ fontSize: 11.5, color: "#059669" }}
                                  >
                                    해설PDF↗
                                  </a>
                                )}
                              </div>
                            </div>
                            {token.intent && (
                              <div style={{ fontSize: 11.5, color: "#475569", marginBottom: 4 }}>
                                🎯 출제의도: {token.intent}
                              </div>
                            )}
                            <div className={styles.vaultCardQuestion} style={{ fontSize: 13, lineHeight: 1.6 }}>
                              <TypingMath text={token.question} />
                            </div>
                            {token.boxContent && (
                              <div
                                style={{
                                  marginTop: 6,
                                  padding: "6px 10px",
                                  background: "#f8fafc",
                                  border: "1px solid #cbd5e1",
                                  borderRadius: 6,
                                  fontSize: 12,
                                }}
                              >
                                <TypingMath text={token.boxContent} />
                              </div>
                            )}
                            {token.choices && token.choices.length > 0 && (
                              <div
                                style={{
                                  display: "flex",
                                  flexWrap: "wrap",
                                  gap: 8,
                                  marginTop: 6,
                                  fontSize: 12,
                                  color: "#334155",
                                }}
                              >
                                {token.choices.map((c, idx) => (
                                  <span key={idx}>
                                    {choiceLabels[idx] || `(${idx + 1})`}{" "}
                                    <TypingMath text={formatChoiceContent(c)} />
                                  </span>
                                ))}
                              </div>
                            )}

                            <div style={{ marginTop: 8 }}>
                              <button
                                type="button"
                                className={styles.solutionToggle}
                                onClick={() => setExpandedTokenId(curr => (curr === token.id ? null : token.id))}
                              >
                                {isExpanded
                                  ? "원본 1:1 매칭 정답·해설 접기 ▲"
                                  : `원본 1:1 매칭 정답(${token.answer}) 및 해설 보기 ▼`}
                              </button>
                              {isExpanded && (
                                <div className={styles.solutionBox} style={{ marginTop: 6 }}>
                                  <div>
                                    <strong>정답:</strong> <TypingMath text={token.answer} />
                                  </div>
                                  <div style={{ marginTop: 4 }}>
                                    <strong>원본 해설:</strong> <TypingMath text={token.solution} />
                                  </div>
                                </div>
                              )}
                            </div>

                            <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                              <button
                                type="button"
                                className={styles.mockSpawnBtn}
                                style={{ flex: 1, marginTop: 0 }}
                                onClick={() => {
                                  setGrade((token.grade as 1 | 2 | 3) || 3);
                                  setSubject(token.subject);
                                  setDifficulty(token.difficulty);
                                  void handleSend(
                                    `${token.examTitle} ${token.number}번 (${token.difficulty}·${token.points}, 출제의도: ${token.intent || token.subject}) 원본 기출 토큰을 1:1로 참조하여 동일한 추론 구조와 난이도의 쌍둥이 변형 문제를 출제해줘`,
                                    "generate",
                                    token.id
                                  );
                                }}
                              >
                                ✦ 이 문제 1:1 쌍둥이 변형 출제
                              </button>
                              <button
                                type="button"
                                className={styles.exportBtn}
                                onClick={() => addTokenToExam(token)}
                              >
                                + 원본 시험지 담기
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              ) : libraryTab === "vault" ? (
                <div className={styles.vaultList}>
                  {savedProblems.length === 0 ? (
                    <p className={styles.examEmptyState}>아직 저장된 문항이 없습니다.</p>
                  ) : (
                    savedProblems.map(item => (
                      <div key={item.id} className={styles.vaultCard}>
                        <div className={styles.vaultCardHeader}>
                          <span>
                            고{item.grade} · {item.subject} · {item.difficulty}
                          </span>
                          <div className={styles.vaultCardActions}>
                            <button type="button" onClick={() => addProblemToExam(item)}>
                              + 시험지 담기
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDeleteSavedProblem(item.id)}
                              aria-label="삭제"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                        <div className={styles.vaultCardQuestion}>
                          <TypingMath text={item.question} />
                        </div>
                        {item.figure && <img src={item.figure} alt="도형" className={styles.examProblemThumb} />}
                      </div>
                    ))
                  )}
                </div>
              ) : (
                <div className={styles.mockArchiveList}>
                  <div className={styles.mockFilterRow}>
                    {[1, 2, 3].map(g => (
                      <button
                        key={g}
                        type="button"
                        className={mockGrade === g ? styles.geoPresetChipActive : styles.geoPresetChip}
                        onClick={() => setMockGrade(g as 1 | 2 | 3)}
                      >
                        고{g}
                      </button>
                    ))}
                    <input
                      type="search"
                      value={mockSearch}
                      onChange={e => setMockSearch(e.target.value)}
                      placeholder="연도·과목·시험명 검색..."
                    />
                  </div>
                  <div className={styles.vaultList}>
                    {filteredMocks.map(exam => {
                      const problemPdf = exam.resources.find(r => r.kind === "problem" && (r.url || r.localPath));
                      const problemHref = problemPdf?.url || problemPdf?.localPath;
                      return (
                        <div key={exam.id} className={styles.vaultCard}>
                          <div className={styles.vaultCardHeader}>
                            <span>
                              {exam.year}년 {exam.month}월 · 고{exam.grade} {exam.subject}
                            </span>
                            {problemHref && (
                              <a href={problemHref} target="_blank" rel="noreferrer">
                                원본 PDF ↗
                              </a>
                            )}
                          </div>
                          <strong className={styles.mockExamTitle}>{exam.title}</strong>
                          <button
                            type="button"
                            className={styles.mockSpawnBtn}
                            onClick={() => {
                              setGrade(exam.grade as 1 | 2 | 3);
                              setSubject(exam.subject);
                              void handleSend(
                                `${exam.year}년 ${exam.month}월 고${exam.grade} ${exam.subject} (${exam.title}) 기출 스타일의 핵심 4점 변형 문제를 출제해줘`,
                                "generate"
                              );
                            }}
                          >
                            ✦ 이 모의고사 스타일로 AI 변형 문제 출제
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {canvasPanel === "report" && (
            <div className={styles.canvasBody}>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {[
                    "성적 향상 그래프가 돋보이는 월간 성취도 리포트 템플릿 짜줘",
                    "일일 출결·숙제·오답 중심 하늘색 체크리스트 템플릿 만들어줘",
                    "오답 분석표와 단원 진도율 중심 가로형 주간 인포그래픽 템플릿으로 설계해줘",
                  ].map(preset => (
                    <button
                      key={preset}
                      type="button"
                      className={styles.geoPresetChip}
                      disabled={busy}
                      onClick={() => {
                        setMode("report");
                        void handleSend(preset, "report");
                      }}
                    >
                      ✦ {preset}
                    </button>
                  ))}
                </div>

                <div className={styles.geoFormGrid}>
                  <label>
                    <span>템플릿 이름</span>
                    <input
                      value={activeReportTemplate.name}
                      maxLength={40}
                      onChange={e =>
                        setActiveReportTemplate(prev => ({
                          ...prev,
                          name: e.target.value,
                        }))
                      }
                      placeholder="예: 고2 심화반 월간 리포트"
                    />
                  </label>
                  <label>
                    <span>방향 / 기본 주기</span>
                    <div className={styles.inlineInputs}>
                      <select
                        value={activeReportTemplate.orientation}
                        onChange={e =>
                          setActiveReportTemplate(prev => ({
                            ...prev,
                            orientation: e.target.value as "portrait" | "landscape",
                          }))
                        }
                        style={{ flex: 1, height: 32, borderRadius: 8, border: "1px solid #cbd5e1", padding: "0 8px", fontSize: 12.5 }}
                      >
                        <option value="portrait">세로형 (A4)</option>
                        <option value="landscape">가로형 (와이드)</option>
                      </select>
                      <select
                        value={activeReportTemplate.period}
                        onChange={e =>
                          setActiveReportTemplate(prev => ({
                            ...prev,
                            period: e.target.value as ReportPeriod,
                          }))
                        }
                        style={{ flex: 1, height: 32, borderRadius: 8, border: "1px solid #cbd5e1", padding: "0 8px", fontSize: 12.5 }}
                      >
                        {Object.entries(reportPeriodLabels).map(([k, label]) => (
                          <option key={k} value={k}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </label>
                  <label>
                    <span>디자인 테마</span>
                    <select
                      value={activeReportTemplate.theme ?? "unidesk"}
                      onChange={e =>
                        setActiveReportTemplate(prev => ({
                          ...prev,
                          theme: e.target.value as ReportTheme,
                        }))
                      }
                      style={{ height: 32, borderRadius: 8, border: "1px solid #cbd5e1", padding: "0 8px", fontSize: 12.5 }}
                    >
                      {Object.entries(reportThemeLabels).map(([k, label]) => (
                        <option key={k} value={k}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className={styles.examExportRow}>
                  <button
                    type="button"
                    className={styles.exportBtn}
                    onClick={() => handleSaveCurrentReportTemplate()}
                  >
                    <Check size={14} /> 내 템플릿 보관함에 저장
                  </button>
                  <button
                    type="button"
                    className={styles.exportPrimaryBtn}
                    onClick={() => handleApplyTemplateToReportPage()}
                  >
                    보고서 페이지에서 바로 열기 ↗
                  </button>
                </div>

                {templateSaveMsg && (
                  <small style={{ color: "#059669", fontWeight: 700, fontSize: 12 }}>✓ {templateSaveMsg}</small>
                )}

                {/* Live Scaled Report Preview */}
                <div
                  style={{
                    background: "#f1f5f9",
                    border: "1px solid #e2e8f0",
                    borderRadius: 12,
                    padding: 12,
                    overflow: "auto",
                    maxHeight: 420,
                    display: "flex",
                    justifyContent: "center",
                  }}
                >
                  <div
                    data-active="true"
                    data-orientation={activeReportTemplate.orientation}
                    style={
                      {
                        "--report-width": `${activeReportTemplate.orientation === "landscape" ? 1123 : 794}px`,
                        "--report-height": `${activeReportTemplate.orientation === "landscape" ? 794 : 1123}px`,
                        "--preview-scale": activeReportTemplate.orientation === "landscape" ? 0.34 : 0.44,
                        width: (activeReportTemplate.orientation === "landscape" ? 1123 : 794) * (activeReportTemplate.orientation === "landscape" ? 0.34 : 0.44),
                      } as React.CSSProperties
                    }
                  >
                    <ReportSheets preview={STUDIO_REPORT_SAMPLE_PREVIEW} template={activeReportTemplate} />
                  </div>
                </div>

                {/* Saved AI Templates */}
                <div style={{ marginTop: 6 }}>
                  <strong style={{ fontSize: 12.5, color: "#334155", display: "block", marginBottom: 6 }}>
                    저장된 AI 보고서 템플릿 ({savedReportTemplates.length})
                  </strong>
                  {savedReportTemplates.length === 0 ? (
                    <p style={{ fontSize: 12, color: "#64748b", margin: 0 }}>
                      채팅창에서 원하는 보고서 구성을 지시하면 AI가 템플릿을 설계해 이곳에 보관합니다.
                    </p>
                  ) : (
                    <div className={styles.vaultList}>
                      {savedReportTemplates.map(tpl => (
                        <div key={tpl.id} className={styles.vaultCard}>
                          <div className={styles.vaultCardHeader}>
                            <span>
                              {tpl.orientation === "landscape" ? "가로형" : "세로형"} ·{" "}
                              {reportThemeLabels[tpl.theme || "unidesk"] || tpl.theme}
                            </span>
                            <div className={styles.vaultCardActions}>
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveReportTemplate(tpl);
                                  saveActiveAiReportTemplate(tpl);
                                }}
                              >
                                미리보기
                              </button>
                              <button type="button" onClick={() => handleApplyTemplateToReportPage(tpl)}>
                                적용 ↗
                              </button>
                              <button
                                type="button"
                                onClick={() => setSavedReportTemplates(deleteAiReportTemplate(tpl.id))}
                                aria-label="템플릿 삭제"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </div>
                          <strong style={{ fontSize: 13, color: "#0f172a" }}>{tpl.name}</strong>
                          <small style={{ fontSize: 11.5, color: "#64748b", display: "block", marginTop: 2 }}>
                            {tpl.blocks.map(b => reportKindLabels[b.kind as ReportKind] || b.kind).join(" · ")}
                          </small>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </aside>
      )}
    </section>
  );
}

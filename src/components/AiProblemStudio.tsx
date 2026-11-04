"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef, useState } from "react";
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
import {
  deleteGeneratedProblem,
  loadGeneratedProblems,
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
import { readSource, type SourcePage } from "../lib/typing-upload";
import { buildDocx, buildHwpx, downloadBlob, prepareExportDocument } from "../lib/typing-export";
import {
  MATH_GEO_PRESETS,
  renderMathGeoPngDataUrl,
  renderMathGeoSvg,
  type MathGeoSpec,
} from "../lib/math-geometry-engine";
import catalogData from "../data/mock-exams.json";
import type { MockExamCatalog } from "../types/mock-exam";
import styles from "./AiProblemStudio.module.css";

type StudioMode = "default" | "generate" | "typing" | "geometry";
type CanvasPanel = "none" | "exam" | "geometry" | "library";

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

interface StudioChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  mode?: StudioMode;
  problems?: GeneratedMathProblem[];
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

  // Sidebar & Canvas state
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [canvasPanel, setCanvasPanel] = useState<CanvasPanel>("none");
  const [libraryTab, setLibraryTab] = useState<"vault" | "mock">("vault");

  // Chat threads & messages
  const [threads, setThreads] = useState<StudioChatThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string>("");
  const [messages, setMessages] = useState<StudioChatMessage[]>([]);

  // Composer state
  const [mode, setMode] = useState<StudioMode>("default");
  const [modeMenuOpen, setModeMenuOpen] = useState(false);
  const modeMenuRef = useRef<HTMLDivElement>(null);
  const [grade, setGrade] = useState<1 | 2 | 3>(2);
  const [subject, setSubject] = useState("수학I");
  const [difficulty] = useState<"하" | "중" | "상" | "킬러">("상");
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [busyStep, setBusyStep] = useState("");
  const [quota, setQuota] = useState<AiQuotaSnapshot | null>(null);

  // Saved problems & Active Exam Paper
  const [savedProblems, setSavedProblems] = useState<GeneratedMathProblem[]>([]);
  const [examTitle, setExamTitle] = useState("2026 수학 실전 모의고사");
  const [examProblems, setExamProblems] = useState<GeneratedMathProblem[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [exportBusy, setExportBusy] = useState("");

  // OCR Attachments
  const [sources, setSources] = useState<SourcePage[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // AlgeoMath / GeoGebra Plotter state
  const [geoPresetIdx, setGeoPresetIdx] = useState<number>(0);
  const [geoSpec, setGeoSpec] = useState<MathGeoSpec>(() => MATH_GEO_PRESETS[0].spec);
  const [geoFn1, setGeoFn1] = useState("0.25*x^3 - 0.75*x + 1");
  const [geoFn1Label, setGeoFn1Label] = useState("y=f(x)");
  const [geoFn2, setGeoFn2] = useState("0.5*x + 0.5");
  const [geoFn2Label, setGeoFn2Label] = useState("y=g(x)");
  const [geoShadeFrom, setGeoShadeFrom] = useState("-1");
  const [geoShadeTo, setGeoShadeTo] = useState("2");
  const [geoShadeEnabled, setGeoShadeEnabled] = useState(true);
  const [geoDomainMin, setGeoDomainMin] = useState("-3");
  const [geoDomainMax, setGeoDomainMax] = useState("3.5");
  const [geoRangeMin, setGeoRangeMin] = useState("-1.5");
  const [geoRangeMax, setGeoRangeMax] = useState("4");
  const [geoJsonText, setGeoJsonText] = useState(() => JSON.stringify(MATH_GEO_PRESETS[0].spec, null, 2));
  const [targetProblemId, setTargetProblemId] = useState<string>("latest");

  // Mock Exam Archive filter state
  const [mockGrade, setMockGrade] = useState<1 | 2 | 3>(3);
  const [mockSearch, setMockSearch] = useState("");

  const threadsKey = `cosmath:ai-studio:threads:${workspace?.id || "local"}`;
  const examDraftKey = `cosmath:typing:${workspace?.id}:${user?.id}`;

  useEffect(() => {
    void loadGeneratedProblems().then(setSavedProblems);
    void fetchAiQuotaStatus().then(setQuota);
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
    setGeoDomainMin(String(preset.spec.xRange?.[0] ?? -4));
    setGeoDomainMax(String(preset.spec.xRange?.[1] ?? 4));
    setGeoRangeMin(String(preset.spec.yRange?.[0] ?? -3));
    setGeoRangeMax(String(preset.spec.yRange?.[1] ?? 4));
    if (preset.spec.functions?.[0]) {
      setGeoFn1(preset.spec.functions[0].expr);
      setGeoFn1Label(preset.spec.functions[0].label || "y=f(x)");
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
      xRange: [Number(geoDomainMin) || -4, Number(geoDomainMax) || 4],
      yRange: [Number(geoRangeMin) || -3, Number(geoRangeMax) || 4],
      functions,
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
      const extractedInputs: Omit<GeneratedMathProblem, "id" | "createdAt">[] = [];
      for (let i = 0; i < sources.length; i++) {
        const page = sources[i];
        setBusyStep(`시험지 페이지 OCR 수식·문항 인식 중 (${i + 1}/${sources.length}: ${page.name})...`);
        const base64 = page.image.includes(",") ? page.image.split(",")[1] : page.image;
        const res = await fetch("/api/typing/extract", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image: base64, mimeType: "image/jpeg" }),
        });
        const data = await res.json();
        if (res.ok && Array.isArray(data.problems)) {
          const normalized = normalizeProblems(data.problems);
          for (const p of normalized) {
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
            ? `첨부하신 시험지(${sources.length}쪽)에서 총 **${savedList.length}문항**을 추출해 시험지 캔버스와 라이브러리에 담았습니다. 우측 **시험지 캔버스**에서 바로 한글(HWPX)·Word로 내려받거나 변형 문제를 요청해 보세요.`
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

  async function handleSend(customPrompt?: string, forcedMode?: StudioMode) {
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
      activeMode === "geometry"
        ? "알지오매스/지오지브라 수식 좌표계와 도형을 작도하는 중..."
        : activeMode === "typing"
          ? "문항 수식(LaTeX)과 레이아웃을 구성하는 중..."
          : activeMode === "generate"
            ? "모의고사·EBS 출제 원리와 함수·기하 그래프를 설계하는 중..."
            : "AI가 답변을 준비하고 있습니다..."
    );

    const enrichedPrompt =
      activeMode === "geometry"
        ? `[알지오매스/지오지브라 도형 작도 및 문항 출제 요청 | 고${grade} ${subject}] ${text}. 반드시 geoSpec(함수 그래프, 적분 색칠 영역, 주요 좌표점과 수선의 발 점선, 원/다각형 등)을 정교하게 포함하여 문항을 생성해줘.`
        : activeMode === "typing"
          ? `[시험지 타이핑 및 문항 정밀 편집 요청 | 고${grade} ${subject}] ${text}. 시험지에 바로 넣을 수 있도록 깔끔한 LaTeX 수식과 5지선다, 필요한 경우 geoSpec 도형을 포함해 문항을 만들어줘.`
          : activeMode === "generate"
            ? `[고${grade} ${subject} / 난이도 ${difficulty} 문제 제작 요청] ${text}. 함수 그래프나 기하 도형이 어울리는 문항이라면 반드시 geoSpec(알지오매스/지오지브라 작도 스펙)을 함께 출력해줘.`
            : text;

    try {
      const response = await sendAiCopilotMessage({
        prompt: enrichedPrompt,
        mode: activeMode === "typing" ? "typing" : activeMode === "default" ? "general" : "problem_studio",
        pathname: "/ai-studio",
        history: messages.slice(-8).map(m => ({ role: m.role, content: m.content })),
      });

      const createdProblems: GeneratedMathProblem[] = [];
      for (const action of response.actions as AiCopilotAction[]) {
        if (action.type === "generate_problems" && action.problems?.length) {
          for (const p of action.problems) {
            if (p.geoSpec) {
              setGeoSpec(p.geoSpec);
              setGeoJsonText(JSON.stringify(p.geoSpec, null, 2));
            }
          }
        }
      }

      const latestVault = await loadGeneratedProblems();
      setSavedProblems(latestVault);
      // Pick the newly generated problems from this turn
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

  function addProblemToExam(problem: GeneratedMathProblem) {
    setExamProblems(prev => {
      if (prev.some(p => p.id === problem.id)) return prev;
      return [...prev, problem];
    });
    setCanvasPanel("exam");
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

  const filteredThreads = threads.filter(t =>
    !searchQuery.trim() ? true : t.title.toLowerCase().includes(searchQuery.trim().toLowerCase())
  );

  const filteredMocks = catalog.exams
    .filter(exam => exam.grade === mockGrade)
    .filter(exam =>
      !mockSearch.trim()
        ? true
        : `${exam.title} ${exam.subject} ${exam.year}`.toLowerCase().includes(mockSearch.trim().toLowerCase())
    )
    .slice(0, 25);

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
            mode === "typing"
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
              onClick={() => setCanvasPanel(c => (c === "library" ? "none" : "library"))}
            >
              <BookOpen size={17} />
              <span>라이브러리 ({savedProblems.length})</span>
            </button>
            <button
              type="button"
              className={`${styles.navItem} ${canvasPanel === "exam" ? styles.navItemActive : ""}`}
              onClick={() => setCanvasPanel(c => (c === "exam" ? "none" : "exam"))}
            >
              <FileText size={17} />
              <span>시험지 캔버스 ({examProblems.length})</span>
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
                              return (
                                <article key={prob.id} className={styles.problemCard}>
                                  <div className={styles.problemCardTop}>
                                    <div className={styles.problemMeta}>
                                      <span className={styles.metaBadge}>
                                        고{prob.grade} · {prob.subject}
                                      </span>
                                      <span className={styles.metaPoints}>{prob.difficulty}</span>
                                      <span className={styles.metaSource}>{prob.sourceLabel || prob.title}</span>
                                    </div>
                                    <div className={styles.problemCardBtns}>
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
                dangerouslySetInnerHTML={{ __html: renderMathGeoSvg(geoSpec) }}
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
                  <span>함수 $f(x)$ 수식</span>
                  <input value={geoFn1} onChange={e => setGeoFn1(e.target.value)} placeholder="0.25*x^3 - 0.75*x + 1" />
                </label>
                <label>
                  <span>보조함수 $g(x)$ 수식</span>
                  <input value={geoFn2} onChange={e => setGeoFn2(e.target.value)} placeholder="0.5*x + 0.5" />
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
                <button type="button" className={styles.exportBtn} onClick={applyQuickFormulaSpec}>
                  수식 그래프 즉시 갱신
                </button>
              </div>

              <details className={styles.geoJsonDetails}>
                <summary>고급 도형 JSON 스펙 (원·다각형·수선의 발 좌표)</summary>
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
                  모의고사 기출 ({catalog.exams.length})
                </button>
              </div>

              {libraryTab === "vault" ? (
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
                      const problemPdf = exam.resources.find(r => r.kind === "problem" && r.localPath);
                      return (
                        <div key={exam.id} className={styles.vaultCard}>
                          <div className={styles.vaultCardHeader}>
                            <span>
                              {exam.year}년 {exam.month}월 · 고{exam.grade} {exam.subject}
                            </span>
                            {problemPdf?.localPath && (
                              <a href={problemPdf.localPath} target="_blank" rel="noreferrer">
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
                                `${exam.year}년 ${exam.month}월 고${exam.grade} ${exam.subject} (${exam.title}) 기출 스타일의 핵심 4점 변형 문제를 함수/기하 도형(geoSpec)과 함께 출제해줘`,
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
        </aside>
      )}
    </section>
  );
}

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
  Loader2,
  MessageSquare,
  Palette,
  PanelLeft,
  PanelLeftClose,
  Plus,
  Printer,
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
  DEFAULT_EXAM_PAPER_STYLE,
  deleteGeneratedProblem,
  loadAiExamStyle,
  loadGeneratedProblems,
  saveAiExamStyle,
  saveGeneratedProblems,
  sendAiCopilotMessage,
  type AiCopilotAction,
  type ExamPaperStyle,
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
  classifyMathProblemMeta,
  inferMathGeoSpecFromProblem,
  problemNeedsDiagram,
  renderMathGeoPngDataUrl,
  renderMathGeoSvg,
  type MathGeoSpec,
} from "../lib/math-geometry-engine";
import catalogData from "../data/mock-exams.json";
import mockProblemStoreData from "../data/mock-exam-problems.json";
import type { MockExamCatalog, MockExamProblemStore, MockExamProblemToken } from "../types/mock-exam";
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
  geoSpec?: MathGeoSpec;
  attachmentNames?: string[];
  modelUsed?: string;
  webSearchSources?: Array<{ title: string; url: string }>;
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
  const [difficulty, setDifficulty] = useState<"하" | "중" | "상" | "킬러">("상");
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [busyStep, setBusyStep] = useState("");
  const [quota, setQuota] = useState<AiQuotaSnapshot | null>(null);

  // Saved problems & Active Exam Paper
  const [savedProblems, setSavedProblems] = useState<GeneratedMathProblem[]>([]);
  const [examTitle, setExamTitle] = useState("2026 수학 실전 모의고사");
  const [examProblems, setExamProblems] = useState<GeneratedMathProblem[]>([]);
  const [examStyle, setExamStyle] = useState<ExamPaperStyle>(() => DEFAULT_EXAM_PAPER_STYLE);
  const [examStyleChatInput, setExamStyleChatInput] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [originCompareId, setOriginCompareId] = useState<string | null>(null);
  const [expandedTokenId, setExpandedTokenId] = useState<string | null>(null);
  const [exportBusy, setExportBusy] = useState("");

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
  const [geoChatInput, setGeoChatInput] = useState("");
  const [geoChatHistory, setGeoChatHistory] = useState<Array<{ id: string; role: "user" | "assistant"; text: string }>>([
    {
      id: "geo-welcome",
      role: "assistant",
      text: "원하시는 함수 그래프나 기하 도형을 채팅으로 말씀해 주세요! (예: '삼차함수 y=x^3-3x+1과 x=1에서의 접선 그려줘', '-1부터 2까지 적분 영역 색칠해줘', '원 O와 내접하는 삼각형 ABC 작도해줘')",
    },
  ]);

  // Mock Exam Archive & Token Library filter state
  const [mockGrade, setMockGrade] = useState<1 | 2 | 3>(3);
  const [mockSearch, setMockSearch] = useState("");

  const threadsKey = `cosmath:ai-studio:threads:${workspace?.id || "local"}`;
  const examDraftKey = `cosmath:typing:${workspace?.id}:${user?.id}`;

  useEffect(() => {
    void loadGeneratedProblems().then(setSavedProblems);
    void fetchAiQuotaStatus().then(setQuota);
    const loadedStyle = loadAiExamStyle();
    setExamStyle(loadedStyle);
    if (loadedStyle.title) {
      setExamTitle(loadedStyle.title);
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
    const onGeoUpdated = (e: Event) => {
      const nextSpec = (e as CustomEvent<MathGeoSpec>).detail;
      if (!nextSpec) return;
      syncGeoControlsFromSpec(nextSpec);
      setCanvasPanel("geometry");
    };
    const onExamStyleUpdated = (e: Event) => {
      const nextStyle = (e as CustomEvent<ExamPaperStyle>).detail;
      if (!nextStyle) return;
      setExamStyle(nextStyle);
      if (nextStyle.title) {
        setExamTitle(nextStyle.title);
      }
      setCanvasPanel("exam");
    };
    window.addEventListener("cosmath-ai-geospec-updated", onGeoUpdated);
    window.addEventListener("cosmath-ai-exam-style-updated", onExamStyleUpdated);
    return () => {
      window.removeEventListener("cosmath-ai-geospec-updated", onGeoUpdated);
      window.removeEventListener("cosmath-ai-exam-style-updated", onExamStyleUpdated);
    };
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

  function syncGeoControlsFromSpec(spec: MathGeoSpec) {
    setGeoSpec(spec);
    setGeoJsonText(JSON.stringify(spec, null, 2));
    setGeoEqualAspect(Boolean(spec.equalAspect));
    setGeoAutoIntersections(Boolean(spec.autoIntersections));
    setGeoTangentX(spec.tangents?.[0] ? String(spec.tangents[0].atX) : "");
    setGeoDomainMin(String(spec.xRange?.[0] ?? -4));
    setGeoDomainMax(String(spec.xRange?.[1] ?? 4));
    setGeoRangeMin(String(spec.yRange?.[0] ?? -3));
    setGeoRangeMax(String(spec.yRange?.[1] ?? 4));
    if (spec.functions?.[0]) {
      setGeoFn1(spec.functions[0].expr);
      setGeoFn1Label(spec.functions[0].label || "y=f(x)");
    } else {
      setGeoFn1("");
      setGeoFn1Label("");
    }
    if (spec.functions?.[1]) {
      setGeoFn2(spec.functions[1].expr);
      setGeoFn2Label(spec.functions[1].label || "y=g(x)");
    } else {
      setGeoFn2("");
      setGeoFn2Label("");
    }
    if (spec.shadedRegions?.[0]) {
      setGeoShadeEnabled(true);
      setGeoShadeFrom(String(spec.shadedRegions[0].from));
      setGeoShadeTo(String(spec.shadedRegions[0].to));
    } else {
      setGeoShadeEnabled(false);
    }
  }

  function selectGeoPreset(index: number) {
    const preset = MATH_GEO_PRESETS[index];
    if (!preset) return;
    setGeoPresetIdx(index);
    syncGeoControlsFromSpec(preset.spec);
  }

  async function handleGenerateDiagramForProblem(prob: GeneratedMathProblem) {
    const nextSpec = inferMathGeoSpecFromProblem(prob.question, prob.boxContent, prob.choices, null);
    syncGeoControlsFromSpec(nextSpec);
    setTargetProblemId(prob.id);
    setCanvasPanel("geometry");

    try {
      const pngUrl = await renderMathGeoPngDataUrl(nextSpec);
      const updated: GeneratedMathProblem = { ...prob, geoSpec: nextSpec, figure: pngUrl };
      setMessages(prev => {
        const next = prev.map(m => ({
          ...m,
          problems: m.problems?.map(p => (p.id === prob.id ? updated : p)),
        }));
        persistThread(next);
        return next;
      });
      setExamProblems(prev => prev.map(p => (p.id === prob.id ? updated : p)));
      await saveGeneratedProblems([updated]);
      setSavedProblems(await loadGeneratedProblems());
    } catch {
      // ignore render error
    }
  }

  function formatProblemBadge(probGrade: number, probSubject: string, probUnit?: string) {
    if (/^(초|중|고)/.test(probSubject.trim())) {
      return probUnit && probUnit !== "시험지 타이핑 추출" && probUnit !== "문항 분석"
        ? `${probSubject} · ${probUnit}`
        : probSubject;
    }
    return `고${probGrade} · ${probSubject}`;
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
            const meta = classifyMathProblemMeta(p.question, p.boxContent, p.choices, grade, subject);
            let figure: string | undefined;
            let inferredGeoSpec: MathGeoSpec | undefined;

            const shouldGenerateDiagram = problemNeedsDiagram(
              p.question,
              p.boxContent,
              p.choices,
              Boolean(p.figureBox)
            );

            if (shouldGenerateDiagram) {
              try {
                inferredGeoSpec = inferMathGeoSpecFromProblem(p.question, p.boxContent, p.choices);
                figure = await renderMathGeoPngDataUrl(inferredGeoSpec);
              } catch {
                // fallback to crop if vector rendering fails
                if (p.figureBox) {
                  try {
                    figure = await cropFigure(page.image, paddedFigureBox(p.figureBox));
                  } catch {
                    // ignore
                  }
                }
              }
            }

            extractedInputs.push({
              title: `${page.name} ${p.number}번`,
              grade: meta.grade,
              subject: meta.subject,
              unit: meta.unit,
              difficulty: meta.difficulty,
              sourceLabel: page.name,
              question: p.question,
              boxContent: p.boxContent,
              choices: p.choices,
              figure,
              geoSpec: inferredGeoSpec,
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
    const text = (customPrompt ?? prompt).trim();

    // If exam paper PDF/images are attached and the user isn't asking to generate a variant from the single image, automatically run OCR typing extraction
    if (sources.length > 0 && !customPrompt && (!text || /타이핑|추출|스캔|인식|변환/.test(text) || sources.length > 1)) {
      setPrompt("");
      await handleExtractSourcesInChat(text || undefined);
      return;
    }

    if (!text && sources.length === 0) return;
    if (busy) return;
    if (!customPrompt) setPrompt("");

    const isGeoIntent =
      forcedMode === "geometry" ||
      (/작도|그려|그래프|도형|접선|적분\s*영역|색칠|외접원|내접원|삼각형|부채꼴/.test(text) &&
        !/문제\s*출제|문항\s*출제|시험지\s*스타일/.test(text));
    const isProbIntent =
      forcedMode === "generate" ||
      Boolean(sourceTokenId) ||
      /문제|문항|출제|변형|쌍둥이|유사|모의고사|킬러|4점|3점|내신|기출/.test(text);
    const isStyleIntent =
      /시험지\s*스타일|레이아웃|1단|2단|3단|풀이\s*여백|워터마크|정답표|해설지\s*포함|명조체|고딕체/.test(text);

    const detectedMode: StudioMode =
      forcedMode || (isGeoIntent ? "geometry" : isProbIntent ? "generate" : "default");

    const userMsg: StudioChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content: text || `${sources.map(s => s.name).join(", ")} 이미지 기반 문항 분석·출제`,
      mode: detectedMode,
      attachmentNames: sources.length ? sources.map(s => s.name) : undefined,
      createdAt: new Date().toISOString(),
    };
    const nextWithUser = [...messages, userMsg];
    setMessages(nextWithUser);
    setBusy(true);
    setBusyStep(
      isGeoIntent
        ? "알지오매스/지오지브라 1:1 등축 좌표계와 도형을 작도하는 중..."
        : isProbIntent
          ? `기출 1:1 매칭 토큰 참조 및 고${grade} ${subject} (${difficulty}) 쌍둥이 변형 설계 중...`
          : isStyleIntent
            ? "시험지 레이아웃과 디자인 스타일을 실시간 변경하는 중..."
            : "AI가 요청을 통합 분석하여 답변을 준비하고 있습니다..."
    );

    const firstSource = sources[0];
    if (sources.length > 0) setSources([]);

    try {
      const response = await sendAiCopilotMessage({
        prompt: text,
        mode: forcedMode === "geometry" ? "geometry" : forcedMode === "generate" ? "problem_studio" : "general",
        pathname: "/ai-studio",
        contextData: {
          grade,
          subject,
          difficulty,
          currentGeoSpec: geoSpec,
          currentExamStyle: { ...examStyle, title: examTitle },
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
      let createdGeoSpec: MathGeoSpec | undefined = response.updatedGeoSpec;
      if (response.updatedExamStyle) {
        setExamStyle(response.updatedExamStyle);
        if (response.updatedExamStyle.title) {
          setExamTitle(response.updatedExamStyle.title);
        }
        setCanvasPanel("exam");
      }
      for (const action of response.actions as AiCopilotAction[]) {
        if (action.type === "update_geo_spec" && action.geoSpec) {
          createdGeoSpec = action.geoSpec;
          syncGeoControlsFromSpec(action.geoSpec);
          setCanvasPanel("geometry");
        } else if (action.type === "update_exam_style" && action.style) {
          const mergedStyle = saveAiExamStyle(action.style, Boolean(action.reset));
          setExamStyle(mergedStyle);
          if (mergedStyle.title) {
            setExamTitle(mergedStyle.title);
          }
          setCanvasPanel("exam");
        } else if (action.type === "generate_problems" && action.problems?.length) {
          for (const p of action.problems) {
            if (p.geoSpec) {
              createdGeoSpec = p.geoSpec;
              syncGeoControlsFromSpec(p.geoSpec);
            }
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
        mode: detectedMode,
        problems: createdProblems.length > 0 ? createdProblems : undefined,
        geoSpec: createdGeoSpec,
        modelUsed: response.modelUsed,
        webSearchSources: response.webSearchSources,
        createdAt: new Date().toISOString(),
      };
      if (detectedMode === "geometry" || createdGeoSpec) {
        setGeoChatHistory(prev => [
          ...prev,
          { id: `gu-${Date.now()}`, role: "user", text },
          { id: `ga-${Date.now()}`, role: "assistant", text: response.reply },
        ]);
      }

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

  function handlePrintExam(problemsOverride?: GeneratedMathProblem[]) {
    const listToPrint =
      problemsOverride && problemsOverride.length > 0
        ? problemsOverride
        : examProblems.length > 0
          ? examProblems
          : savedProblems.slice(0, 4);
    if (listToPrint.length === 0) return;
    if (problemsOverride && problemsOverride.length > 0) {
      setExamProblems(prev => {
        const existingIds = new Set(prev.map(p => p.id));
        const merged = [...prev, ...problemsOverride.filter(p => !existingIds.has(p.id))];
        return merged.length > 0 ? merged : problemsOverride;
      });
    } else if (examProblems.length === 0) {
      setExamProblems(listToPrint);
    }
    setCanvasPanel("exam");
    setTimeout(() => {
      if (typeof window !== "undefined") {
        window.print();
      }
    }, 90);
  }

  function updateExamStyleField(patch: Partial<ExamPaperStyle>) {
    const merged = saveAiExamStyle(patch, false);
    setExamStyle(merged);
    if (patch.title) {
      setExamTitle(patch.title);
    }
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

  const renderStyledExamPaper = (problemsToRender: GeneratedMathProblem[], isPrintMode: boolean) => {
    const st: ExamPaperStyle = { ...DEFAULT_EXAM_PAPER_STYLE, ...examStyle };
    const cols = Math.max(1, Math.min(4, Number(st.columns) || 2));
    const accent = st.accentColor || "#111827";
    const bg = st.backgroundColor || "#ffffff";
    const fg = st.textColor || "#0f172a";
    const font = st.fontFamily || "'Noto Serif KR', 'Batang', Georgia, serif";
    const fSize = Number(st.fontSize) || 13.5;
    const lHeight = Number(st.lineHeight) || 1.68;
    const gap = Number(st.problemGap) ?? 22;
    const solSpace = Number(st.solutionSpace) ?? 40;
    const pad = Number(st.pagePadding) ?? 24;
    const displayTitle = (examTitle || st.title || "2026 수학 실전 모의고사").trim();
    const displaySubtitle = st.subtitle ?? "2026학년도 대학수학능력시험 대비 수학 영역";
    const headerLeft = st.headerLeft ?? "제 2 교시";
    const headerRight = st.headerRight ?? "홀수형";
    const footerText = st.footerText ?? "유니데스크 AI 수학 연구소";

    if (problemsToRender.length === 0 && !isPrintMode) {
      return (
        <div className={styles.examPreviewPaper}>
          <div className={styles.examEmptyState}>
            <p>
              채팅창에서 생성하거나 타이핑한 문항의 <strong>[+ 시험지에 담기]</strong> 버튼을 누르면 이곳에 맞춤 시험지가 구성됩니다.
            </p>
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
        </div>
      );
    }

    const perPage = Number(st.perPage) > 0 ? Number(st.perPage) : 0;
    const pages: Array<{ startIdx: number; items: GeneratedMathProblem[] }> = [];
    if (perPage > 0 && problemsToRender.length > 0) {
      for (let i = 0; i < problemsToRender.length; i += perPage) {
        pages.push({ startIdx: i, items: problemsToRender.slice(i, i + perPage) });
      }
    } else {
      pages.push({ startIdx: 0, items: problemsToRender });
    }

    const customCssObj: React.CSSProperties = {};
    if (st.customCss && typeof st.customCss === "object") {
      for (const [k, v] of Object.entries(st.customCss)) {
        (customCssObj as Record<string, string | number>)[k] = v;
      }
    }

    return (
      <div className={isPrintMode ? styles.printExamPagesWrap : styles.previewExamPagesWrap}>
        {pages.map((page, pageIdx) => (
          <div
            key={`exam-page-${pageIdx}`}
            className={`${styles.examPreviewPaper} ${isPrintMode ? styles.printPageSheet : ""}`}
            style={{
              position: "relative",
              background: bg,
              color: fg,
              fontFamily: font,
              fontSize: `${fSize}px`,
              lineHeight: lHeight,
              padding: `${pad}px`,
              border:
                st.borderStyle === "box"
                  ? `2px solid ${accent}`
                  : st.borderStyle === "dashed"
                    ? `1.5px dashed ${accent}`
                    : isPrintMode
                      ? "none"
                      : "1px solid #e5e7eb",
              ...customCssObj,
            }}
          >
            {st.watermark && (
              <div
                aria-hidden="true"
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  pointerEvents: "none",
                  zIndex: 0,
                  overflow: "hidden",
                }}
              >
                <span
                  style={{
                    fontSize: isPrintMode ? 54 : 34,
                    fontWeight: 900,
                    color: accent,
                    opacity: 0.06,
                    transform: "rotate(-28deg)",
                    whiteSpace: "nowrap",
                    userSelect: "none",
                    letterSpacing: "0.08em",
                  }}
                >
                  {st.watermark}
                </span>
              </div>
            )}

            {/* Header Section */}
            {st.headerStyle !== "none" && (
              <header
                style={{
                  position: "relative",
                  zIndex: 1,
                  marginBottom: 18,
                  paddingBottom: 12,
                  borderBottom:
                    st.headerStyle === "banner" || st.borderStyle === "none"
                      ? "none"
                      : st.borderStyle === "double" || st.headerStyle === "suneung"
                        ? `3px double ${accent}`
                        : st.borderStyle === "dashed"
                          ? `1.5px dashed ${accent}`
                          : `2px solid ${accent}`,
                  ...(st.headerStyle === "banner"
                    ? {
                        background: accent,
                        color: "#ffffff",
                        padding: "16px 20px",
                        borderRadius: 10,
                      }
                    : st.headerStyle === "modern"
                      ? {
                          borderLeft: `5px solid ${accent}`,
                          paddingLeft: 14,
                        }
                      : {}),
                }}
              >
                {displaySubtitle && (
                  <div
                    style={{
                      textAlign: st.headerStyle === "modern" ? "left" : "center",
                      fontSize: Math.max(11, fSize - 2),
                      fontWeight: 600,
                      opacity: st.headerStyle === "banner" ? 0.9 : 0.78,
                      marginBottom: 4,
                    }}
                  >
                    {displaySubtitle}
                  </div>
                )}

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    flexWrap: "nowrap",
                  }}
                >
                  {headerLeft ? (
                    <span
                      style={{
                        padding: "3px 10px",
                        borderRadius: st.headerStyle === "suneung" ? 999 : 6,
                        border:
                          st.headerStyle === "banner"
                            ? "1px solid rgba(255,255,255,0.5)"
                            : `1.5px solid ${accent}`,
                        fontSize: Math.max(11, fSize - 1.5),
                        fontWeight: 700,
                        whiteSpace: "nowrap",
                        flexShrink: 0,
                      }}
                    >
                      {headerLeft}
                    </span>
                  ) : (
                    <span />
                  )}

                  <strong
                    style={{
                      fontSize: Math.round(fSize * 1.42),
                      fontWeight: 900,
                      letterSpacing: "-0.02em",
                      color: st.headerStyle === "banner" ? "#ffffff" : accent,
                      textAlign: "center",
                      flex: 1,
                      wordBreak: "keep-all",
                      lineHeight: 1.25,
                    }}
                  >
                    {displayTitle}
                  </strong>

                  {headerRight ? (
                    <span
                      style={{
                        padding: "3px 10px",
                        borderRadius: 6,
                        border:
                          st.headerStyle === "banner"
                            ? "1px solid rgba(255,255,255,0.5)"
                            : `1.5px solid ${accent}`,
                        fontSize: Math.max(11, fSize - 1.5),
                        fontWeight: 700,
                        whiteSpace: "nowrap",
                        flexShrink: 0,
                      }}
                    >
                      {headerRight}
                    </span>
                  ) : (
                    <span />
                  )}
                </div>

                {st.showStudentInfoBox && pageIdx === 0 && (
                  <div
                    style={{
                      marginTop: 10,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      flexWrap: "wrap",
                      gap: "6px 14px",
                      fontSize: Math.max(10.5, fSize - 2),
                      padding: "7px 12px",
                      borderRadius: 6,
                      border:
                        st.headerStyle === "banner"
                          ? "1px solid rgba(255,255,255,0.35)"
                          : "1px solid #cbd5e1",
                      background:
                        st.headerStyle === "banner" ? "rgba(255,255,255,0.12)" : "rgba(248,250,252,0.8)",
                    }}
                  >
                    <div style={{ whiteSpace: "nowrap" }}>학교/반: __________</div>
                    <div style={{ whiteSpace: "nowrap" }}>학년: _____</div>
                    <div style={{ whiteSpace: "nowrap" }}>성명: ________</div>
                    <div style={{ whiteSpace: "nowrap" }}>점수: ____ / 100</div>
                  </div>
                )}

                {st.customNote && pageIdx === 0 && (
                  <div
                    style={{
                      marginTop: 8,
                      padding: "6px 10px",
                      borderRadius: 6,
                      background: "#f8fafc",
                      border: "1px dashed #94a3b8",
                      fontSize: Math.max(11, fSize - 2),
                      color: "#334155",
                    }}
                  >
                    {st.customNote}
                  </div>
                )}
              </header>
            )}

            {/* Problems Multi-Column Layout */}
            <div
              style={{
                position: "relative",
                zIndex: 1,
                display: "grid",
                gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                columnGap: cols > 1 ? 24 : 0,
                rowGap: `${gap}px`,
                alignItems: "start",
              }}
            >
              {cols === 2 && st.showColumnDivider && (
                <div
                  aria-hidden="true"
                  style={{
                    position: "absolute",
                    top: 0,
                    bottom: 0,
                    left: "50%",
                    width: 1,
                    background: "#cbd5e1",
                    pointerEvents: "none",
                  }}
                />
              )}
              {page.items.map((p, idx) => {
                const probNum = page.startIdx + idx + 1;
                const pts = p.points || (p.difficulty === "킬러" || p.difficulty === "상" ? "4점" : "3점");
                const cleanedQuestion = (p.question || "").replace(/\s*\[[234]점\]\s*$/, "").trim();
                const choiceCols =
                  st.choiceColumns && st.choiceColumns > 0
                    ? st.choiceColumns
                    : p.choices?.every(c => c.length <= 12)
                      ? 5
                      : p.choices?.every(c => c.length <= 24)
                        ? 3
                        : 1;
                return (
                  <article
                    key={`${p.id}-${probNum}`}
                    className={styles.examProblemItem}
                    style={{
                      background: "transparent",
                      border: "none",
                      borderRadius: 0,
                      padding: "2px 4px",
                      paddingBottom: `${Math.max(12, solSpace)}px`,
                      breakInside: "avoid",
                      pageBreakInside: "avoid",
                      wordBreak: "keep-all",
                      overflowWrap: "break-word",
                    }}
                  >
                    <div className={styles.examProblemTop} style={{ marginBottom: 4 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <strong style={{ fontSize: `${fSize + 1}px`, color: accent }}>{probNum}.</strong>
                        {st.showPoints !== false && (
                          <span style={{ fontSize: `${Math.max(10.5, fSize - 2)}px`, color: "#475569", fontWeight: 700 }}>
                            [{pts}]
                          </span>
                        )}
                        {st.showDifficulty && (
                          <span
                            style={{
                              fontSize: `${Math.max(10, fSize - 2.5)}px`,
                              padding: "1px 6px",
                              borderRadius: 999,
                              background: "#eff6ff",
                              color: accent,
                              fontWeight: 700,
                            }}
                          >
                            {p.difficulty}
                          </span>
                        )}
                        {st.showSource && p.sourceLabel && (
                          <span style={{ fontSize: `${Math.max(10, fSize - 2.5)}px`, color: "#64748b" }}>
                            ({p.sourceLabel})
                          </span>
                        )}
                      </div>
                      {!isPrintMode && (
                        <button
                          type="button"
                          className={styles.noPrintBtn}
                          onClick={() => removeProblemFromExam(p.id)}
                          aria-label="시험지에서 제거"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>

                    <div
                      className={styles.examProblemText}
                      style={{
                        fontSize: `${fSize}px`,
                        lineHeight: lHeight,
                        wordBreak: "keep-all",
                        overflowWrap: "break-word",
                      }}
                    >
                      <TypingMath text={cleanedQuestion} />
                    </div>

                    {p.figure && (
                      <div style={{ display: "flex", justifyContent: "center", margin: "8px 0" }}>
                        <img
                          src={p.figure}
                          alt={`${probNum}번 도형`}
                          className={styles.examProblemThumb}
                          style={{ maxWidth: cols >= 2 ? 190 : 250 }}
                        />
                      </div>
                    )}

                    {p.boxContent && (
                      <div
                        style={{
                          margin: "8px 0",
                          padding: "8px 11px",
                          borderRadius: 6,
                          border: "1px solid #94a3b8",
                          background: "rgba(248,250,252,0.65)",
                          fontSize: `${Math.max(11, fSize - 1)}px`,
                        }}
                      >
                        <div style={{ textAlign: "center", fontWeight: 700, marginBottom: 4 }}>〈보 기〉</div>
                        {formatBoxContent(p.boxContent)
                          .split("\n")
                          .map((line, bIdx) => (
                            <div key={bIdx}>
                              <TypingMath text={line} />
                            </div>
                          ))}
                      </div>
                    )}

                    {p.choices && p.choices.length > 0 && (
                      <div
                        style={{
                          marginTop: 8,
                          display: "grid",
                          gridTemplateColumns: `repeat(${choiceCols}, minmax(0, 1fr))`,
                          gap: "6px 10px",
                          fontSize: `${Math.max(11.5, fSize - 0.5)}px`,
                        }}
                      >
                        {p.choices.map((c, cIdx) => (
                          <div key={cIdx} style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                            <span>{choiceLabels[cIdx] || `(${cIdx + 1})`}</span>
                            <TypingMath text={formatChoiceContent(c)} />
                          </div>
                        ))}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>

            {/* Footer */}
            <footer
              style={{
                position: "relative",
                zIndex: 1,
                marginTop: 22,
                paddingTop: 10,
                borderTop: `1px solid ${st.borderStyle === "none" ? "#e2e8f0" : accent}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                fontSize: Math.max(10.5, fSize - 2.5),
                color: "#64748b",
              }}
            >
              <span>{footerText}</span>
              <strong>
                {pageIdx + 1} / {pages.length}
              </strong>
            </footer>
          </div>
        ))}

        {/* Answer Key & Detailed Solutions Sheet */}
        {(st.showAnswerKey || st.showSolutions) && problemsToRender.length > 0 && (
          <div
            className={`${styles.examPreviewPaper} ${isPrintMode ? styles.printPageSheet : ""}`}
            style={{
              background: bg,
              color: fg,
              fontFamily: font,
              fontSize: `${Math.max(11.5, fSize - 1)}px`,
              lineHeight: lHeight,
              padding: `${pad}px`,
              marginTop: isPrintMode ? 0 : 14,
              pageBreakBefore: "always",
              breakBefore: "page",
            }}
          >
            <header
              style={{
                borderBottom: `2px solid ${accent}`,
                paddingBottom: 10,
                marginBottom: 14,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <strong style={{ fontSize: `${Math.round(fSize * 1.25)}px`, color: accent }}>
                {displayTitle} — 정답 및 해설지
              </strong>
              <span style={{ fontSize: 11.5, color: "#64748b" }}>총 {problemsToRender.length}문항</span>
            </header>

            {st.showAnswerKey && (
              <div
                style={{
                  marginBottom: 16,
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: "1px solid #cbd5e1",
                  background: "rgba(248,250,252,0.8)",
                }}
              >
                <div style={{ fontWeight: 800, marginBottom: 6, color: accent, fontSize: 12.5 }}>[빠른 정답표]</div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(95px, 1fr))",
                    gap: 6,
                  }}
                >
                  {problemsToRender.map((p, idx) => (
                    <div
                      key={`ans-${p.id}-${idx}`}
                      style={{
                        padding: "4px 8px",
                        borderRadius: 6,
                        background: "#ffffff",
                        border: "1px solid #e2e8f0",
                        fontSize: 12,
                      }}
                    >
                      <strong>{idx + 1}번:</strong> <TypingMath text={p.answer || "-"} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {st.showSolutions && (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: cols >= 2 ? "repeat(2, minmax(0, 1fr))" : "1fr",
                  gap: 14,
                }}
              >
                {problemsToRender.map((p, idx) => (
                  <div
                    key={`sol-${p.id}-${idx}`}
                    style={{
                      padding: "8px 10px",
                      borderRadius: 8,
                      border: "1px solid #e2e8f0",
                      breakInside: "avoid",
                      pageBreakInside: "avoid",
                    }}
                  >
                    <div style={{ fontWeight: 800, color: accent, marginBottom: 4 }}>
                      {idx + 1}번 해설{" "}
                      <span style={{ fontWeight: 700, color: "#15803d" }}>
                        (정답: <TypingMath text={p.answer || "-"} />)
                      </span>
                    </div>
                    <div style={{ whiteSpace: "pre-wrap", fontSize: `${Math.max(11, fSize - 1.5)}px` }}>
                      <TypingMath text={p.solution || "해설이 등록되지 않았습니다."} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

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
          placeholder="질문, 수학 문제 제작·변형, 시험지 PDF 첨부 타이핑, 도형 작도, 학생·시험지 스타일 관리를 한 곳에서 입력하세요..."
          disabled={busy}
        />

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
                          <span className={styles.assistantBadge} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                            <Sparkles size={13} /> AI 스튜디오
                          </span>
                          {msg.modelUsed && (
                            <span
                              style={{
                                marginLeft: 6,
                                fontSize: 11,
                                fontWeight: 700,
                                padding: "2px 8px",
                                borderRadius: 999,
                                background: msg.modelUsed.includes("gemini-4") ? "#ede9fe" : "#e0f2fe",
                                color: msg.modelUsed.includes("gemini-4") ? "#6d28d9" : "#0369a1",
                              }}
                            >
                              {msg.modelUsed.includes("gemini-4")
                                ? `🧠 ${msg.modelUsed} (추론·창작)`
                                : `⚡ ${msg.modelUsed} (고속)`}
                            </span>
                          )}
                        </div>
                        <p className={styles.assistantText}>{msg.content}</p>
                        {msg.webSearchSources && msg.webSearchSources.length > 0 && (
                          <div
                            style={{
                              display: "flex",
                              flexWrap: "wrap",
                              alignItems: "center",
                              gap: 6,
                              marginTop: 6,
                              marginBottom: 8,
                              fontSize: 11.5,
                              color: "#475569",
                            }}
                          >
                            <span style={{ fontWeight: 700, color: "#1d4ed8" }}>🌐 웹 기출 탐색 참조 (원본 변형 출제됨):</span>
                            {msg.webSearchSources.slice(0, 4).map((src, sIdx) => (
                              <a
                                key={sIdx}
                                href={src.url}
                                target="_blank"
                                rel="noreferrer"
                                style={{
                                  padding: "2px 8px",
                                  borderRadius: 6,
                                  background: "#f1f5f9",
                                  border: "1px solid #cbd5e1",
                                  color: "#2563eb",
                                  textDecoration: "none",
                                  maxWidth: 220,
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {src.title} ↗
                              </a>
                            ))}
                          </div>
                        )}

                        {msg.problems && msg.problems.length > 0 && (
                          <div className={styles.problemCardStack}>
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                flexWrap: "wrap",
                                gap: 8,
                                padding: "8px 12px",
                                borderRadius: 12,
                                background: "#f8fafc",
                                border: "1px solid #dbeafe",
                              }}
                            >
                              <span style={{ fontSize: 12.5, fontWeight: 700, color: "#1e40af" }}>
                                📄 생성된 시험지 문항 ({msg.problems.length}문항)
                              </span>
                              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                                <button
                                  type="button"
                                  className={styles.cardSmallBtn}
                                  onClick={() => {
                                    setExamProblems(prev => {
                                      const existingIds = new Set(prev.map(p => p.id));
                                      return [...prev, ...(msg.problems || []).filter(p => !existingIds.has(p.id))];
                                    });
                                    setCanvasPanel("exam");
                                  }}
                                >
                                  <Palette size={13} /> 시험지 스타일·미리보기 열기
                                </button>
                                <button
                                  type="button"
                                  className={styles.cardPrimaryBtn}
                                  style={{ background: "#2563eb" }}
                                  onClick={() => handlePrintExam(msg.problems)}
                                >
                                  <Printer size={13} /> 바로 프린트 / PDF 인쇄
                                </button>
                              </div>
                            </div>
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
                                        {formatProblemBadge(prob.grade, prob.subject, prob.unit)}
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
                                        onClick={() =>
                                          void handleSend(
                                            `다음 문제를 참고하되 절대 그대로 쓰지 말고 수치·함수를 새롭게 바꾼 1:1 쌍둥이 변형 문제와 상세 해설을 만들어줘: ${prob.question}`,
                                            "generate",
                                            prob.sourceTokenId
                                          )
                                        }
                                      >
                                        <Sparkles size={13} /> 쌍둥이 변형
                                      </button>
                                      <button
                                        type="button"
                                        className={styles.cardSmallBtn}
                                        onClick={() => void handleGenerateDiagramForProblem(prob)}
                                      >
                                        <Sparkles size={13} /> 그림 생성
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

                        {msg.geoSpec && (!msg.problems || msg.problems.length === 0) && (
                          <div className={styles.problemCardStack}>
                            <article className={styles.problemCard}>
                              <div className={styles.problemCardTop}>
                                <div className={styles.problemMeta}>
                                  <span className={styles.metaBadge}>📐 AI 작도 도형</span>
                                  <span className={styles.metaSource}>{msg.geoSpec.title || "맞춤 수학 도형·함수 그래프"}</span>
                                </div>
                                <div className={styles.problemCardBtns}>
                                  <button
                                    type="button"
                                    className={styles.cardSmallBtn}
                                    onClick={() => {
                                      syncGeoControlsFromSpec(msg.geoSpec!);
                                      setCanvasPanel("geometry");
                                    }}
                                  >
                                    <Compass size={13} /> 작도 캔버스에서 대화로 수정
                                  </button>
                                  <button
                                    type="button"
                                    className={styles.cardPrimaryBtn}
                                    onClick={() => {
                                      syncGeoControlsFromSpec(msg.geoSpec!);
                                      void attachCurrentGraphToProblem();
                                    }}
                                  >
                                    <Plus size={13} /> 이 도형으로 문항 생성 / 삽입
                                  </button>
                                </div>
                              </div>
                              <div
                                className={styles.geoSvgStage}
                                style={{ marginTop: 10 }}
                                dangerouslySetInnerHTML={{ __html: renderMathGeoSvg(msg.geoSpec) }}
                              />
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
                  onChange={e => {
                    setExamTitle(e.target.value);
                    updateExamStyleField({ title: e.target.value });
                  }}
                  placeholder="시험지 제목 입력"
                  aria-label="시험지 제목"
                />
                <div className={styles.examExportRow}>
                  <button
                    type="button"
                    className={styles.exportPrimaryBtn}
                    disabled={examProblems.length === 0 && savedProblems.length === 0}
                    onClick={() => handlePrintExam()}
                  >
                    <Printer size={14} /> 바로 인쇄 / PDF
                  </button>
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
                    className={styles.exportBtn}
                    disabled={examProblems.length === 0 && savedProblems.length === 0}
                    onClick={() =>
                      handleOpenInFullTypingEditor(examProblems.length > 0 ? examProblems : savedProblems.slice(0, 4))
                    }
                  >
                    타이핑 편집기 이동
                  </button>
                </div>
              </div>

              {/* AI 시험지 스타일 무제한 대화형 커스터마이징 패널 */}
              <div
                style={{
                  background: "#f8fafc",
                  border: "1.5px solid #bfdbfe",
                  borderRadius: 12,
                  padding: "11px 13px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, flexWrap: "wrap" }}>
                  <strong style={{ fontSize: 12.5, color: "#1e40af", display: "inline-flex", alignItems: "center", gap: 5 }}>
                    <Palette size={14} /> 🎨 AI 채팅으로 시험지 스타일 무제한 변경
                  </strong>
                  <span style={{ fontSize: 11, color: "#64748b" }}>
                    현재: {examStyle.columns || 2}단 · {examStyle.headerStyle || "suneung"} · 여백 {examStyle.solutionSpace ?? 40}px
                  </span>
                </div>

                <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                  {[
                    { label: "수능·평가원 2단", prompt: "시험지 스타일을 수능 평가원 2단 명조체 양식으로 바꿔줘" },
                    { label: "워크북 1단 (풀이여백 넓게)", prompt: "시험지를 1단 학원 클리닉 워크북 스타일로 바꾸고 풀이 여백을 140px로 넓게 줘" },
                    { label: "3단 콤팩트 배치", prompt: "시험지를 3단 레이아웃으로 바꾸고 풀이 여백을 20px로 줄여줘" },
                    { label: "모던 블루 + 고딕체", prompt: "시험지 디자인을 모던 네이비 블루 테마와 고딕체로 바꿔줘" },
                    { label: "에메랄드 그린 테마", prompt: "시험지 포인트 색상을 에메랄드 초록색으로 바꿔줘" },
                    { label: "아이보리 미색 배경", prompt: "시험지 배경을 눈이 편한 아이보리 미색 배경으로 바꿔줘" },
                    { label: "정답·해설지 함께 인쇄", prompt: "시험지 뒤에 빠른 정답표랑 상세 해설지도 같이 인쇄되게 포함해줘" },
                    { label: "문제지만 단독 인쇄", prompt: "정답이랑 해설지는 빼고 문제지만 단독 인쇄되게 설정해줘" },
                    { label: "기본 스타일 초기화", prompt: "시험지 스타일 기본 원래대로 초기화해줘" },
                  ].map(chip => (
                    <button
                      key={chip.label}
                      type="button"
                      className={styles.geoPresetChip}
                      disabled={busy}
                      onClick={() => void handleSend(chip.prompt)}
                    >
                      ✦ {chip.label}
                    </button>
                  ))}
                </div>

                <form
                  onSubmit={e => {
                    e.preventDefault();
                    if (!examStyleChatInput.trim() || busy) return;
                    const text = examStyleChatInput.trim();
                    setExamStyleChatInput("");
                    void handleSend(text);
                  }}
                  style={{ display: "flex", gap: 6 }}
                >
                  <input
                    type="text"
                    value={examStyleChatInput}
                    onChange={e => setExamStyleChatInput(e.target.value)}
                    placeholder="예: 1단으로 바꾸고 글씨 크기 15px, 풀이 여백 160px, 워터마크 '코스매스' 넣어줘..."
                    disabled={busy}
                    style={{
                      flex: 1,
                      padding: "7px 10px",
                      borderRadius: 8,
                      border: "1px solid #93c5fd",
                      fontSize: 12,
                      background: "#ffffff",
                    }}
                  />
                  <button
                    type="submit"
                    className={styles.exportPrimaryBtn}
                    disabled={busy || !examStyleChatInput.trim()}
                    style={{ padding: "7px 11px", fontSize: 12 }}
                  >
                    {busy ? <Loader2 size={13} className={styles.spin} /> : <ArrowUp size={14} />}
                    스타일 적용
                  </button>
                </form>
              </div>

              {renderStyledExamPaper(
                examProblems.length > 0 ? examProblems : savedProblems.slice(0, 4),
                false
              )}
            </div>
          )}

          {canvasPanel === "geometry" && (
            <div className={styles.canvasBody}>
              {/* 1. AI 대화형 도형 작도 채팅 패널 */}
              <div
                style={{
                  background: "#f8fafc",
                  border: "1.5px solid #bfdbfe",
                  borderRadius: 12,
                  padding: "12px 14px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <strong style={{ fontSize: 13, color: "#1e40af", display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <Compass size={15} /> 💬 AI 채팅으로 도형 작도 · 수정하기
                  </strong>
                  <span style={{ fontSize: 11, color: "#64748b" }}>자연어로 말하면 AI가 즉시 작도합니다</span>
                </div>

                {/* 빠른 채팅 작도 프롬프트 칩 */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {[
                    "삼차함수 y=x^3-3x+1과 x=1에서의 접선 그려줘",
                    "이차함수 y=x^2-2x-3과 직선 y=x+1의 교점 및 둘러싸인 넓이 색칠해줘",
                    "원 O에 내접하는 삼각형 ABC와 외접원 작도해줘",
                    "중심각이 60도인 부채꼴 AOB 그려줘",
                    "평행한 두 직선 l, m과 동위각·엇각 표시해줘",
                    "현재 그래프에서 -1부터 2까지 적분 영역 색칠해줘",
                  ].map(chip => (
                    <button
                      key={chip}
                      type="button"
                      className={styles.geoPresetChip}
                      disabled={busy}
                      onClick={() => {
                        setMode("geometry");
                        void handleSend(chip, "geometry");
                      }}
                    >
                      ✦ {chip}
                    </button>
                  ))}
                </div>

                {/* 작도 대화 히스토리 */}
                <div
                  style={{
                    maxHeight: 135,
                    overflowY: "auto",
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                    padding: "6px 8px",
                    background: "#ffffff",
                    borderRadius: 8,
                    border: "1px solid #e2e8f0",
                    fontSize: 12,
                  }}
                >
                  {geoChatHistory.slice(-6).map(item => (
                    <div
                      key={item.id}
                      style={{
                        alignSelf: item.role === "user" ? "flex-end" : "flex-start",
                        background: item.role === "user" ? "#2563eb" : "#f1f5f9",
                        color: item.role === "user" ? "#ffffff" : "#1e293b",
                        padding: "6px 10px",
                        borderRadius: 8,
                        maxWidth: "90%",
                        lineHeight: 1.45,
                      }}
                    >
                      {item.text}
                    </div>
                  ))}
                </div>

                {/* 채팅 입력창 */}
                <form
                  onSubmit={e => {
                    e.preventDefault();
                    const text = geoChatInput.trim();
                    if (!text || busy) return;
                    setGeoChatInput("");
                    setMode("geometry");
                    void handleSend(text, "geometry");
                  }}
                  style={{ display: "flex", gap: 6 }}
                >
                  <input
                    type="text"
                    value={geoChatInput}
                    disabled={busy}
                    onChange={e => setGeoChatInput(e.target.value)}
                    placeholder="예: 'x=2에서의 접선 추가해줘', '직각삼각형 ABC 그려줘', '색칠 영역 빼줘'..."
                    aria-label="AI 도형 작도 채팅 요청"
                    style={{
                      flex: 1,
                      height: 36,
                      padding: "0 12px",
                      borderRadius: 8,
                      border: "1px solid #93c5fd",
                      fontSize: 12.5,
                      background: "#ffffff",
                    }}
                  />
                  <button
                    type="submit"
                    disabled={busy || !geoChatInput.trim()}
                    className={styles.exportPrimaryBtn}
                    style={{ height: 36, padding: "0 14px", whiteSpace: "nowrap" }}
                  >
                    {busy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} AI 작도
                  </button>
                </form>
              </div>

              {/* 2. 실시간 렌더링된 도형 스테이지 */}
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

              {/* 3. 기본 프리셋 및 수동 미세조정 (접기 가능) */}
              <details className={styles.geoJsonDetails}>
                <summary>빠른 도형 프리셋 & 수식 직접 미세조정 열기</summary>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
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
                </div>
              </details>

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
                            {formatProblemBadge(item.grade, item.subject, item.unit)} · {item.difficulty}
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
        </aside>
      )}

      {/* 4. Dedicated A4 Print Container (Visible only during window.print() / PDF Export) */}
      <div className={styles.printOnlyExamSheet} aria-hidden="true">
        {renderStyledExamPaper(
          examProblems.length > 0 ? examProblems : savedProblems.slice(0, 4),
          true
        )}
      </div>
    </section>
  );
}

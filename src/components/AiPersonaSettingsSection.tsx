"use client";

import { useEffect, useState } from "react";
import {
  Bot,
  Check,
  Coffee,
  Flame,
  GraduationCap,
  PenTool,
  RotateCcw,
  Save,
  Sigma,
  Sparkles,
} from "lucide-react";
import {
  AI_PERSONA_PRESETS,
  loadAiPersonaConfig,
  resolveActivePersonaPrompt,
  saveAiPersonaConfig,
  type AiPersonaIconKey,
  type SavedAiPersonaConfig,
} from "../lib/ai-personas";
import styles from "../app/settings/settings.module.css";

const PERSONA_ICONS: Record<AiPersonaIconKey, typeof Bot> = {
  GraduationCap,
  Sparkles,
  Coffee,
  Sigma,
  Flame,
  Bot,
  PenTool,
};

export default function AiPersonaSettingsSection() {
  const [config, setConfig] = useState<SavedAiPersonaConfig>(() => ({
    personaId: AI_PERSONA_PRESETS[0].id,
    customPrompt: "",
  }));
  const [notice, setNotice] = useState("");

  useEffect(() => {
    setConfig(loadAiPersonaConfig());
  }, []);

  const resolved = resolveActivePersonaPrompt(config);
  const activePreset = resolved.preset;

  function handleSelectPreset(personaId: string) {
    const next = saveAiPersonaConfig({
      ...config,
      personaId,
    });
    setConfig(next);
    const matched = AI_PERSONA_PRESETS.find(p => p.id === personaId);
    setNotice(`'${matched?.name || "AI 캐릭터"}' 모드가 적용되었습니다.`);
    setTimeout(() => setNotice(""), 3000);
  }

  function handleSavePrompt() {
    saveAiPersonaConfig(config);
    setNotice("AI 캐릭터 프롬프트 설정을 저장했습니다.");
    setTimeout(() => setNotice(""), 3000);
  }

  function handleResetPrompt() {
    const next = saveAiPersonaConfig({
      ...config,
      customPrompt: "",
    });
    setConfig(next);
    setNotice("선택된 캐릭터의 기본 프롬프트로 복원했습니다.");
    setTimeout(() => setNotice(""), 3000);
  }

  return (
    <section id="ai-persona" className={styles.section}>
      <div className={styles.sectionHead}>
        <div>
          <p>AI PERSONA &amp; SYSTEM PROMPT</p>
          <h2>AI 캐릭터 · 대화 스타일 설정</h2>
        </div>
        <Bot />
      </div>

      <p className={styles.requestNote} style={{ marginTop: 12 }}>
        AI 스튜디오와 코파일럿 채팅의 성격·말투(페르소나)를 선택하거나 직접 프롬프트를 작성할 수 있습니다.
      </p>

      <div
        style={{
          marginTop: 16,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {AI_PERSONA_PRESETS.map(preset => {
          const Icon = PERSONA_ICONS[preset.iconKey] || Bot;
          const isSelected = config.personaId === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => handleSelectPreset(preset.id)}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: 14,
                padding: "12px 16px",
                borderRadius: 8,
                border: isSelected ? "1.5px solid #2864a9" : "1px solid #dce6f0",
                background: isSelected ? "#eef6ff" : "#ffffff",
                textAlign: "left",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              <span
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 8,
                  display: "grid",
                  placeItems: "center",
                  flexShrink: 0,
                  background: isSelected ? "#2864a9" : "#f1f6fb",
                  color: isSelected ? "#ffffff" : "#2864a9",
                }}
              >
                <Icon size={18} />
              </span>
              <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                <strong style={{ fontSize: 13, color: "#203b60", lineHeight: 1.35 }}>{preset.name}</strong>
                <p style={{ margin: 0, fontSize: 11.5, color: "#60758e", lineHeight: 1.4 }}>
                  {preset.tagline}
                </p>
              </div>
              <span
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  display: "grid",
                  placeItems: "center",
                  flexShrink: 0,
                  background: isSelected ? "#2864a9" : "transparent",
                  border: isSelected ? "1.5px solid #2864a9" : "1.5px solid #cbd5e1",
                  color: "#ffffff",
                }}
              >
                {isSelected && <Check size={13} />}
              </span>
            </button>
          );
        })}
      </div>

      <div style={{ marginTop: 18 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: "#4a637d" }}>
            적용 중인 성격 · 시스템 프롬프트 (직접 추가·수정 가능)
          </label>
          {config.customPrompt && (
            <button
              type="button"
              onClick={handleResetPrompt}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                border: "none",
                background: "transparent",
                color: "#2864a9",
                fontSize: 11,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              <RotateCcw size={12} /> 기본 프롬프트로 복원
            </button>
          )}
        </div>
        <textarea
          rows={4}
          value={config.customPrompt || activePreset.systemPrompt}
          onChange={e => setConfig(prev => ({ ...prev, customPrompt: e.target.value }))}
          placeholder="원하시는 AI의 성격, 말투, 호칭(예: 원장님/선생님), 답변 스타일 등을 자유롭게 적어주세요..."
          style={{
            width: "100%",
            padding: "11px 12px",
            borderRadius: 7,
            border: "1px solid #cad8e6",
            fontSize: 12,
            lineHeight: 1.55,
            color: "#203b60",
            background: "#f8fbff",
            resize: "vertical",
            outline: "none",
          }}
        />
      </div>

      <div className={styles.actions}>
        {notice && (
          <span className={styles.success}>
            <Check size={14} /> {notice}
          </span>
        )}
        <button type="button" onClick={handleSavePrompt}>
          <Save /> 프롬프트 저장
        </button>
      </div>
    </section>
  );
}

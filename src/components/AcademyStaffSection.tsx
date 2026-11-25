"use client";

import { useEffect, useState } from "react";
import { Plus, Save, Sparkles, Trash2, Users } from "lucide-react";
import {
  addOrUpdateAcademyStaffMember,
  loadAcademyStaff,
  removeAcademyStaffMember,
  saveAcademyStaff,
  type AcademyStaffMember,
  type StaffRoleType,
} from "../lib/academy-staff";
import styles from "../app/settings/settings.module.css";

const ROLES: StaffRoleType[] = ["원장님", "선생님", "조교쌤", "실장님"];

const ROLE_BADGE_STYLE: Record<StaffRoleType, { bg: string; fg: string; border: string }> = {
  원장님: { bg: "#fef3c7", fg: "#b45309", border: "#fde68a" },
  선생님: { bg: "#e8f3ff", fg: "#1d4ed8", border: "#bfdbfe" },
  조교쌤: { bg: "#ecfdf5", fg: "#047857", border: "#a7f3d0" },
  실장님: { bg: "#f3e8ff", fg: "#6d28d9", border: "#ddd6fe" },
};

export default function AcademyStaffSection() {
  const [staff, setStaff] = useState<AcademyStaffMember[]>([]);
  const [name, setName] = useState("");
  const [role, setRole] = useState<StaffRoleType>("선생님");
  const [assignedClasses, setAssignedClasses] = useState("");
  const [duties, setDuties] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    setStaff(loadAcademyStaff());
    const onChanged = () => setStaff(loadAcademyStaff());
    window.addEventListener("cosmath-staff-changed", onChanged);
    return () => window.removeEventListener("cosmath-staff-changed", onChanged);
  }, []);

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const next = addOrUpdateAcademyStaffMember({
      name: name.trim(),
      role,
      assignedClasses: assignedClasses.trim(),
      duties: duties.trim(),
    });
    setStaff(next);
    setName("");
    setAssignedClasses("");
    setDuties("");
    setNotice(`'${name.trim()} ${role}' 정보가 저장되어 AI 스튜디오와 코파일럿이 즉시 인식합니다.`);
    setTimeout(() => setNotice(""), 3500);
  }

  function handleFieldChange(id: string, patch: Partial<AcademyStaffMember>) {
    setStaff(prev => prev.map(m => (m.id === id ? { ...m, ...patch } : m)));
  }

  function handleSaveAll() {
    saveAcademyStaff(staff);
    setNotice("학원 구성원 명단을 저장했습니다. AI 채팅에서 이름으로 바로 호출하실 수 있습니다.");
    setTimeout(() => setNotice(""), 3500);
  }

  function handleDelete(id: string, memberName: string) {
    const next = removeAcademyStaffMember(id);
    setStaff(next);
    setNotice(`'${memberName}' 구성원을 목록에서 삭제했습니다.`);
    setTimeout(() => setNotice(""), 3000);
  }

  return (
    <section id="staff" className={styles.section}>
      <div className={styles.sectionHead}>
        <div>
          <p>ACADEMY STAFF &amp; AI RECOGNITION</p>
          <h2>학원 구성원 관리 (선생님 · 조교쌤 · 실장님)</h2>
        </div>
        <Users />
      </div>

      <p className={styles.requestNote} style={{ marginTop: 12 }}>
        여기에 원장님, 선생님, 조교쌤, 상담 실장님 이름과 담당 반·업무를 등록해 두면{" "}
        <strong style={{ color: "#2864a9" }}>
          AI가 모든 채팅에서 각 구성원의 이름과 역할을 자동으로 인식
        </strong>
        합니다. (예: <em>&ldquo;박지훈 조교쌤한테 넘길 오늘 오답 미완료 명단 정리해줘&rdquo;</em>,{" "}
        <em>&ldquo;이수진 실장님께 전달할 결석생 상담 인수인계 메모 남겨줘&rdquo;</em>)
      </p>

      {/* 신규 구성원 추가 폼 */}
      <form
        onSubmit={handleAdd}
        style={{
          marginTop: 16,
          padding: 16,
          borderRadius: 8,
          background: "#f8fbff",
          border: "1px solid #d5e4f3",
          display: "grid",
          gap: 12,
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.1fr 1fr 1.4fr 1.5fr",
            gap: 10,
          }}
        >
          <label style={{ fontSize: 10.5, fontWeight: 700, color: "#4a637d" }}>
            이름 *
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="예: 박지훈"
              maxLength={30}
              style={{
                width: "100%",
                marginTop: 5,
                padding: "9px 10px",
                borderRadius: 6,
                border: "1px solid #cad8e6",
                fontSize: 12,
                background: "#ffffff",
              }}
            />
          </label>

          <label style={{ fontSize: 10.5, fontWeight: 700, color: "#4a637d" }}>
            직책 / 호칭
            <select
              value={role}
              onChange={e => setRole(e.target.value as StaffRoleType)}
              style={{
                width: "100%",
                marginTop: 5,
                padding: "9px 10px",
                borderRadius: 6,
                border: "1px solid #cad8e6",
                fontSize: 12,
                background: "#ffffff",
                color: "#203b60",
                fontWeight: 700,
              }}
            >
              {ROLES.map(r => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>

          <label style={{ fontSize: 10.5, fontWeight: 700, color: "#4a637d" }}>
            담당 반 (선택)
            <input
              type="text"
              value={assignedClasses}
              onChange={e => setAssignedClasses(e.target.value)}
              placeholder="예: 고1 심화반, 중3 A반"
              maxLength={80}
              style={{
                width: "100%",
                marginTop: 5,
                padding: "9px 10px",
                borderRadius: 6,
                border: "1px solid #cad8e6",
                fontSize: 12,
                background: "#ffffff",
              }}
            />
          </label>

          <label style={{ fontSize: 10.5, fontWeight: 700, color: "#4a637d" }}>
            담당 업무 / AI 참고 메모 (선택)
            <input
              type="text"
              value={duties}
              onChange={e => setDuties(e.target.value)}
              placeholder="예: 오답 클리닉·프린트 채점 / 학부모 상담·수납"
              maxLength={100}
              style={{
                width: "100%",
                marginTop: 5,
                padding: "9px 10px",
                borderRadius: 6,
                border: "1px solid #cad8e6",
                fontSize: 12,
                background: "#ffffff",
              }}
            />
          </label>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <span style={{ fontSize: 11, color: "#60758e", display: "inline-flex", alignItems: "center", gap: 5 }}>
            <Sparkles size={13} color="#2864a9" /> AI 채팅창에서도{" "}
            <em>&ldquo;박지훈 조교쌤(오답 클리닉 담당) 등록해줘&rdquo;</em>라고 말하면 자동 추가됩니다.
          </span>
          <button
            type="submit"
            disabled={!name.trim()}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 14px",
              borderRadius: 7,
              border: "none",
              background: name.trim() ? "#2864a9" : "#94a3b8",
              color: "#ffffff",
              fontSize: 11.5,
              fontWeight: 700,
              cursor: name.trim() ? "pointer" : "not-allowed",
            }}
          >
            <Plus size={14} /> 구성원 추가
          </button>
        </div>
      </form>

      {/* 등록된 구성원 목록 */}
      <div style={{ marginTop: 18 }}>
        {staff.length === 0 ? (
          <div
            style={{
              padding: "24px 16px",
              textAlign: "center",
              borderRadius: 8,
              border: "1px dashed #cbd5e1",
              color: "#64748b",
              fontSize: 12,
            }}
          >
            아직 등록된 학원 구성원(선생님·조교쌤·실장님)이 없습니다. 위 입력창에서 추가해 보세요!
          </div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {staff.map(member => {
              const badge = ROLE_BADGE_STYLE[member.role] || ROLE_BADGE_STYLE["선생님"];
              return (
                <div
                  key={member.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "auto 1.1fr 1.3fr 1.6fr auto",
                    alignItems: "center",
                    gap: 10,
                    padding: "11px 12px",
                    borderRadius: 8,
                    border: "1px solid #e3eaf2",
                    background: "#ffffff",
                  }}
                >
                  <select
                    value={member.role}
                    onChange={e =>
                      handleFieldChange(member.id, { role: e.target.value as StaffRoleType })
                    }
                    style={{
                      padding: "5px 9px",
                      borderRadius: 999,
                      border: `1px solid ${badge.border}`,
                      background: badge.bg,
                      color: badge.fg,
                      fontSize: 11.5,
                      fontWeight: 800,
                      cursor: "pointer",
                    }}
                  >
                    {ROLES.map(r => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>

                  <input
                    type="text"
                    value={member.name}
                    onChange={e => handleFieldChange(member.id, { name: e.target.value })}
                    placeholder="이름"
                    style={{
                      padding: "7px 9px",
                      borderRadius: 6,
                      border: "1px solid #d5e0eb",
                      fontSize: 12.5,
                      fontWeight: 700,
                      color: "#203b60",
                    }}
                  />

                  <input
                    type="text"
                    value={member.assignedClasses}
                    onChange={e =>
                      handleFieldChange(member.id, { assignedClasses: e.target.value })
                    }
                    placeholder="담당 반 (예: 고1 심화반)"
                    style={{
                      padding: "7px 9px",
                      borderRadius: 6,
                      border: "1px solid #d5e0eb",
                      fontSize: 12,
                      color: "#334e68",
                    }}
                  />

                  <input
                    type="text"
                    value={member.duties}
                    onChange={e => handleFieldChange(member.id, { duties: e.target.value })}
                    placeholder="담당 업무 (예: 오답 클리닉 / 상담·행정)"
                    style={{
                      padding: "7px 9px",
                      borderRadius: 6,
                      border: "1px solid #d5e0eb",
                      fontSize: 12,
                      color: "#334e68",
                    }}
                  />

                  <button
                    type="button"
                    onClick={() => handleDelete(member.id, `${member.name} ${member.role}`)}
                    title="구성원 삭제"
                    aria-label={`${member.name} 삭제`}
                    style={{
                      padding: "7px 9px",
                      borderRadius: 6,
                      border: "1px solid #fecdd3",
                      background: "#fff1f2",
                      color: "#be123c",
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className={styles.actions}>
        {notice && <span className={styles.success}>{notice}</span>}
        {staff.length > 0 && (
          <button type="button" onClick={handleSaveAll}>
            <Save /> 변경사항 저장
          </button>
        )}
      </div>
    </section>
  );
}

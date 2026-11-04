import AiProblemStudio from "../../components/AiProblemStudio";

export const metadata = {
  title: "AI 스튜디오 | 유니데스크",
  description: "채팅으로 수학 문제를 제작·변형하고, 알지오매스형 함수·기하 작도와 시험지 타이핑을 진행하는 AI 스튜디오",
};

export default function AiStudioPage() {
  return (
    <main style={{ width: "100vw", height: "100vh", overflow: "hidden", background: "#ffffff" }}>
      <AiProblemStudio fullScreen />
    </main>
  );
}

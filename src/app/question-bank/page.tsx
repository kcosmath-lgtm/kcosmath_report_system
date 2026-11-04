import MockExamLibrary from "../../components/MockExamLibrary";
import AiProblemStudio from "../../components/AiProblemStudio";
import catalogData from "../../data/mock-exams.json";
import type { MockExamCatalog } from "../../types/mock-exam";
import styles from "./question-bank.module.css";

export default function QuestionBankPage() {
  const catalog = catalogData as MockExamCatalog;
  return (
    <main className={styles.page} style={{ padding: 0, background: "#ffffff" }}>
      <AiProblemStudio fullScreen />
      <div className={styles.content} style={{ paddingTop: 32 }}>
        <MockExamLibrary exams={catalog.exams} />
      </div>
    </main>
  );
}

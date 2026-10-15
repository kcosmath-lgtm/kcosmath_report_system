import type { StudentDailyRecord } from '../../../types/student-daily';
import styles from './report.module.css';

export default function GradeTrend({daily}:{daily:StudentDailyRecord[]}) {
 const exams=[...daily].sort((a,b)=>a.record_date.localeCompare(b.record_date)).flatMap(record=>record.exams.filter(exam=>Number.isFinite(exam.score)&&Number.isFinite(exam.max_score)&&exam.max_score>0&&exam.score>=0&&exam.score<=exam.max_score).map(exam=>({...exam,date:record.record_date,rate:Math.round(exam.score/exam.max_score*1000)/10})));
 const x=(index:number)=>exams.length===1?260:40+index/(exams.length-1)*440;
 const y=(value:number)=>145-value*1.2;
 return <section className={`${styles.block} ${styles.grades}`}><h3>시험 성적 추이</h3><p className={styles.caption}>시험별 100점 환산 · 시험 범위와 난도가 달라 단순 비교에는 차이가 있습니다.</p>
 {exams.length?<><svg viewBox="0 0 520 180" role="img" aria-label="시험별 100점 환산 성적 추이" className={styles.gradeChart}>
 {[0,50,100].map(value=><g key={value}><line x1="35" x2="490" y1={y(value)} y2={y(value)} stroke="#dce6f2"/><text x="3" y={y(value)+4} fontSize="10" fill="#75869b">{value}</text></g>)}
 <polyline points={exams.map((exam,index)=>`${x(index)},${y(exam.rate)}`).join(' ')} fill="none" stroke="#2864a9" strokeWidth="2.5"/>
 {exams.map((exam,index)=><g key={`${exam.date}-${exam.id}-${index}`}><title>{exam.date} {exam.name}: {exam.score}/{exam.max_score} ({exam.rate}점)</title><circle cx={x(index)} cy={y(exam.rate)} r="4" fill="#2864a9"/><text x={x(index)} y={y(exam.rate)-9} textAnchor="middle" fontSize="10" fill="#2864a9">{exam.rate}</text><text x={x(index)} y={index%2?176:163} textAnchor="middle" fontSize="9" fill="#75869b">{exam.date.slice(5)} · {index+1}</text></g>)}
 </svg><table><thead><tr><th>날짜</th><th>시험명</th><th>점수 / 만점</th><th>100점 환산</th></tr></thead><tbody>{exams.map((exam,index)=><tr key={`${exam.date}-${exam.id}-${index}`}><td>{exam.date.slice(5)}</td><td>{index+1}. {exam.name}</td><td>{exam.score} / {exam.max_score}</td><td>{exam.rate}점</td></tr>)}</tbody></table></>:<p className={styles.empty}>이 기간에 저장된 시험 성적이 없습니다.</p>}
 </section>;
}

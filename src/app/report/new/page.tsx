"use client";
import {useCallback,useEffect,useRef,useState,type CSSProperties} from 'react';
import Link from 'next/link';
import Image from 'next/image';
import dayjs from 'dayjs';
import JSZip from 'jszip';
import {Download,Menu,RefreshCw,Users} from 'lucide-react';
import StudentSidebar from '../../../components/layout/Sidebar';
import LandingMenu from '../../../components/LandingMenu';
import {useAuth} from '../../../components/AuthProvider';
import {loadStudentDaily,loadWrongAnswerRange,loadProgress} from '../../../lib/report-storage';
import {reportMonths} from '../../../lib/wrong-answer-report';
import type {ReportStudent} from '../../../types/report';
import ReportSheets,{type Preview} from './ReportSheets';
import logo from '../../../../public/logo.png';
import styles from './report.module.css';

const safeName=(value:string)=>value.replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').replace(/[. ]+$/g,'').slice(0,70)||'학생';
export default function NewReportPage(){
 const {workspace,user}=useAuth();
 const [students,setStudents]=useState<ReportStudent[]>([]),[sidebar,setSidebar]=useState(true),[active,setActive]=useState('');
 const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date());
 const [end,setEnd]=useState(today);
 const start=dayjs(end).isValid()?dayjs(end).subtract(11,'month').startOf('month').format('YYYY-MM-DD'):'';
 const [reports,setReports]=useState<Preview[]>([]),[loading,setLoading]=useState(false),[exporting,setExporting]=useState(false),[message,setMessage]=useState(''),[revision,setRevision]=useState(0);
 const [orientation,setOrientation]=useState<'portrait'|'landscape'>('portrait');
 const pageWidth=orientation==='landscape'?1123:794,pageHeight=orientation==='landscape'?794:1123;
 const sheets=useRef<HTMLDivElement>(null);
 const [previewScale,setPreviewScale]=useState(1);
 useEffect(()=>{
  const canvas=sheets.current;if(!canvas)return;
  const pageSizes=new Map<Element,number>();
  const fit=()=>{
   const css=getComputedStyle(canvas);
   const width=canvas.clientWidth-parseFloat(css.paddingLeft)-parseFloat(css.paddingRight);
   const height=canvas.clientHeight-parseFloat(css.paddingTop)-parseFloat(css.paddingBottom);
   const pages=Array.from(canvas.querySelectorAll<HTMLElement>('[data-active="true"] [data-sheet]'));
   const fitHeight=Math.max(pageHeight,...pages.map(page=>pageSizes.get(page)??page.offsetHeight));
   // Zoom introduces subpixel rounding. Do not feed tiny size changes back
   // into the observer as a new preview scale on every frame.
   const nextScale=Math.max(0.05,Math.floor(Math.min(1,width/pageWidth,height/fitHeight)*1000)/1000);
   setPreviewScale(current=>Math.abs(Math.round(current*1000)-Math.round(nextScale*1000))>1?nextScale:current);
  };
  const observer=new ResizeObserver(entries=>{
   for(const entry of entries){
    if(entry.target!==canvas){
     const size=entry.borderBoxSize[0];
     if(size)pageSizes.set(entry.target,size.blockSize);
    }
   }
   fit();
  });observer.observe(canvas);
  canvas.querySelectorAll<HTMLElement>('[data-sheet]').forEach(page=>observer.observe(page));
  fit();return()=>observer.disconnect();
 },[reports,active,sidebar,pageWidth,pageHeight]);
 const select=useCallback((next:ReportStudent[])=>{setStudents(next);setActive(current=>next.some(s=>s.id===current)?current:next[0]?.id??'');},[]);
 useEffect(()=>{
  let cancelled=false;
  const months=reportMonths(start,end);
  if(!students.length||!months.length||months.length>12)return;
  async function load(){
   setLoading(true);setReports([]);setMessage('');
   try{
    const [daily,wrong]=await Promise.all([Promise.all(months.map(loadStudentDaily)),loadWrongAnswerRange(start,end,students.map(s=>s.id))]);
    const output:Preview[]=[];
    for(let offset=0;offset<students.length;offset+=4){
     const batch=await Promise.all(students.slice(offset,offset+4).map(async student=>{const progress=await loadProgress(student.id);return {...student,start,end,daily:daily.flat().filter(r=>r.student_id===student.id&&r.record_date>=start&&r.record_date<=end).sort((a,b)=>a.record_date.localeCompare(b.record_date)),wrong:wrong.filter(r=>r.student_id===student.id&&r.record_date>=start&&r.record_date<=end),books:progress.books,entries:progress.entries.filter(e=>e.record_date<=end).sort((a,b)=>a.record_date.localeCompare(b.record_date)||a.created_at.localeCompare(b.created_at))};}));
     if(cancelled)return;output.push(...batch);
    }
    if(!cancelled)setReports(output);
   }catch{if(!cancelled)setMessage('기록을 불러오지 못했습니다. 기록 새로고침으로 다시 시도해 주세요.');}
   finally{if(!cancelled)setLoading(false);}
  }
  void load();return()=>{cancelled=true;};
 },[students,start,end,revision]);
 const valid=reportMonths(start,end).length>0&&reportMonths(start,end).length<=12;
 const current=reports.filter(r=>students.some(s=>s.id===r.id)&&r.start===start&&r.end===end);
 const ready=valid&&!loading&&students.length>0&&current.length===students.length;
 const snapshotKey=`cosmath-daily-snapshot:v2:${workspace?.id}:${user?.id}:${start}:${end}`;
 function saveReports(){try{localStorage.setItem(snapshotKey,JSON.stringify({version:1,reports:current}));setMessage(`${current.length}명 보고서를 현재 브라우저에 저장했습니다. 원본 수업 기록은 변경되지 않습니다.`);}catch{setMessage('브라우저 저장 공간이 부족하거나 저장이 차단되었습니다. 이미지 일괄 저장을 이용해 주세요.');}}
 function loadSaved(){try{const value=JSON.parse(localStorage.getItem(snapshotKey)||'null');if(value?.version!==1||!Array.isArray(value.reports))throw new Error();const saved=value.reports.filter((r:Preview)=>students.some(s=>s.id===r.id)&&r.start===start&&r.end===end&&[r.daily,r.wrong,r.books,r.entries].every(Array.isArray));if(saved.length!==students.length)throw new Error();setReports(saved);setMessage('저장된 보고서를 불러왔습니다. 저장 시점의 기록입니다.');}catch{setMessage('이 기간과 선택한 학생의 저장본을 찾을 수 없습니다.');}}
 async function exportAll(){
  if(!ready||exporting)return;setExporting(true);setMessage('이미지를 준비하고 있습니다.');
  try{
   await document.fonts.ready;
   const {toBlob}=await import('html-to-image');const zip=new JSZip();
   const nodes=Array.from(sheets.current?.querySelectorAll<HTMLElement>('[data-report]')??[]);
   if(nodes.length!==students.length)throw new Error('Missing reports');
   let completed=0;const total=nodes.reduce((n,node)=>n+node.querySelectorAll('[data-sheet]').length,0);
   for(const node of nodes){const report=current.find(r=>r.id===node.dataset.report);if(!report)throw new Error('Missing student');const pages=Array.from(node.querySelectorAll<HTMLElement>('[data-sheet]'));
    for(let index=0;index<pages.length;index++){
     const blob=await toBlob(pages[index],{pixelRatio:2,width:pageWidth,height:pages[index].offsetHeight,style:{zoom:'1'},backgroundColor:'#ffffff',cacheBust:false});if(!blob)throw new Error('Image failed');
     zip.file(`${safeName(report.group)}_${safeName(report.name)}_${safeName(report.id)}/${String(index+1).padStart(2,'0')}_${end}_${orientation}.png`,blob);
     completed++;setMessage(`이미지 생성 중 ${completed} / ${total}`);
    }
   }
   const blob=await zip.generateAsync({type:'blob'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`일일보고서_${end}_${current.length}명_${orientation}.zip`;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);setMessage(`${current.length}명 · ${completed}장의 이미지를 ZIP으로 저장했습니다.`);
  }catch{setMessage('이미지 일괄 저장에 실패했습니다. 파일은 저장되지 않았습니다. 다시 시도해 주세요.');}finally{setExporting(false);}
 }
 return <main className={styles.workspace} data-orientation={orientation} style={{'--report-width':`${pageWidth}px`,'--report-height':`${pageHeight}px`} as CSSProperties}>
  <StudentSidebar isOpen={sidebar} onClose={()=>setSidebar(false)} onBatchSelect={select} disabled={exporting}/>
  <div className={styles.main}>
   <header className={styles.workspaceHeader}><div>{!sidebar&&<button aria-label="학생 목록 열기" onClick={()=>setSidebar(true)}><Menu size={20}/></button>}<Link href="/" aria-label="COSMATH 홈"><Image src={logo} alt="COSMATH" width={150} priority/></Link><div><h1>일일 보고서 <small>(new)</small></h1><span>DAILY LEARNING REPORT</span></div></div><LandingMenu/></header>
   <div className={styles.workspaceToolbar}><div className={styles.range}><label>보고 날짜<input type="date" value={end} disabled={exporting} onChange={e=>setEnd(e.target.value)}/></label><button disabled={loading||exporting||!students.length} onClick={()=>setRevision(v=>v+1)}><RefreshCw size={14}/> 기록 새로고침</button></div><div className={styles.toolbarActions}><label className={styles.orientation}>보고서 방향<select aria-label="보고서 방향" value={orientation} disabled={exporting} onChange={e=>setOrientation(e.target.value as 'portrait'|'landscape')}><option value="portrait">세로형</option><option value="landscape">가로형</option></select></label><button disabled={!students.length||loading||exporting||!valid} onClick={loadSaved}>저장본 불러오기</button><button disabled={!ready||exporting} onClick={saveReports}>보고서 저장</button><button disabled={!ready||exporting} onClick={()=>window.print()}>PDF 저장</button><button className={styles.batchDownload} disabled={!ready||exporting} onClick={()=>void exportAll()}><Download size={16}/>{exporting?'이미지 생성 중…':`이미지 일괄 저장${students.length?` (${students.length}명)`:''}`}</button></div></div>
   {!valid&&<p role="alert" className={styles.message}>올바른 보고 날짜를 선택해 주세요.</p>}
   {message&&<p role="status" className={styles.message}>{message}</p>}
   {students.length>0&&<nav aria-label="보고서 학생 선택" className={styles.studentTabs}>{students.map(s=><button key={s.id} aria-label={`${s.name} 보고서`} disabled={exporting} aria-pressed={active===s.id} onClick={()=>setActive(s.id)}>{s.name}<small>{s.grade}</small></button>)}<span>이미지 저장 시 선택한 학생 전체를 포함합니다.</span></nav>}
   <div className={styles.workspaceCanvas} ref={sheets} style={{'--preview-scale':previewScale} as CSSProperties}>
    {!students.length?<div className={styles.welcome}><Users size={38}/><span>READY TO WRITE</span><h2>학생의 성장 기록을 만나볼까요?</h2><p>왼쪽 목록에서 학생이나 반을 선택하면<br/>저장된 기록으로 보고서가 자동 생성됩니다.</p></div>:loading?<p role="status" className={styles.welcome}>선택한 {students.length}명의 보고서를 불러오는 중…</p>:current.map(report=><div key={report.id} data-report={report.id} data-active={active===report.id} className={styles.reportStack}><ReportSheets preview={report}/></div>)}
   </div>
  </div>
 </main>;
}

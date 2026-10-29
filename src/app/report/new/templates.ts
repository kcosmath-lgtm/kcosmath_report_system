import dayjs from 'dayjs';

export const kinds = {grades:'성적',attendance:'출석',wrong:'오답',homework:'숙제',progress:'진도',feedback:'피드백'};
export type Kind = keyof typeof kinds;
export type Period = 'day'|'week'|'month'|'1month'|'3months'|'custom';
export type Block = {id:string;kind:Kind;view:'card'|'chart'|'table';wide:boolean;emphasis?:boolean};
export const themes = {
 miricheck:'📋 하늘색 학원 체크리스트형 (미리캔버스)',
 mirireport:'📒 노랑 인포그래픽 분석형 (미리캔버스)',
 mirigraph:'📊 파스텔 성취도 평가서형 (미리캔버스)',
 unidesk:'✨ 유니데스크 다크 네이비형',
 notebook:'학습 노트형',
 summary:'한눈에 요약형',
 timeline:'성장 타임라인형',
 briefing:'성적 브리핑형',
 planner:'학습 플래너형',
 letter:'선생님 편지형',
 clean:'정돈된 기본형',
};
export type Theme = keyof typeof themes;
export const themeArtwork:Partial<Record<Theme,string>> = {notebook:'study-desk',summary:'summary-overview',timeline:'timeline-journey',briefing:'briefing-analysis',planner:'planner-week',letter:'letter-envelope'};
export const themeColors:Record<Theme,string> = {
 miricheck:'#5b9bd5',
 mirireport:'#eab308',
 mirigraph:'#4f75ff',
 unidesk:'#3b5bdb',
 notebook:'#355f7a',
 summary:'#b94e3b',
 timeline:'#157c78',
 briefing:'#7144b0',
 planner:'#244bb6',
 letter:'#a44767',
 clean:'#2864a9',
};
export type Template = {id:string;name:string;orientation:'portrait'|'landscape';period:Period;blocks:Block[];theme?:Theme;illustrations?:boolean};
export const recommendations:Partial<Record<Theme,string>> = {notebook:'따뜻하고 균형 잡힌 일일 보고',summary:'핵심 결과를 짧고 빠르게 확인',timeline:'날짜를 따라 학습 과정과 변화 확인',briefing:'시험 결과와 보완할 내용 분석',planner:'배운 내용과 다음 할 일을 함께 정리',letter:'선생님의 피드백을 중심으로 소통'};
export const periods:Record<Period,string> = {day:'하루',week:'이번 주',month:'이번 달','1month':'최근 1개월','3months':'최근 3개월',custom:'직접 선택'};
export function periodStart(period:Period,end:string,custom:string){
 const date=dayjs(end);
 if(!date.isValid())return '';
 if(period==='custom')return custom;
 if(period==='week')return date.subtract((date.day()+6)%7,'day').format('YYYY-MM-DD');
 if(period==='month')return date.startOf('month').format('YYYY-MM-DD');
 if(period==='1month'||period==='3months')return date.subtract(period==='1month'?1:3,'month').add(1,'day').format('YYYY-MM-DD');
 return end;
}
function blocks(theme:Theme,items:[Kind,Block['view'],boolean?,boolean?][]):Block[]{return items.map(([kind,view,wide=false,emphasis=false],i)=>({id:`${theme}-${i}`,kind,view,wide,emphasis}));}
export const presets:Template[] = [
 {id:'preset-0',name:themes.notebook,theme:'notebook',orientation:'portrait',period:'day',illustrations:true,blocks:blocks('notebook',[['attendance','card'],['homework','card'],['grades','chart',true,true],['wrong','chart'],['progress','card'],['feedback','card']])},
 {id:'preset-summary',name:themes.summary,theme:'summary',orientation:'portrait',period:'day',illustrations:true,blocks:blocks('summary',[['grades','card',true,true],['attendance','card'],['homework','card'],['wrong','card'],['feedback','card',true]])},
 {id:'preset-timeline',name:themes.timeline,theme:'timeline',orientation:'portrait',period:'1month',illustrations:true,blocks:blocks('timeline',[['progress','table',true],['grades','chart',true,true],['wrong','chart',true],['feedback','card',true]])},
 {id:'preset-briefing',name:themes.briefing,theme:'briefing',orientation:'landscape',period:'1month',illustrations:true,blocks:blocks('briefing',[['grades','chart',true,true],['grades','table',true],['wrong','card'],['feedback','card']])},
 {id:'preset-planner',name:themes.planner,theme:'planner',orientation:'landscape',period:'week',illustrations:true,blocks:blocks('planner',[['progress','card'],['homework','table'],['wrong','chart'],['attendance','card'],['feedback','card',true]])},
 {id:'preset-letter',name:themes.letter,theme:'letter',orientation:'portrait',period:'week',illustrations:true,blocks:blocks('letter',[['feedback','card',true,true],['progress','card',true],['attendance','card'],['homework','card'],['wrong','card']])},
];

export type ReportCycle = 'day'|'week'|'month';
export type ReportFocus = 'balanced'|'exam'|'coaching';

export const reportCycles:Record<ReportCycle,{label:string;badge:string;desc:string;defaultTheme:Theme}> = {
 day:{label:'일일 보고서',badge:'DAILY REPORT',desc:'당일 수업 출결·숙제·진도·테스트 체크리스트',defaultTheme:'miricheck'},
 week:{label:'주간 보고서',badge:'WEEKLY REPORT',desc:'주간 3단계 학습 점검 및 진도·성적 비교 분석',defaultTheme:'mirireport'},
 month:{label:'월간 보고서',badge:'MONTHLY REPORT',desc:'월간 성취도 막대 그래프 및 종합 평가 리포트',defaultTheme:'mirigraph'},
};

export const reportFocuses:Record<ReportFocus,{label:string;desc:string;defaultTheme:Theme}> = {
 balanced:{label:'기본 종합형',desc:'출결·숙제·진도·성적·피드백 균형 구성',defaultTheme:'miricheck'},
 exam:{label:'성적·오답 집중형',desc:'시험 점수 추이와 오답 완료율 중심 분석',defaultTheme:'mirireport'},
 coaching:{label:'진도·피드백 집중형',desc:'교재 진도율과 선생님 코멘트 중심 소통',defaultTheme:'mirigraph'},
};

const cycleFocusBlocks:Record<ReportCycle,Record<ReportFocus,[Kind,Block['view'],boolean?,boolean?][]>> = {
 day:{
  balanced:[['attendance','card'],['homework','card'],['progress','chart',true],['grades','card'],['wrong','card'],['feedback','card',true]],
  exam:[['grades','chart',true,true],['wrong','chart'],['homework','card'],['attendance','card'],['progress','card'],['feedback','card',true]],
  coaching:[['progress','chart',true],['homework','card'],['attendance','card'],['wrong','card'],['feedback','chart',true,true]],
 },
 week:{
  balanced:[['attendance','chart'],['homework','chart'],['progress','table',true],['grades','chart',true],['wrong','chart',true],['feedback','card',true]],
  exam:[['grades','chart',true,true],['grades','table',true],['wrong','chart',true],['homework','table'],['attendance','card'],['feedback','card',true]],
  coaching:[['progress','chart',true],['homework','table',true],['attendance','table'],['wrong','chart'],['feedback','chart',true,true]],
 },
 month:{
  balanced:[['grades','chart',true,true],['progress','chart',true],['attendance','chart'],['homework','chart'],['wrong','table',true],['feedback','chart',true]],
  exam:[['grades','chart',true,true],['grades','table',true],['wrong','table',true],['progress','chart'],['attendance','card'],['feedback','chart',true]],
  coaching:[['progress','table',true],['homework','chart'],['attendance','chart'],['wrong','chart',true],['feedback','chart',true,true]],
 },
};

const fallbackKindSpec:Record<ReportCycle,Record<Kind,[Kind,Block['view'],boolean?,boolean?]>> = {
 day:{
  grades:['grades','card',false,false],
  attendance:['attendance','card',false,false],
  homework:['homework','card',false,false],
  wrong:['wrong','card',false,false],
  progress:['progress','chart',true,false],
  feedback:['feedback','card',true,false],
 },
 week:{
  grades:['grades','chart',true,false],
  attendance:['attendance','chart',false,false],
  homework:['homework','chart',false,false],
  wrong:['wrong','chart',true,false],
  progress:['progress','table',true,false],
  feedback:['feedback','card',true,false],
 },
 month:{
  grades:['grades','chart',true,true],
  attendance:['attendance','chart',false,false],
  homework:['homework','chart',false,false],
  wrong:['wrong','table',true,false],
  progress:['progress','chart',true,false],
  feedback:['feedback','chart',true,false],
 },
};

export function defaultKindsFor(cycle:ReportCycle,focus:ReportFocus):Kind[]{
 const set=new Set<Kind>();
 for(const [kind] of cycleFocusBlocks[cycle][focus])set.add(kind);
 return Array.from(set);
}

export function buildStructuredTemplate(params:{
 cycle:ReportCycle;
 focus:ReportFocus;
 theme:Theme;
 orientation:'portrait'|'landscape';
 enabledKinds:Kind[];
 illustrations?:boolean;
}):Template{
 const {cycle,focus,theme,orientation,enabledKinds,illustrations=true}=params;
 const activeSet=new Set<Kind>(enabledKinds.length?enabledKinds:['feedback']);
 const baseSpecs=cycleFocusBlocks[cycle][focus].filter(([k])=>activeSet.has(k));
 const present=new Set<Kind>(baseSpecs.map(([k])=>k));
 const extraSpecs:typeof baseSpecs=[];
 for(const k of activeSet){
  if(!present.has(k))extraSpecs.push(fallbackKindSpec[cycle][k]);
 }
 const finalSpecs=[...baseSpecs,...extraSpecs];
 return {
  id:`structured-${cycle}-${focus}`,
  name:`${reportCycles[cycle].label} · ${reportFocuses[focus].label}`,
  theme,
  orientation,
  period:cycle,
  illustrations,
  blocks:blocks(theme,finalSpecs.length?finalSpecs:[['feedback','card',true]]),
 };
}
export function isTemplate(value:unknown):value is Template{
 if(!value||typeof value!=='object')return false;
 const t=value as Template;
 return typeof t.id==='string'&&typeof t.name==='string'&&t.name.length>0&&t.name.length<=40&&['portrait','landscape'].includes(t.orientation)&&Object.hasOwn(periods,t.period)&&(t.theme===undefined||Object.hasOwn(themes,t.theme))&&(t.illustrations===undefined||typeof t.illustrations==='boolean')&&Array.isArray(t.blocks)&&t.blocks.length>0&&t.blocks.length<=12&&t.blocks.every(b=>b&&typeof b.id==='string'&&Object.hasOwn(kinds,b.kind)&&['card','chart','table'].includes(b.view)&&typeof b.wide==='boolean'&&(b.emphasis===undefined||typeof b.emphasis==='boolean'))&&new Set(t.blocks.map(b=>b.id)).size===t.blocks.length;
}

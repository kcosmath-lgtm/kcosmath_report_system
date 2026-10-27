import dayjs from 'dayjs';

export const kinds = {grades:'성적',attendance:'출석',wrong:'오답',homework:'숙제',progress:'진도',feedback:'피드백'};
export type Kind = keyof typeof kinds;
export type Period = 'day'|'week'|'month'|'1month'|'3months'|'custom';
export type Block = {id:string;kind:Kind;view:'card'|'chart'|'table';wide:boolean;emphasis?:boolean};
export const themes = {notebook:'학습 노트형',summary:'한눈에 요약형',timeline:'성장 타임라인형',briefing:'성적 브리핑형',planner:'학습 플래너형',letter:'선생님 편지형',clean:'정돈된 기본형'};
export type Theme = keyof typeof themes;
export const themeArtwork:Partial<Record<Theme,string>> = {notebook:'study-desk',summary:'summary-overview',timeline:'timeline-journey',briefing:'briefing-analysis',planner:'planner-week',letter:'letter-envelope'};
export const themeColors:Record<Theme,string> = {notebook:'#355f7a',summary:'#b94e3b',timeline:'#157c78',briefing:'#7144b0',planner:'#244bb6',letter:'#a44767',clean:'#2864a9'};
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
export function isTemplate(value:unknown):value is Template{
 if(!value||typeof value!=='object')return false;
 const t=value as Template;
 return typeof t.id==='string'&&typeof t.name==='string'&&t.name.length>0&&t.name.length<=40&&['portrait','landscape'].includes(t.orientation)&&Object.hasOwn(periods,t.period)&&(t.theme===undefined||Object.hasOwn(themes,t.theme))&&(t.illustrations===undefined||typeof t.illustrations==='boolean')&&Array.isArray(t.blocks)&&t.blocks.length>0&&t.blocks.length<=12&&t.blocks.every(b=>b&&typeof b.id==='string'&&Object.hasOwn(kinds,b.kind)&&['card','chart','table'].includes(b.view)&&typeof b.wide==='boolean'&&(b.emphasis===undefined||typeof b.emphasis==='boolean'))&&new Set(t.blocks.map(b=>b.id)).size===t.blocks.length;
}

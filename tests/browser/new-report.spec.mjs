import { test,expect } from '@playwright/test';
for(const orientation of ['portrait','landscape']) test(`batch report exports grades and ${orientation} images for all selected students`,async({page})=>{
 const host=new URL(process.env.NEXT_PUBLIC_SUPABASE_URL||'https://placeholder-url-for-build.supabase.co').hostname;
 const user={id:'10000000-0000-4000-8000-000000000001',email:'test@example.com',aud:'authenticated',role:'authenticated',user_metadata:{},app_metadata:{}};
 const token=['eyJhbGciOiJIUzI1NiJ9',Buffer.from(JSON.stringify({sub:user.id,exp:Math.floor(Date.now()/1000)+86400,role:'authenticated'})).toString('base64url'),'signature'].join('.');
 await page.addInitScript(({host,user,token})=>localStorage.setItem(`sb-${host.split('.')[0]}-auth-token`,JSON.stringify({access_token:token,refresh_token:'test',expires_at:Math.floor(Date.now()/1000)+86400,user})),{host,user,token});
 await page.route(`https://${host}/**`,route=>route.fulfill({json:route.request().url().includes('cosmath_get_my_workspace')?{id:'academy',name:'Test',role:'owner'}:user}));
 await page.goto('/students');await expect(page.getByText('등록된 반이 없습니다.')).toBeVisible();
 await page.evaluate(()=>new Promise((resolve,reject)=>{const req=indexedDB.open('cosmath-local-v1',6);req.onsuccess=()=>{const db=req.result,tx=db.transaction(['classes','students'],'readwrite');tx.objectStore('classes').put({id:'class',name:'테스트 반'});for(const [id,name] of [['a','학생 A'],['b','학생 B']])tx.objectStore('students').put({id,class_id:'class',name,grade:'중2',active:true,version:1});tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};req.onerror=()=>reject(req.error);}));
 await page.evaluate(()=>new Promise((resolve,reject)=>{const request=indexedDB.open('cosmath-local-v1',6);request.onsuccess=()=>{const db=request.result,tx=db.transaction(['studentDaily','wrongAnswers'],'readwrite');tx.objectStore('studentDaily').put({id:'daily',student_id:'a',record_date:'2026-10-10',attendance:'출석',reason:'',exams:[{id:'exam-1',name:'단원 평가',score:35,max_score:50,scope:'',memo:''},{id:'exam-2',name:'종합 평가',score:80,max_score:100,scope:'',memo:''},{id:'exam-3',name:'복습 평가',score:0,max_score:20,scope:'',memo:''}],version:1});tx.objectStore('wrongAnswers').put({id:'wrong',student_id:'a',record_date:'2026-10-10',total_wrong:10,corrected_count:7,homework_status:'O',completed:false,memo:'',version:1});tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};request.onerror=()=>reject(request.error);}));
 await page.evaluate(()=>new Promise((resolve,reject)=>{
  const request=indexedDB.open('cosmath-local-v1',6);
  request.onsuccess=()=>{
   const db=request.result,tx=db.transaction(['studentDaily','wrongAnswers','progressBooks','progressEntries'],'readwrite');
   for(let day=1;day<=6;day++){
    const date=`2026-09-0${day}`;
    tx.objectStore('wrongAnswers').put({id:`history-${day}`,student_id:'a',record_date:date,total_wrong:day,corrected_count:1,homework_status:'X',version:1});
    tx.objectStore('studentDaily').put({id:`history-${day}`,student_id:'a',record_date:date,attendance:'결석',reason:'',exams:[{id:`old-exam-${day}`,name:`이전 시험 ${day}`,score:day,max_score:10,scope:'',memo:''}],version:1});
   }
   tx.objectStore('progressBooks').put({id:'book',student_id:'a',title:'수학 교재',curriculum:'중등',course:'수학',units:[],states:{},version:1});
   tx.objectStore('progressEntries').put({id:'entry',book_id:'book',record_date:'2026-10-10',unit_ids:[],scope:'이차방정식 42~46쪽',homework:'47~49쪽 풀기',due_date:'2026-10-12',memo:'풀이 과정을 차근차근 설명했습니다.',states:{},created_at:'2026-10-10T10:00:00Z'});
   tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);
  };request.onerror=()=>reject(request.error);
 }));
 await page.goto('/report/new');
 await page.getByLabel('보고서 방향',{exact:true}).selectOption(orientation);
 await page.getByLabel('테스트 반 전체 선택',{exact:true}).check();
 await page.getByLabel('보고 날짜',{exact:true}).fill('2026-10-10');
 const downloadButton=page.getByRole('button',{name:'이미지 일괄 저장 (2명)',exact:true});await expect(downloadButton).toBeEnabled();
 await expect(page.locator('[data-report]')).toHaveCount(2);await expect(page.getByRole('textbox')).toHaveCount(1);
 // Once fitted, the preview must stop resizing (including taller portrait pages).
 await page.evaluate(()=>document.fonts.ready);
 await page.waitForTimeout(300);
 const scales=await page.locator('[style*="--preview-scale"]').evaluate(async canvas=>{
  const samples=[];
  for(let frame=0;frame<60;frame++){
   await new Promise(resolve=>requestAnimationFrame(resolve));
   samples.push(canvas.style.getPropertyValue('--preview-scale'));
  }
  return samples;
 });
 expect([...new Set(scales)]).toHaveLength(1);
 const report=page.locator('[data-report="a"]');
 await expect(report.locator('[data-sheet]')).toHaveCount(1);
 await expect(report.locator('[data-today]')).toHaveCount(5);
 await expect(report.locator('[data-today=true]')).toHaveCount(1);
 await expect(report).toContainText('이차방정식 42~46쪽');
 await expect(report).toContainText('47~49쪽 풀기');
 await expect(report).toContainText('풀이 과정을 차근차근 설명했습니다.');
 await expect(report).not.toContainText('이전 시험 4');
 await expect(report).toContainText('이전 시험 5');
 expect(await report.locator('[data-sheet]').evaluate(el=>el.scrollHeight<=el.clientHeight+1)).toBe(true);
 await expect(page.locator('[data-report="a"]')).toContainText('남은 3문제');
 await expect(page.locator('[data-report="a"]')).toContainText('최근 시험 성적');await expect(page.locator('[data-report="a"]')).toContainText('오늘 검사한 숙제');await expect(page.locator('[data-report="a"]')).toContainText('0 / 20');
 await expect(page.locator('[data-report="b"]')).toContainText('저장된 시험 성적이 없습니다.');
 await page.screenshot({path:`test-results/new-report-grades-${orientation}.png`});
 await page.getByRole('navigation',{name:'보고서 학생 선택'}).getByRole('button',{name:'학생 B 보고서',exact:true}).click();
 await expect(page.locator('[data-report="b"]')).toHaveAttribute('data-active','true');
 await expect.poll(async()=>page.locator('[data-report="b"] [data-sheet]').first().evaluate(page=>{const bounds=page.getBoundingClientRect(),canvas=page.closest('[style*="--preview-scale"]').getBoundingClientRect();return bounds.height<=canvas.height&&bounds.width<=canvas.width;})).toBe(true);
 await page.screenshot({path:`test-results/new-report-${orientation}.png`});
 await page.getByRole('button',{name:'보고서 저장',exact:true}).click();await expect(page.getByRole('status')).toContainText('2명 보고서를 현재 브라우저에 저장');
 const downloadEvent=page.waitForEvent('download');await downloadButton.click();const download=await downloadEvent;expect(download.suggestedFilename()).toContain(`2명_${orientation}.zip`);
 const fs=await import('node:fs/promises'),JSZip=(await import('jszip')).default;
 const zip=await JSZip.loadAsync(await fs.readFile(await download.path()));const images=Object.keys(zip.files).filter(name=>name.endsWith('.png'));expect(images).toHaveLength(2);
 expect(images.filter(name=>name.includes('학생 A'))).toHaveLength(1);expect(images.filter(name=>name.includes('학생 B'))).toHaveLength(1);
 for(const name of images){const bytes=await zip.file(name).async('uint8array');expect([...bytes.slice(0,8)]).toEqual([137,80,78,71,13,10,26,10]);const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);expect(view.getUint32(16)).toBe(orientation==='landscape'?2246:1588);expect(view.getUint32(20)).toBeGreaterThanOrEqual(orientation==='landscape'?1588:2246);}
 await expect(page.getByRole('status')).toContainText('2명 · 2장');
 await page.getByRole('button',{name:'저장본 불러오기',exact:true}).click();await expect(page.getByRole('status')).toContainText('저장된 보고서를 불러왔습니다');
 await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'학생 목록 닫기',exact:true}).click();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 await page.emulateMedia({media:'print'});await expect(page.getByRole('complementary',{name:'학생 목록'})).toBeHidden();await expect(page.locator('[data-sheet]')).toHaveCount(2);
});

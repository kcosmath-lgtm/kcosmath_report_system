import {test,expect} from '@playwright/test';

test('six templates offer distinct layouts with portrait and landscape previews',async({page})=>{
 const host=new URL(process.env.NEXT_PUBLIC_SUPABASE_URL||'https://placeholder-url-for-build.supabase.co').hostname;
 const user={id:'10000000-0000-4000-8000-000000000001',email:'test@example.com',aud:'authenticated',role:'authenticated',user_metadata:{},app_metadata:{}};
 const token=['eyJhbGciOiJIUzI1NiJ9',Buffer.from(JSON.stringify({sub:user.id,exp:Math.floor(Date.now()/1000)+86400,role:'authenticated'})).toString('base64url'),'signature'].join('.');
 await page.addInitScript(({host,user,token})=>localStorage.setItem(`sb-${host.split('.')[0]}-auth-token`,JSON.stringify({access_token:token,refresh_token:'test',expires_at:Math.floor(Date.now()/1000)+86400,user})),{host,user,token});
 await page.route(`https://${host}/**`,route=>route.fulfill({json:route.request().url().includes('cosmath_get_my_workspace')?{id:'academy',name:'Test',role:'owner'}:user}));
 await page.goto('/report/new');
 await page.getByRole('button',{name:'템플릿 만들기·편집'}).click();
 const editor=page.getByRole('dialog');
 const presets=editor.locator('button[data-preset]');
 await expect(presets).toHaveCount(6);
 for(const old of ['집중 관리형','성적 분석형','학습 관리형','주간 요약형'])await expect(editor.getByRole('button',{name:old,exact:true})).toHaveCount(0);
 const ownedImages=new Set();
 const paletteColors=new Set();
 for(const theme of ['notebook','summary','timeline','briefing','planner','letter']){
  await editor.locator(`button[data-preset="${theme}"]`).click();
  await expect(editor.getByLabel('보고서 디자인',{exact:true})).toHaveValue(theme);
  for(const orientation of ['portrait','landscape']){
   await editor.getByLabel('템플릿 방향',{exact:true}).selectOption(orientation);
   const sheets=editor.locator('[data-sheet]');
   await expect(sheets.first()).toHaveAttribute('data-theme',theme);
   await sheets.evaluateAll(async nodes=>{await document.fonts.ready;await Promise.all(nodes.flatMap(node=>Array.from(node.querySelectorAll('img')).map(img=>img.decode())));});
   if(orientation==='portrait'){
    const images=await sheets.evaluateAll(nodes=>[...new Set(nodes.flatMap(node=>Array.from(node.querySelectorAll('img')).map(img=>img.getAttribute('src'))))]);
    expect(images.length).toBeGreaterThan(0);
    for(const src of images){expect(ownedImages.has(src)).toBe(false);ownedImages.add(src);}
    paletteColors.add(await sheets.first().evaluate(node=>getComputedStyle(node).getPropertyValue('--accent')));
   }
   expect(await sheets.evaluateAll(nodes=>nodes.every(node=>node.scrollWidth<=node.clientWidth+1))).toBe(true);
   const zoom=await sheets.first().evaluate(node=>node.style.zoom);
   await sheets.first().evaluate((node,orientation)=>{node.style.zoom=orientation==='portrait'?'.45':'.6';},orientation);
   await sheets.first().screenshot({path:`test-results/gallery-${theme}-${orientation}.png`});
   await sheets.first().evaluate((node,zoom)=>{node.style.zoom=zoom;},zoom);
  }
 }
 expect(paletteColors.size).toBe(6);
 await editor.getByRole('button',{name:'템플릿 저장',exact:true}).click();
 await page.reload();
 await page.getByLabel('내 템플릿',{exact:true}).selectOption({label:'선생님 편지형'});
 await page.getByRole('button',{name:'템플릿 만들기·편집'}).click();
 await expect(page.getByLabel('보고서 디자인',{exact:true})).toHaveValue('letter');
 await page.keyboard.press('Escape');
});

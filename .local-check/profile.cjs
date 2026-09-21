const puppeteer = require('C:/Users/user/AppData/Local/npm-cache/_npx/1a4eb60c8f6b0f89/node_modules/puppeteer-core');
const fs = require('node:fs');
(async () => {
 const env = fs.readFileSync('.env.local','utf8');
 const url = env.match(/^NEXT_PUBLIC_SUPABASE_URL\s*=\s*["']?([^\s"']+)/m)[1];
 const host = new URL(url).hostname;
 const browser = await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try {
 const page = await browser.newPage();
 const errors=[]; page.on('pageerror',e=>errors.push(e.message));
 await page.setRequestInterception(true);
 let workspace = {id:'test-workspace',name:'테스트 학원',role:'owner'};
 page.on('request',r=>{if(new URL(r.url()).hostname===host) r.respond({status:200,contentType:'application/json',body:JSON.stringify(r.url().includes('cosmath_get_my_workspace')?workspace:[])});else r.continue();});
 await page.goto('http://localhost:3000',{waitUntil:'networkidle0'});
 console.log('anonymous login',await page.evaluate(()=>[...document.querySelectorAll('button')].some(b=>b.textContent.includes('로그인'))));
 const user={id:'10000000-0000-4000-8000-000000000001',aud:'authenticated',role:'authenticated',email:'local-test@example.com',user_metadata:{full_name:'테스트 선생님',avatar_url:'/logo.png'},app_metadata:{provider:'google'},created_at:new Date().toISOString()};
 await page.evaluate(({host,user})=>localStorage.setItem('sb-'+host.split('.')[0]+'-auth-token',JSON.stringify({access_token:'test-token',refresh_token:'test-refresh',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user})),{host,user});
 await page.evaluate(()=>{const key=Object.keys(localStorage).find(k=>k.endsWith('-auth-token'));const s=JSON.parse(localStorage.getItem(key));s.access_token=btoa(JSON.stringify({alg:'HS256',typ:'JWT'}))+'.'+btoa(JSON.stringify({sub:s.user.id,exp:s.expires_at,iat:Math.floor(Date.now()/1000),role:'authenticated'}))+'.dGVzdA';localStorage.setItem(key,JSON.stringify(s));});
 await page.reload({waitUntil:'networkidle0'});
 await page.waitForSelector('button[aria-controls="landing-main-menu"]',{timeout:10000}).catch(async e=>{console.log('diagnostic',await page.evaluate(()=>document.body.innerText.slice(0,250)),errors);throw e;});
 for(const [name,width,height] of [['desktop',1440,1000],['mobile',390,844],['small-mobile',375,667]]) {
 await page.setViewport({width,height});
 await page.click('button[aria-controls="landing-main-menu"]');
 await page.waitForSelector('#landing-main-menu');
 console.log(name,await page.evaluate(()=>{const p=document.querySelector('#landing-main-menu'),r=p.getBoundingClientRect();return {text:p.innerText,links:[...p.querySelectorAll('a')].map(a=>({href:a.getAttribute('href'),visible:(()=>{const b=a.getBoundingClientRect();return a.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2));})()})),bounds:{x:r.x,y:r.y,width:r.width,height:r.height},fits:r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth};}));
 await page.screenshot({path:'.local-check/profile-'+name+'.png'});
 await page.keyboard.press('Escape');
 console.log(name,'escapeClosed',await page.$('#landing-main-menu')===null);
 }
 await page.click('button[aria-controls="landing-main-menu"]');await page.mouse.click(5,600);console.log('outsideClosed',await page.$('#landing-main-menu')===null);
 await page.click('button[aria-controls="landing-main-menu"]');await page.click('#landing-main-menu a[href="/settings"]');await page.waitForFunction(()=>location.pathname==='/settings');console.log('settingsNavigation',true);
 workspace=null;await page.goto('http://localhost:3000',{waitUntil:'networkidle0'});console.log('noWorkspace',await page.evaluate(()=>({profile:!!document.querySelector('[aria-controls="landing-main-menu"]'),login:[...document.querySelectorAll('button')].some(b=>b.textContent.includes('로그인'))})));
 console.log('pageErrors',errors);
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});

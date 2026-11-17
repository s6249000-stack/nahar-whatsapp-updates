'use strict';
const GROUP_LOCK='testGroupLock';
const JOB='testJob';
const ALARM='nahar-test-send';
let ongoing=false;
let nearTermTimer=null;
function classify(phase,detail){
 const d=String(detail||'');
 if(phase==='attempted'||phase==='scheduled'||phase==='processing')return {stage:phase==='scheduled'?'schedule':phase==='processing'?'alarm':'send',code:'OK'};
 if(/CHANNEL_OPEN/.test(d))return {stage:'channel_navigation',code:'OPEN_FAILED'};
 if(/CHANNEL_HUB/.test(d))return {stage:'channel_navigation',code:'HUB_NOT_OPEN'};
 if(/CHANNEL_ROW/.test(d))return {stage:'channel_selection',code:'CHANNEL_NOT_FOUND'};
 if(/CHANNEL_ARROW/.test(d))return {stage:'channel_post',code:'FORWARD_CONTROL_MISSING'};
 if(/CHANNEL_PICKER/.test(d))return {stage:'channel_forward',code:'RECIPIENT_PICKER_MISSING'};
 if(/לשונית WhatsApp|לא נמצאה לשונית/.test(d))return {stage:'tab',code:'NO_TAB'};
 if(/רכיב WhatsApp|חיבור התוסף|לא החזיר תשובה|לא נטען לאחר/.test(d))return {stage:'probe',code:'NO_BRIDGE'};
 if(/אזור שיחה חסר/.test(d))return {stage:'chat',code:'NO_MAIN'};
 if(/חיפוש|שדה החיפוש/.test(d))return {stage:'search',code:'NO_SEARCH'};
 if(/תוצאה מדויקת|לא נמצאה|לא נמצא.*קבוצת/.test(d))return {stage:'search',code:'NO_RESULT'};
 if(/כמה שיחות|כמה תוצאות/.test(d))return {stage:'search',code:'MULTIPLE_RESULTS'};
 if(/לא אומתה|לא נפתחה|השתנתה|קבוצה.*לא/.test(d))return {stage:'verify',code:'GROUP_MISMATCH'};
 if(/כתיבה|שדה כתיבת/.test(d))return {stage:'compose',code:'NO_EDITOR'};
 if(/טיוטה|טקסט.*קיים/.test(d))return {stage:'compose',code:'DRAFT_EXISTS'};
 if(/טקסט|נוסח/.test(d))return {stage:'compose',code:'TEXT_MISMATCH'};
 if(/כפתור שליחה/.test(d))return {stage:'send',code:'SEND_BUTTON_MISSING'};
 if(/מועד|תזמון/.test(d))return {stage:'schedule',code:'REJECTED'};
 return {stage:'unknown',code:'OTHER'};
}
function safeMetrics(m){
 if(!m||typeof m!=='object')return {};
 return {hasMain:m.hasMain===true,hasHeader:m.hasHeader===true,hasSide:m.hasSide===true,hasSearch:m.hasSearch===true,hasEditor:m.hasEditor===true,headerFields:Math.min(100,Math.max(0,Math.floor(Number(m.headerFields)||0)))};
}
async function status(phase, detail='',metrics={}){
 const r=await chrome.storage.local.get(JOB);
 const attemptId=r[JOB]?.attemptId||'unknown';
 const info=classify(phase,detail);
 const event={phase,detail,at:new Date().toISOString(),stage:info.stage,code:info.code,version:chrome.runtime.getManifest().version,attemptId,metrics:safeMetrics(metrics)};
 await chrome.storage.local.set({lastStatus:event});
 // Status is pushed to the already-open, protected scheduler page. It uploads only whitelisted diagnostics.
 try{
  const tabs=await chrome.tabs.query({url:'https://nahar-shalom-tools.pages.dev/tools/whatsapp-scheduler/*'});
  await Promise.all(tabs.map(t=>chrome.tabs.sendMessage(t.id,{type:'NAHAR_WA_DIAGNOSTIC_PUSH',status:event}).catch(()=>{})));
 }catch{}
}
async function setAlarm(job) {await chrome.alarms.clear(ALARM);await chrome.alarms.create(ALARM,{when:job.when});}
async function activateWhatsappTab(){
 const tabs=await chrome.tabs.query({url:'https://web.whatsapp.com/*'});
 if(!tabs.length)throw Error('לא נמצאה לשונית WhatsApp Web. פתח אותה פעם אחת באותו Chrome ונסה שוב');
 const tab=tabs.find(t=>t.active&&t.windowId!==undefined)||tabs.find(t=>t.status==='complete')||tabs[0];
 if(tab.windowId!==undefined)await chrome.windows.update(tab.windowId,{focused:true});
 await chrome.tabs.update(tab.id,{active:true});
 return tab;
}
async function probeWhatsappTab(tab){
 let lastError='';
 for(let i=0;i<24;i++){
  try{
   let pong;
   try{pong=await chrome.tabs.sendMessage(tab.id,{type:'WA_TEST_PING_V0618'});}
   catch(e){
    await chrome.scripting.executeScript({target:{tabId:tab.id},files:['whatsapp.js']});
    pong=await chrome.tabs.sendMessage(tab.id,{type:'WA_TEST_PING_V0618'});
   }
   if(pong?.ok&&(pong.hasSide||pong.hasMain))return pong;
   lastError='WhatsApp Web עדיין טוען את רשימת השיחות';
  }catch(e){lastError=String(e?.message||e)}
  await new Promise(resolve=>setTimeout(resolve,350));
 }
 throw Error('WhatsApp Web לא נטען לאחר מעבר ללשונית. '+lastError.slice(0,180));
}

// File data is transferred in small chunks to extension IndexedDB, not as one Chrome
// runtime message or a chrome.storage.local value. Browser storage availability is the only size limit.
const FILE_DB='nahar-wa-scheduler-files-v1';
let fileDbPromise;
function fileDb(){
 if(!fileDbPromise)fileDbPromise=new Promise((resolve,reject)=>{
  const req=indexedDB.open(FILE_DB,1);
  req.onupgradeneeded=()=>{const db=req.result;db.createObjectStore('meta');db.createObjectStore('chunks')};
  req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
 });
 return fileDbPromise;
}
async function dbAction(store,mode,fn){
 const db=await fileDb();
 return new Promise((resolve,reject)=>{
  const tx=db.transaction(store,mode),obj=tx.objectStore(store);
  let result;
  try{const r=fn(obj);r.onsuccess=()=>{result=r.result};r.onerror=()=>reject(r.error)}catch(e){reject(e);return}
  tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
 });
}
const fileKey=(id,index)=>id+':'+String(index).padStart(8,'0');
async function cleanUpload(id){
 const meta=await dbAction('meta','readonly',s=>s.get(id));
 if(meta)for(let i=0;i<meta.next;i++)await dbAction('chunks','readwrite',s=>s.delete(fileKey(id,i)));
 await dbAction('meta','readwrite',s=>s.delete(id));
}
async function handleFileMessage(msg,sender){
 const type=msg.type;
 const isSite=sender.url?.startsWith('https://nahar-shalom-tools.pages.dev/tools/whatsapp-scheduler/');
 const isWa=sender.url?.startsWith('https://web.whatsapp.com/');
 if(type==='FILE_CHUNK_READ'){
  if(!isWa)throw Error('הגישה לקובץ אינה מורשית');
  const job=(await chrome.storage.local.get(JOB))[JOB];
  if(job?.phase!=='processing'||job.attachment?.id!==msg.id)throw Error('אין קובץ מורשה לניסיון השליחה הפעיל');
  const meta=await dbAction('meta','readonly',s=>s.get(msg.id));
  if(!meta?.committed||!Number.isInteger(msg.index)||msg.index<0||msg.index>=meta.next)throw Error('מקטע הקובץ אינו זמין');
  const chunk=await dbAction('chunks','readonly',s=>s.get(fileKey(msg.id,msg.index)));
  if(typeof chunk!=='string')throw Error('חסר מקטע קובץ');
  return {ok:true,data:chunk};
 }
 if(!isSite)throw Error('הבקשה לקובץ אינה מורשית');
 if(type==='FILE_BEGIN'){
  const a=msg.attachment;
  if(!a||!(/^[a-f0-9-]{36}$/i.test(a.id))||typeof a.name!=='string'||!a.name||a.name.length>180||
    /[\\/\x00-\x1f]/.test(a.name)||typeof a.type!=='string'||a.type.length>100||
    !Number.isSafeInteger(a.size)||a.size<=0)throw Error('נתוני הקובץ אינם תקינים');
  await cleanUpload(a.id);
  await dbAction('meta','readwrite',s=>s.put({id:a.id,name:a.name,type:a.type,size:a.size,next:0,bytes:0,committed:false},a.id));
  return {ok:true};
 }
 if(!/^[a-f0-9-]{36}$/i.test(String(msg.id||'')))throw Error('מזהה קובץ שגוי');
 if(type==='FILE_ABORT'){await cleanUpload(msg.id);return {ok:true}}
 const meta=await dbAction('meta','readonly',s=>s.get(msg.id));
 if(!meta)throw Error('לא נמצאה העלאת קובץ פעילה');
 if(type==='FILE_CHUNK'){
  if(meta.committed||!Number.isInteger(msg.index)||msg.index!==meta.next||typeof msg.data!=='string'||
   !/^[A-Za-z0-9+/]+={0,2}$/.test(msg.data)||msg.data.length>400000)throw Error('מקטע קובץ אינו תקין או אינו בסדר הנכון');
  let size;try{size=atob(msg.data).length}catch{throw Error('קידוד מקטע קובץ שגוי')}
  if(size===0||size>196608||meta.bytes+size>meta.size)throw Error('מקטע קובץ גדול מהצפוי');
  // Write chunk and progress in one transaction.
  const db=await fileDb();
  await new Promise((resolve,reject)=>{
   const tx=db.transaction(['chunks','meta'],'readwrite');
   tx.objectStore('chunks').put(msg.data,fileKey(msg.id,msg.index));
   tx.objectStore('meta').put({...meta,next:meta.next+1,bytes:meta.bytes+size},msg.id);
   tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  });
  return {ok:true,received:meta.bytes+size};
 }
 if(type==='FILE_COMMIT'){
  if(meta.bytes!==meta.size||meta.next<1)throw Error('העברת הקובץ אינה מלאה');
  await dbAction('meta','readwrite',s=>s.put({...meta,committed:true},msg.id));
  return {ok:true,attachment:{id:meta.id,name:meta.name,type:meta.type,size:meta.size,chunks:meta.next}};
 }
 throw Error('פעולת קובץ לא מוכרת');
}
chrome.runtime.onMessage.addListener((msg,sender,reply)=>{
 if(!['FILE_BEGIN','FILE_CHUNK','FILE_COMMIT','FILE_ABORT','FILE_CHUNK_READ'].includes(msg?.type))return;
 handleFileMessage(msg,sender).then(reply,e=>reply({ok:false,error:String(e.message||e)}));
 return true;
});


// Trusted multiline keyboard events are scoped to the existing WhatsApp Web tab
// during an authenticated, actively processing test only. This is never used to
// read page data, bypass WhatsApp verification, or send a message.
let trustedTyping=false;
async function typeTrustedLines(sender,textValue){
 const job=(await chrome.storage.local.get(JOB))[JOB];
 if(!job||job.phase!=='processing'||job.text!==textValue||
    !sender.tab?.id||!sender.url?.startsWith('https://web.whatsapp.com/'))
   throw Error('הקלדת דפדפן נחסמה: אין ניסיון WhatsApp מורשה פעיל');
 if(!textValue.includes('\n'))throw Error('הקלדה זו מיועדת להודעה מרובת שורות בלבד');
 if(trustedTyping)throw Error('הקלדת דפדפן אחרת כבר מתבצעת');
 const tabId=sender.tab.id;
 const tab=await chrome.tabs.get(tabId);
 if(!tab.url?.startsWith('https://web.whatsapp.com/'))throw Error('הלשונית השתנתה');
 if(!tab.active)throw Error('לשונית WhatsApp אינה פעילה בעת ההקלדה');
 const dbg={tabId};
 trustedTyping=true;
 let attached=false;
 try{
  try{await chrome.debugger.attach(dbg,'1.3');attached=true}
  catch(e){throw Error('Chrome לא אישר הדמיית הקלדה מדויקת: '+String(e.message||e).slice(0,140))}
  const lines=textValue.replace(/\r\n?/g,'\n').split('\n');
  const command=(method,params)=>chrome.debugger.sendCommand(dbg,method,params);
  for(let i=0;i<lines.length;i++){
   // A Shift+Enter produces a *real editor line break*, not the flattened
   // synthetic insertLineBreak and insertHTML from previous versions.
   if(i){
    const key={key:'Enter',code:'Enter',windowsVirtualKeyCode:13,nativeVirtualKeyCode:13,modifiers:8};
    await command('Input.dispatchKeyEvent',{type:'keyDown',...key,text:'\r',unmodifiedText:'\r'});
    await command('Input.dispatchKeyEvent',{type:'keyUp',...key});
   }
   if(lines[i])await command('Input.insertText',{text:lines[i]});
  }
  return {ok:true,lines:lines.length};
 }finally{
  if(attached)try{await chrome.debugger.detach(dbg)}catch{}
  trustedTyping=false;
 }
}
chrome.runtime.onMessage.addListener((msg,sender,reply)=>{
 if(msg?.type!=='WA_TRUSTED_TYPE_LINES_V040')return;
 if(typeof msg.text!=='string'||msg.text.length>4000){reply({ok:false,error:'טקסט להקלדה אינו תקין'});return}
 typeTrustedLines(sender,msg.text).then(reply,e=>reply({ok:false,error:String(e.message||e)}));
 return true;
});

// Trusted pointer click is limited to the current channel-forwarding pilot.
// WhatsApp channel SVG forward control requires a real pointer event; synthetic
// DOM clicks can be ignored. This is NOT permitted for generic sends.
async function channelTrustedClick(sender,msg){
 const job=(await chrome.storage.local.get(JOB))[JOB];
 if(!job||job.phase!=='processing'||job.kind!=='channel_forward'||
    job.source!=='ידידי ישיבת המקובלים נהר שלום המקובל הרב  בניהו שמואלי שליט"א'||
    job.target!=='🏷️ פנימי שמעון נוה 🔖'||
    !sender.tab?.id||!sender.url?.startsWith('https://web.whatsapp.com/'))
  throw Error('לחיצת ערוץ נחסמה: אין ניסוי העברה מורשה פעיל');
 if(!['left','right'].includes(msg.button)||!Number.isFinite(msg.x)||!Number.isFinite(msg.y)||
    msg.x<0||msg.y<0||msg.x>3000||msg.y>2200)
  throw Error('נקודת לחיצת הערוץ אינה תקינה');
 if(trustedTyping)throw Error('פעולת דפדפן אחרת כבר מתבצעת');
 const tab=await chrome.tabs.get(sender.tab.id);
 if(!tab.active||!tab.url?.startsWith('https://web.whatsapp.com/'))
  throw Error('לשונית WhatsApp אינה פעילה');
 const dbg={tabId:sender.tab.id},button=msg.button,buttons=button==='right'?2:1;
 trustedTyping=true;
 let attached=false;
 try{
  await chrome.debugger.attach(dbg,'1.3');attached=true;
  const x=Math.round(msg.x),y=Math.round(msg.y);
  await chrome.debugger.sendCommand(dbg,'Input.dispatchMouseEvent',{type:'mouseMoved',x,y,modifiers:0});
  await chrome.debugger.sendCommand(dbg,'Input.dispatchMouseEvent',{type:'mousePressed',x,y,button,buttons,clickCount:1});
  await chrome.debugger.sendCommand(dbg,'Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button,buttons:0,clickCount:1});
  return {ok:true};
 }finally{
  if(attached)try{await chrome.debugger.detach(dbg)}catch{}
  trustedTyping=false;
 }
}
chrome.runtime.onMessage.addListener((msg,sender,reply)=>{
 if(msg?.type!=='WA_CHANNEL_POINTER_V058')return;
 channelTrustedClick(sender,msg).then(reply,e=>reply({ok:false,error:String(e.message||e)}));
 return true;
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse)=>{
 if(!['SCHEDULE_TEST','FORWARD_TEST','SEND_FORWARD_TEST','CHANNEL_FORWARD_TEST','STATUS_TEST'].includes(msg?.type)) return;
 if(msg.type==='STATUS_TEST'){
  (async()=>{
   if(!sender.url?.startsWith('https://nahar-shalom-tools.pages.dev/tools/whatsapp-scheduler/')) throw Error('מקור הבקשה אינו מורשה');
   const r=await chrome.storage.local.get([JOB,'lastStatus']);
   return {ok:true,job:r[JOB]||null,status:r.lastStatus||null};
  })().then(sendResponse).catch(e=>sendResponse({ok:false,error:e.message}));
  return true;
 }
 (async()=>{
  if(!sender.url?.startsWith('https://nahar-shalom-tools.pages.dev/tools/whatsapp-scheduler/')) throw Error('מקור הבקשה אינו מורשה');
  const job=msg.job||{};
  if(msg.type==='CHANNEL_FORWARD_TEST'){
   const source='ידידי ישיבת המקובלים נהר שלום המקובל הרב  בניהו שמואלי שליט"א',target='🏷️ פנימי שמעון נוה 🔖';
   if(job.source!==source||job.target!==target)throw Error('ניסוי הערוץ מורשה רק אל קבוצת הבדיקות');
   const old=await chrome.storage.local.get([JOB,GROUP_LOCK]);
   if(['processing','scheduled'].includes(old[JOB]?.phase))throw Error('יש ניסיון פעיל אחר');
   if(old[GROUP_LOCK]&&old[GROUP_LOCK]!==target)throw Error('נעילת קבוצת הבדיקות אינה תואמת');
   if(!Number.isFinite(job.when)||job.when<Date.now()-15000||job.when>Date.now()+60000)throw Error('מועד ניסיון הערוץ אינו תקין');
   const item={id:crypto.randomUUID(),attemptId:/^[a-zA-Z0-9-]{8,40}$/.test(job.attemptId||'')?job.attemptId:crypto.randomUUID(),
    kind:'channel_forward',source,target,when:Math.max(job.when,Date.now()+250),phase:'scheduled'};
   await chrome.storage.local.set({[GROUP_LOCK]:target,[JOB]:item});
   await setAlarm(item);await status('scheduled','ניסוי העברת העדכון האחרון מהערוץ לקבוצת הבדיקות');
   scheduleNearTerm(item);
   await activateWhatsappTab();
   return {ok:true,id:item.id};
  }
  if(msg.type==='FORWARD_TEST'){
   const only='🏷️ פנימי שמעון נוה 🔖';
   if(job.source!==only||job.target!==only)throw Error('ניסוי ההעברה מוגבל לאותה קבוצת בדיקות כמקור וכיעד');
   const old=(await chrome.storage.local.get([JOB,GROUP_LOCK]));
   if(old[JOB]?.phase==='processing'||old[JOB]?.phase==='scheduled')throw Error('יש כבר ניסיון תזמון פעיל');
   if(old[GROUP_LOCK]&&old[GROUP_LOCK]!==only)throw Error('נעילת קבוצת הבדיקות אינה תואמת');
   if(!Number.isFinite(job.when)||job.when<Date.now()-15000||job.when>Date.now()+60000)
    throw Error('מועד העברה לא תקין');
   const item={id:crypto.randomUUID(),attemptId:/^[a-zA-Z0-9-]{8,40}$/.test(job.attemptId||'')?job.attemptId:crypto.randomUUID(),
    kind:'forward',source:only,target:only,when:Math.max(job.when,Date.now()+250),phase:'scheduled'};
   await chrome.storage.local.set({[GROUP_LOCK]:only,[JOB]:item});
   await setAlarm(item);await status('scheduled','ניסיון העברת הודעה אחרונה בקבוצת הבדיקות');
   scheduleNearTerm(item);
   await activateWhatsappTab();
   return {ok:true,id:item.id};
  }
  if(typeof job.group!=='string'||job.group.length<3||job.group.length>160||job.targets?.length!==1||job.targets[0]!=='test')throw Error('מותר יעד בדיקה יחיד בלבד');
  if(msg.type==='SEND_FORWARD_TEST'&&(job.group!=='🏷️ פנימי שמעון נוה 🔖'||job.target!=='🏷️ פנימי שמעון נוה 🔖'))
   throw Error('ניסוי שליחה והעברה מוגבל לקבוצת הבדיקות כמקור וכיעד');
  const pair=await chrome.storage.local.get(GROUP_LOCK);
  if(pair[GROUP_LOCK]&&pair[GROUP_LOCK]!==job.group)throw Error('נחסמה שליחה ליעד שונה מקבוצת הבדיקות שהוגדרה לראשונה');
  if(typeof job.text!=='string'||job.text.length>4000)throw Error('הטקסט חייב להיות קצר מ־4,000 תווים');
  const a=job.attachment;
  if(a!==null&&a!==undefined){
   if(!a||typeof a!=='object'||typeof a.id!=='string'||!(/^[a-f0-9-]{36}$/i.test(a.id))||
    typeof a.name!=='string'||a.name.length>180||typeof a.type!=='string'||a.type.length>100||
    !Number.isSafeInteger(a.size)||a.size<1||!Number.isSafeInteger(a.chunks)||a.chunks<1)
    throw Error('נתוני הקובץ אינם תקינים');
   const stored=await dbAction('meta','readonly',s=>s.get(a.id));
   if(!stored?.committed||stored.size!==a.size||stored.next!==a.chunks||stored.name!==a.name)
    throw Error('הקובץ לא הועבר במלואו לתוסף');
  }
  if(!job.text.trim()&&!a)throw Error('יש להזין הודעה או לצרף קובץ');
  if(!Number.isFinite(job.when) || job.when<Date.now()-15000 || job.when>Date.now()+30*86400000)throw Error('מועד התזמון אינו בטווח המותר');
  const item={kind:msg.type==='SEND_FORWARD_TEST'?'send_forward':'send',target:msg.type==='SEND_FORWARD_TEST'?job.target:null,id:crypto.randomUUID(),attemptId:typeof job.attemptId==='string'&&/^[a-zA-Z0-9-]{8,40}$/.test(job.attemptId)?job.attemptId:crypto.randomUUID(),group:job.group,text:job.text,attachment:a||null,when:Math.max(job.when,Date.now()+250),phase:'scheduled'};
  await chrome.storage.local.set({[GROUP_LOCK]:job.group});
  await chrome.storage.local.set({[JOB]:item});await setAlarm(item);await status('scheduled',new Date(item.when).toLocaleString('he-IL'));
  scheduleNearTerm(item);
  // Move to the existing WhatsApp Web tab immediately, visibly, before the three-second test.
  try { await activateWhatsappTab(); }
  catch(e){ await status('failed',String(e.message||e));await chrome.alarms.clear(ALARM);if(nearTermTimer!==null){clearTimeout(nearTermTimer);nearTermTimer=null;}item.phase='failed';await chrome.storage.local.set({[JOB]:item});throw e; }
  return {ok:true,id:item.id};
 })().then(sendResponse).catch(e=>sendResponse({ok:false,error:e.message}));return true;
});
chrome.runtime.onInstalled.addListener(async()=>{const r=await chrome.storage.local.get(JOB);if(r[JOB]?.phase==='scheduled')await setAlarm(r[JOB]);});
chrome.runtime.onStartup.addListener(async()=>{const r=await chrome.storage.local.get(JOB);if(r[JOB]?.phase==='scheduled')await setAlarm(r[JOB]);});
function scheduleNearTerm(job){
 if(nearTermTimer!==null){clearTimeout(nearTermTimer);nearTermTimer=null;}
 const remaining=job.when-Date.now();
 if(remaining>=0&&remaining<=60000){
  const expectedId=job.id;
  nearTermTimer=setTimeout(()=>{nearTermTimer=null;sendDueJob(expectedId).catch(e=>status('failed','שגיאת תזמון: '+String(e?.message||e)))},Math.max(0,remaining));
 }
}
chrome.alarms.onAlarm.addListener(a=>{
 if(a.name===ALARM)sendDueJob(null).catch(e=>status('failed','שגיאת שעון Chrome: '+String(e?.message||e)));
});
async function sendDueJob(expectedId){
 if(ongoing)return;
 ongoing=true;
 try {
  const r=await chrome.storage.local.get(JOB),job=r[JOB];if(!job||job.phase!=='scheduled'||(expectedId&&job.id!==expectedId))return;
  if(Date.now()+1000<job.when){await setAlarm(job);return;}
  job.phase='processing';await chrome.storage.local.set({[JOB]:job});await status('processing',job.kind==='channel_forward'?'מנסה להעביר עדכון אחרון מהערוץ לקבוצת הבדיקות':job.kind==='forward'?'מבצע העברת הודעה אחרונה לקבוצת הבדיקות':job.kind==='send_forward'?'שולח הודעה ולאחר מכן מעביר אותה בקבוצת הבדיקות':'מנסה לפרסם בקבוצת הבדיקות');
  const tab=await activateWhatsappTab();
  await probeWhatsappTab(tab);
  // Exactly one send attempt; errors are not automatically retried to avoid duplicate WhatsApp messages.
  let result;
  try{result=await chrome.tabs.sendMessage(tab.id,job.kind==='channel_forward'?{type:'CHANNEL_FORWARD_TEST_V0618',source:job.source,target:job.target,id:job.id}:job.kind==='forward'?{type:'FORWARD_TEST_V0618',source:job.source,target:job.target,id:job.id}:job.kind==='send_forward'?{type:'SEND_FORWARD_TEST_V0618',group:job.group,target:job.target,text:job.text,attachment:job.attachment,id:job.id}:{type:'SEND_TEST_V0618',group:job.group,text:job.text,attachment:job.attachment,id:job.id});}
  catch(error){throw Error('חיבור התוסף ללשונית אבד בזמן השליחה: '+String(error?.message||error).slice(0,180));}
  if(!result)throw Error('WhatsApp Web לא החזיר תשובה מניסיון השליחה');
  if(!result.ok){const err=new Error(result.error||'השליחה לא אושרה');err.metrics=result.metrics;throw err;}
  job.phase='attempted';const used=job.attachment?.id;job.attachment=null;await chrome.storage.local.set({[JOB]:job});if(used)cleanUpload(used).catch(()=>{});await status('attempted',job.kind==='channel_forward'?'בוצע ניסיון העברה מהערוץ — יש לאמת שהעדכון האחרון הופיע בקבוצת הבדיקות':job.kind==='forward'?'בוצע ניסיון העברה — יש לבדוק הופעת הודעה מועברת חדשה בקבוצת הבדיקות':job.kind==='send_forward'?'בוצעו שליחה והעברה — בדוק ששתי ההודעות מופיעות בקבוצה':'ניסיון שליחה בוצע; יש לבדוק בקבוצה שההודעה נראית');
  /* Delivery status is reported via STATUS_TEST */
 }catch(e){await status('failed',String(e.message||e),e.metrics||{});const r=await chrome.storage.local.get(JOB);if(r[JOB]){r[JOB].phase='failed';const used=r[JOB].attachment?.id;r[JOB].attachment=null;if(used)cleanUpload(used).catch(()=>{});r[JOB].error=String(e.message||e);await chrome.storage.local.set({[JOB]:r[JOB]});}/* Delivery status is reported via STATUS_TEST */}finally{ongoing=false}
}

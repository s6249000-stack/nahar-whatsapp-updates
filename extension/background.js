'use strict';
const GROUP_LOCK='testGroupLock';
const JOB='testJob';
const ALARM='nahar-test-send';
let ongoing=false;
let nearTermTimer=null;
async function status(phase, detail='') {await chrome.storage.local.set({lastStatus:{phase,detail,at:new Date().toISOString()}});}
async function setAlarm(job) {await chrome.alarms.clear(ALARM);await chrome.alarms.create(ALARM,{when:job.when});}
chrome.runtime.onMessage.addListener((msg, sender, sendResponse)=>{
 if(!['SCHEDULE_TEST','STATUS_TEST'].includes(msg?.type)) return;
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
  if(typeof job.group!=='string'||job.group.length<3||job.group.length>160||job.targets?.length!==1||job.targets[0]!=='test')throw Error('מותר יעד בדיקה יחיד בלבד');
  const pair=await chrome.storage.local.get(GROUP_LOCK);
  if(pair[GROUP_LOCK]&&pair[GROUP_LOCK]!==job.group)throw Error('נחסמה שליחה ליעד שונה מקבוצת הבדיקות שהוגדרה לראשונה');
  if(typeof job.text!=='string'||!job.text.trim()||job.text.length>4000) throw Error('בדיקה זו תומכת רק בהודעת טקסט עד 4,000 תווים');
  if(job.filename) throw Error('שליחת קבצים עדיין אינה נתמכת בתוסף הניסוי');
  if(!Number.isFinite(job.when) || job.when<Date.now()-15000 || job.when>Date.now()+30*86400000)throw Error('מועד התזמון אינו בטווח המותר');
  const item={id:crypto.randomUUID(),group:job.group,text:job.text,when:Math.max(job.when,Date.now()+250),phase:'scheduled'};
  await chrome.storage.local.set({[GROUP_LOCK]:job.group});
  await chrome.storage.local.set({[JOB]:item});await setAlarm(item);await status('scheduled',new Date(item.when).toLocaleString('he-IL'));
  scheduleNearTerm(item);
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
  job.phase='processing';await chrome.storage.local.set({[JOB]:job});await status('processing','מנסה לפרסם בקבוצת הבדיקות');
  const tabs=await chrome.tabs.query({url:'https://web.whatsapp.com/*'});
  if(!tabs.length)throw Error('לא נמצאה לשונית WhatsApp Web פתוחה. פתח את WhatsApp Web בחלון Chrome זה ונסה שוב');
  // A content script from an unpacked extension does not automatically attach to an already-open tab after reload.
  // Probe first, inject only when necessary, and never create a new tab or retry a possibly-executed send.
  let tab=null, lastConnectionError='';
  for(const candidate of tabs){
   try{
    try{
     const pong=await chrome.tabs.sendMessage(candidate.id,{type:'WA_TEST_PING'});
     if(pong?.ok){tab=candidate;break;}
    }catch(initialError){
     await chrome.scripting.executeScript({target:{tabId:candidate.id},files:['whatsapp.js']});
     const pong=await chrome.tabs.sendMessage(candidate.id,{type:'WA_TEST_PING'});
     if(pong?.ok){tab=candidate;break;}
    }
   }catch(error){lastConnectionError=String(error?.message||error).slice(0,220);}
  }
  if(!tab)throw Error('לא הצלחתי להפעיל את רכיב WhatsApp בלשונית הקיימת. '+(lastConnectionError||'רענן את WhatsApp Web ונסה שוב'));
  // Exactly one send attempt; errors are not automatically retried to avoid duplicate WhatsApp messages.
  let result;
  try{result=await chrome.tabs.sendMessage(tab.id,{type:'SEND_TEST',group:job.group,text:job.text,id:job.id});}
  catch(error){throw Error('חיבור התוסף ללשונית אבד בזמן השליחה: '+String(error?.message||error).slice(0,180));}
  if(!result)throw Error('WhatsApp Web לא החזיר תשובה מניסיון השליחה');
  if(!result.ok)throw Error(result.error||'השליחה לא אושרה');
  job.phase='attempted';await chrome.storage.local.set({[JOB]:job});await status('attempted','ניסיון שליחה בוצע; יש לבדוק בקבוצה שההודעה נראית');
  /* Delivery status is reported via STATUS_TEST */
 }catch(e){await status('failed',String(e.message||e));const r=await chrome.storage.local.get(JOB);if(r[JOB]){r[JOB].phase='failed';r[JOB].error=String(e.message||e);await chrome.storage.local.set({[JOB]:r[JOB]});}/* Delivery status is reported via STATUS_TEST */}finally{ongoing=false}
}

'use strict';
const GROUP_LOCK='testGroupLock';
const JOB='testJob';
const ALARM='nahar-test-send';
let ongoing=false;
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
  if(!Number.isFinite(job.when) || job.when<Date.now()+5000 || job.when>Date.now()+30*86400000)throw Error('יש לבחור מועד עתידי בתוך 30 ימים');
  const item={id:crypto.randomUUID(),group:job.group,text:job.text,when:job.when,phase:'scheduled'};
  await chrome.storage.local.set({[GROUP_LOCK]:job.group});
  await chrome.storage.local.set({[JOB]:item});await setAlarm(item);await status('scheduled',new Date(item.when).toLocaleString('he-IL'));
  return {ok:true,id:item.id};
 })().then(sendResponse).catch(e=>sendResponse({ok:false,error:e.message}));return true;
});
chrome.runtime.onInstalled.addListener(async()=>{const r=await chrome.storage.local.get(JOB);if(r[JOB]?.phase==='scheduled')await setAlarm(r[JOB]);});
chrome.runtime.onStartup.addListener(async()=>{const r=await chrome.storage.local.get(JOB);if(r[JOB]?.phase==='scheduled')await setAlarm(r[JOB]);});
chrome.alarms.onAlarm.addListener(async a=>{
 if(a.name!==ALARM||ongoing)return;
 ongoing=true;
 try {
  const r=await chrome.storage.local.get(JOB),job=r[JOB];if(!job||job.phase!=='scheduled')return;
  if(Date.now()+1000<job.when){await setAlarm(job);return;}
  job.phase='processing';await chrome.storage.local.set({[JOB]:job});await status('processing','מנסה לפרסם בקבוצת הבדיקות');
  let tabs=await chrome.tabs.query({url:'https://web.whatsapp.com/*'});
  let tab=tabs[0];
  if(!tab)tab=await chrome.tabs.create({url:'https://web.whatsapp.com/',active:false});
  let result;
  for(let attempt=0;attempt<20;attempt++){
   try {result=await chrome.tabs.sendMessage(tab.id,{type:'SEND_TEST',group:job.group,text:job.text,id:job.id});break;}
   catch(e){await new Promise(r=>setTimeout(r,1500));}
  }
  if(!result)throw Error('WhatsApp Web לא זמין. ודא שהחשבון מחובר וש-Chrome פתוח');
  if(!result.ok)throw Error(result.error||'השליחה לא אושרה');
  job.phase='attempted';await chrome.storage.local.set({[JOB]:job});await status('attempted','ניסיון שליחה בוצע; יש לבדוק בקבוצה שההודעה נראית');
  chrome.notifications.create({type:'basic',iconUrl:'icon.png',title:'נהר שלום — בדיקת תזמון',message:'ניסיון השליחה בוצע. ודא שההודעה הופיעה בקבוצה.'});
 }catch(e){await status('failed',String(e.message||e));const r=await chrome.storage.local.get(JOB);if(r[JOB]){r[JOB].phase='failed';r[JOB].error=String(e.message||e);await chrome.storage.local.set({[JOB]:r[JOB]});}chrome.notifications.create({type:'basic',iconUrl:'icon.png',title:'נהר שלום — שליחת ניסיון נכשלה',message:String(e.message||e).slice(0,230)});}finally{ongoing=false}
});

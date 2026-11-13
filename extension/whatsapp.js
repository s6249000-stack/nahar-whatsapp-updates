(() => {
 'use strict';
 if (globalThis.__naharWaTestScriptV030) return;
 globalThis.__naharWaTestScriptV030=true;
 let sending=false;
 const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const norm=s=>String(s||'').normalize('NFC').replace(/[\u200e\u200f\u061c\u202a-\u202e\u2066-\u2069]/g,'').replace(/\s+/g,' ').trim();
 const visible=e=>Boolean(e&&e.getClientRects().length);
 const main=()=>document.querySelector('#main');
 const attrs=(e,a)=>e?.getAttribute(a)||'';
 const isShown=e=>!!(e&&e.isConnected&&e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden');
 const side=()=>document.querySelector('#side');
 // Exact lexical group name. Emoji decorations differ between the saved group label and the live WhatsApp UI.
 // Never use the pinned-chat position as proof of identity.
 const cleanName=s=>norm(s).replace(/[^\p{L}\p{N}]+/gu,' ').trim();
 function headerNames(){
  const h=document.querySelector('#main header');
  if(!isShown(h))return [];
  return [...h.querySelectorAll('[title],span,[aria-label]')].filter(isShown)
   .flatMap(e=>[attrs(e,'title'),attrs(e,'aria-label'),e.children.length?'':e.textContent?.trim()]).filter(Boolean);
 }
 const activeIs=name=>headerNames().some(v=>cleanName(v)===cleanName(name));
 function editor(){return [...document.querySelectorAll('#main footer [contenteditable="true"],#main [data-testid="conversation-compose-box-input"]')].find(isShown)||null;}
 function diagnosis(){
  const mainEl=main(),sideEl=side(),search=mainSearch(),rows=sideEl?.querySelectorAll('[role="row"],[data-testid="cell-frame-container"]').length||0;
  return 'אבחון: אזור שיחה '+(mainEl?'קיים':'חסר')+', כותרת '+(document.querySelector('#main header')?'קיימת':'חסרה')+
    ', שדות כותרת '+headerNames().length+', רשימת שיחות '+(sideEl?'קיימת':'חסרה')+
    ', שדה חיפוש '+(search?'קיים':'חסר')+', שורות '+rows+', שדה כתיבה '+(editor()?'קיים':'חסר');
 }
 function mainSearch(){
  const root=side();if(!isShown(root))return null;
  const items=[...root.querySelectorAll('input,[contenteditable="true"],[role="textbox"]')].filter(isShown);
  const label=e=>[attrs(e,'aria-label'),attrs(e,'title'),attrs(e,'placeholder'),attrs(e,'data-placeholder'),attrs(e.parentElement,'data-placeholder')].join(' ');
  return items.find(e=>/search|חיפוש|חפש/i.test(label(e)))||items.find(e=>!e.closest('[role="dialog"]'))||null;
 }
 const searchContent=e=>e instanceof HTMLInputElement?e.value:(e.innerText||e.textContent||'').trim();
 function setSearch(e,value){
  e.focus();
  if(e instanceof HTMLInputElement){
   const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set;
   if(!setter)throw Error('שדה החיפוש אינו מאפשר כתיבה');
   setter.call(e,value);
   e.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:value}));
  }else{
   const selection=document.getSelection(),range=document.createRange();
   range.selectNodeContents(e);selection.removeAllRanges();selection.addRange(range);
   if(!document.execCommand('insertText',false,value))throw Error('WhatsApp Web לא קיבל טקסט בחיפוש');
   e.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:value}));
  }
 }
 function resultRowsForName(name){
  const root=side();if(!isShown(root))return [];
  const wanted=cleanName(name);
  const rows=[...root.querySelectorAll('[data-testid="cell-frame-container"],[data-testid="cell-frame-wrapper"],[role="row"],[role="listitem"],[data-testid="chat-list"] [tabindex],[data-testid="search-result"]')]
    .filter(isShown).filter(e=>!e.closest('#main'));
  const matches=rows.filter(row=>[...row.querySelectorAll('[title],span[dir="auto"],span[title]')]
    .some(e=>isShown(e)&&cleanName(attrs(e,'title')||(e.children.length?'':e.textContent))===wanted));
  return matches.filter(row=>!matches.some(child=>child!==row&&row.contains(child)));
 }
 async function ensureGroup(group){
  if(activeIs(group))return;
  // Pinned chats are searched by name before typing into the sidebar search.
  const pinned=resultRowsForName(group);
  if(pinned.length===1){
   pinned[0].click();
   for(let i=0;i<22;i++){await delay(150);if(activeIs(group)&&editor())return;}
  }
  let search=null;
  for(let i=0;i<30;i++){search=mainSearch();if(search)break;await delay(150);}
  if(!search)throw Error('לא נמצא שדה החיפוש הראשי. '+diagnosis());
  // Search for the distinctive Hebrew name, not emoji decorations that may have changed.
  const query=cleanName(group);
  const current=cleanName(searchContent(search));
  if(current&&current!==query)throw Error('קיים חיפוש אחר בוואטסאפ. לא דרסתי אותו. '+diagnosis());
  setSearch(search,query);
  await delay(350);
  if(cleanName(searchContent(search))!==query)throw Error('שם קבוצת הבדיקות לא נקלט בחיפוש. '+diagnosis());
  let picked=null;
  for(let i=0;i<30;i++){
   const rows=resultRowsForName(group);
   if(rows.length===1){picked=rows[0];break;}
   if(rows.length>1)throw Error('נמצאו כמה שיחות עם אותו שם קבוצת בדיקות — בוטל כדי לא לשלוח בטעות');
   await delay(180);
  }
  if(!picked)throw Error('קבוצת הבדיקות לא נמצאה כתוצאה מדויקת. '+diagnosis());
  picked.click();
  for(let i=0;i<35;i++){
   await delay(170);
   if(activeIs(group)&&editor())return;
  }
  throw Error('נמצאה קבוצת הבדיקות ברשימה אך לא אומתה פתיחת השיחה. שמות בכותרת: '+headerNames().map(cleanName).filter(Boolean).slice(0,5).join(' / ').slice(0,180)+'. '+diagnosis());
 }
 function metrics(){
  return {hasMain:!!main(),hasHeader:!!document.querySelector('#main header'),headerFields:Math.min(100,headerNames().length),
   hasSide:!!side(),hasSearch:!!mainSearch(),hasEditor:!!editor()};
 }
 async function send(text,group){
   if(typeof group!=='string'||group.length<3||group.length>160||!text?.trim())throw Error('שם קבוצה או הודעה לא תקינים');
   if(!document.querySelector('#side'))throw Error('WhatsApp Web עדיין לא נטען או מנותק. '+diagnosis());
   await ensureGroup(group);
   if(!activeIs(group))throw Error('קבוצת הבדיקות לא אומתה — בוטל');
   const box=editor();if(!box)throw Error('לא נמצא שדה כתיבת ההודעה בקבוצת הבדיקות');
   if(norm(box.innerText))throw Error('יש כבר טקסט בטיוטת השיחה — בוטל כדי לא למחוק אותו');
   box.focus();
   if(!document.execCommand('insertText',false,text))throw Error('כתיבת ההודעה נכשלה');
   await delay(200);
   if(norm(box.innerText)!==norm(text))throw Error('בדיקת הטקסט שהוכנס נכשלה — בוטל');
   if(!activeIs(group))throw Error('השיחה הפתוחה השתנתה לפני השליחה — בוטל');
   const button=main()?.querySelector('footer [data-icon="send"]')?.closest('button,[role="button"]');
   if(!button)throw Error('לא נמצא כפתור שליחה. הטקסט הוכן אך לא נשלח');
   button.click();
   return {ok:true,detail:'נלחץ כפתור שליחה; יש לאמת שההודעה הופיעה בקבוצה'};
 }
 chrome.runtime.onMessage.addListener((msg,sender,respond)=>{
   if(msg?.type==='WA_TEST_PING_V030'){respond({ok:true,version:'0.3.0',ready:true,hasMain:!!main(),hasSide:!!document.querySelector('#pane-side'),active:!!editor()});return;}
   if(msg?.type!=='SEND_TEST_V030')return;
   if(sending){respond({ok:false,error:'ניסיון שליחה כבר מתבצע'});return;}
   if(typeof msg.group!=='string'||typeof msg.text!=='string'){respond({ok:false,error:'נתוני הבדיקה לא תקינים'});return;}
   sending=true;
   send(msg.text,msg.group).then(respond).catch(e=>respond({ok:false,error:String(e.message||e),metrics:metrics()})).finally(()=>{sending=false});
   return true;
 });
})();
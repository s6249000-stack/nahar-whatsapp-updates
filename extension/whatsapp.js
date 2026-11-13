(() => {
 'use strict';
 if (globalThis.__naharWaTestScriptReady) return;
 globalThis.__naharWaTestScriptReady=true;
 let sending=false;
 const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const norm=s=>String(s||'').normalize('NFC').replace(/[\u200e\u200f\u061c\u202a-\u202e\u2066-\u2069]/g,'').replace(/\s+/g,' ').trim();
 const visible=e=>Boolean(e&&e.getClientRects().length);
 const main=()=>document.querySelector('#main')||document.querySelector('[data-testid="conversation-panel-wrapper"]')||document.querySelector('[role="main"]');
 function conversationHeader(){
   const m=main();
   if(m){
     const h=m.querySelector('header,[data-testid="conversation-header"],[data-testid="conversation-info-header"]');
     if(h&&visible(h))return h;
   }
   const candidates=[...document.querySelectorAll('header,[data-testid="conversation-header"]')].filter(visible);
   return candidates.find(h=>h.closest('#main,[role="main"],[data-testid="conversation-panel-wrapper"]'))||null;
 }
 function activeNames() {
   const h=conversationHeader();
   if(!h)return [];
   const values=[];
   for(const e of [h,...h.querySelectorAll('[title],[aria-label],[dir="auto"],[data-testid]')]){
     if(!visible(e))continue;
     values.push(e.getAttribute('title'),e.getAttribute('aria-label'));
     if(e.children.length===0)values.push(e.textContent);
   }
   return [...new Set(values.map(norm).filter(Boolean))];
 }
 function activeIs(group){return activeNames().includes(norm(group));}
 function diagnosis(){
   return 'אבחון: אזור שיחה '+(main()?'קיים':'חסר')+
    ', כותרת '+(conversationHeader()?'קיימת':'חסרה')+
    ', שדות כותרת '+activeNames().length+
    ', רשימת שיחות '+(document.querySelector('#pane-side')?'קיימת':'חסרה')+
    ', שדה כתיבה '+(editor()?'קיים':'חסר');
 }
 function sidebarMatch(group){
   const pane=document.querySelector('#pane-side')||document.querySelector('[data-testid="chat-list"]');
   if(!pane)return null;
   const desired=norm(group);
   const candidates=[...pane.querySelectorAll('[title],[aria-label],[dir="auto"]')].filter(visible);
   const e=candidates.find(e=>norm(e.getAttribute('title'))===desired||norm(e.getAttribute('aria-label'))===desired||(e.children.length===0&&norm(e.textContent)===desired));
   return e?e.closest('[data-testid="cell-frame-container"],[role="row"],[data-testid="chat-list-item"]')||e:null;
 }
 function searchBox(){
   const pane=document.querySelector('#side')||document.querySelector('[data-testid="chat-list-search"]')||document.body;
   return [...pane.querySelectorAll('[contenteditable="true"][role="textbox"],[contenteditable="true"][data-tab]')].find(e=>visible(e)&&!e.closest('footer'))||null;
 }
 function editor(){
   const m=main();if(!m)return null;
   return [...m.querySelectorAll('footer [contenteditable="true"],[data-testid="conversation-compose-box-input"],[contenteditable="true"][role="textbox"]')].find(visible)||null;
 }
 async function ensureGroup(group){
   if(activeIs(group))return;
   let row=sidebarMatch(group);
   if(!row){
     const search=searchBox();
     if(!search)throw Error('לא נמצא חיפוש שיחות. '+diagnosis());
     search.focus();
     if(norm(search.innerText))throw Error('חיפוש השיחות אינו ריק — לא נדרוס תוכן. '+diagnosis());
     if(!document.execCommand('insertText',false,group))throw Error('לא ניתן להקליד בחיפוש. '+diagnosis());
     for(let i=0;i<20&&!row;i++){await delay(350);row=sidebarMatch(group);}
     if(!row)throw Error('קבוצת הבדיקות לא נמצאה לאחר חיפוש. '+diagnosis());
   }
   row.click();
   for(let i=0;i<22&&!activeIs(group);i++)await delay(350);
   if(!activeIs(group))throw Error('נפתחה שיחה אך אי אפשר לאמת את קבוצת הבדיקות. '+diagnosis());
 }
 async function send(text,group){
   if(typeof group!=='string'||group.length<3||group.length>160||!text?.trim())throw Error('שם קבוצה או הודעה לא תקינים');
   if(!document.querySelector('#side')&&!document.querySelector('#pane-side'))throw Error('WhatsApp Web עדיין לא נטען או מנותק. '+diagnosis());
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
   if(msg?.type==='WA_TEST_PING'){respond({ok:true,ready:true,hasMain:!!main(),active:!!editor()});return;}
   if(msg?.type!=='SEND_TEST')return;
   if(sending){respond({ok:false,error:'ניסיון שליחה כבר מתבצע'});return;}
   if(typeof msg.group!=='string'||typeof msg.text!=='string'){respond({ok:false,error:'נתוני הבדיקה לא תקינים'});return;}
   sending=true;
   send(msg.text,msg.group).then(respond).catch(e=>respond({ok:false,error:String(e.message||e)})).finally(()=>{sending=false});
   return true;
 });
})();
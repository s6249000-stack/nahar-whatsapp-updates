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
 function clickAsUser(element,direct=false){
   if(!element)return false;
   try{element.scrollIntoView({block:'center',inline:'nearest'});}catch{}
   const target=direct?element:(element.closest('[role="listitem"],[data-testid="cell-frame-container"],[role="row"]')||element);
   const rect=target.getBoundingClientRect();
   const x=rect.left+Math.max(4,Math.min(rect.width/2,rect.width-4)),y=rect.top+Math.max(4,Math.min(rect.height/2,rect.height-4));
   const common={bubbles:true,cancelable:true,composed:true,clientX:x,clientY:y,button:0,buttons:1,view:window};
   target.dispatchEvent(new PointerEvent('pointerover',{...common,pointerId:1,pointerType:'mouse',isPrimary:true}));
   target.dispatchEvent(new MouseEvent('mouseover',common));
   target.dispatchEvent(new PointerEvent('pointerdown',{...common,pointerId:1,pointerType:'mouse',isPrimary:true}));
   target.dispatchEvent(new MouseEvent('mousedown',common));
   target.dispatchEvent(new PointerEvent('pointerup',{...common,buttons:0,pointerId:1,pointerType:'mouse',isPrimary:true}));
   target.dispatchEvent(new MouseEvent('mouseup',{...common,buttons:0}));
   target.dispatchEvent(new MouseEvent('click',{...common,buttons:0}));
   return true;
 }
 function rowSummary(el){
   if(!el)return 'ללא שורה';
   const e=el.closest('[role="listitem"],[data-testid="cell-frame-container"],[role="row"]')||el;
   return 'תגית '+e.tagName+'; תפקיד '+(e.getAttribute('role')||'-')+'; testid '+(e.getAttribute('data-testid')||'-')+'; גודל '+Math.round(e.getBoundingClientRect().width)+'x'+Math.round(e.getBoundingClientRect().height);
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
   // Click the actual chat title or its clickable parent, not an arbitrary virtual-list cell.
   const titleNode=[...row.querySelectorAll('[title],[aria-label],[dir="auto"]')].find(e=>
     norm(e.getAttribute('title'))===norm(group)||norm(e.getAttribute('aria-label'))===norm(group)||(e.children.length===0&&norm(e.textContent)===norm(group))
   );
   const clickTarget=titleNode?.closest('[role="listitem"],[data-testid="cell-frame-container"],[role="row"],[role="button"],[tabindex="0"]')||row;
   // Attempt a full pointer/mouse sequence on the actual chat row; bare .click() was not opening the React chat.
   clickAsUser(clickTarget);
   for(let i=0;i<16&&!activeIs(group);i++)await delay(250);
   if(!activeIs(group)){
     // A second, different interaction path: click the exact title node instead of the surrounding row.
     if(titleNode&&titleNode!==clickTarget)clickAsUser(titleNode,true);
     for(let i=0;i<12&&!activeIs(group);i++)await delay(250);
   }
   if(!activeIs(group))throw Error('בוצעו אירועי עכבר בשיחת הבדיקות אך לא נפתח אזור שיחה. '+rowSummary(clickTarget)+'. '+diagnosis());
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
   if(msg?.type==='WA_TEST_PING'){respond({ok:true,ready:true,hasMain:!!main(),hasSide:!!document.querySelector('#pane-side'),active:!!editor()});return;}
   if(msg?.type!=='SEND_TEST')return;
   if(sending){respond({ok:false,error:'ניסיון שליחה כבר מתבצע'});return;}
   if(typeof msg.group!=='string'||typeof msg.text!=='string'){respond({ok:false,error:'נתוני הבדיקה לא תקינים'});return;}
   sending=true;
   send(msg.text,msg.group).then(respond).catch(e=>respond({ok:false,error:String(e.message||e)})).finally(()=>{sending=false});
   return true;
 });
})();
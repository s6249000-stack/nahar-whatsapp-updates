(() => {
'use strict';
// Based on the proven UI interaction sequence in the user's Zmanim-to-WhatsApp extension.
// Separate versioned handler prevents stale extension scripts from intercepting a send.
if(globalThis.__naharSchedulerAgentV034)return;
globalThis.__naharSchedulerAgentV034=true;
let sending=false;
let activeSendingGroup='';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const norm=s=>String(s||'').normalize('NFKC').replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g,'').replace(/\s+/g,' ').trim();
const lexical=s=>norm(s).replace(/[\uFE0E\uFE0F]/g,'').replace(/[^\p{L}\p{N}]+/gu,' ').trim().toLowerCase();
const shown=e=>{if(!e||!e.isConnected)return false;const r=e.getBoundingClientRect(),cs=getComputedStyle(e);return r.width>1&&r.height>1&&cs.visibility!=='hidden'&&cs.display!=='none'};
const attr=(e,k)=>e?.getAttribute?.(k)||'';
const label=e=>norm(attr(e,'title')||attr(e,'aria-label')||attr(e,'aria-placeholder')||e?.textContent||'');
function humanClick(el){
 if(!el)return false;
 try{el.scrollIntoView({block:'center'});}catch{}
 try{el.focus?.();}catch{}
 const b={bubbles:true,cancelable:true,view:window,button:0,buttons:1};
 try{el.dispatchEvent(new PointerEvent('pointerdown',b));}catch{}
 try{el.dispatchEvent(new MouseEvent('mousedown',b));}catch{}
 try{el.dispatchEvent(new PointerEvent('pointerup',{...b,buttons:0}));}catch{}
 try{el.dispatchEvent(new MouseEvent('mouseup',{...b,buttons:0}));}catch{}
 try{el.click();return true;}catch{return false;}
}
function pressKey(el,key){const o={key,code:key,bubbles:true,cancelable:true};for(const event of ['keydown','keypress','keyup'])el.dispatchEvent(new KeyboardEvent(event,o));}
function currentNames(){
 const h=document.querySelector('#main header');if(!shown(h))return [];
 const selectors=['[data-testid="conversation-info-header-chat-title"]','span[title]','div[title]','[role="button"] span[dir="auto"]','span[dir="auto"]','[aria-label]'];
 const values=[];
 for(const sel of selectors)for(const e of h.querySelectorAll(sel)){if(!shown(e))continue;let v=label(e);if(v&&v.length<=180)values.push(v)}
 return [...new Set(values)];
}
function currentMatches(name){
 const desired=lexical(name);
 return desired.length>=8&&currentNames().some(v=>lexical(v)===desired);
}
function composer(){
 const m=document.querySelector('#main');if(!m)return null;
 const selectors=['footer [data-testid="conversation-compose-box-input"][contenteditable="true"]','footer div[contenteditable="true"][role="textbox"]','footer div[contenteditable="true"]','footer [role="textbox"]'];
 for(const sel of selectors){const found=[...m.querySelectorAll(sel)].filter(shown);if(found.length)return found[found.length-1]}
 return null;
}
function searchBox(){
 const side=document.querySelector('#side');if(!side)return null;
 const candidates=[...side.querySelectorAll('div[contenteditable="true"],input[type="text"],[role="textbox"]')].filter(shown);
 let chosen=null,best=-999;
 for(const e of candidates){
  const meta=norm([attr(e,'aria-label'),attr(e,'aria-placeholder'),attr(e,'placeholder'),attr(e,'title')].join(' '));
  const r=e.getBoundingClientRect();let score=0;
  if(/search|חיפוש|איתור|start a new chat|התחלת צ.?אט/i.test(meta))score+=100;
  if(attr(e,'data-tab')==='3')score+=35;
  if(attr(e,'role')==='textbox')score+=15;
  if(r.top<220)score+=20;
  if(r.height>=24&&r.height<=80)score+=10;
  if(e.closest('footer'))score-=100;
  if(score>best){best=score;chosen=e}
 }
 return chosen;
}
const readSearch=e=>e instanceof HTMLInputElement?e.value:(e.innerText||e.textContent||'');
function setSearch(e,value){
 e.focus();
 if(e instanceof HTMLInputElement){
  const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set;
  setter?.call(e,value);
  e.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:value}));
 }else{
  const selection=document.getSelection(),range=document.createRange();range.selectNodeContents(e);selection.removeAllRanges();selection.addRange(range);
  if(!document.execCommand('insertText',false,value))throw Error('SEARCH_INSERT_FAILED');
  e.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:value}));
 }
}
function chatCandidates(name){
 const wanted=lexical(name),roots=[document.querySelector('#pane-side'),document.querySelector('#side'),document.querySelector('[role="grid"]')].filter(Boolean);
 const matches=[],seen=new Set();
 for(const root of roots)for(const e of root.querySelectorAll('[title],[aria-label],span[dir="auto"],div[dir="auto"]')){
  if(!shown(e)||seen.has(e))continue;seen.add(e);
  const raw=label(e);if(lexical(raw)!==wanted)continue;
  const row=e.closest('[data-testid="cell-frame-container"],[role="listitem"],[role="row"],[tabindex="0"],[tabindex="-1"]')||e.parentElement;
  if(row&&shown(row)&&!matches.some(x=>x.row===row))matches.push({el:e,row});
 }
 return matches.filter(x=>!matches.some(y=>y!==x&&x.row.contains(y.row)));
}
async function waitForTarget(name,timeout=4200){
 let stable=0;
 for(let i=0;i<Math.ceil(timeout/180);i++){
  if(currentMatches(name)&&composer()){if(++stable>=3)return true}else stable=0;
  await wait(180);
 }
 return false;
}
async function clickCandidate(candidate,name){
 humanClick(candidate.row);
 if(await waitForTarget(name,2800))return true;
 humanClick(candidate.el);
 return waitForTarget(name,2200);
}
async function openGroup(name){
 if(await waitForTarget(name,550))return;
 // Search pinned, visible chats first — regardless of their position.
 let matches=chatCandidates(name);
 if(matches.length===1&&await clickCandidate(matches[0],name))return;
 if(matches.length>1)throw Error('נמצאו כמה שיחות עם שם זהה. השליחה בוטלה');
 const search=searchBox();if(!search)throw Error('לא זוהה שדה חיפוש WhatsApp');
 const query=lexical(name);
 const current=lexical(readSearch(search));
 if(current&&current!==query)throw Error('שדה חיפוש השיחות מכיל ערך אחר; לא שיניתי אותו');
 humanClick(search);
 setSearch(search,query);
 await wait(500);
 if(lexical(readSearch(search))!==query)throw Error('חיפוש הקבוצה לא נקלט');
 for(let i=0;i<22;i++){
  matches=chatCandidates(name);
  if(matches.length>1)throw Error('נמצאו כמה שיחות עם שם זהה. השליחה בוטלה');
  if(matches.length===1&&await clickCandidate(matches[0],name))return;
  await wait(220);
 }
 // Never use Enter on an unverified result: it could open the wrong conversation.
 throw Error('נמצאה רשימת שיחות, אך לא אומתה פתיחת קבוצת הבדיקות');
}
function messageCanonical(value){
 return String(value||'')
  .normalize('NFC')
  .replace(/\r\n?/g,'\n')
  .replace(/[\u200b-\u200f\u061c\u202a-\u202e\u2060\u2066-\u2069\ufeff]/g,'')
  .replace(/[\ufe0e\ufe0f]/g,'')
  .replace(/\u00a0/g,' ')
  .replace(/[ \t]+/g,' ')
  .replace(/[ \t]*\n[ \t]*/g,'\n')
  .replace(/\n{2,}/g,'\n')
  .trim();
}
function getComposerVariants(e){
 const variants=[e.innerText||'',e.textContent||''];
 // WhatsApp sometimes renders explicit BR elements without a newline in textContent.
 let fromDom='';
 const visit=node=>{
  for(const child of node.childNodes){
   if(child.nodeType===3){fromDom+=child.nodeValue||'';continue;}
   if(child.nodeType!==1)continue;
   if(child.tagName==='BR'){fromDom+='\n';continue;}
   if(child.getAttribute('data-testid')==='mention-plain-text')continue;
   const block=/^(DIV|P)$/.test(child.tagName);
   if(block&&fromDom&&!fromDom.endsWith('\n'))fromDom+='\n';
   visit(child);
  }
 };
 visit(e);variants.push(fromDom);
 return variants;
}
async function fillComposer(e,text){
 const original=String(text).replace(/\r\n?/g,'\n');
 const expected=messageCanonical(original);
 const read=()=>getComposerVariants(composer()||e).map(messageCanonical);
 const matches=()=>read().some(v=>v===expected);
 if(read().some(Boolean))throw Error('קיימת כבר טיוטה בשדה הכתיבה — לא שיניתי אותה');
 // Ensure selection is inside the actual contenteditable editor, not a placeholder wrapper.
 const editorNode=e.isContentEditable?e:e.querySelector('[contenteditable="true"]');
 if(!editorNode)throw Error('לא נמצא עורך WhatsApp שניתן לכתוב בו');
 editorNode.focus();
 const sel=document.getSelection(),range=document.createRange();
 range.selectNodeContents(editorNode);range.collapse(false);
 sel.removeAllRanges();sel.addRange(range);
 const html=original.split('\n').map(line=>line.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')).join('<br>');
 document.execCommand('insertHTML',false,html);
 await wait(300);
 if(matches())return;
 // In some WhatsApp builds insertHTML reports success but React discards it.
 // Only retry with plain text if the live editor is still entirely empty.
 if(read().some(Boolean)){
  const actual=read()[0]||'';
  throw Error('הטקסט הוקלד אך אינו תואם למקור — עצרתי לפני שליחה (מקור '+expected.length+' תווים, בפועל '+actual.length+')');
 }
 const live=composer();
 if(!live||!currentMatches(activeSendingGroup))throw Error('שדה הכתיבה או השיחה השתנו בעת ההקלדה');
 live.focus();
 const selection=document.getSelection(),r=document.createRange();
 r.selectNodeContents(live);r.collapse(false);selection.removeAllRanges();selection.addRange(r);
 if(!document.execCommand('insertText',false,original))throw Error('WhatsApp לא קיבל הקלדת טקסט');
 await wait(350);
 if(matches())return;
 const actual=read()[0]||'';
 throw Error('ההודעה לא נקלטה בשדה הכתיבה — לא נשלחה (מקור '+expected.length+' תווים, בפועל '+actual.length+')');
}
function sendButton(){
 const m=document.querySelector('#main');if(!m)return null;
 const selectors=['button[data-testid="compose-btn-send"]','[data-testid="send"]','button[aria-label="Send"]','button[aria-label*="Send" i]','button[aria-label*="שלח"]','button[aria-label*="שליחה"]','[role="button"][aria-label*="שלח"]'];
 for(const q of selectors){const e=[...m.querySelectorAll(q)].filter(shown);if(e.length)return e[e.length-1]}
 for(const e of m.querySelectorAll('[data-icon="send"],[data-icon="send-filled"]')){const b=e.closest('button,[role="button"]');if(shown(b))return b}
 return null;
}
function metrics(){return {hasMain:!!document.querySelector('#main'),hasHeader:!!document.querySelector('#main header'),headerFields:Math.min(100,currentNames().length),hasSide:!!document.querySelector('#side'),hasSearch:!!searchBox(),hasEditor:!!composer()}}
async function send(text,name){
 if(typeof name!=='string'||lexical(name).length<8||typeof text!=='string'||!text.trim())throw Error('נתוני יעד או הודעה לא תקינים');
 await openGroup(name);
 if(!await waitForTarget(name,1000))throw Error('לא אומתה קבוצת הבדיקות לפני כתיבה');
 const box=composer();if(!box)throw Error('שדה ההודעה לא נמצא');
 if(norm(box.innerText))throw Error('יש טיוטה קיימת, בוטל');
 activeSendingGroup=name;
 await fillComposer(box,text);
 if(!currentMatches(name))throw Error('השיחה השתנתה לפני השליחה — בוטל');
 const b=sendButton();if(!b)throw Error('כפתור השליחה לא נמצא; ההודעה נותרה כטיוטה');
 // Exactly one click: repeated synthetic clicks could cause duplicate sends.
 b.click();
 return {ok:true};
}
chrome.runtime.onMessage.addListener((msg,sender,reply)=>{
 if(msg?.type==='WA_TEST_PING_V034'){reply({ok:true,version:'0.3.4',hasMain:!!document.querySelector('#main'),hasSide:!!document.querySelector('#side')});return;}
 if(msg?.type!=='SEND_TEST_V034')return;
 if(sending){reply({ok:false,error:'כבר מתבצע ניסיון שליחה'});return;}
 sending=true;
 send(msg.text,msg.group).then(reply).catch(e=>reply({ok:false,error:String(e.message||e),metrics:metrics()})).finally(()=>{sending=false;activeSendingGroup=''});
 return true;
});
})();
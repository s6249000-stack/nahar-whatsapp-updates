(() => {
'use strict';
// Based on the proven UI interaction sequence in the user's Zmanim-to-WhatsApp extension.
// Separate versioned handler prevents stale extension scripts from intercepting a send.
if(globalThis.__naharSchedulerAgentV0312)return;
globalThis.__naharSchedulerAgentV0312=true;
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
// Preserve all meaningful characters, consecutive blank lines, and spaces.
// Only normalize OS line endings and invisible bidi controls inserted by WhatsApp.
function exactText(value){
 return String(value??'').normalize('NFC').replace(/\r\n?/g,'\n')
   .replace(/[\u200b-\u200f\u061c\u202a-\u202e\u2060\u2066-\u2069\ufeff]/g,'')
   .replace(/\u00a0/g,' ');
}
function logicalDomText(root){
 let out='';
 const walk=(el)=>{
  for(const n of el.childNodes){
   if(n.nodeType===3){out+=n.nodeValue||'';continue;}
   if(n.nodeType!==1)continue;
   if(n.tagName==='BR'){out+='\n';continue;}
   const block=/^(DIV|P)$/.test(n.tagName);
   if(block&&out&&!out.endsWith('\n'))out+='\n';
   walk(n);
  }
 };
 walk(root);
 return out;
}
function composerReads(e){
 const values=[e.innerText||'',logicalDomText(e)];
 const inner=e.querySelector('[contenteditable="true"]');
 if(inner)values.push(inner.innerText||'',logicalDomText(inner));
 return values.map(exactText);
}
function exactMatches(e,original){
 const expected=exactText(original);
 return composerReads(e).some(v=>v===expected||v.replace(/\n$/,'')===expected);
}
function editorCursorAtEnd(e){
 e.focus();
 const sel=document.getSelection(),r=document.createRange();
 r.selectNodeContents(e);r.collapse(false);sel.removeAllRanges();sel.addRange(r);
}
async function fillComposer(e,text){
 const original=String(text).replace(/\r\n?/g,'\n');
 const target=e.isContentEditable?e:e.querySelector('[contenteditable="true"]');
 if(!target)throw Error('לא נמצא שדה כתיבה פעיל');
 if(composerReads(target).some(x=>x.trim()))throw Error('קיימת טיוטה בשיחה — לא דרסתי אותה');
 const escape=s=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
 // Separate visual lines into DIV blocks; empty lines receive BR to prevent
 // contenteditable engines from collapsing them.
 const html=original.split('\n').map(x=>'<div>'+(x?escape(x):'<br>')+'</div>').join('');
 editorCursorAtEnd(target);
 document.execCommand('insertHTML',false,html);
 await wait(350);
 if(exactMatches(target,original))return;
 const reads=composerReads(target),actual=reads.find(x=>x.length)||'';
 if(actual){
  // Keep the draft visible for inspection, never silently send a changed message.
  throw Error('הטקסט אינו זהה למקור — בוטלה השליחה (מקור '+exactText(original).length+', טיוטה '+actual.length+', שורות מקור '+original.split('\n').length+')');
 }
 // Only retry when the editor stayed empty.
 editorCursorAtEnd(target);
 document.execCommand('insertText',false,original);
 await wait(350);
 if(exactMatches(target,original))return;
 const now=composerReads(target).find(x=>x.length)||'';
 throw Error('הטקסט לא נקלט במדויק — לא נשלח (מקור '+exactText(original).length+', טיוטה '+now.length+')');
}
function containsLink(text){return /(?:https?:\/\/|www\.)[^\s<>"']+/i.test(text)}
async function holdForLinkPreview(text,name){
 if(!containsLink(text))return;
 // Five seconds *after* the text has been inserted into the live composer.
 await wait(5000);
 if(!currentMatches(name))throw Error('השיחה השתנתה בזמן ההמתנה לתצוגה המקדימה');
}
function sendButton(){
 const m=document.querySelector('#main');if(!m)return null;
 const selectors=['button[data-testid="compose-btn-send"]','[data-testid="send"]','button[aria-label="Send"]','button[aria-label*="Send" i]','button[aria-label*="שלח"]','button[aria-label*="שליחה"]','[role="button"][aria-label*="שלח"]'];
 for(const q of selectors){const e=[...m.querySelectorAll(q)].filter(shown);if(e.length)return e[e.length-1]}
 for(const e of m.querySelectorAll('[data-icon="send"],[data-icon="send-filled"]')){const b=e.closest('button,[role="button"]');if(shown(b))return b}
 return null;
}
async function decodeAttachment(a){
 if(!a||typeof a!=='object'||typeof a.id!=='string'||typeof a.name!=='string'||
  !Number.isSafeInteger(a.size)||a.size<1||!Number.isSafeInteger(a.chunks)||a.chunks<1)
  throw Error('נתוני הקובץ אינם תקינים');
 const parts=[];let total=0;
 for(let index=0;index<a.chunks;index++){
  const result=await chrome.runtime.sendMessage({type:'FILE_CHUNK_READ',id:a.id,index});
  if(!result?.ok||typeof result.data!=='string')throw Error('מקטע הקובץ לא התקבל מהתוסף');
  let binary;
  try{binary=atob(result.data)}catch{throw Error('מקטע הקובץ אינו תקין')}
  const buffer=new Uint8Array(binary.length);
  for(let j=0;j<binary.length;j++)buffer[j]=binary.charCodeAt(j);
  parts.push(buffer);total+=buffer.length;
 }
 if(total!==a.size)throw Error('גודל הקובץ שהורכב שונה מהמקור; השליחה בוטלה');
 return new File(parts,a.name,{type:a.type||'application/octet-stream'});
}
function attachButton(){
 const main=document.querySelector('#main');
 if(!main)return null;
 const selectors=[
  'footer button[aria-label*="Attach" i]','footer [role="button"][aria-label*="Attach" i]',
  'footer button[aria-label*="צרף"]','footer [role="button"][aria-label*="צרף"]',
  'footer button[aria-label*="הוסף"]','footer [role="button"][aria-label*="הוסף"]',
  'footer [data-testid="clip"]','footer [data-icon="clip"]',
  'footer [data-icon="plus-rounded"]','footer [data-icon="attach-menu-plus"]',
  'footer button[title*="Attach" i]',
  '[data-testid="compose-btn-attach"]','[data-testid="attach-menu-plus"]'
 ];
 for(const q of selectors)for(const el of main.querySelectorAll(q)){
  const button=el.closest('button,[role="button"]')||el;
  if(shown(button))return button;
 }
 // WhatsApp has moved the attachment button OUTSIDE footer in recent versions.
 // Only look for attachment-specific icon names around the visible composer.
 const c=composer(),rect=c?.getBoundingClientRect();
 const closeToComposer=e=>{
  if(!rect||!shown(e))return false;
  const r=e.getBoundingClientRect();
  return r.width>=15&&r.height>=15&&r.width<=90&&r.height<=90&&
   Math.abs((r.top+r.bottom)/2-(rect.top+rect.bottom)/2)<100&&
   r.left>rect.left-180&&r.right<rect.right+180;
 };
 const icons=[...main.querySelectorAll('[data-icon],button[aria-label],button[title],[role="button"][aria-label]')];
 for(const el of icons){
  const meta=[attr(el,'data-icon'),attr(el,'aria-label'),attr(el,'title')].join(' ');
  if(!/(?:clip|attach|attachment|plus-rounded|attach-menu-plus|צרף|צירוף|הוסף)/i.test(meta))continue;
  const btn=el.closest('button,[role="button"]')||el;
  if(closeToComposer(btn))return btn;
 }
 return null;
}
function filePickerDiagnostic(){
 const main=document.querySelector('#main');
 const composerRect=composer()?.getBoundingClientRect();
 const candidates=[...main?.querySelectorAll('button,[role="button"]')||[]]
  .filter(shown).filter(e=>{
   const r=e.getBoundingClientRect();
   return composerRect&&Math.abs((r.top+r.bottom)/2-(composerRect.top+composerRect.bottom)/2)<95;
  });
 return 'כפתורי כתיבה סמוכים '+candidates.length+', כפתורי צירוף מזוהים '+[...main?.querySelectorAll('[data-icon*="clip"],[data-icon*="attach"],[data-icon*="plus"]')||[]].length;
}
async function injectFileByPasteDrop(file){
 const compose=composer(),main=document.querySelector('#main');
 if(!compose||!main)throw Error('שדה הכתיבה לא קיים');
 const dt=new DataTransfer();dt.items.add(file);
 compose.focus();
 const targets=[compose,main];
 const check=async(ms)=>{
  for(let i=0;i<Math.ceil(ms/180);i++){if(previewSend()&&(previewRoot()||previewCaption()))return true;await wait(180);}
  return false;
 };
 try{
  let event;
  try{event=new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:dt});}
  catch{event=new Event('paste',{bubbles:true,cancelable:true});Object.defineProperty(event,'clipboardData',{value:dt})}
  compose.dispatchEvent(event);
  if(await check(3500))return true;
 }catch{}
 for(const target of targets){
  try{
   for(const type of ['dragenter','dragover','drop']){
    let event;
    try{event=new DragEvent(type,{bubbles:true,cancelable:true,dataTransfer:dt})}
    catch{event=new Event(type,{bubbles:true,cancelable:true});Object.defineProperty(event,'dataTransfer',{value:dt})}
    target.dispatchEvent(event);
   }
   if(await check(3500))return true;
  }catch{}
 }
 return false;
}
const inputAccept=e=>String(e.getAttribute('accept')||'').toLowerCase().replace(/\s+/g,'');
function isSticker(e){
 const a=inputAccept(e),near=String(e.closest('[role="menuitem"],label')?.textContent||'')+' '+attr(e,'aria-label');
 return /sticker|מדבקה/i.test(near)||a==='image/webp';
}
function inputScore(e,kind){
 if(isSticker(e))return -1000;
 const a=inputAccept(e);
 const hint=[attr(e,'data-testid'),attr(e,'aria-label'),e.parentElement?.getAttribute('aria-label'),e.parentElement?.textContent?.slice(0,70)].join(' ');
 if(kind==='media')return (/תמונות|photos|media/i.test(hint)?150:0)+(a.includes('video')?100:0)+(a.includes('image')?40:0)+(e.multiple?20:0);
 return (/document|מסמכים|מסמך|קובץ/i.test(hint)?150:0)+(!a||a==='*'||a==='*/*'?100:0)+(a.includes('application')?30:0)-(a.includes('image')&&!a.includes('application')?200:0);
}
function menuItem(kind){
 const selectors=kind==='media'?['[data-testid="mi-attach-media"]','[aria-label="Photos & videos"]','[aria-label="תמונות וסרטונים"]']:['[data-testid="mi-attach-document"]','[aria-label="Document"]','[aria-label="מסמך"]'];
 for(const q of selectors){const el=[...document.querySelectorAll(q)].find(shown);if(el)return el}
 const pattern=kind==='media'?/photos?\s*(?:&|and)\s*videos?|תמונות\s*(?:ו|&)\s*סרטונים/i:/document|מסמכים|מסמך/i;
 return [...document.querySelectorAll('[role="menuitem"],[role="menu"] [role="button"]')].find(e=>shown(e)&&pattern.test(e.textContent||'')&&!e.closest('#side'))||null;
}
async function attachmentInput(file){
 const kind=/^(image|video)\//.test(file.type)?'media':'document';
 const before=new Set(document.querySelectorAll('input[type="file"]'));
 const button=attachButton();if(!button)throw Error('כפתור צירוף הקבצים לא נמצא');
 humanClick(button);
 let item=null;
 for(let i=0;i<24;i++){
  const fresh=[...document.querySelectorAll('input[type="file"]')].filter(e=>!before.has(e)&&inputScore(e,kind)>0).sort((a,b)=>inputScore(b,kind)-inputScore(a,kind));
  if(fresh.length)return fresh[0];
  item=item||menuItem(kind);
  if(item)break;
  await wait(130);
 }
 if(item){
  humanClick(item);
  for(let i=0;i<40;i++){
   const fresh=[...document.querySelectorAll('input[type="file"]')].filter(e=>!before.has(e)&&inputScore(e,kind)>0).sort((a,b)=>inputScore(b,kind)-inputScore(a,kind));
   if(fresh.length)return fresh[0];
   await wait(130);
  }
 }
 throw Error('שדה הצירוף של '+(kind==='media'?'תמונות וסרטונים':'מסמכים')+' לא הופיע');
}
function previewRoot(){
 const selectors=['[data-testid="media-editor"]','[data-testid="media-preview"]','[data-testid="media-preview-dialog"]','[data-testid="media-upload"]','[data-testid*="preview"]','[role="dialog"]'];
 for(const q of selectors){
  const el=[...document.querySelectorAll(q)].filter(shown).filter(e=>!e.closest('#side')).at(-1);
  if(el)return el;
 }
 // Current WhatsApp Web renders the media preview as a full conversation overlay,
 // with a video/image stage, caption input and circular SEND button, without a dialog role.
 const main=document.querySelector('#main');
 if(main&&visibleMediaStage(main))return main;
 return null;
}
function visibleMediaStage(root){
 if(!root)return false;
 const elements=[...root.querySelectorAll('video,img,canvas')].filter(shown)
  .filter(e=>!e.closest('header,#side,footer'));
 return elements.some(e=>{
  const r=e.getBoundingClientRect();
  return r.height>150&&r.width>110;
 });
}
function attachmentOverlay(){
 const main=document.querySelector('#main');
 if(!main)return null;
 if(visibleMediaStage(main))return main;
 return previewRoot();
}
function previewCaption(){
 const root=attachmentOverlay();
 if(!root)return null;
 const candidates=[...root.querySelectorAll('[contenteditable="true"],[role="textbox"]')]
  .filter(shown).filter(e=>!e.closest('#side'))
  .filter(e=>{
   const r=e.getBoundingClientRect(),main=document.querySelector('#main')?.getBoundingClientRect();
   return !!main&&r.top>main.top+100&&r.bottom>main.top+main.height*.55&&r.bottom<main.bottom-25;
  });
 const labelled=candidates.filter(e=>/caption|כיתוב|הקלדת הודעה|type a message/i.test([attr(e,'aria-label'),attr(e,'data-placeholder'),attr(e,'title'),e.parentElement?.textContent?.slice(0,35)].join(' ')));
 return labelled.at(-1)||candidates.at(-1)||null;
}
function messageInfoOpen(){
 const candidates=[...document.querySelectorAll('h1,h2,header,[role="heading"],[data-testid*="message-info"]')].filter(shown);
 return candidates.some(e=>/^\s*(?:פרטי ההודעה|Message info|Info message)\s*$/i.test(e.textContent||'')||
    /message-info/i.test(attr(e,'data-testid')));
}
function activeAttachmentEditor(){
 if(messageInfoOpen())return null;
 const main=document.querySelector('#main');if(!main||!shown(main))return null;
 // Attachment editor has a large media preview AND a distinct, lower caption field
 // plus a bottom thumbnail row with a dedicated add-more attachment control.
 if(!visibleMediaStage(main)||!previewCaption())return null;
 const r=main.getBoundingClientRect();
 const thumbnails=[...main.querySelectorAll('img,video')].filter(shown).filter(e=>{
  const b=e.getBoundingClientRect();return b.bottom>r.bottom-110&&b.top<r.bottom&&b.width<130&&b.height<130;
 });
 const addMore=[...main.querySelectorAll('button,[role="button"]')].filter(shown).filter(e=>{
  const b=e.getBoundingClientRect(),t=[attr(e,'aria-label'),attr(e,'title'),e.textContent||''].join(' ');
  return b.top>r.bottom-125&&b.width<90&&b.height<90&&(/^\s*[+＋]\s*$/.test(t)||/add|הוסף|צרף/i.test(t));
 });
 return thumbnails.length||addMore.length?main:null;
}
function previewSend(){
 const main=activeAttachmentEditor();if(!main)return null;
 const bounds=main.getBoundingClientRect();
 // Only explicitly tagged SEND buttons; no location-only clicking.
 const candidates=[...main.querySelectorAll('button,[role="button"],[data-icon],svg')].filter(shown);
 const found=new Set();
 for(const e of candidates){
  const btn=e.closest('button,[role="button"]')||e;
  if(!shown(btn)||btn.closest('#side,header')||found.has(btn))continue;
  const info=[
   attr(e,'aria-label'),attr(e,'title'),attr(e,'data-testid'),attr(e,'data-icon'),
   attr(btn,'aria-label'),attr(btn,'title'),attr(btn,'data-testid'),attr(btn,'data-icon'),
   ...[...btn.querySelectorAll('[data-icon]')].map(n=>attr(n,'data-icon'))
  ].join(' ').toLowerCase();
  if(!/(?:^|[\s_-])(?:send|send-filled|media-send|compose-btn-send|שלח|שליחה)(?:$|[\s_-])/.test(info))continue;
  if(/info|message-info|forward|delete|attach|plus|add|sticker|הוסף|מידע|פרטי/.test(info))continue;
  const box=btn.getBoundingClientRect();
  const inBottom=box.bottom>bounds.bottom-155&&box.bottom<=bounds.bottom+18;
  const inLeft=box.left>=bounds.left-20&&box.left<=bounds.left+Math.min(200,bounds.width*.28);
  if(!inBottom||!inLeft||box.width<25||box.width>105||box.height<25||box.height>105)continue;
  found.add(btn);
 }
 return found.size===1?[...found][0]:null;
}
function previewControlDiagnostics(){
 const main=document.querySelector('#main');
 if(!main)return 'אין אזור שיחה';
 const r=main.getBoundingClientRect();
 const values=[...main.querySelectorAll('button,[role="button"]')].filter(shown).filter(e=>{
  const b=e.getBoundingClientRect();
  return b.bottom>r.bottom-165&&b.left>=r.left-20&&b.left<r.left+200;
 }).slice(0,8).map(e=>{
  const icon=[...e.querySelectorAll('[data-icon]')].map(n=>attr(n,'data-icon')).filter(Boolean).slice(0,3);
  const names=[attr(e,'aria-label'),attr(e,'title'),attr(e,'data-testid'),...icon].filter(Boolean);
  const rect=e.getBoundingClientRect();
  return '{tag:'+e.tagName+',meta:'+names.join('/').slice(0,75)+',size:'+Math.round(rect.width)+'x'+Math.round(rect.height)+'}';
 });
 return 'חלונית פרטי הודעה '+(messageInfoOpen()?'פתוחה':'סגורה')+
 ', עורך צירוף '+(activeAttachmentEditor()?'אומת':'לא אומת')+
 ', כפתורים סמוכים: '+values.join(' ');
}
function previewDiagnostic(){
 const main=document.querySelector('#main');
 const r=main?.getBoundingClientRect();
 const media=main?[...main.querySelectorAll('video,img,canvas')].filter(shown).filter(e=>!e.closest('header,footer')):[];
 const buttons=main&&r?[...main.querySelectorAll('button,[role="button"]')].filter(shown).filter(e=>{
  const b=e.getBoundingClientRect();return b.top>r.bottom-165&&b.left<r.left+160;
 }).length:0;
 return 'תצוגת מדיה '+(visibleMediaStage(main)?'קיימת':'לא זוהתה')+', פריטי מדיה '+media.length+', כפתורים שמאליים תחתונים '+buttons+', שדה כיתוב '+(previewCaption()?'קיים':'חסר');
}
async function sendAttachment(attachment,text,name){
 const file=await decodeAttachment(attachment);
 if(messageInfoOpen())throw Error('חלונית פרטי ההודעה פתוחה. סגור אותה לפני ניסיון שליחה כדי למנוע לחיצה שגויה');
 if(activeAttachmentEditor())throw Error('יש קובץ בטיוטת הצירוף מניסיון קודם. סגור את הטיוטה לפני ניסיון חדש כדי למנוע כפילות');
 let input=null;
 try{input=await attachmentInput(file);}
 catch(error){
  // Media paste/drop follows WhatsApp's own composer route; never switch to
  // profile picture or sticker inputs.
  if(/^(image|video)\//.test(file.type)&&await injectFileByPasteDrop(file)){
   input=null;
  }else throw Error(String(error.message||error)+'. '+filePickerDiagnostic());
 }
 if(input){
 const dt=new DataTransfer();dt.items.add(file);
 try{input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}))}
 catch{throw Error('WhatsApp לא קיבל את הקובץ המצורף')}
 }
 let ready=false;
 for(let i=0;i<75;i++){
  await wait(200);
  if(activeAttachmentEditor()&&previewSend()){ready=true;break}
 }
 if(!ready)throw Error('צירוף הקובץ לא אומת או כפתור SEND לא זוהה — '+previewControlDiagnostics());
 if(text.trim()){
  const cap=previewCaption();
  if(!cap)throw Error('לא נמצא שדה כיתוב לקובץ. הקובץ לא נשלח');
  activeSendingGroup=name;
  await fillComposer(cap,text);
  await holdForLinkPreview(text,name);
 }
 if(!currentMatches(name))throw Error('קבוצת הבדיקות השתנתה לפני שליחת הקובץ — בוטל');
 const button=previewSend();
 if(!button)throw Error('כפתור SEND ייעודי לקובץ לא זוהה. '+previewControlDiagnostics());
 // Send the file once, with its caption if supplied. Do not send a separate text message.
 button.click();
 // A click only means an attempt. Verify the attachment editor closed and the
 // message-info pane did not open; otherwise do not report attempted success.
 await wait(900);
 if(messageInfoOpen())throw Error('נפתחה חלונית פרטי הודעה במקום שליחת קובץ — אין אישור שליחה');
 if(activeAttachmentEditor())throw Error('כפתור השליחה נלחץ אך טיוטת הקובץ עדיין פתוחה — השליחה לא אומתה');
 return {ok:true};
}
function metrics(){return {hasMain:!!document.querySelector('#main'),hasHeader:!!document.querySelector('#main header'),headerFields:Math.min(100,currentNames().length),hasSide:!!document.querySelector('#side'),hasSearch:!!searchBox(),hasEditor:!!composer()}}
async function send(text,name,attachment){
 if(typeof name!=='string'||lexical(name).length<8||typeof text!=='string'||(!text.trim()&&!attachment))throw Error('נתוני יעד או הודעה לא תקינים');
 await openGroup(name);
 if(!await waitForTarget(name,1000))throw Error('לא אומתה קבוצת הבדיקות לפני כתיבה');
 if(attachment)return sendAttachment(attachment,text,name);
 const box=composer();if(!box)throw Error('שדה ההודעה לא נמצא');
 if(norm(box.innerText))throw Error('יש טיוטה קיימת, בוטל');
 activeSendingGroup=name;
 await fillComposer(box,text);
 await holdForLinkPreview(text,name);
 if(!currentMatches(name))throw Error('השיחה השתנתה לפני השליחה — בוטל');
 const b=sendButton();if(!b)throw Error('כפתור השליחה לא נמצא; ההודעה נותרה כטיוטה');
 // Exactly one click: repeated synthetic clicks could cause duplicate sends.
 b.click();
 return {ok:true};
}
chrome.runtime.onMessage.addListener((msg,sender,reply)=>{
 if(msg?.type==='WA_TEST_PING_V0312'){reply({ok:true,version:'0.3.12',hasMain:!!document.querySelector('#main'),hasSide:!!document.querySelector('#side')});return;}
 if(msg?.type!=='SEND_TEST_V0312')return;
 if(sending){reply({ok:false,error:'כבר מתבצע ניסיון שליחה'});return;}
 sending=true;
 send(msg.text,msg.group,msg.attachment).then(reply).catch(e=>reply({ok:false,error:String(e.message||e),metrics:metrics()})).finally(()=>{sending=false;activeSendingGroup=''});
 return true;
});
})();
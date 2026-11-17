(() => {
'use strict';
// Based on the proven UI interaction sequence in the user's Zmanim-to-WhatsApp extension.
// Separate versioned handler prevents stale extension scripts from intercepting a send.
if(globalThis.__naharSchedulerAgentV0611)return;
globalThis.__naharSchedulerAgentV0611=true;
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
// Never collapse, trim, or modify the user's lines and spacing. The only
// normalization is OS CRLF and renderer-only directional control marks.
function exactText(value){
 return String(value??'').normalize('NFC').replace(/\r\n?/g,'\n')
   .replace(/[\u200b-\u200f\u061c\u202a-\u202e\u2060\u2066-\u2069\ufeff]/g,'')
   .replace(/\u00a0/g,' ');
}
function logicalDomText(root){
 let result='';
 function walk(node){
  for(const child of node.childNodes){
   if(child.nodeType===3){result+=child.nodeValue||'';continue}
   if(child.nodeType!==1)continue;
   if(child.tagName==='BR'){result+='\n';continue}
   const block=/^(DIV|P)$/.test(child.tagName);
   if(block&&result&&!result.endsWith('\n'))result+='\n';
   walk(child);
  }
 }
 walk(root);return result;
}
function composerReads(e){
 const reads=[e.innerText||'',logicalDomText(e)];
 const inner=e.querySelector('[contenteditable="true"]');
 if(inner&&inner!==e)reads.push(inner.innerText||'',logicalDomText(inner));
 return [...new Set(reads.map(exactText))];
}
function exactMatches(e,original){
 const expected=exactText(original);
 return composerReads(e).some(v=>v===expected);
}
function realEditor(el){
 if(!el)return null;
 const inner=el.querySelector('[contenteditable="true"]');
 return inner&&inner!==el?inner:el.isContentEditable?el:null;
}
function cursorEnd(el){
 el.focus();
 const selection=document.getSelection(),range=document.createRange();
 range.selectNodeContents(el);range.collapse(false);
 selection.removeAllRanges();selection.addRange(range);
}
function editorSnapshot(editor){
 const values=composerReads(editor);
 const best=values.reduce((a,b)=>b.length>a.length?b:a,'');
 const children=[...editor.querySelectorAll('br,div,p,span')];
 return {best,br:children.filter(x=>x.tagName==='BR').length,
   paragraphs:children.filter(x=>x.tagName==='P'||x.tagName==='DIV').length,
   directNodes:editor.childNodes.length};
}
async function fillComposer(el,text){
 const original=String(text).replace(/\r\n?/g,'\n');
 const editor=realEditor(el);
 if(!editor)throw Error('שדה ההודעה של WhatsApp אינו ניתן לעריכה');
 if(!currentMatches(activeSendingGroup))
  throw Error('קבוצת הבדיקות השתנתה לפני ההקלדה — בוטל');
 if(composerReads(editor).some(v=>v.replace(/\s/g,'')))
  throw Error('שדה ההודעה מכיל טיוטה קיימת — לא דרסתי אותה');
 // The one-line path has already been tested successfully; leave it unchanged.
 if(!original.includes('\n')){
  cursorEnd(editor);
  if(!document.execCommand('insertText',false,original))
   throw Error('WhatsApp לא קיבל הקלדת טקסט');
 }else{
  // Previous execCommand-based line breaks were consistently flattened by
  // WhatsApp's controlled editor. Use browser-generated Shift+Enter.
  cursorEnd(editor);
  if(document.activeElement!==editor&&!editor.contains(document.activeElement))
   throw Error('שדה ההודעה לא קיבל מיקוד');
  const result=await chrome.runtime.sendMessage({type:'WA_TRUSTED_TYPE_LINES_V040',text:original});
  if(!result?.ok)throw Error(result?.error||'הקלדת שורות בדפדפן נכשלה');
 }
 await wait(500);
 if(!currentMatches(activeSendingGroup))throw Error('קבוצת הבדיקות השתנתה בזמן ההקלדה');
 if(exactMatches(editor,original))return;
 const expected=exactText(original),d=editorSnapshot(editor),actual=d.best;
 let diff=0;
 while(diff<Math.min(expected.length,actual.length)&&expected[diff]===actual[diff])diff++;
 const count=t=>(t.match(/\n/g)||[]).length;
 throw Error('WhatsApp לא שמר את הטקסט במדויק — לא נשלח (מקור '+expected.length+
  ', טיוטה '+actual.length+', מעברי מקור '+count(expected)+', מעברי טיוטה '+count(actual)+
  ', BR '+d.br+', פסקאות '+d.paragraphs+', ילדי עורך '+d.directNodes+
  ', הבדל בתו '+diff+')');
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
// WhatsApp mounts the attachment editor in a portal outside #main on some builds.
// Never derive preview identity from old chat-message videos or images.
function messageInfoOpen(){
 const headings=[...document.querySelectorAll('h1,h2,header,[role="heading"],[data-testid*="message-info"]')].filter(shown);
 return headings.some(e=>/^\s*(?:פרטי ההודעה|Message info|Info message)\s*$/i.test(e.textContent||'')||
   /message-info/i.test(attr(e,'data-testid')));
}
function probableCaption(el){
 if(!shown(el)||el.closest('#side'))return false;
 const meta=[attr(el,'aria-label'),attr(el,'aria-placeholder'),attr(el,'data-placeholder'),attr(el,'data-testid'),
   attr(el.parentElement,'data-placeholder')].join(' ');
 if(/caption|כיתוב|הקלדת הודעה|type a message/i.test(meta))return true;
 const box=el.getBoundingClientRect();
 const regular=composer();
 if(el===regular||regular?.contains(el)||el.closest('#main footer'))return false;
 return box.width>140&&box.height>=20&&box.top>window.innerHeight*.50;
}
function thumbnailEvidence(root){
 const els=[...root.querySelectorAll('img,video,canvas')].filter(shown).filter(x=>!x.closest('#side'));
 return els.some(e=>{
  const r=e.getBoundingClientRect();
  return r.width>25&&r.width<125&&r.height>25&&r.height<125&&r.top>window.innerHeight*.70;
 });
}
function previewEditor(){
 if(messageInfoOpen())return null;
 const candidates=[...document.querySelectorAll('[contenteditable="true"],[role="textbox"]')].filter(probableCaption);
 for(const cap of candidates.reverse()){
  // A dedicated attachment overlay has both a caption field and a media thumbnail.
  let node=cap;
  for(let depth=0;node&&depth<9;depth++,node=node.parentElement){
   if(node===document.body)break;
   const box=node.getBoundingClientRect();
   if(box.width<250||box.height<150)continue;
   if(thumbnailEvidence(node))return {root:node,caption:cap};
  }
 }
 return null;
}
function previewCaption(){
 return previewEditor()?.caption||null;
}
function activeAttachmentEditor(){
 return previewEditor()?.root||null;
}
function exactSendControl(root){
 const nodes=[...root.querySelectorAll('button,[role="button"],[aria-label],[title],[data-icon],[data-testid]')].filter(shown);
 const found=new Set();
 for(const node of nodes){
  const btn=node.closest('button,[role="button"]')||node;
  const meta=[attr(node,'data-testid'),attr(node,'data-icon'),attr(node,'aria-label'),attr(node,'title'),
    attr(btn,'data-testid'),attr(btn,'data-icon'),attr(btn,'aria-label'),attr(btn,'title')].join(' ');
  if(!/(?:^|[\s_-])(?:send|send-filled|media-send|compose-btn-send|שלח|שליחה)(?:$|[\s_-])/.test(meta))continue;
  if(/info|forward|attach|plus|add|הוסף|מידע|פרטי/.test(meta))continue;
  const r=btn.getBoundingClientRect();
  if(r.width<25||r.height<25||r.width>110||r.height>110)continue;
  if(r.top<window.innerHeight*.65)continue;
  found.add(btn);
 }
 return found.size===1?[...found][0]:null;
}
function previewSend(){
 const e=previewEditor();
 if(!e)return null;
 return exactSendControl(e.root);
}
function previewControlDiagnostics(){
 const caps=[...document.querySelectorAll('[contenteditable="true"],[role="textbox"]')].filter(probableCaption);
 const thumbs=[...document.querySelectorAll('img,video,canvas')].filter(shown).filter(e=>{
  const r=e.getBoundingClientRect();
  return !e.closest('#side')&&r.top>window.innerHeight*.70&&r.width<125&&r.height<125;
 });
 const overlay=previewEditor();
 return 'חלונית פרטי הודעה '+(messageInfoOpen()?'פתוחה':'סגורה')+
 ', שדות כיתוב מועמדים '+caps.length+', תמונות ממוזערות '+thumbs.length+
 ', עורך צירוף '+(overlay?'אומת':'לא אומת')+
 ', כפתור SEND מזוהה '+(overlay&&exactSendControl(overlay.root)?'כן':'לא');
}
async function tryPreviewEnter(){
 const e=previewEditor();
 if(!e)throw Error('Enter לא הופעל: עורך צירוף קובץ לא אומת');
 // Never press Enter on a normal chat composer or message info pane.
 if(e.caption===composer()||messageInfoOpen())throw Error('Enter בוטל כדי למנוע שליחה למקום שגוי');
 e.caption.focus();
 for(const type of ['keydown','keypress','keyup']){
  const event=new KeyboardEvent(type,{key:'Enter',code:'Enter',keyCode:13,which:13,bubbles:true,cancelable:true,composed:true});
  e.caption.dispatchEvent(event);
 }
 await wait(1250);
 if(messageInfoOpen())throw Error('נפתחו פרטי הודעה במקום שליחה — לא בוצעה שליחה');
 if(previewEditor())throw Error('Enter נשלח לשדה הכיתוב, אך תצוגת הצירוף עדיין פתוחה — לא אומתה שליחה');
 return {ok:true};
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
  if(previewEditor()){ready=true;break}
 }
 if(!ready)throw Error('עורך הצירוף לא זוהה בבטחה — '+previewControlDiagnostics());
 if(text.trim()){
  const cap=previewCaption();
  if(!cap)throw Error('לא נמצא שדה כיתוב לקובץ. הקובץ לא נשלח');
  activeSendingGroup=name;
  await fillComposer(cap,text);
  await holdForLinkPreview(text,name);
 }
 if(!currentMatches(name))throw Error('קבוצת הבדיקות השתנתה לפני שליחת הקובץ — בוטל');
 const button=previewSend();
 if(!button)return tryPreviewEnter();
 // Use only explicitly labelled SEND controls inside the *verified attachment editor*.
 button.click();
 await wait(1250);
 if(messageInfoOpen())throw Error('נפתחה חלונית פרטי הודעה במקום שליחת קובץ — אין אישור שליחה');
 if(previewEditor())throw Error('כפתור SEND נלחץ אך טיוטת הקובץ עדיין פתוחה — השליחה לא אומתה');
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

const FORWARD_TEST_GROUP='🏷️ פנימי שמעון נוה 🔖';
function forwardVisible(e){return shown(e)&&getComputedStyle(e).pointerEvents!=='none'}
// WhatsApp builds no longer always expose "message-out" or true_* message IDs.
// Outgoing messages still display our read/delivery check indicator within the
// message meta area. Require that concrete indicator before forwarding.
function deliveryStatusIcon(el){
 const name=[attr(el,'data-icon'),attr(el,'data-testid'),attr(el,'aria-label'),attr(el,'title')].join(' ').toLowerCase();
 return /(?:msg[-_])?(?:dblcheck|doublecheck|check|ack|read|delivered)(?:[-_]|$)/.test(name)||
  /(?:נקראה|נקראו|נמסרה|נשלחה|delivered|read by|seen by)/i.test(name);
}
function outgoingProof(row){
 if(!row||row.closest('header,footer,[role="dialog"]'))return false;
 if(row.classList.contains('message-in')||/^false[_-]/i.test(attr(row,'data-id')))return false;
 const id=[attr(row,'data-id'),...([...row.querySelectorAll('[data-id]')].slice(0,12).map(e=>attr(e,'data-id')))].join(' ');
 if(row.classList.contains('message-out')||/(?:^|\s)true[_-]/.test(id))return true;
 const meta=[...row.querySelectorAll('[data-testid*="msg-meta"],[class*="msg-meta"],[data-icon],[aria-label],[title]')];
 return meta.some(e=>shown(e)&&deliveryStatusIcon(e)&&
  (e.closest('[data-testid*="msg-meta"],[class*="msg-meta"]')||
   /^(?:msg[-_])?(?:dblcheck|doublecheck|check|ack|read)/i.test(attr(e,'data-icon'))));
}
function bubbleFromDelivery(el){
 const main=document.querySelector('#main');
 let cur=el;
 // Prefer the semantic message container, but recent WhatsApp builds use
 // anonymous wrappers, so fall back to a bounded bubble around the status.
 for(let depth=0;cur&&cur!==main&&depth<12;cur=cur.parentElement,depth++){
  if(cur.matches('.message-out,[data-id^="true_"],[data-id^="true-"],[data-testid="msg-container"],[data-testid="message-container"]'))
   return cur;
 }
 cur=el;
 let candidate=null;
 for(let depth=0;cur&&cur!==main&&depth<11;cur=cur.parentElement,depth++){
  const box=cur.getBoundingClientRect();
  if(box.width>95&&box.width<900&&box.height>=30&&box.height<950&&
    !cur.querySelector('footer,header')&&cur.querySelector('[data-testid*="msg-meta"],[class*="msg-meta"]')){
   candidate=cur;
   // Prefer the nearest complete bubble, not the single ack icon.
   if(cur.children.length>=2)return cur;
  }
 }
 return candidate;
}
function outgoingRows(){
 const main=document.querySelector('#main');
 if(!main)return [];
 const roots=[...main.querySelectorAll('.message-out,[data-id^="true_"],[data-id^="true-"],[data-testid="msg-container"],[data-testid="message-container"]')];
 const fromStatus=[...main.querySelectorAll('[data-icon],[data-testid],[aria-label],[title]')]
  .filter(e=>shown(e)&&deliveryStatusIcon(e)&&!e.closest('header,footer,[role="dialog"]'))
  .map(bubbleFromDelivery).filter(Boolean);
 const all=[...new Set([...roots,...fromStatus])],selected=[];
 for(const row of all){
  if(!outgoingProof(row))continue;
  if(selected.some(e=>e===row||e.contains(row)))continue;
  selected.push(row);
 }
 // The document order is relevant, not the order of our selector lists.
 return selected.sort((a,b)=>{
  const rel=a.compareDocumentPosition(b);
  return rel&Node.DOCUMENT_POSITION_FOLLOWING?-1:rel&Node.DOCUMENT_POSITION_PRECEDING?1:0;
 });
}
function outgoingDiagnostic(){
 const main=document.querySelector('#main');
 if(!main)return 'אין אזור שיחה';
 const ids=[...main.querySelectorAll('[data-id]')];
 const statuses=[...main.querySelectorAll('[data-icon],[aria-label],[title]')]
   .filter(e=>shown(e)&&deliveryStatusIcon(e)&&!e.closest('header,footer'));
 const meta=[...main.querySelectorAll('[data-testid*="msg-meta"],[class*="msg-meta"]')];
 const containers=[...main.querySelectorAll('[data-testid="msg-container"],[data-testid="message-container"]')];
 return 'מזהי הודעות '+ids.length+', אזורי זמן/סטטוס '+meta.length+
  ', סימוני מסירה/קריאה '+statuses.length+', מכלי הודעות '+containers.length+
  ', מועמדות יוצאות מאומתות '+outgoingRows().length;
}
async function scrollChatBottom(){
 const main=document.querySelector('#main');
 if(!main)return;
 const all=[...main.querySelectorAll('*')];
 const scrollables=all.filter(e=>{
  if(!shown(e))return false;
  const style=getComputedStyle(e),y=style.overflowY;
  return e.scrollHeight>e.clientHeight+70&&/auto|scroll/.test(y)&&
    e.clientHeight>200;
 }).sort((a,b)=>b.scrollHeight-b.clientHeight-(a.scrollHeight-a.clientHeight));
 // Prefer the message list container, not the entire page or sidebar.
 const panel=scrollables[0]||null;
 if(panel){panel.scrollTop=panel.scrollHeight;panel.dispatchEvent(new Event('scroll',{bubbles:true}));}
 const bottom=[...main.querySelectorAll('[data-icon="chevron-down"],[data-icon="down"],[aria-label*="latest" i],[aria-label*="למטה"],[aria-label*="האחרונה"]')]
  .filter(shown).filter(e=>!e.closest('footer,header'));
 if(bottom.length===1){const button=bottom[0].closest('button,[role="button"]')||bottom[0];humanClick(button);}
 await wait(500);
}
async function lastOutgoing(){
 for(let i=0;i<5;i++){
  const rows=outgoingRows();
  if(rows.length){const last=rows.at(-1);last.scrollIntoView({block:'center'});await wait(160);return last;}
  await scrollChatBottom();
  await wait(350);
 }
 return null;
}
function expectedForwardMenu(){
 const items=[...document.querySelectorAll('[role="menuitem"],[role="menu"] [role="button"],[data-testid*="menu-item"]')].filter(forwardVisible);
 const options=items.filter(e=>{
  const t=[attr(e,'aria-label'),attr(e,'title'),e.textContent].join(' ');
  return /^(?:\s*)(?:↪\s*)?(?:Forward|העבר|העברה|העבר הודעה)(?:\s*)$/i.test(t.trim());
 });
 return options.length===1?options[0]:null;
}
async function openForwardFromMessage(row){
 row.scrollIntoView({block:'center'});
 await wait(200);
 const clickable=[...row.querySelectorAll('[data-icon="forward"],[aria-label*="forward" i],[aria-label*="העבר"],[title*="forward" i],[title*="העבר"]')]
  .map(e=>e.closest('button,[role="button"]')||e).filter(forwardVisible);
 if(clickable.length===1){humanClick(clickable[0]);return}
 const rect=row.getBoundingClientRect();
 const ev={bubbles:true,cancelable:true,clientX:rect.left+rect.width*.5,clientY:rect.top+Math.min(55,rect.height*.35),button:2,buttons:2,view:window};
 row.dispatchEvent(new PointerEvent('pointerdown',{...ev,pointerId:1,pointerType:'mouse'}));
 row.dispatchEvent(new MouseEvent('mousedown',ev));
 row.dispatchEvent(new MouseEvent('contextmenu',ev));
 for(let i=0;i<15;i++){
  const item=expectedForwardMenu();
  if(item){humanClick(item);return}
  await wait(170);
 }
 throw Error('תפריט העברת ההודעה לא נפתח או שאפשרות העברה לא זוהתה');
}
function forwardingDialog(){
 // Return the stable chat-selector region, even before a destination has been
 // selected. Requiring a footer recipient chip caused the 0.4.9 regression.
 const heading=/^(?:העברת הודעה אל|העבר הודעה אל|העברת העדכון אל|העבר את העדכון אל|Forward message to|Forward update to|Forward to|העבר אל)$/i;
 const headings=[...document.querySelectorAll('h1,h2,h3,[role="heading"],span,div')]
  .filter(shown).filter(e=>e.children.length<=2&&heading.test(norm(e.textContent)));
 const matches=[];
 for(const title of headings){
  for(let el=title,depth=0;el&&el!==document.body&&depth<15;el=el.parentElement,depth++){
   const r=el.getBoundingClientRect();
   if(r.width<355||r.width>700||r.height<490||r.height>window.innerHeight+12)continue;
   if(r.left<0||r.right>window.innerWidth+12||r.top<0)continue;
   if(![...el.querySelectorAll('input,[role="textbox"],[contenteditable="true"]')].some(shown))continue;
   const close=[...el.querySelectorAll('[aria-label],[data-icon],button')].filter(shown)
    .some(e=>/close|סגור/i.test([attr(e,'aria-label'),attr(e,'data-icon'),attr(e,'title')].join(' ')));
   matches.push({el,area:r.width*r.height,close});
  }
 }
 matches.sort((x,y)=>x.area-y.area);
 return (matches.find(x=>x.close)||matches[0])?.el||null;
}
function forwardChoice(dialog,target){
 const wanted=lexical(target);
 const nodes=[...dialog.querySelectorAll('[title],[aria-label],span[dir="auto"]')].filter(shown)
  .filter(e=>lexical(attr(e,'title')||attr(e,'aria-label')||(e.children.length?'':e.textContent))===wanted);
 const rows=[];
 for(const name of nodes){
  let p=name;
  for(let i=0;i<10&&p&&p!==dialog;i++,p=p.parentElement){
   const r=p.getBoundingClientRect(),d=dialog.getBoundingClientRect();
   // The clickable recipient row is a full-width, ~70px-high region.
   if(r.width>=Math.min(225,d.width*.48)&&r.height>=48&&r.height<=120&&
     r.top>d.top+75&&r.bottom<d.bottom-110){
     if(!rows.includes(p))rows.push(p);
   }
  }
 }
 if(!rows.length)return null;
 // Choose the outermost row that still fits a single chat item, not the name span.
 rows.sort((x,y)=>y.getBoundingClientRect().width-x.getBoundingClientRect().width);
 const best=rows[0];
 if(rows.some(e=>e!==best&&!best.contains(e)&&!e.contains(best)))return null;
 return best;
}
function forwardSelectionState(dialog,row,target){
 if(!row||!shown(row))return {selected:false,reason:'no-row'};
 const r=row.getBoundingClientRect(),d=dialog.getBoundingClientRect();
 const normalized=lexical(target);
 const names=[...row.querySelectorAll('[title],[aria-label],span[dir="auto"]')].filter(shown)
  .filter(e=>lexical(attr(e,'title')||attr(e,'aria-label')||(e.children.length?'':e.textContent))===normalized);
 if(!names.length)return {selected:false,reason:'wrong-target'};
 const controls=[...dialog.querySelectorAll('input[type="checkbox"],[role="checkbox"],[aria-checked],[data-state],svg,[data-icon],div,span')].filter(shown)
  .filter(e=>{
   const b=e.getBoundingClientRect();
   // Checkbox sits at the far RIGHT end of the same recipient row in RTL UI.
   return b.height>=12&&b.height<=35&&b.width>=12&&b.width<=35&&
     Math.abs((b.top+b.bottom)/2-(r.top+r.bottom)/2)<20&&
     b.left>r.right-90&&b.right<=d.right+5;
  });
 const semantic=controls.some(e=>e.checked===true||attr(e,'aria-checked')==='true'||attr(e,'data-state')==='checked');
 if(semantic)return {selected:true,reason:'checked-attribute'};
 const visual=controls.filter(e=>{
  const css=getComputedStyle(e),m=css.backgroundColor.match(/rgba?\(([^)]+)\)/i);
  const rgb=m?.[1].split(',').map(Number)||[];
  const dark=rgb.length>=3&&(rgb.length===3||rgb[3]>.75)&&rgb.slice(0,3).every(v=>v<80);
  const check=!!e.querySelector('svg,path,polyline')||/✓|✔/.test(e.textContent||'')||
   /check|tick|selected/i.test([attr(e,'data-icon'),attr(e,'aria-label'),attr(e,'data-testid')].join(' '));
  return dark&&check;
 });
 if(visual.length)return {selected:true,reason:'visual-check'};
 // Nested SVG with check may have a transparent background, but it must live
 // inside a dark checkbox parent in the row's checkbox region.
 const icon=controls.some(e=>/check|tick|selected/i.test([attr(e,'data-icon'),attr(e,'data-testid')].join(' '))&&
  [...(function*(n){for(let p=n;p&&p!==dialog;p=p.parentElement)yield p})(e)].some(p=>{
   const pRect=p.getBoundingClientRect(),color=getComputedStyle(p).backgroundColor;
   const rgb=color.match(/rgba?\(([^)]+)\)/i)?.[1].split(',').map(Number)||[];
   return pRect.width>=15&&pRect.width<=30&&rgb.length>=3&&rgb.slice(0,3).every(x=>x<80);
  }));
 if(icon)return {selected:true,reason:'dark-check-icon'};
 // The footer recipient chip is additional evidence, but never alone proves
 // a checkbox selection: it must refer to the exact target.
 const chip=[...dialog.querySelectorAll('[title],[aria-label],span[dir="auto"]')].filter(shown).some(e=>{
  const b=e.getBoundingClientRect();
  return b.top>d.bottom-75&&lexical(attr(e,'title')||attr(e,'aria-label')||e.textContent)===normalized;
 });
 if(chip&&controls.some(e=>attr(e,'aria-checked')==='true'))return {selected:true,reason:'chip-plus-checked'};
 return {selected:false,reason:'not-confirmed; checkbox-candidates '+controls.length};
}
async function stableForwardDialog(minSamples=3){
 let previous=null,count=0;
 for(let i=0;i<45;i++){
  const d=forwardingDialog();
  if(d){
   const r=d.getBoundingClientRect();
   // Ignore the transient scaled-down transform from WhatsApp's open animation.
   const transform=getComputedStyle(d).transform;
   const stableSize=r.width>=355&&r.width<=700&&r.height>=490&&r.height<=window.innerHeight+30;
   const stablePosition=r.left>window.innerWidth*.15&&r.right<window.innerWidth*.85;
   const steady=previous&&Math.abs(previous.width-r.width)<2&&Math.abs(previous.height-r.height)<2&&
     Math.abs(previous.left-r.left)<2&&Math.abs(previous.top-r.top)<2;
   if(stableSize&&stablePosition&&steady)count++;else count=0;
   if(count>=minSamples)return d;
   previous={width:r.width,height:r.height,left:r.left,top:r.top,transform};
  }else{previous=null;count=0}
  await wait(150);
 }
 return null;
}
// In the current WhatsApp build, the recipient list and the action footer are
// sibling portal nodes. Never require the send arrow to be a child of the
// 436x527 recipient-picker section.
function forwardButtonRegion(inner){
 const r=inner.getBoundingClientRect();
 return {left:r.left-38,right:r.left+102,top:r.bottom+18,
   bottom:Math.min(window.innerHeight-5,r.bottom+Math.min(330,window.innerHeight-r.bottom))};
}
function safeArrowShape(el){
 if(!el||!shown(el))return false;
 const r=el.getBoundingClientRect();
 if(r.width<38||r.width>82||r.height<38||r.height>82||Math.abs(r.width-r.height)>14)return false;
 const labelText=[attr(el,'aria-label'),attr(el,'title'),attr(el,'data-testid'),attr(el,'data-icon'),
   ...[...el.querySelectorAll('[data-icon]')].map(x=>attr(x,'data-icon'))].join(' ');
 if(/(?:close|cancel|info|back|add|plus|attach|mic|record|פרטי|בטל|סגור|הוסף)/i.test(labelText))return false;
 const explicit=/(?:send|forward|העבר|שלח)/i.test(labelText);
 const svg=[...el.querySelectorAll('svg')].some(x=>!!x.querySelector('path,polygon,polyline'));
 const black=(()=>{
  const m=getComputedStyle(el).backgroundColor.match(/rgba?\(([^)]+)\)/i);
  const c=m?.[1].split(',').map(Number)||[];
  return c.length>=3&&(c.length===3||c[3]>.7)&&c.slice(0,3).every(n=>n<95);
 })();
 return explicit||(black&&svg);
}
function findForwardArrow(inner){
 const z=forwardButtonRegion(inner);
 if(z.bottom-z.top<48)return null;
 // Search globally because WhatsApp places the bottom action in a sibling
 // of the recipient selector, not inside its DOM subtree.
 const nodes=[...document.querySelectorAll('button,[role="button"],div,span')].filter(e=>{
  if(!safeArrowShape(e))return false;
  const r=e.getBoundingClientRect(),cx=(r.left+r.right)/2,cy=(r.top+r.bottom)/2;
  return cx>=z.left&&cx<=z.right&&cy>=z.top&&cy<=z.bottom;
 });
 // Different wrappers can describe the same visible circle. Collapse nested
 // candidates and require ONE geometrically distinct action in the region.
 const unique=nodes.filter(e=>!nodes.some(x=>x!==e&&e.contains(x)));
 const actionable=unique.filter(e=>{
  const r=e.getBoundingClientRect(),cx=(r.left+r.right)/2,cy=(r.top+r.bottom)/2;
  const stack=document.elementsFromPoint(cx,cy);
  return stack.some(hit=>e===hit||e.contains(hit)||hit.contains(e));
 });
 if(actionable.length!==1)return null;
 return actionable[0];
}
function forwardConfirmDiagnostics(inner){
 const r=inner.getBoundingClientRect(),z=forwardButtonRegion(inner);
 const all=[...document.querySelectorAll('button,[role="button"],div,span')].filter(shown).filter(e=>{
  const b=e.getBoundingClientRect(),x=(b.left+b.right)/2,y=(b.top+b.bottom)/2;
  return x>=z.left&&x<=z.right&&y>=z.top&&y<=z.bottom&&b.width>=35&&b.width<=100&&b.height>=35&&b.height<=100;
 });
 const candidate=all.filter(safeArrowShape);
 return 'בחירת יעד '+Math.round(r.width)+'x'+Math.round(r.height)+
  ', אזור חץ ('+[z.left,z.top,z.right,z.bottom].map(Math.round).join(',')+')'+
  ', כפתורים באזור '+all.length+', מועמדי חץ '+candidate.length+
  ', נבחר '+(findForwardArrow(inner)?'כן':'לא');
}
function forwardConfirm(inner){
 return findForwardArrow(inner);
}
async function forwardLastTestMessage(source,target,expectedRow=null){
 if(source!==FORWARD_TEST_GROUP||target!==FORWARD_TEST_GROUP)
  throw Error('ניסיון העברה מורשה רק מאותה קבוצת בדיקות אל עצמה');
 if(messageInfoOpen())throw Error('חלונית פרטי הודעה פתוחה — סגור אותה לפני ניסוי העברה');
 await openGroup(source);
 if(!currentMatches(source))throw Error('קבוצת המקור לא אומתה');
 await scrollChatBottom();
 const row=expectedRow||await lastOutgoing();
 if(!row||!row.isConnected)throw Error('לא נמצאה הודעה יוצאת בקבוצת הבדיקות. '+outgoingDiagnostic());
 if(expectedRow&&outgoingRows().at(-1)!==expectedRow)
  throw Error('נוספה הודעה נוספת לאחר השליחה — לא נבצע העברה של הודעה שאינה מזוהה');
 const knownId=row.getAttribute('data-id')||row.querySelector('[data-id]')?.getAttribute('data-id')||'';
 if(!outgoingProof(row))
  throw Error('לא ניתן להוכיח שההודעה האחרונה היא הודעה שנשלחה מאיתנו');
 await openForwardFromMessage(row);
 let dialog=null;
 for(let i=0;i<12;i++){dialog=forwardingDialog();if(dialog)break;await wait(180)}
 if(!dialog){
  // The video shows an intermediate message-selection footer with a second
  // "Forward" control. Never use an ordinal menu item or generic arrow.
  const main=document.querySelector('#main');
  const selected=[...main.querySelectorAll('[aria-checked="true"],input[type="checkbox"]:checked,[data-state="checked"]')].filter(shown);
  const actions=[...main.querySelectorAll('button,[role="button"]')].filter(shown).filter(e=>{
   const info=[attr(e,'aria-label'),attr(e,'title'),attr(e,'data-testid'),e.textContent].join(' ').trim();
   const r=e.getBoundingClientRect(),b=main.getBoundingClientRect();
   return /(?:^|\s)(?:העבר|forward)(?:\s|$)/i.test(info)&&r.top>b.bottom-115;
  });
  if(selected.length!==1||actions.length!==1)throw Error('נפתח מצב בחירת הודעות, אך לא אומתו בחירה יחידה וכפתור העברה');
  humanClick(actions[0]);
  for(let i=0;i<18;i++){dialog=forwardingDialog();if(dialog)break;await wait(180)}
 }
 if(!dialog)throw Error('חלון בחירת יעד להעברה לא נפתח');
 dialog=await stableForwardDialog();
 if(!dialog)throw Error('חלון ההעברה לא התייצב בגודל מלא — בוטלה ההעברה');
 const search=[...dialog.querySelectorAll('input,[contenteditable="true"],[role="textbox"]')].find(shown);
 if(search&&!readSearch(search).trim())setSearch(search,'פנימי שמעון נוה');
 let chosen=null,selectedState={selected:false,reason:'not-found'},clicked=false;
 for(let i=0;i<35;i++){
  dialog=await stableForwardDialog(1)||dialog;
  chosen=forwardChoice(dialog,target);
  if(chosen){
   selectedState=forwardSelectionState(dialog,chosen,target);
   if(selectedState.selected)break;
   if(!clicked){
    // The checkbox itself may be separate from the name span; click full row once.
    humanClick(chosen);clicked=true;
   }
  }
  await wait(180);
 }
 dialog=await stableForwardDialog(2);
 chosen=dialog&&forwardChoice(dialog,target);
 selectedState=chosen?forwardSelectionState(dialog,chosen,target):{selected:false,reason:'recipient-not-found'};
 if(!selectedState.selected)throw Error('קבוצת הבדיקות לא אומתה כמסומנת — '+selectedState.reason);
 const confirm=forwardConfirm(dialog);
 if(!confirm)throw Error('כפתור אישור ההעברה לא זוהה. '+forwardConfirmDiagnostics(dialog));
 if(!currentMatches(source))throw Error('קבוצת המקור השתנתה לפני אישור ההעברה');
 humanClick(confirm);
 await wait(1200);
 if(forwardingDialog())throw Error('חלון ההעברה עדיין פתוח — אין אישור שההעברה בוצעה');
 return {ok:true};
}

// Reuse the two independently tested workflows without brittle DOM
// count/content/attachment matching between them.
async function sendThenForwardTest(text,attachment,group,target){
 if(group!==FORWARD_TEST_GROUP||target!==FORWARD_TEST_GROUP)
  throw Error('שליחה והעברה משולבת מורשית לקבוצת הבדיקות בלבד');
 await openGroup(group);
 if(!currentMatches(group))throw Error('קבוצת הבדיקות לא אומתה לפני השליחה');
 const sent=await send(text,group,attachment);
 if(!sent?.ok)throw Error('שליחת ההודעה לא אושרה — לא תבוצע העברה');
 await wait(2200);
 if(!currentMatches(group))throw Error('קבוצת הבדיקות השתנתה לאחר השליחה — ההעברה בוטלה');
 if(!attachment){
  const field=composer();
  if(field&&norm(field.innerText))throw Error('הטקסט עדיין נמצא בשדה ההקלדה — לא תבוצע העברה');
 }
 try{
  const forwarded=await forwardLastTestMessage(group,target);
  if(!forwarded?.ok)throw Error('ניסיון ההעברה לא אושר');
  return {ok:true,detail:'בוצעו שליחה והעברה; יש לאמת שתי הודעות בקבוצה'};
 }catch(e){
  throw Error('השליחה בוצעה, אך ההעברה נכשלה: '+String(e.message||e));
 }
}

// Experimental channel -> test-group transfer. Kept isolated from the
// 0.5.4 tested group send/forward workflows.
// Adapted from the user's proven Zmanim extension: enter the Channels hub,
// choose the personally owned main channel from the fixed channels list,
// then verify the title and channel-only UI. Never search ordinary chats.
const CHANNEL_TITLE_PREFIX='ידידי ישיבת המקובלים נהר שלום המקובל הרב  בניהו שמואלי שליט"א';
const CHANNEL_STABLE_PREFIX='ידידי ישיבת המקובלים נהר שלום המקובל הרב';
function channelHeaderName(){
 const header=document.querySelector('#main header');
 if(!header||!shown(header))return '';
 for(const selector of ['span[title]','[data-testid="conversation-info-header-chat-title"]','span[dir="auto"]','h1','h2']){
  for(const el of header.querySelectorAll(selector)){
   if(!shown(el))continue;
   const t=norm(attr(el,'title')||el.textContent);
   if(t&&t.length<=180&&!/^(?:search|חיפוש|ערוצים|channels|back|חזרה|more|עוד)$/i.test(t))
    return t;
  }
 }
 return '';
}
function channelViewEvidence(){
 const main=document.querySelector('#main');
 if(!main)return false;
 const header=main.querySelector('header');
 if(/עוקבים|עוקב|followers?/i.test(header?.innerText||''))return true;
 if(main.querySelector('[data-testid*="newsletter" i],[data-testid*="channel" i],[data-icon*="newsletter" i]'))return true;
 return [...main.querySelectorAll('header [aria-label],header [title],header [data-testid],header [data-icon]')]
  .some(e=>/channel|newsletter|ערוץ/i.test([attr(e,'aria-label'),attr(e,'title'),attr(e,'data-testid'),attr(e,'data-icon')].join(' ')));
}
function activeTestChannel(){
 const main=document.querySelector('#main'),header=main?.querySelector('header');
 if(!header||!shown(header)||!channelViewEvidence())return null;
 const candidates=[...header.querySelectorAll('span[title],[data-testid="conversation-info-header-chat-title"],span[dir="auto"],h1,h2')]
  .filter(shown).map(e=>norm(attr(e,'title')||e.textContent));
 const prefix=lexical(CHANNEL_STABLE_PREFIX);
 const verified=candidates.some(t=>lexical(t)===lexical(CHANNEL_TITLE_PREFIX)||
  lexical(t).startsWith(prefix+' '));
 if(!verified)return null;
 return {root:main,header};
}
function channelsHubEvidence(){
 const headings=[...document.querySelectorAll('h1,h2,h3,[role="heading"]')]
  .filter(shown).filter(e=>!e.closest('#main'));
 if(!headings.some(e=>/^(?:ערוצים|channels)$/i.test(norm(e.textContent))))return false;
 if(headings.some(e=>/^(?:ארכיון|archive|archived)$/i.test(norm(e.textContent))))return false;
 return true;
}
// The Channels icon is on the far-right WhatsApp navigation rail. Its
// tooltip says "ערוצים" in the user's screenshot. Archive is a chat-list
// entry and must never be treated as a tab.
const railControls=()=>[...document.querySelectorAll('button,[role="button"],[role="tab"]')]
 .filter(shown).filter(e=>!e.closest('#main,#side,#pane-side'))
 .filter(e=>{
  const r=e.getBoundingClientRect();
  return r.left>=window.innerWidth-82&&r.right<=window.innerWidth+4&&
   r.width>=24&&r.width<=78&&r.height>=24&&r.height<=78&&r.top>=95&&r.top<=430;
 });
function channelsTooltipFor(control){
 const r=control.getBoundingClientRect(),cy=(r.top+r.bottom)/2;
 return [...document.querySelectorAll('[role="tooltip"],[data-testid*="tooltip"],div,span')]
  .filter(shown).some(e=>{
   if(e.children.length>1||norm(e.textContent)!=='ערוצים')return false;
   const t=e.getBoundingClientRect();
   return t.width>20&&t.width<210&&t.height<90&&
    Math.abs((t.top+t.bottom)/2-cy)<100&&
    t.right>window.innerWidth-220;
  });
}
async function channelNavButton(){
 const controls=railControls();
 // Prefer one explicitly labelled Channels icon, never a guessed neighbour.
 const named=controls.filter(e=>{
  const nodes=[e,...e.querySelectorAll('[title],[aria-label],[data-testid],[data-icon]')];
  return nodes.some(n=>{
   const name=[attr(n,'title'),attr(n,'aria-label'),attr(n,'data-testid'),attr(n,'data-icon')].join(' ');
   return /^(?:ערוצים|channels)$/i.test(norm(name))||
    /(?:newsletter|channels-tab|channels-nav)/i.test(name);
  });
 });
 if(named.length===1)return named[0];
 if(named.length>1)return null;
 // Actual tab-tooltip check is allowed even while the Archive chat list is open.
 for(const control of controls){
  const r=control.getBoundingClientRect();
  const evt={bubbles:true,view:window,clientX:(r.left+r.right)/2,clientY:(r.top+r.bottom)/2};
  control.dispatchEvent(new PointerEvent('pointerover',{...evt,pointerType:'mouse'}));
  control.dispatchEvent(new MouseEvent('mouseover',evt));
  control.dispatchEvent(new MouseEvent('mousemove',evt));
  await wait(140);
  if(channelsTooltipFor(control))return control;
 }
 return null;
}
async function openChannelsHub(){
 if(channelsHubEvidence()||activeTestChannel())return true;
 // Ignore the Archive sidebar; it does not block navigation via the rail.
 const button=await channelNavButton();
 if(!button)throw Error('לא זוהה סמל "ערוצים" בסרגל הימני — לא נלחץ ארכיון');
 // Match the user's working Zmanim extension: a SINGLE native click.
 // humanClick() dispatches pointerdown/mousedown/up plus click, which can
 // activate multiple WhatsApp handlers and inadvertently navigate elsewhere.
 const r=button.getBoundingClientRect();
 const hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);
 if(!hit||(hit!==button&&!button.contains(hit)))
  throw Error('סמל הערוצים מוסתר ברגע הלחיצה — לא נלחץ רכיב אחר');
 button.click();
 for(let i=0;i<36;i++){
  await wait(130);
  if(channelsHubEvidence()||activeTestChannel())return true;
 }
 throw Error('נלחץ סמל ערוצים, אך רשימת הערוצים לא נפתחה');
}
function channelOwnedZone(){
 const side=document.querySelector('#side')||document.querySelector('#pane-side');
 if(!side||!channelsHubEvidence())return null;
 const search=[...side.querySelectorAll('input[type="text"],[role="searchbox"],[role="textbox"],[contenteditable="true"]')]
  .filter(shown).find(e=>/search|חיפוש/i.test([attr(e,'placeholder'),attr(e,'aria-label'),attr(e,'aria-placeholder')].join(' ')));
 if(!search)return null;
 const r=search.getBoundingClientRect(),sideRect=side.getBoundingClientRect();
 const headings=[...side.querySelectorAll('h1,h2,h3,[role="heading"],div,span')].filter(shown)
  .filter(e=>/^(?:חיפוש ערוצים למעקב|find channels to follow|channels to follow)$/i.test(norm(e.textContent)));
 const follow=headings.filter(e=>e.getBoundingClientRect().top>r.bottom)
  .sort((a,b)=>a.getBoundingClientRect().top-b.getBoundingClientRect().top)[0];
 return {left:Math.max(sideRect.left,r.left-80),right:Math.min(sideRect.right,r.right+80),
  top:r.bottom+4,bottom:Math.min(sideRect.bottom,follow?follow.getBoundingClientRect().top-8:r.bottom+280)};
}
function channelOwnedRows(){
 const zone=channelOwnedZone();
 if(!zone||zone.bottom<=zone.top+40)return [];
 const side=document.querySelector('#side')||document.querySelector('#pane-side');
 const matches=[];
 for(const e of side.querySelectorAll('[role="row"],[role="listitem"],[tabindex="0"],[tabindex="-1"],div,li,a')){
  if(!shown(e)||e.closest('#main'))continue;
  const r=e.getBoundingClientRect(),cy=(r.top+r.bottom)/2;
  if(cy<zone.top||cy>zone.bottom||r.width<235||r.height<42||r.height>135)continue;
  if(r.right<zone.left||r.left>zone.right)continue;
  const name=norm(e.innerText||e.textContent);
  if(/^(?:channels|ערוצים|search|חיפוש)$|חיפוש ערוצים למעקב|find channels to follow|יצירת ערוץ|create channel/i.test(name))continue;
  if(!e.querySelector('img,[role="img"],svg')&&!/\b\d{1,2}:\d{2}\b/.test(name))continue;
  matches.push({el:e,top:r.top,height:r.height,name});
 }
 matches.sort((x,y)=>x.top-y.top||x.height-y.height);
 const rows=[];
 for(const item of matches){
  const at=rows.findIndex(x=>Math.abs(x.top-item.top)<12);
  if(at<0)rows.push(item);
  else if(item.height<rows[at].height)rows[at]=item;
 }
 return rows;
}
function findMainChannelRow(){
 const zone=channelOwnedZone();
 if(!zone)return null;
 const side=document.querySelector('#side')||document.querySelector('#pane-side');
 const stable=lexical(CHANNEL_STABLE_PREFIX);
 const leaves=[...side.querySelectorAll('span,[dir="auto"],[title],[aria-label],div')]
  .filter(shown).filter(e=>{
   const r=e.getBoundingClientRect(),cy=(r.top+r.bottom)/2;
   return cy>=zone.top&&cy<=zone.bottom&&r.left<zone.right&&r.right>zone.left&&
    lexical(attr(e,'title')||attr(e,'aria-label')||(e.children.length?'':e.textContent)).startsWith(stable);
  }).sort((a,b)=>a.children.length-b.children.length);
 for(const leaf of leaves){
  let node=leaf;
  for(let i=0;i<8&&node&&node!==side;i++,node=node.parentElement){
   const r=node.getBoundingClientRect();
   if(r.width>=235&&r.height>=42&&r.height<=135)return node;
  }
 }
 // The WhatsApp sidebar may truncate the channel title and remove the
 // complete [title] attribute. Restore the proven 0.6.2 second-row fallback,
 // but ONLY inside the verified owned-Channels zone (never the chat archive).
 const rows=channelOwnedRows();
 return rows.length>=2?rows[1].el:null;
}
async function openMainChannel(){
 // The 0.6.2 workflow was confirmed to forward correctly. Preserve its
 // channel discovery and do not click the sidebar again after a channel is open.
 if(activeTestChannel())return true;
 if(!await openChannelsHub())throw Error('לא נפתחה לשונית ערוצים ב־WhatsApp Web');
 for(let turn=0;turn<10;turn++){
  const row=findMainChannelRow();
  if(row){
   const r=row.getBoundingClientRect(),x=r.left+r.width*.55,y=r.top+r.height/2;
   const hit=document.elementFromPoint(x,y);
   if(hit&&row.contains(hit))humanClick(hit);else humanClick(row);
   for(let i=0;i<25;i++){
    await wait(150);
    if(activeTestChannel())return true;
   }
  }
  await wait(320);
 }
 throw Error('רשימת הערוצים נפתחה, אך הערוץ הראשי לא זוהה. לא בוצעה העברה');
}
function channelForwardCandidates(view){
 const root=view.root,feed=root.getBoundingClientRect(),header=view.header.getBoundingClientRect();
 // Channel updates are rendered as standalone cards. The small double-arrow
 // control (shown in the user's screenshot) is BELOW the lower-right edge
 // of a card and is often an unlabeled SVG inside a DIV, not a button.
 const visible=[...root.querySelectorAll('button,[role="button"],svg,[data-icon],div,span')]
  .filter(shown).filter(e=>!e.closest('header,footer,[role="dialog"],[role="menu"]'));
 const controls=[];
 for(const e of visible){
  const r=e.getBoundingClientRect();
  const cx=(r.left+r.right)/2,cy=(r.top+r.bottom)/2;
  if(cx<feed.left+85||cx>feed.right-15||cy<header.bottom+60||cy>feed.bottom-60)continue;
  if(r.width<22||r.width>62||r.height<20||r.height>62)continue;
  const parent=e.closest('button,[role="button"]');
  const candidate=parent&&shown(parent)?parent:e;
  const rect=candidate.getBoundingClientRect();
  if(rect.width>75||rect.height>75||rect.width<18||rect.height<18)continue;
  const metadata=[attr(candidate,'aria-label'),attr(candidate,'title'),attr(candidate,'data-testid'),
   attr(candidate,'data-icon'),attr(e,'aria-label'),attr(e,'title'),attr(e,'data-testid'),attr(e,'data-icon')].join(' ');
  if(/(?:close|delete|reply|react|emoji|share|download|back|menu|עוד|תפריט|מחק|תגובה)/i.test(metadata))continue;
  const icons=[candidate,...candidate.querySelectorAll('svg,[data-icon]')];
  const arrowLabel=icons.some(el=>/(?:forward|העבר)/i.test(
   [attr(el,'data-icon'),attr(el,'aria-label'),attr(el,'title'),attr(el,'data-testid')].join(' ')));
  const svg=candidate.tagName.toLowerCase()==='svg'||!!candidate.querySelector('svg,path');
  if(!svg&&!arrowLabel)continue;
  controls.push({el:candidate,rect,arrowLabel});
 }
 const distinct=[...new Map(controls.map(c=>[c.el,c])).values()];
 // Require the button to be associated with the bottom-most visible actual
 // message card; unlike the group UI it may carry no data-icon/label.
 const cards=[...root.querySelectorAll('article,[data-id],[data-testid*="channel-update"],[data-testid*="channel-message"],[data-testid*="message"],.message-in,.message-out')]
  .filter(shown).filter(e=>!e.closest('header,footer,[role="dialog"]'))
  .map(e=>({el:e,r:e.getBoundingClientRect()}))
  .filter(x=>x.r.width>240&&x.r.width<Math.min(800,feed.width*.9)&&
    x.r.height>70&&x.r.bottom>header.bottom+100&&x.r.bottom<feed.bottom-65);
 // If WhatsApp doesn't expose card IDs, recover visible card from the
 // media bubble or the text with a message timestamp/views footer.
 if(!cards.length){
  for(const media of root.querySelectorAll('video,video[poster],img,[data-testid*="media"]')){
   if(!shown(media))continue;
   for(let node=media,depth=0;node&&node!==root&&depth<10;node=node.parentElement,depth++){
    const r=node.getBoundingClientRect();
    if(r.width>260&&r.width<800&&r.height>140&&r.height<feed.height*.85&&
      r.bottom<feed.bottom-65&&r.bottom>header.bottom+130){
     cards.push({el:node,r});break;
    }
   }
  }
 }
 // For each card, the forward-arrow center must be 0-58px BELOW its bubble,
 // and within 70px of its right edge. Favor the most recently rendered (lowest).
 const choices=[];
 for(const card of cards){
  for(const c of distinct){
   const x=(c.rect.left+c.rect.right)/2,y=(c.rect.top+c.rect.bottom)/2;
   const dy=y-card.r.bottom,dx=card.r.right-x;
   if(dy>=-2&&dy<62&&dx>=-12&&dx<85&&c.rect.width>=25&&c.rect.width<=64){
    const point=document.elementFromPoint(x,y);
    if(!point||!(c.el===point||c.el.contains(point)||point.contains(c.el)))continue;
    choices.push({card,c,score:card.r.bottom+ (c.arrowLabel?3:0)});
   }
  }
 }
 choices.sort((x,y)=>y.score-x.score);
 if(!choices.length)return [];
 // A single visible arrow associated with the LAST card is mandatory.
 const top=choices[0];
 if(choices.some(x=>x!==top&&Math.abs(x.card.r.bottom-top.card.r.bottom)<8&&
  Math.abs(x.c.rect.left-top.c.rect.left)>12))return [];
 return [top.c.el];
}
async function channelTrustedPointer(x,y,button='left'){
 const result=await chrome.runtime.sendMessage({type:'WA_CHANNEL_POINTER_V058',button,x,y});
 if(!result?.ok)throw Error('WhatsApp לא אישר לחיצה על חץ ההעברה: '+(result?.error||'אין תשובה'));
}
async function waitChannelForwardDialog(){
 for(let i=0;i<22;i++){
  const dialog=forwardingDialog();
  if(dialog)return dialog;
  await wait(160);
 }
 return null;
}
function channelCardForArrow(root,arrow){
 const b=arrow.getBoundingClientRect(),rootBox=root.getBoundingClientRect();
 const candidates=[...root.querySelectorAll('article,[data-id],[data-testid*="channel-update"],[data-testid*="channel-message"],[data-testid*="message"]')]
  .filter(shown).map(el=>({el,r:el.getBoundingClientRect()}))
  .filter(x=>x.r.width>=270&&x.r.width<=800&&x.r.height>=100&&
    x.r.bottom<=b.top+18&&x.r.bottom>=b.top-65&&
    Math.abs(x.r.right-b.right)<100&&x.r.top>rootBox.top+60)
  .sort((a,b)=>b.r.bottom-a.r.bottom);
 return candidates[0]||null;
}
function channelMenuDiagnostic(){
 const menu=[...document.querySelectorAll('[role="menu"],[role="menuitem"],[data-testid*="menu"]')].filter(shown);
 return 'רכיבי תפריט גלויים '+menu.length;
}
async function openForwardPickerFromChannelArrow(channel,arrow){
 if(!activeTestChannel())throw Error('ערוץ המקור אינו פתוח לפני הלחיצה');
 const r=arrow.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;
 if(!document.elementFromPoint(x,y))throw Error('כפתור ההעברה אינו גלוי ללחיצה');
 // Trusted browser click; this control does not react to synthetic .click().
 await channelTrustedPointer(x,y);
 let dialog=await waitChannelForwardDialog();
 if(dialog)return dialog;
 // Prefer the user's alternate right-click method if the inline arrow fails,
 // but only when we can identify the same last channel card unambiguously.
 const card=channelCardForArrow(channel.root,arrow);
 if(!card)throw Error('לחיצה אמיתית על חץ העדכון לא פתחה בחירת יעד; לא זוהה כרטיס עדכון בטוח לקליק ימני. '+channelMenuDiagnostic());
 const rx=Math.max(card.r.left+45,Math.min(card.r.right-90,card.r.left+card.r.width*.65));
 const ry=card.r.top+Math.min(85,Math.max(45,card.r.height*.2));
 if(!activeTestChannel())throw Error('הערוץ השתנה לפני ניסיון קליק ימני');
 await channelTrustedPointer(rx,ry,'right');
 for(let i=0;i<18;i++){
  const menu=expectedForwardMenu();
  if(menu){humanClick(menu);break}
  dialog=forwardingDialog();
  if(dialog)return dialog;
  await wait(150);
 }
 dialog=await waitChannelForwardDialog();
 if(!dialog)throw Error('החץ וקליק ימני לא פתחו חלון העברה. '+channelMenuDiagnostic());
 return dialog;
}
async function forwardLastChannelUpdateToTest(source,target){
 if(source!==CHANNEL_TITLE_PREFIX||target!==FORWARD_TEST_GROUP)
  throw Error('ניסוי ערוץ מורשה רק מהערוץ המוגדר אל קבוצת הבדיקות');
 try{await openMainChannel();}catch(e){throw Error('CHANNEL_OPEN: '+String(e.message||e));}
 const channel=activeTestChannel();
 if(!channel)throw Error('הערוץ הראשי לא אומת לאחר פתיחה אוטומטית — לא בוצעה העברה');
 // Only inspect the feed. No send is permitted until the exact group has
 // been visibly selected in WhatsApp's native forwarding dialog.
 const scrollable=[...channel.root.querySelectorAll('*')].filter(shown).filter(e=>{
  const cs=getComputedStyle(e);
  return /auto|scroll/.test(cs.overflowY)&&e.clientHeight>160&&e.scrollHeight>e.clientHeight+100;
 }).sort((x,y)=>y.clientHeight-x.clientHeight)[0];
 if(scrollable){
  scrollable.scrollTop=scrollable.scrollHeight;
  scrollable.dispatchEvent(new Event('scroll',{bubbles:true}));
  await wait(600);
 }
 let actions=channelForwardCandidates(channel);
 if(!actions.length){
  const posts=[...channel.root.querySelectorAll('article,[data-testid*="channel-update"],[data-testid*="channel-message"],[data-testid*="update-container"],[data-id]')]
   .filter(shown).filter(e=>!e.closest('header,footer,[role="dialog"]'));
  const last=posts.at(-1);
  if(last){
   last.scrollIntoView({block:'end'});
   last.dispatchEvent(new MouseEvent('mouseover',{bubbles:true,view:window}));
   last.dispatchEvent(new PointerEvent('pointerover',{bubbles:true,view:window,pointerType:'mouse'}));
   await wait(500);
   actions=channelForwardCandidates(channel);
  }
 }
 if(!actions.length)throw Error('CHANNEL_ARROW: הערוץ פתוח, אך לא נמצא חץ העברה גלוי. מועמדים '+actions.length);
 // WhatsApp documents a dedicated Forward arrow next to each channel update.
 // Last visible button at feed bottom corresponds to the last update.
 const button=actions.at(-1);
 if(!activeTestChannel())throw Error('הערוץ השתנה לפני בחירת העדכון');
 let dialog;try{dialog=await openForwardPickerFromChannelArrow(channel,button)}catch(e){throw Error('CHANNEL_PICKER: '+String(e.message||e))}
 dialog=await stableForwardDialog();
 if(!dialog)throw Error('חלון בחירת היעד מהערוץ לא התייצב');
 const input=[...dialog.querySelectorAll('input,[contenteditable="true"],[role="textbox"]')].find(shown);
 if(input&&!readSearch(input).trim())setSearch(input,'פנימי שמעון נוה');
 let clicked=false;
 for(let i=0;i<32;i++){
  dialog=await stableForwardDialog(1)||dialog;
  const selected=forwardChoice(dialog,target);
  if(selected){
   if(forwardSelectionState(dialog,selected,target).selected)break;
   if(!clicked){humanClick(selected);clicked=true}
  }
  await wait(170);
 }
 dialog=await stableForwardDialog(2);
 const row=dialog&&forwardChoice(dialog,target);
 if(!row||!forwardSelectionState(dialog,row,target).selected)
  throw Error('קבוצת הבדיקות לא זוהתה כיעד מסומן — לא בוצעה העברה מהערוץ');
 const confirm=forwardConfirm(dialog);
 if(!confirm)throw Error('קבוצת היעד מסומנת, אך חץ אישור ההעברה לא זוהה. '+forwardConfirmDiagnostics(dialog));
 humanClick(confirm);
 await wait(1150);
 if(forwardingDialog())throw Error('חלון ההעברה נשאר פתוח — אין אישור שהניסיון הושלם');
 return {ok:true,detail:'בוצע ניסיון העברת העדכון האחרון מהערוץ לקבוצת הבדיקות'};
}
chrome.runtime.onMessage.addListener((msg,sender,reply)=>{
 if(msg?.type==='WA_TEST_PING_V0611'){reply({ok:true,version:'0.6.11',hasMain:!!document.querySelector('#main'),hasSide:!!document.querySelector('#side')});return;}
 if(!['SEND_TEST_V0611','FORWARD_TEST_V0611','SEND_FORWARD_TEST_V0611','CHANNEL_FORWARD_TEST_V0611'].includes(msg?.type))return;
 if(sending){reply({ok:false,error:'כבר מתבצע ניסיון שליחה'});return;}
 sending=true;
 const promise=msg.type==='CHANNEL_FORWARD_TEST_V0611'
  ?forwardLastChannelUpdateToTest(msg.source,msg.target)
  :msg.type==='SEND_FORWARD_TEST_V0611'
   ?sendThenForwardTest(msg.text,msg.attachment,msg.group,msg.target)
  :msg.type==='FORWARD_TEST_V0611'
   ?forwardLastTestMessage(msg.source,msg.target)
   :send(msg.text,msg.group,msg.attachment);
 promise.then(reply).catch(e=>reply({ok:false,error:String(e.message||e),metrics:metrics()})).finally(()=>{sending=false;activeSendingGroup=''});
 return true;
});
})();
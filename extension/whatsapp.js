(() => {
'use strict';
// Based on the proven UI interaction sequence in the user's Zmanim-to-WhatsApp extension.
// Separate versioned handler prevents stale extension scripts from intercepting a send.
if(globalThis.__naharSchedulerAgentV045)return;
globalThis.__naharSchedulerAgentV045=true;
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
 const text=/העברת הודעה אל|העבר הודעה אל|Forward message to|Forward to|העבר אל/i;
 const candidates=[...document.querySelectorAll('[role="dialog"],[data-testid*="forward"],[aria-modal="true"]')].filter(shown);
 for(const el of candidates){
  if(text.test((el.textContent||'').slice(0,400))||/forward/i.test(attr(el,'data-testid')))return el;
 }
 // WhatsApp sometimes mounts a non-dialog panel. Require a visible search
 // and an explicit forwarding heading, rather than assuming any overlay.
 const headers=[...document.querySelectorAll('h1,h2,[role="heading"]')].filter(shown).filter(e=>text.test(e.textContent||''));
 for(const h of headers){
  let e=h.parentElement;
  for(let i=0;i<6&&e;i++,e=e.parentElement){
   if(e.querySelector('[role="textbox"],input[type="text"],input[type="search"]'))return e;
  }
 }
 return null;
}
function forwardChoice(dialog,target){
 const wanted=lexical(target);
 const candidates=[...dialog.querySelectorAll('[title],[aria-label],span[dir="auto"]')].filter(shown)
  .filter(e=>lexical(attr(e,'title')||attr(e,'aria-label')||(e.children.length?'':e.textContent))===wanted);
 if(!candidates.length)return null;
 // Name may be a nested span; use the visible whole chat result, not its text span.
 const rows=candidates.map(e=>{
  let p=e;
  for(let i=0;i<7&&p&&p!==dialog;i++,p=p.parentElement){
   const r=p.getBoundingClientRect();
   if(r.width>=240&&r.height>=48&&r.height<=140&&
      (p.querySelector('[role="checkbox"],input[type="checkbox"],[data-icon*="check"],svg')||
       p.matches('[role="row"],[data-testid*="cell"]')))return p;
  }
  return e.closest('[role="row"],[data-testid*="cell"],[tabindex]')||e;
 });
 const distinct=[...new Set(rows)].filter(shown);
 // Prefer the smallest row containing checkbox graphics.
 distinct.sort((x,y)=>x.getBoundingClientRect().height-y.getBoundingClientRect().height);
 if(distinct.length>1&&!distinct[0].contains(distinct[1])&&!distinct[1].contains(distinct[0]))return null;
 return distinct[0]||null;
}
function forwardSelectionState(dialog,row,target){
 if(!row||!shown(row))return {selected:false,reason:'no-row'};
 const checkboxes=[row,...row.querySelectorAll('[role="checkbox"],input[type="checkbox"],[aria-checked],[data-state]')];
 if(checkboxes.some(e=>e.checked===true||attr(e,'aria-checked')==='true'||attr(e,'data-state')==='checked'))
  return {selected:true,reason:'checkbox'};
 // In the screenshot WhatsApp renders the checked target as a black box
 // with a white check mark; the control often lacks semantic checkbox attributes.
 const icons=[...row.querySelectorAll('[data-icon],svg')].filter(shown);
 const checks=icons.filter(e=>/(?:check|tick|selected)/i.test(
  [attr(e,'data-icon'),attr(e,'data-testid'),attr(e,'aria-label')].join(' ')));
 if(checks.length)return {selected:true,reason:'check-icon'};
 // Require both the selected row background and a small checked black square.
 const rowColor=getComputedStyle(row).backgroundColor;
 const checkedSquares=[...row.querySelectorAll('div,span')].filter(e=>{
  if(!shown(e))return false;
  const r=e.getBoundingClientRect();
  if(r.width<15||r.width>27||r.height<15||r.height>27)return false;
  const c=getComputedStyle(e).backgroundColor.match(/[\d.]+/g)?.map(Number)||[];
  return c.length>=3&&(c.length<4||c[3]>.5)&&c[0]+c[1]+c[2]<230&&
   (e.querySelector('svg,path')||/✓|✔/.test(e.textContent||''));
 });
 if(checkedSquares.length===1)return {selected:true,reason:'black-check'};
 // The recipient chip at the foot of the dialog confirms a selected recipient.
 const bottom=dialog.getBoundingClientRect().bottom;
 const chips=[...dialog.querySelectorAll('[title],[aria-label],span[dir="auto"]')].filter(shown).filter(e=>{
  const box=e.getBoundingClientRect();
  return box.top>bottom-100&&lexical(attr(e,'title')||attr(e,'aria-label')||e.textContent)===lexical(target);
 });
 if(chips.length===1&&rowColor)return {selected:true,reason:'recipient-chip'};
 return {selected:false,reason:'not-confirmed'};
}
function forwardConfirm(dialog){
 const bounds=dialog.getBoundingClientRect();
 if(bounds.width<320||bounds.width>800||bounds.height<420) return null;
 const nearAction=(el)=>{
  if(!shown(el)||!dialog.contains(el))return false;
  const r=el.getBoundingClientRect();
  return r.left>=bounds.left-12&&r.left<bounds.left+112&&
    r.top>bounds.bottom-112&&r.bottom<=bounds.bottom+10 &&
    r.width>=35&&r.width<=83&&r.height>=35&&r.height<=83;
 };
 const excluded=/info|message-info|add|attach|close|cancel|search|menu|בטל|סגור|הוסף|חפש|פרטי/i;
 const raw=[...dialog.querySelectorAll('button,[role="button"],[aria-label],[title],[data-testid],[data-icon],svg,div')].filter(nearAction);
 // Prefer an explicit forwarding control, but *only* inside the bottom-left
 // action zone of the target-selection dialog.
 const semantic=[...new Set(raw.map(e=>e.closest('button,[role="button"]')||e))].filter(e=>{
  if(!nearAction(e))return false;
  const meta=[attr(e,'aria-label'),attr(e,'title'),attr(e,'data-testid'),attr(e,'data-icon'),
    ...[...e.querySelectorAll('[data-icon]')].map(n=>attr(n,'data-icon'))].join(' ');
  return !excluded.test(meta)&&/(?:forward|send|העבר|שלח)/i.test(meta);
 });
 if(semantic.length===1)return semantic[0];
 // Screenshot: the send control is a solid near-black circle (about 50 px)
 // with a white arrow at the very bottom-left of the modal. It may be a DIV
 // without role=button, so inspect the actual element and its ancestors.
 const isDark=e=>{
  const css=getComputedStyle(e),color=css.backgroundColor;
  const m=color.match(/rgba?\(([^)]+)\)/i);if(!m)return false;
  const numbers=m[1].split(',').map(Number);
  return numbers.length>=3&&(numbers.length===3||numbers[3]>.75)&&numbers.slice(0,3).every(x=>x<65);
 };
 const candidates=raw.filter(e=>{
  if(!nearAction(e)||!isDark(e))return false;
  const r=e.getBoundingClientRect();
  if(Math.abs(r.width-r.height)>12||r.width<42||r.width>72)return false;
  if(!e.querySelector('svg,[data-icon],path,polygon,polyline'))return false;
  const meta=[attr(e,'aria-label'),attr(e,'title'),attr(e,'data-testid')].join(' ');
  if(excluded.test(meta))return false;
  return true;
 });
 // Several nested wrappers can describe the same circle; take the innermost
 // black circle, but never choose between two separate circles.
 const inner=candidates.filter(e=>!candidates.some(other=>other!==e&&e.contains(other)));
 if(inner.length===1)return inner[0];
 // Locate the screenshot-confirmed circle by its center, then verify that
 // the actual pointer target belongs to a single black arrow control.
 const x=bounds.left+34,y=bounds.bottom-33;
 const hit=document.elementFromPoint(x,y);
 if(hit&&dialog.contains(hit)){
  const ancestors=[];
  for(let e=hit;e&&e!==dialog;e=e.parentElement){
   if(candidates.includes(e))ancestors.push(e);
  }
  if(ancestors.length&&candidates.every(e=>ancestors.includes(e)||ancestors.some(a=>a.contains(e)||e.contains(a))))
   return ancestors[0];
 }
 return null;
}
async function forwardLastTestMessage(source,target){
 if(source!==FORWARD_TEST_GROUP||target!==FORWARD_TEST_GROUP)
  throw Error('ניסיון העברה מורשה רק מאותה קבוצת בדיקות אל עצמה');
 if(messageInfoOpen())throw Error('חלונית פרטי הודעה פתוחה — סגור אותה לפני ניסוי העברה');
 await openGroup(source);
 if(!currentMatches(source))throw Error('קבוצת המקור לא אומתה');
 await scrollChatBottom();
 const row=await lastOutgoing();
 if(!row)throw Error('לא נמצאה הודעה יוצאת בקבוצת הבדיקות. '+outgoingDiagnostic());
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
 const search=[...dialog.querySelectorAll('input,[contenteditable="true"],[role="textbox"]')].find(shown);
 if(search&&!readSearch(search).trim())setSearch(search,'פנימי שמעון נוה');
 for(let i=0;i<30;i++){
  const selection=forwardChoice(dialog,target);
  if(selection){if(!forwardSelectionState(dialog,selection,target).selected)humanClick(selection);break}
  await wait(170);
 }
 const chosen=forwardChoice(dialog,target);
 if(!chosen)throw Error('קבוצת היעד לא נמצאה בחלון ההעברה');
 await wait(250);
 const selectedState=forwardSelectionState(dialog,chosen,target);
 if(!selectedState.selected)throw Error('לא ניתן לאמת שקבוצת הבדיקות נבחרה כיעד (סימון לא זוהה)');
 const confirm=forwardConfirm(dialog);
 if(!confirm)throw Error('כפתור אישור ההעברה לא זוהה. חלון: '+Math.round(dialog.getBoundingClientRect().width)+'x'+Math.round(dialog.getBoundingClientRect().height));
 if(!currentMatches(source))throw Error('קבוצת המקור השתנתה לפני אישור ההעברה');
 humanClick(confirm);
 await wait(1200);
 if(forwardingDialog())throw Error('חלון ההעברה עדיין פתוח — אין אישור שההעברה בוצעה');
 return {ok:true};
}
chrome.runtime.onMessage.addListener((msg,sender,reply)=>{
 if(msg?.type==='WA_TEST_PING_V045'){reply({ok:true,version:'0.4.5',hasMain:!!document.querySelector('#main'),hasSide:!!document.querySelector('#side')});return;}
 if(msg?.type!=='SEND_TEST_V045'&&msg?.type!=='FORWARD_TEST_V045')return;
 if(sending){reply({ok:false,error:'כבר מתבצע ניסיון שליחה'});return;}
 sending=true;
 const promise=msg.type==='FORWARD_TEST_V045'
   ?forwardLastTestMessage(msg.source,msg.target)
   :send(msg.text,msg.group,msg.attachment);
 promise.then(reply).catch(e=>reply({ok:false,error:String(e.message||e),metrics:metrics()})).finally(()=>{sending=false;activeSendingGroup=''});
 return true;
});
})();
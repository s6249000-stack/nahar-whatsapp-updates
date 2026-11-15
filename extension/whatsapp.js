(() => {
'use strict';
// Based on the proven UI interaction sequence in the user's Zmanim-to-WhatsApp extension.
// Separate versioned handler prevents stale extension scripts from intercepting a send.
if(globalThis.__naharSchedulerAgentV052)return;
globalThis.__naharSchedulerAgentV052=true;
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
 const heading=/^(?:העברת הודעה אל|העבר הודעה אל|Forward message to|Forward to|העבר אל)$/i;
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

// Combined test: only forward the *new* outgoing message produced by this
// very attempt. Never forward an older message when the send hasn't appeared.
async function sendThenForwardTest(text,attachment,group,target){
 if(group!==FORWARD_TEST_GROUP||target!==FORWARD_TEST_GROUP)
  throw Error('שליחה והעברה משולבת מורשית לקבוצת הבדיקות בלבד');
 await openGroup(group);
 if(!currentMatches(group))throw Error('קבוצת הבדיקות לא אומתה לפני השליחה');
 await scrollChatBottom();
 const previous=new Set(outgoingRows());
 const sent=await send(text,group,attachment);
 if(!sent?.ok)throw Error('שליחת ההודעה לא אושרה — לא תבוצע העברה');
 let newest=null;
 for(let i=0;i<55;i++){
  await wait(230);
  if(!currentMatches(group))throw Error('השיחה השתנתה לאחר השליחה — ההעברה בוטלה');
  const latest=outgoingRows().at(-1);
  if(latest&&!previous.has(latest)){newest=latest;break}
 }
 if(!newest)throw Error('השליחה בוצעה, אך ההודעה החדשה לא זוהתה בשיחה — לא העברתי הודעה ישנה');
 await wait(500);
 // Existing, tested forwarding sequence remains untouched except for pinning
 // the exact newly-created message instead of selecting a historical "last".
 try{
  const forwarded=await forwardLastTestMessage(group,target,newest);
  if(!forwarded?.ok)throw Error('ניסיון ההעברה לא אושר');
  return {ok:true,detail:'בוצעו שליחה והעברה; יש לאמת שתי הודעות בקבוצה'};
 }catch(e){throw Error('השליחה בוצעה, אך ההעברה נכשלה: '+String(e.message||e))}
}
chrome.runtime.onMessage.addListener((msg,sender,reply)=>{
 if(msg?.type==='WA_TEST_PING_V052'){reply({ok:true,version:'0.5.2',hasMain:!!document.querySelector('#main'),hasSide:!!document.querySelector('#side')});return;}
 if(!['SEND_TEST_V052','FORWARD_TEST_V052','SEND_FORWARD_TEST_V052'].includes(msg?.type))return;
 if(sending){reply({ok:false,error:'כבר מתבצע ניסיון שליחה'});return;}
 sending=true;
 const promise=msg.type==='SEND_FORWARD_TEST_V052'
  ?sendThenForwardTest(msg.text,msg.attachment,msg.group,msg.target)
  :msg.type==='FORWARD_TEST_V052'
   ?forwardLastTestMessage(msg.source,msg.target)
   :send(msg.text,msg.group,msg.attachment);
 promise.then(reply).catch(e=>reply({ok:false,error:String(e.message||e),metrics:metrics()})).finally(()=>{sending=false;activeSendingGroup=''});
 return true;
});
})();
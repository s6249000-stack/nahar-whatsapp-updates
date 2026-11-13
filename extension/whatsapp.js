(() => {
 'use strict';
 const authorizedGroup=group=>typeof group==='string'&&group.length>=3&&group.length<=160;
 let sending=false;
 const sleep=ms=>new Promise(r=>setTimeout(r,ms));
 const visible=e=>!!(e && e.getClientRects().length);
 function normalized(x){return (x||'').replace(/\s+/g,' ').trim();}
 function exactGroup(group){
  const candidates=[...document.querySelectorAll('[title]')].filter(e=>visible(e)&&normalized(e.getAttribute('title'))===normalized(group));
  return candidates.find(e=>e.closest('[role="row"], [data-testid="cell-frame-container"]')) || candidates[0];
 }
 function compose(){return [...document.querySelectorAll('[contenteditable="true"][role="textbox"],footer [contenteditable="true"]')].find(visible);}
 function selectedTitle(group){
  const header=document.querySelector('header');if(!header)return '';
  return [...header.querySelectorAll('[title]')].map(e=>e.getAttribute('title')).find(t=>normalized(t)===normalized(GROUP))||'';
 }
 async function send(text,groupName){
  if(!authorizedGroup(groupName))throw Error('שם יעד לא תקין');
  if(!document.querySelector('#pane-side')) throw Error('WhatsApp Web לא מחובר או לא נטען');
  let group=exactGroup(groupName);
  if(!group){
   const box=[...document.querySelectorAll('[contenteditable="true"]')].find(e=>visible(e)&&!e.closest('footer'));
   if(!box)throw Error('לא נמצאה קבוצת הבדיקות ברשימת השיחות');
   box.focus();document.execCommand('selectAll',false,null);document.execCommand('insertText',false,groupName);
   for(let i=0;i<16&&!group;i++){await sleep(500);group=exactGroup(groupName)}
   if(!group)throw Error('לא נמצאה התאמה מדויקת לשם קבוצת הבדיקות');
  }
  group.click();for(let i=0;i<16&&!selectedTitle(groupName);i++)await sleep(350);
  if(!selectedTitle(groupName))throw Error('שם הקבוצה הפתוחה אינו תואם לקבוצת הבדיקות — השליחה בוטלה');
  const box=compose();if(!box)throw Error('שדה כתיבת הודעה לא נמצא');
  if(normalized(box.innerText))throw Error('קיימת הודעה שלא נשלחה בשדה הכתיבה — בוטל כדי לא לדרוס אותה');
  box.focus();
  if(!document.execCommand('insertText',false,text))throw Error('הכנסת הטקסט נכשלה');
  await sleep(250);
  if(normalized(box.innerText)!==normalized(text))throw Error('הטקסט לא הוזן במדויק — לא בוצעה שליחה');
  if(!selectedTitle(groupName))throw Error('הקבוצה השתנתה — השליחה בוטלה');
  const button=document.querySelector('footer [data-icon="send"]')?.closest('button, [role="button"]');
  if(!button)throw Error('כפתור השליחה אינו מזוהה — ההודעה הוכנה אך לא נשלחה');
  button.click();return {ok:true};
 }
 chrome.runtime.onMessage.addListener((msg,sender,respond)=>{
  if(msg?.type!=='SEND_TEST')return;
  if(sending){respond({ok:false,error:'פעולת שליחה כבר מתבצעת'});return;}
  if(!authorizedGroup(msg.group) || typeof msg.text!=='string' || !msg.text.trim()){respond({ok:false,error:'יעד או תוכן לא מורשים'});return;}
  sending=true;send(msg.text,msg.group).then(respond).catch(e=>respond({ok:false,error:String(e.message||e)})).finally(()=>{sending=false});return true;
 });
})();

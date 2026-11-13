(() => {
  'use strict';
  if (window.top !== window) return;
  const source = 'nahar-wa-scheduler-v1';
  window.postMessage({source, direction:'extension-to-page', type:'READY'}, location.origin);
  window.addEventListener('message', async e => {
    if (e.source !== window || e.origin !== location.origin || e.data?.source !== source || e.data.direction !== 'page-to-extension') return;
    if (!['SCHEDULE','STATUS'].includes(e.data.type)) return;
    const requestId = String(e.data.requestId || '');
    try {
      const response = await chrome.runtime.sendMessage(e.data.type==='STATUS'?{type:'STATUS_TEST'}:{type:'SCHEDULE_TEST',job:e.data.job});
      window.postMessage({source, direction:'extension-to-page', type:'RESULT', requestId, response}, location.origin);
    } catch(err) {
      window.postMessage({source, direction:'extension-to-page', type:'RESULT', requestId, response:{ok:false,error:String(err.message || err)}}, location.origin);
    }
  });
})();

(function() {
  var AP = window.AutoPulseConfig || {};
  var botName = AP.botName || 'AI Assistant';
  var color = AP.color || '#00f5a0';
  var welcomeMsg = AP.welcomeMessage || 'Hi! 👋 How can I help you today?';
  var apiUrl = 'https://autopulse-ai.netlify.app/chatbot';
  var businessInfo = AP.businessInfo || '';
  var history = [];

  var style = document.createElement('style');
  style.textContent = '#ap-btn{position:fixed;bottom:24px;right:24px;z-index:99999;width:60px;height:60px;border-radius:50%;background:' + color + ';border:none;cursor:pointer;box-shadow:0 4px 20px rgba(0,0,0,.3);font-size:1.6rem;transition:transform .2s;}#ap-btn:hover{transform:scale(1.1);}#ap-box{position:fixed;bottom:100px;right:24px;z-index:99999;width:340px;max-height:500px;background:#0d0d15;border:1px solid #1e1e2e;border-radius:16px;display:none;flex-direction:column;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,.5);font-family:-apple-system,BlinkMacSystemFont,sans-serif;}#ap-box.open{display:flex;}#ap-head{background:#16161f;padding:14px 16px;border-bottom:1px solid #1e1e2e;display:flex;align-items:center;justify-content:space-between;}#ap-head span{color:#f0f0f5;font-weight:700;font-size:.95rem;}#ap-close{background:none;border:none;color:#6b6b8a;cursor:pointer;font-size:1.2rem;padding:0;}#ap-msgs{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px;max-height:340px;}.ap-msg{max-width:80%;}.ap-bot{align-self:flex-start;}.ap-user{align-self:flex-end;}.ap-bubble{padding:10px 14px;border-radius:12px;font-size:.85rem;line-height:1.5;}.ap-bot .ap-bubble{background:#16161f;color:#f0f0f5;border-bottom-left-radius:4px;}.ap-user .ap-bubble{background:' + color + ';color:#000;font-weight:500;border-bottom-right-radius:4px;}#ap-input-row{display:flex;gap:8px;padding:12px;border-top:1px solid #1e1e2e;background:#0d0d15;}#ap-input{flex:1;background:#16161f;border:1px solid #1e1e2e;border-radius:10px;padding:8px 12px;color:#f0f0f5;font-size:.85rem;outline:none;}#ap-send{background:' + color + ';color:#000;border:none;border-radius:10px;padding:8px 14px;font-weight:700;cursor:pointer;}#ap-powered{text-align:center;padding:6px;font-size:.7rem;color:#6b6b8a;background:#0d0d15;}#ap-powered a{color:' + color + ';text-decoration:none;}';
  document.head.appendChild(style);

  var btn = document.createElement('button');
  btn.id = 'ap-btn';
  btn.innerHTML = '💬';

  var box = document.createElement('div');
  box.id = 'ap-box';
  box.innerHTML = '<div id="ap-head"><span>🤖 ' + botName + '</span><button id="ap-close">✕</button></div><div id="ap-msgs"><div class="ap-msg ap-bot"><div class="ap-bubble">' + welcomeMsg + '</div></div></div><div id="ap-input-row"><input id="ap-input" type="text" placeholder="Type a message..."/><button id="ap-send">Send</button></div><div id="ap-powered">Powered by <a href="https://autopulse-ai.netlify.app" target="_blank">AutoPulse AI</a></div>';

  document.body.appendChild(btn);
  document.body.appendChild(box);

  btn.onclick = function() { box.classList.toggle('open'); if(box.classList.contains('open')) document.getElementById('ap-input').focus(); };
  document.getElementById('ap-close').onclick = function() { box.classList.remove('open'); };

  function addMsg(text, isUser) {
    var msgs = document.getElementById('ap-msgs');
    var div = document.createElement('div');
    div.className = 'ap-msg ' + (isUser ? 'ap-user' : 'ap-bot');
    div.innerHTML = '<div class="ap-bubble">' + text + '</div>';
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
  }

  function sendMsg() {
    var input = document.getElementById('ap-input');
    var msg = input.value.trim();
    if (!msg) return;
    addMsg(msg, true);
    input.value = '';
    history.push({ role: 'user', content: msg });
    var tid = 'apt' + Date.now();
    var msgs = document.getElementById('ap-msgs');
    var t = document.createElement('div');
    t.className = 'ap-msg ap-bot'; t.id = tid;
    t.innerHTML = '<div class="ap-bubble" style="color:#6b6b8a">Typing...</div>';
    msgs.appendChild(t); msgs.scrollTop = msgs.scrollHeight;
    fetch(apiUrl, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({message:msg, businessInfo:businessInfo, history:history}) })
    .then(function(r){return r.json();})
    .then(function(d){
      var reply = d.reply || 'Sorry I could not process that.';
      var el = document.getElementById(tid); if(el) el.remove();
      addMsg(reply, false);
      history.push({ role:'assistant', content:reply });
    }).catch(function(){
      var el = document.getElementById(tid); if(el) el.remove();
      addMsg('Sorry something went wrong!', false);
    });
  }

  document.getElementById('ap-send').onclick = sendMsg;
  document.getElementById('ap-input').onkeypress = function(e){ if(e.key==='Enter') sendMsg(); };
})();

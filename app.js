(function () {
  'use strict';

  var STORAGE_KEY = 'xuemiao-state-v2';
  var pad = function (n) { return String(n).padStart(2, '0'); };
  var iso = function (d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  var fromIso = function (s) { var p = s.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); };
  var today = new Date(); today.setHours(0, 0, 0, 0);
  var state = loadState();
  var selectedDate = state.selectedDate || iso(today);
  var calendarDate = fromIso(selectedDate);
  var recognition = null;
  var audioCtx = null;
  var noiseSource = null;
  var focusThemes = [
    {className:'theme-pomodoro', badge:'🍅 25 分钟冲刺 · 专注一件事', sound:'轻节拍', message:'先完成，再完美。学喵陪你冲刺！'},
    {className:'theme-deep', badge:'✦ 45 分钟潜行 · 屏蔽干扰', sound:'深夜雨', message:'把通知留在门外，进入你的深度时间。'},
    {className:'theme-mindful', badge:'🍃 5 分钟呼吸 · 回到当下', sound:'柔和溪流', message:'不用赶，跟着呼吸慢慢来喵。'}
  ];

  function defaults() {
    return {
      selectedDate: iso(today),
      habits: [
        {id: 1, icon: '💧', bg: '#E8F4FD', name: '晨起一杯水', time: '07:00-08:30', streak: 21, type: 'check', doneDates: [iso(today)]},
        {id: 2, icon: '📖', bg: '#FFF0E8', name: '高数第八章学习', time: '08:00-09:00', streak: 0, type: 'focus', doneDates: []},
        {id: 3, icon: '🧪', bg: '#F0E8FF', name: '实验室打卡', time: '10:00', streak: 0, type: 'check', doneDates: []}
      ],
      scheduleByDate: {},
      focus: {mode: 0, remaining: 1500, endAt: null},
      sound: false,
      nickname: '猫味少女Lily'
    };
  }

  if (!state.scheduleByDate) {
    state.scheduleByDate = {};
    state.scheduleByDate[iso(today)] = [
      {id:Date.now()+1,text:'产品方案终审稿',time:'09:00',q:'q1',done:false},
      {id:Date.now()+2,text:'高数第八章复习',time:'11:00',q:'q2',done:false},
      {id:Date.now()+3,text:'回复社群消息',time:'15:00',q:'q3',done:false}
    ];
  }

  function loadState() {
    try {
      var parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (parsed && Array.isArray(parsed.habits)) return parsed;
    } catch (_) {}
    return defaults();
  }

  function saveState() {
    state.selectedDate = selectedDate;
    state.habits = HABITS;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; });
  }

  function showToast(message) {
    var el = document.getElementById('toast');
    if (!el) { el = document.createElement('div'); el.id = 'toast'; el.className = 'toast'; document.body.appendChild(el); }
    el.textContent = message; el.classList.add('show');
    clearTimeout(showToast.t); showToast.t = setTimeout(function () { el.classList.remove('show'); }, 2200);
  }

  HABITS = state.habits;

  window.renderHabits = function () {
    var list = document.getElementById('habits-list');
    if (!list) return;
    list.innerHTML = HABITS.map(function (h) {
      var done = (h.doneDates || []).indexOf(selectedDate) >= 0;
      var action = h.type === 'focus' && !done
        ? '<button class="icon-btn" onclick="startHabitFocus(' + h.id + ')">▶</button>'
        : '<button aria-label="' + (done ? '取消打卡' : '打卡') + '" class="habit-check ' + (done ? 'done' : '') + '" onclick="toggleHabit(' + h.id + ')">' + (done ? '✓' : '') + '</button>';
      return '<div class="habit-card"><div class="habit-icon" style="background:' + h.bg + '">' + escapeHtml(h.icon) + '</div>' +
        '<div style="flex:1;min-width:0"><div style="font-size:15px;font-weight:700">' + escapeHtml(h.name) + '</div><div style="font-size:12px;color:var(--sub)">' + escapeHtml(h.time || '全天') + (h.streak ? ' · 连续' + h.streak + '天' : '') + '</div></div>' + action +
        '<button class="habit-menu" aria-label="编辑任务" onclick="openHabitModal(' + h.id + ')">⋯</button></div>';
    }).join('');
    updateSummary(); renderSchedule();
  };

  window.toggleHabit = function (id) {
    var h = HABITS.find(function (x) { return x.id === id; }); if (!h) return;
    h.doneDates = h.doneDates || [];
    var i = h.doneDates.indexOf(selectedDate);
    if (i >= 0) { h.doneDates.splice(i, 1); if (h.streak) h.streak--; showToast('已取消这天的打卡'); }
    else { h.doneDates.push(selectedDate); h.streak = (h.streak || 0) + 1; showToast('打卡成功！记录已保存 ✨'); celebrate(); }
    saveState(); renderHabits();
  };

  window.startHabitFocus = function (id) {
    state.activeHabitId = id; saveState(); setFocusMode(0); switchTab('focus'); showToast('已进入专注，完成后会自动打卡');
  };

  function celebrate() {
    var art = document.querySelector('.cat-box .cat-art'); if (!art) return;
    art.animate([{transform:'scale(.8) rotate(-8deg)'},{transform:'scale(1.16) rotate(7deg)'},{transform:'scale(1)'}], {duration:650,easing:'cubic-bezier(.2,.8,.2,1)'});
    var msg = document.getElementById('cat-msg'); if (msg) msg.textContent = '好耶！今天的你又向目标靠近了一步！';
  }

  window.openHabitModal = function (id) {
    var h = id ? HABITS.find(function (x) { return x.id === id; }) : null;
    var back = document.createElement('div'); back.className = 'modal-backdrop'; back.onclick = function (e) { if (e.target === back) back.remove(); };
    back.innerHTML = '<div class="modal-sheet"><div style="font-size:20px;font-weight:800">' + (h ? '编辑任务' : '新建好习惯') + '</div>' +
      '<label class="form-label">任务名称</label><input class="input-box" id="habit-name" maxlength="30" value="' + escapeHtml(h ? h.name : '') + '" placeholder="例如：背 30 个单词">' +
      '<div class="form-row"><div><label class="form-label">时间</label><input class="input-box" id="habit-time" value="' + escapeHtml(h ? h.time : '09:00') + '"></div><div><label class="form-label">图标</label><input class="input-box" id="habit-icon" maxlength="4" value="' + escapeHtml(h ? h.icon : '✨') + '"></div></div>' +
      '<label class="form-label">执行方式</label><select class="input-box" id="habit-type"><option value="check">直接打卡</option><option value="focus"' + (h && h.type === 'focus' ? ' selected' : '') + '>启动专注</option></select>' +
      '<div class="modal-actions">' + (h ? '<button class="icon-btn danger-btn" id="delete-habit">删除</button>' : '<button class="icon-btn" onclick="this.closest(\'.modal-backdrop\').remove()">取消</button>') + '<button class="btn-orange" id="save-habit">保存</button></div></div>';
    document.body.appendChild(back);
    back.querySelector('#habit-name').focus();
    back.querySelector('#save-habit').onclick = function () {
      var name = back.querySelector('#habit-name').value.trim(); if (!name) { showToast('请先填写任务名称'); return; }
      var next = {id: h ? h.id : Date.now(), name:name, time:back.querySelector('#habit-time').value.trim() || '全天', icon:back.querySelector('#habit-icon').value.trim() || '✨', type:back.querySelector('#habit-type').value, bg:h ? h.bg : '#EEF1FF', streak:h ? h.streak : 0, doneDates:h ? (h.doneDates || []) : []};
      if (h) HABITS[HABITS.indexOf(h)] = next; else HABITS.push(next);
      saveState(); renderHabits(); back.remove(); showToast('任务已保存');
    };
    var del = back.querySelector('#delete-habit'); if (del) del.onclick = function () { HABITS = HABITS.filter(function (x) { return x.id !== id; }); saveState(); renderHabits(); back.remove(); showToast('任务已删除'); };
  };

  function renderDateStrip() {
    var wrap = document.getElementById('date-strip'); if (!wrap) return;
    var week = ['日','一','二','三','四','五','六']; var html = '';
    for (var i = -14; i <= 14; i++) { var d = new Date(today); d.setDate(d.getDate() + i); var key = iso(d); html += '<button class="date-pill ' + (key === selectedDate ? 'active' : '') + '" data-date="' + key + '"><span>周' + week[d.getDay()] + '</span><strong>' + d.getDate() + '</strong></button>'; }
    wrap.innerHTML = html;
    wrap.querySelectorAll('button').forEach(function (b) { b.onclick = function () { selectDate(b.dataset.date); }; });
    requestAnimationFrame(function () { var a = wrap.querySelector('.active'); if (a) a.scrollIntoView({behavior:'smooth',inline:'center',block:'nearest'}); });
  }

  function selectDate(key) {
    selectedDate = key; calendarDate = fromIso(key); saveState(); renderDateStrip(); renderCalendar(); renderHabits(); updateHeader();
  }

  function updateHeader() {
    var d = fromIso(selectedDate); var l = document.getElementById('today-label'); var g = document.getElementById('greeting-label');
    if (l) l.textContent = d.getFullYear() + '年' + pad(d.getMonth()+1) + '月' + pad(d.getDate()) + '日';
    var hour = new Date().getHours(); if (g) g.textContent = (hour < 11 ? '早安' : hour < 18 ? '下午好' : '晚上好') + '，今天学了吗？';
  }

  window.renderCalendar = function () {
    var grid = document.getElementById('cal-grid'); if (!grid) return;
    var y = calendarDate.getFullYear(), m = calendarDate.getMonth(); var title = document.getElementById('calendar-title'); if (title) title.textContent = y + '年' + (m+1) + '月';
    var heads = ['一','二','三','四','五','六','日']; var html = heads.map(function (d) { return '<div class="cal-header">' + d + '</div>'; }).join('');
    var start = new Date(y,m,1), offset = (start.getDay()+6)%7, count = new Date(y,m+1,0).getDate();
    for (var b=0;b<offset;b++) html += '<div></div>';
    for (var n=1;n<=count;n++) { var key=iso(new Date(y,m,n)),scheduled=(state.scheduleByDate[key]||[]).length,habitCount=HABITS.filter(function(h){return(h.doneDates||[]).indexOf(key)>=0;}).length,totalMarks=scheduled+habitCount; html += '<button class="cal-day ' + (key===selectedDate?'today ':'') + (totalMarks>1?'has-many':'') + '" data-date="'+key+'" style="border:0;cursor:pointer">'+n+(totalMarks?'<span class="cal-dot"></span>':'')+'</button>'; }
    grid.innerHTML=html; grid.querySelectorAll('button').forEach(function(btn){btn.onclick=function(){selectDate(btn.dataset.date);};});
  };
  window.changeMonth = function (delta) { calendarDate = new Date(calendarDate.getFullYear(),calendarDate.getMonth()+delta,1); renderCalendar(); };
  window.goToday = function () { selectDate(iso(today)); };
  window.goYesterday = function () { var d=new Date(today);d.setDate(d.getDate()-1);selectDate(iso(d));switchTab('schedule'); };

  function updateSummary() {
    var done = HABITS.filter(function(h){return (h.doneDates||[]).indexOf(selectedDate)>=0;}).length; var rate = HABITS.length ? Math.round(done/HABITS.length*100) : 0;
    var banner = document.querySelector('.streak-banner'); if (!banner) return; var nums=banner.querySelectorAll('div[style*="font-size:32px"]'); if(nums[0]) nums[0].innerHTML=(done*25)+' <span style="font-size:16px">分钟</span>'; if(nums[1]) nums[1].textContent=rate+'%';
    var yesterday=new Date(today);yesterday.setDate(yesterday.getDate()-1);var ykey=iso(yesterday),missed=HABITS.filter(function(h){return(h.doneDates||[]).indexOf(ykey)<0;}).length,makeup=document.getElementById('makeup-banner'),makeupText=document.getElementById('makeup-text');if(makeup&&makeupText){makeup.style.display=missed?'flex':'none';makeupText.textContent='昨日有 '+missed+' 个任务未打卡';}
  }

  function getDaySchedule() { return state.scheduleByDate[selectedDate] || (state.scheduleByDate[selectedDate] = []); }

  function renderQuadrants() {
    var tasks=getDaySchedule(),emptyText=['先处理最关键的事','适合安排成长任务','可否委托或快速完成','有精力再做也可以'],colors={q1:'#E53E3E',q2:'#4895EF',q3:'#F6A623',q4:'#06A880'};
    ['q1','q2','q3','q4'].forEach(function(q,index){var wrap=document.getElementById('quadrant-'+q);if(!wrap)return;var items=tasks.filter(function(t){return t.q===q;});wrap.innerHTML=items.length?items.map(function(t){return '<div class="q-task '+(t.done?'done':'')+'" style="border-color:'+colors[q]+';color:'+colors[q]+'"><button class="q-task-check" aria-label="'+(t.done?'恢复任务':'完成任务')+'" onclick="toggleScheduleTask('+t.id+')"></button><span class="q-task-text" style="color:var(--text)" onclick="openScheduleTaskModal(\''+q+'\','+t.id+')">'+escapeHtml(t.text)+'</span><button class="q-task-delete" aria-label="删除日程" onclick="deleteScheduleTask('+t.id+')">×</button></div>';}).join(''):'<div class="q-empty">'+emptyText[index]+'</div>';});
  }

  window.openScheduleTaskModal=function(q,id){var tasks=getDaySchedule(),task=id?tasks.find(function(t){return t.id===id;}):null;var d=fromIso(selectedDate),back=document.createElement('div');back.className='modal-backdrop';back.onclick=function(e){if(e.target===back)back.remove();};back.innerHTML='<div class="modal-sheet"><div style="font-size:20px;font-weight:800">'+(task?'编辑日程':'添加 '+(d.getMonth()+1)+'月'+d.getDate()+'日日程')+'</div><label class="form-label">要做的事</label><input class="input-box" id="schedule-task-text" maxlength="40" value="'+escapeHtml(task?task.text:'')+'" placeholder="例如：完成项目初稿"><div class="form-row"><div><label class="form-label">时间</label><input class="input-box" id="schedule-task-time" type="time" value="'+escapeHtml(task?task.time:'09:00')+'"></div><div><label class="form-label">优先级</label><select class="input-box" id="schedule-task-q"><option value="q1">重要且紧急</option><option value="q2">重要不紧急</option><option value="q3">紧急不重要</option><option value="q4">不紧急不重要</option></select></div></div><div class="modal-actions"><button class="icon-btn" id="cancel-schedule">取消</button><button class="btn-orange" id="save-schedule">保存</button></div></div>';document.body.appendChild(back);var select=back.querySelector('#schedule-task-q');select.value=task?task.q:(q||'q2');back.querySelector('#schedule-task-text').focus();back.querySelector('#cancel-schedule').onclick=function(){back.remove();};back.querySelector('#save-schedule').onclick=function(){var text=back.querySelector('#schedule-task-text').value.trim();if(!text){showToast('请填写要做的事');return;}var next={id:task?task.id:Date.now(),text:text,time:back.querySelector('#schedule-task-time').value||'全天',q:select.value,done:task?task.done:false};if(task)tasks[tasks.indexOf(task)]=next;else tasks.push(next);saveState();renderSchedule();renderCalendar();back.remove();showToast('日程已加入当天');};};

  window.quickAddScheduleTask=function(){var input=document.getElementById('quick-task-input'),text=(input.value||'').trim();if(!text){showToast('先输入一件要做的事');return;}var now=new Date(),hour=now.getHours(),minute=Math.ceil(now.getMinutes()/5)*5;if(minute===60){hour=(hour+1)%24;minute=0;}var time=selectedDate===iso(today)?pad(hour)+':'+pad(minute):'09:00';getDaySchedule().push({id:Date.now(),text:text,time:time,q:'q2',done:false});input.value='';saveState();renderSchedule();renderCalendar();showToast('已加入今日待办');};
  window.handleQuickTaskKey=function(e){if(e.key==='Enter'){e.preventDefault();quickAddScheduleTask();}};
  window.toggleScheduleTask=function(id){var task=getDaySchedule().find(function(t){return t.id===id;});if(!task)return;task.done=!task.done;saveState();renderSchedule();renderCalendar();showToast(task.done?'完成一项，很棒！':'已恢复任务');};
  window.deleteScheduleTask=function(id){state.scheduleByDate[selectedDate]=getDaySchedule().filter(function(t){return t.id!==id;});saveState();renderSchedule();renderCalendar();showToast('日程已删除');};
  window.startSmartFocus=function(id){state.activeScheduleId=id;saveState();setFocusMode(0);switchTab('focus');showToast('已带着当前任务进入番茄钟');};
  window.smartAddSchedule=function(){var suggestion=(new Date().getHours()<12?'安排 45 分钟深度学习':'用 15 分钟复盘今日进度');getDaySchedule().push({id:Date.now(),text:suggestion,time:new Date().getHours()<12?'10:00':'20:30',q:'q2',done:false});saveState();renderSchedule();renderCalendar();showToast('已采纳学喵建议');};

  function renderSmartTip(){var wrap=document.getElementById('schedule-smart-tip');if(!wrap)return;var pending=getDaySchedule().filter(function(t){return!t.done;}),urgent=pending.find(function(t){return t.q==='q1';}),hour=new Date().getHours(),copy,action;if(urgent){copy='<b>建议先做：</b>'+escapeHtml(urgent.text)+'。它同时重要且紧急，先给它一个 25 分钟时间块。';action='<button onclick="startSmartFocus('+urgent.id+')">开始专注</button>';}else if(!pending.length){copy=hour>=20?'<b>今日已清空。</b>用 5 分钟记下明天第一件事，会更容易启动。':'<b>日程还很空。</b>先保护一块不被打扰的深度时间吧。';action='<button onclick="smartAddSchedule()">采纳建议</button>';}else{copy='<b>节奏建议：</b>今天还有 '+pending.length+' 项。'+(hour<12?'上午先做费脑的，零碎事放到下午。':'把低优先级任务留到精力有余时。');action='';}wrap.innerHTML='<span class="smart-tip-icon">💡</span><div class="smart-tip-copy">'+copy+'</div>'+action;}

  function renderSchedule() {
    var wrap=document.getElementById('schedule-list'); if(!wrap)return;var d=fromIso(selectedDate),title=document.getElementById('schedule-day-title'),count=document.getElementById('schedule-day-count'),scheduled=getDaySchedule(),doneCount=scheduled.filter(function(t){return t.done;}).length;if(title)title.textContent=(selectedDate===iso(today)?'今日':(d.getMonth()+1)+'月'+d.getDate()+'日')+'要做';if(count)count.textContent=scheduled.length?'已完成 '+doneCount+' / '+scheduled.length:'还没安排，从一件小事开始';
    var habitRows=HABITS.map(function(h){return{kind:'habit',id:h.id,text:h.name,time:h.time||'全天',icon:h.icon,done:(h.doneDates||[]).indexOf(selectedDate)>=0};}),scheduleRows=scheduled.map(function(t){return{kind:'schedule',id:t.id,text:t.text,time:t.time||'全天',icon:'📌',done:t.done};}),rows=habitRows.concat(scheduleRows).sort(function(a,b){return a.time.localeCompare(b.time);});
    wrap.innerHTML=rows.length?rows.map(function(r){return '<div class="schedule-card clickable" onclick="'+(r.kind==='habit'?'toggleHabit':'toggleScheduleTask')+'('+r.id+')" style="display:flex;gap:12px;align-items:center;margin:0 0 8px;padding:10px;background:#F8F9FE"><span style="font-size:20px">'+escapeHtml(r.icon)+'</span><div style="flex:1"><div style="font-size:11px;color:var(--sub)">'+escapeHtml(r.time)+'</div><div style="font-size:14px;font-weight:700;'+(r.done?'text-decoration:line-through;opacity:.55':'')+'">'+escapeHtml(r.text)+(r.done?' ✓':'')+'</div></div></div>';}).join(''):'<div style="color:var(--sub);text-align:center">这天还没有任务</div>';renderQuadrants();renderSmartTip();
  }

  var oldSetFocusMode=window.setFocusMode;
  function applyFocusTheme(i){var theme=focusThemes[i]||focusThemes[0],shell=document.getElementById('focus-shell'),badge=document.getElementById('focus-mode-badge'),msg=document.getElementById('focus-msg'),soundBtn=document.getElementById('sound-btn');if(shell)shell.className='focus-shell '+theme.className;if(badge)badge.textContent=theme.badge;if(msg)msg.textContent=theme.message;if(soundBtn&&!noiseSource)soundBtn.textContent='🎵 '+theme.sound+'：关';}
  window.setFocusMode=function(i){oldSetFocusMode(i);state.focus={mode:i,remaining:timerSec,endAt:null};applyFocusTheme(i);saveState();};
  var oldUpdateTimerUI=window.updateTimerUI;
  window.updateTimerUI=function(){var m=Math.floor(timerSec/60),s=timerSec%60,disp=document.getElementById('timer-display');if(disp)disp.textContent=pad(m)+':'+pad(s);var total=focusModes[focusMode].sec,prog=(total-timerSec)/total,circ=document.getElementById('timer-circle');if(circ)circ.style.strokeDashoffset=628*(1-prog);var cat=document.getElementById('focus-cat');if(cat&&!cat.querySelector('img'))cat.innerHTML='<img class="focus-cat-art" src="assets/xuemiao-focus.png" alt="伏案专注的学喵">';state.focus={mode:focusMode,remaining:timerSec,endAt:timerRunning?Date.now()+timerSec*1000:null};saveState();};
  window.toggleTimer=(function(original){return function(){original();if(timerRunning)showToast('专注开始，学喵会陪着你');};})(window.toggleTimer);

  window.toggleWhiteNoise=function(){var btn=document.getElementById('sound-btn'),theme=focusThemes[focusMode]||focusThemes[0];if(noiseSource){noiseSource.stop();noiseSource=null;state.sound=false;btn.textContent='🎵 '+theme.sound+'：关';saveState();return;}audioCtx=audioCtx||new (window.AudioContext||window.webkitAudioContext)();var buffer=audioCtx.createBuffer(1,audioCtx.sampleRate*2,audioCtx.sampleRate),data=buffer.getChannelData(0),last=0;for(var i=0;i<data.length;i++){var white=Math.random()*2-1;if(focusMode===0)data[i]=white*.18;else if(focusMode===1){last=(last+.018*white)/1.018;data[i]=last*2.6;}else{last=last*.94+white*.06;data[i]=last*.8;}}noiseSource=audioCtx.createBufferSource();var gain=audioCtx.createGain();gain.gain.value=focusMode===0?.12:.16;noiseSource.buffer=buffer;noiseSource.loop=true;noiseSource.connect(gain).connect(audioCtx.destination);noiseSource.start();state.sound=true;btn.textContent='🎵 '+theme.sound+'：开';saveState();};

  window.callAI = async function (userMsg) {
    chatHistory.push({role:'user',content:userMsg}); var typing=addMsg('assistant','',true);
    await new Promise(function(r){setTimeout(r,500);}); var msg=userMsg.toLowerCase(),reply;
    if(/(计划|规划|明天)/.test(msg)) reply='可以这样拆：① 先选 1 个最重要的目标；② 分成 2 个 25 分钟专注块；③ 晚上用 5 分钟复盘。要不要我帮你把其中一项加成打卡任务？';
    else if(/(专注|效率|拖延)/.test(msg)) reply='先做一个 25 分钟番茄钟喵：关掉通知，只留一个任务，结束后休息 5 分钟。你今天已完成 '+HABITS.filter(function(h){return(h.doneDates||[]).indexOf(selectedDate)>=0;}).length+' 项，节奏不错！';
    else if(/(早起|习惯|打卡)/.test(msg)) reply='养成习惯的关键是“足够小+固定触发”。例如把“早起学习”改成“起床后坐到书桌前 5 分钟”，连续 7 天后再加量。';
    else reply='我可以帮你拆目标、安排专注块或设计习惯。把你最想完成的一件事和可用时间告诉我，我们从最小一步开始喵。';
    if(typing)typing.textContent=reply;chatHistory.push({role:'assistant',content:reply});
  };

  function setupVoice(){var SR=window.SpeechRecognition||window.webkitSpeechRecognition,btn=document.getElementById('voice-btn');if(!SR){if(btn){btn.classList.add('unsupported');btn.title='当前浏览器不支持语音识别';}window.toggleVoice=function(){showToast('当前浏览器不支持语音识别，请使用 Chrome/Edge 或手动输入');};return;}recognition=new SR();recognition.lang='zh-CN';recognition.interimResults=true;recognition.continuous=false;recognition.onstart=function(){listening=true;btn.classList.add('listening');btn.textContent='🔴';showToast('正在听…再点一次可停止');};recognition.onresult=function(e){var text='';for(var i=e.resultIndex;i<e.results.length;i++)text+=e.results[i][0].transcript;document.getElementById('chat-input').value=text;};recognition.onend=function(){listening=false;btn.classList.remove('listening');btn.textContent='🎤';};recognition.onerror=function(e){recognition.onend();showToast(e.error==='not-allowed'?'需要麦克风权限才能语音输入':'没听清，请再试一次');};window.toggleVoice=function(){if(listening)recognition.stop();else recognition.start();};}

  window.openSettings=function(){var back=document.createElement('div');back.className='modal-backdrop';back.innerHTML='<div class="modal-sheet"><div style="font-size:20px;font-weight:800">设置</div><label class="form-label">昵称</label><input class="input-box" id="nickname" value="'+escapeHtml(state.nickname||'')+'"><label class="form-label">数据</label><button class="icon-btn danger-btn" id="reset-data">清空所有本地数据</button><div class="modal-actions"><button class="icon-btn" id="close-settings">取消</button><button class="btn-orange" id="save-settings">保存</button></div></div>';document.body.appendChild(back);back.querySelector('#close-settings').onclick=function(){back.remove();};back.querySelector('#save-settings').onclick=function(){state.nickname=back.querySelector('#nickname').value.trim()||'学喵用户';document.querySelector('.profile-header div[style*="font-size:20px"]').textContent=state.nickname;saveState();back.remove();showToast('设置已保存');};back.querySelector('#reset-data').onclick=function(){if(confirm('确定清空任务和打卡记录吗？')){localStorage.removeItem(STORAGE_KEY);location.reload();}};};

  function boot(){updateHeader();renderDateStrip();renderCalendar();renderHabits();setupVoice();var online=document.querySelector('#screen-ai div[style*="color:var(--green)"]');if(online)online.textContent='● 本地助手已就绪';var name=document.querySelector('.profile-header div[style*="font-size:20px"]');if(name)name.textContent=state.nickname||'学喵用户';timerRunning=false;focusMode=state.focus&&Number.isInteger(state.focus.mode)?state.focus.mode:0;timerSec=state.focus&&state.focus.remaining||focusModes[focusMode].sec;renderFocusTabs();applyFocusTheme(focusMode);updateTimerUI();var timerBtn=document.getElementById('timer-btn'),focusStatus=document.getElementById('focus-status');if(timerBtn)timerBtn.textContent=timerSec===focusModes[focusMode].sec?'▶ 开始':'▶ 继续';if(focusStatus)focusStatus.textContent='准备专注';saveState();}
  boot();
})();

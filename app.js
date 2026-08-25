/* ============================================================
   You vs You - v2
   Personal workout tracker. Progress saves to the server, not
   just this browser, so a URL change never wipes the log again.
   See MANUAL.md for the plain-language guide.
   ============================================================ */

const LOCAL_KEY = 'yvy_state_v2';
const PASS_KEY  = 'yvy_pass';
const API       = '/api/state';

const D    = window.WORKOUT_DATA;
const META = window.EX_META || {};
const REP_ONLY_DEFAULTS = window.REP_ONLY_DEFAULTS || [];

/* ============ STATE ============ */

function blankState(){
  return {
    v: 2,
    pos: { m:0, w:3, d:0 },          // Month 1, Week 4, Day 1
    sessions: {},                     // "m-w-d" -> {logged, done, startedAt, finishedAt, pump}
    daily: {},                        // "YYYY-MM-DD" -> {water, ate, rest, workout, travel}
    bw: [{ date:'2026-06-20', lb:210 }],
    streak: 0,
    lastStreakDate: null,
    travelDone: {},
    repOnly: {},                      // exercise name -> true/false override
    updatedAt: 0
  };
}

function loadLocal(){
  try{
    const raw = localStorage.getItem(LOCAL_KEY);
    if(raw){
      const s = JSON.parse(raw);
      return Object.assign(blankState(), s);
    }
  }catch(e){}
  return blankState();
}

let S = loadLocal();
let pass = '';
try { pass = localStorage.getItem(PASS_KEY) || ''; } catch(e){}

/* ============ SYNC ============ */

let syncStatus = 'idle';     // idle | saving | saved | offline | locked | loading
let saveTimer = null;
let lastSavedAt = null;
let offlineMode = false;

function setSync(s){
  syncStatus = s;
  const el = document.getElementById('cloudBadge');
  if(el) el.outerHTML = cloudBadge();
}

function cloudBadge(){
  const map = {
    idle:    ['○','Synced','var(--muted)'],
    saved:   ['●','Saved','var(--win)'],
    saving:  ['◐','Saving','var(--warn)'],
    loading: ['◐','Loading','var(--warn)'],
    offline: ['⚠','Offline','var(--warn)'],
    locked:  ['🔒','Local only','var(--dim)']
  };
  const [icon,label,color] = map[syncStatus] || map.idle;
  return `<button id="cloudBadge" class="cloud" style="color:${color}" onclick="openSyncMenu()">
    <span class="cloud-dot">${icon}</span><span class="cloud-txt">${label}</span></button>`;
}

function localSave(){
  try{ localStorage.setItem(LOCAL_KEY, JSON.stringify(S)); }catch(e){}
}

/* Every write goes through here. Local first so nothing is ever lost
   to a dropped connection, then a debounced push to the server. */
function save(){
  S.updatedAt = Date.now();
  localSave();
  if(!pass || offlineMode){ setSync('locked'); return; }
  setSync('saving');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(pushRemote, 1200);
}

async function pushRemote(){
  if(!pass || offlineMode) return;
  try{
    const res = await fetch(API, {
      method:'PUT',
      headers:{ 'content-type':'application/json', 'x-yvy-pass':pass },
      body: JSON.stringify(S)
    });
    if(res.status === 401){ setSync('offline'); toast('Wrong passcode','tap the badge to fix','peak'); return; }
    if(!res.ok) throw new Error('status '+res.status);
    const j = await res.json();
    lastSavedAt = j.savedAt;
    setSync('saved');
  }catch(e){
    setSync('offline');
  }
}

async function pullRemote(){
  if(!pass || offlineMode) return { ok:false, reason:'no-pass' };
  setSync('loading');
  try{
    const res = await fetch(API, { headers:{ 'x-yvy-pass':pass } });
    if(res.status === 401) return { ok:false, reason:'unauthorized' };
    if(!res.ok) throw new Error('status '+res.status);
    const j = await res.json();
    setSync('saved');
    return { ok:true, state: j.state };
  }catch(e){
    setSync('offline');
    return { ok:false, reason:'network' };
  }
}

/* First load: whichever copy is newer wins. Ties go to the server. */
async function bootSync(){
  const r = await pullRemote();
  if(!r.ok){
    if(r.reason === 'unauthorized'){
      pass = '';
      try{ localStorage.removeItem(PASS_KEY); }catch(e){}
      view = 'gate';
    }
    render();
    return;
  }
  const remote = r.state;
  if(remote && (remote.updatedAt || 0) >= (S.updatedAt || 0)){
    S = Object.assign(blankState(), remote);
    localSave();
  } else {
    await pushRemote();
  }
  render();
}

/* ============ HELPERS ============ */

function today(){
  const n = new Date();
  return n.getFullYear() + '-' + String(n.getMonth()+1).padStart(2,'0') + '-' + String(n.getDate()).padStart(2,'0');
}
function dayObj(){ const t = today(); S.daily[t] = S.daily[t] || {}; return S.daily[t]; }
function curDay(){
  const m = D.program[S.pos.m];
  const w = m.weeks[S.pos.w];
  const d = w.days[S.pos.d];
  return { m, w, d };
}
function sessionKey(){ return S.pos.m+'-'+S.pos.w+'-'+S.pos.d; }
function fmt(n){ return Math.round(n).toLocaleString(); }
function minRep(target){
  if(!target) return null;
  let t = (''+target).toLowerCase().trim();
  if(t === 'amrap') return null;
  t = t.split('/')[0].trim();
  let mm = t.match(/^(\d+)\s*-\s*(\d+)$/); if(mm) return parseInt(mm[1]);
  mm = t.match(/^(\d+)$/); if(mm) return parseInt(mm[1]);
  return null;
}
function esc(s){ return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function fmtClock(ms){
  const s = Math.max(0, Math.floor(ms/1000));
  const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sec = s%60;
  if(h) return h+':'+String(m).padStart(2,'0')+':'+String(sec).padStart(2,'0');
  return m+':'+String(sec).padStart(2,'0');
}
function fmtTimeOfDay(ts){
  return new Date(ts).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'});
}
function fmtMinutes(ms){
  const min = Math.round(ms/60000);
  if(min < 60) return min+' min';
  return Math.floor(min/60)+'h '+(min%60)+'m';
}

/* ============ THE WORK ENGINE ============ */

function isRepOnly(name){
  if(Object.prototype.hasOwnProperty.call(S.repOnly, name)) return !!S.repOnly[name];
  return REP_ONLY_DEFAULTS.indexOf(name) !== -1;
}
function toggleRepOnly(name){
  S.repOnly[name] = !isRepOnly(name);
  save();
  renderSession();
}

/* Work for one set. Weighted lifts: weight x reps. Rep-only lifts: reps. */
function setWork(name, s){
  const reps = (s.r == null || isNaN(s.r) || s.r <= 0) ? 0 : Number(s.r);
  if(isRepOnly(name)) return reps;
  const w = (s.w == null || isNaN(s.w)) ? 0 : Number(s.w);
  if(w <= 0) return 0;
  return w * (reps || 1);
}
function setStr(name, s){
  if(!s) return '';
  if(isRepOnly(name)) return (s.r || 0) + ' reps';
  return (s.w) + (s.r ? ' x ' + s.r : '');
}

/* Every past in-app session that logged this exercise, oldest first. */
function loggedHistory(name, excludeKey){
  const out = [];
  Object.keys(S.sessions).forEach(k => {
    if(k === excludeKey) return;
    const sess = S.sessions[k];
    const sets = sess.logged && sess.logged[name];
    if(!sets || !sets.length) return;
    let best = 0, bestSet = null;
    sets.forEach(s => { const wk = setWork(name, s); if(wk > best){ best = wk; bestSet = s; } });
    if(best > 0) out.push({ t: sess.finishedAt || sess.startedAt || 0, work: best, set: bestSet, key: k });
  });
  out.sort((a,b) => a.t - b.t);
  return out;
}

/*
  THE FIX. v1 read the target straight off the frozen spreadsheet seed and
  never looked at anything logged in the app, so the bar never moved.
  This walks the real session history first and only falls back to the seed.
*/
function targetFor(name, excludeKey){
  const hist = loggedHistory(name, excludeKey);
  const repMode = isRepOnly(name);
  // The old spreadsheet numbers are weight-based, so they mean nothing
  // for an exercise scored on reps. Rep-only lifts start clean.
  const seed = repMode ? null : D.byExercise[name];

  let work = 0, str = '', inferred = false, peak = 0, peakStr = '', source = 'none';

  if(hist.length){
    const last = hist[hist.length - 1];
    work = last.work;
    str = setStr(name, last.set);
    source = 'app';
    hist.forEach(h => { if(h.work > peak){ peak = h.work; peakStr = setStr(name, h.set); } });
  } else if(seed && seed.bestWork > 0){
    work = seed.bestWork;
    str = seed.bestStr;
    inferred = !!seed.anyInferred;
    source = 'seed';
    peak = seed.peakWork;
    peakStr = seed.peakStr;
  }
  if(seed && seed.peakWork > peak){ peak = seed.peakWork; peakStr = seed.peakStr; }

  return { work, str, inferred, peak, peakStr, source, sessions: hist.length, repMode };
}

/* ============ ROUTER ============ */

let view = 'home';
let mode = 'program';
let activeCircuit = null;
let summaryData = null;

function render(){
  if(view === 'gate') return renderGate();
  stopSessionClock();
  if(view === 'home') renderHome();
  else if(view === 'session') renderSession();
  else if(view === 'summary') renderSummary();
  else if(view === 'circuit') renderCircuit();
  else if(view === 'history') renderHistory();
  else if(view === 'bwgraph') renderBWGraph();
  else if(view === 'calendar') renderCalendar();
}

/* ============ PASSCODE GATE ============ */

function renderGate(){
  document.getElementById('app').innerHTML = `
    <div class="gate">
      <div class="gate-mark">YOU<span>vs</span>YOU</div>
      <div class="gate-title">Unlock your log</div>
      <div class="gate-sub">Enter the passcode you set in Netlify. It links this device to your saved progress, so your numbers follow you to any phone.</div>
      <input class="modal-inp" id="passInput" type="password" inputmode="text" autocomplete="current-password" placeholder="passcode">
      <button class="btn-primary" onclick="submitPass()">Unlock</button>
      <button class="mini-link" onclick="skipPass()">Skip for now and use this device only</button>
    </div>`;
  setTimeout(() => { const i = document.getElementById('passInput'); if(i) i.focus(); }, 60);
}

async function submitPass(){
  const v = (document.getElementById('passInput').value || '').trim();
  if(!v) return;
  pass = v;
  offlineMode = false;
  const r = await pullRemote();
  if(!r.ok){
    if(r.reason === 'unauthorized'){ pass = ''; toast('Passcode rejected','try again','peak'); return; }
    toast('Cannot reach the server','saved locally for now','peak');
  }
  try{ localStorage.setItem(PASS_KEY, pass); }catch(e){}
  if(r.ok){
    const remote = r.state;
    if(remote && (remote.updatedAt || 0) >= (S.updatedAt || 0)){
      S = Object.assign(blankState(), remote);
      localSave();
    } else {
      await pushRemote();
    }
  }
  view = 'home';
  render();
}

function skipPass(){
  offlineMode = true;
  setSync('locked');
  view = 'home';
  render();
  toast('Local only mode','progress stays on this device','peak');
}

/* ============ SYNC MENU ============ */

function openSyncMenu(){
  const m = document.createElement('div');
  m.className = 'modal-bg'; m.id = 'syncModal';
  const stamp = lastSavedAt ? new Date(lastSavedAt).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}) : 'not yet this session';
  m.innerHTML = `<div class="modal">
    <div class="modal-title">Your data</div>
    <div class="modal-sub">Last server save: ${stamp}<br>${offlineMode || !pass ? 'This device is saving locally only.' : 'Syncing to the server on every change.'}</div>
    <button class="modal-btn save" style="width:100%;margin-bottom:9px" onclick="forcePush()">Push this device to the server</button>
    <button class="modal-btn cancel" style="width:100%;margin-bottom:9px" onclick="forcePull()">Pull the server copy down</button>
    <button class="modal-btn cancel" style="width:100%;margin-bottom:9px" onclick="exportData()">Download a backup file</button>
    <button class="modal-btn cancel" style="width:100%;margin-bottom:9px" onclick="triggerImport()">Restore from a backup file</button>
    <button class="modal-btn cancel" style="width:100%;margin-bottom:14px" onclick="changePass()">Change passcode</button>
    <button class="modal-btn cancel" style="width:100%" onclick="closeSync()">Close</button>
  </div>`;
  document.body.appendChild(m);
  m.addEventListener('click', e => { if(e.target === m) closeSync(); });
}
function closeSync(){ const m = document.getElementById('syncModal'); if(m) m.remove(); }
async function forcePush(){ closeSync(); offlineMode = false; await pushRemote(); toast('Pushed to server','this device is the source','green'); }
async function forcePull(){
  closeSync(); offlineMode = false;
  const r = await pullRemote();
  if(r.ok && r.state){ S = Object.assign(blankState(), r.state); localSave(); render(); toast('Pulled from server','server copy loaded','green'); }
  else toast('Nothing to pull','server has no copy yet','peak');
}
function changePass(){ closeSync(); try{ localStorage.removeItem(PASS_KEY); }catch(e){} pass=''; view='gate'; render(); }

/* ============ HOME ============ */

function renderHome(){
  const { m, w, d } = curDay();
  const dateStr  = new Date().toLocaleDateString('en-US',{weekday:'long'});
  const dateMain = new Date().toLocaleDateString('en-US',{month:'long',day:'numeric'});
  const dy = dayObj();

  let daysDone = 0;
  const totalDays = m.weeks[S.pos.w].days.length;
  for(let i=0;i<totalDays;i++){ if(S.sessions[S.pos.m+'-'+S.pos.w+'-'+i]?.done) daysDone++; }

  const ringPct = Math.round(daysDone/totalDays*100);
  const off = 276.5*(1-ringPct/100);
  const sessDone = S.sessions[sessionKey()]?.done;
  const exCount = d.exercises.length;

  let totalProgDays = 0, doneProgDays = 0;
  D.program.forEach((mm,mi) => mm.weeks.forEach((ww,wi) => ww.days.forEach((dd,di) => {
    totalProgDays++;
    if(S.sessions[mi+'-'+wi+'-'+di]?.done) doneProgDays++;
  })));
  const progPct = Math.round(doneProgDays/totalProgDays*100);

  let monthSegs = '';
  D.program.forEach((mm,mi) => {
    const cls = mi < S.pos.m ? 'done' : (mi === S.pos.m ? 'cur' : '');
    monthSegs += `<div class="prog-seg ${cls}"></div>`;
  });

  let pills = '';
  m.weeks[S.pos.w].days.forEach((dd,i) => {
    const done = S.sessions[S.pos.m+'-'+S.pos.w+'-'+i]?.done;
    const cur = i === S.pos.d;
    pills += `<button class="day-pill ${cur?'cur':''} ${done?'done':''}" onclick="jumpDay(${i})">
      <span class="dp-day">Day ${dd.day}</span>${done?'✓':(cur?'●':'·')}</button>`;
  });

  const waterOn = dy.water, ate = dy.ate, rested = dy.rest;

  const programBlock = `
    <div class="sect-label">Today's Session</div>
    <div class="lift-card ${sessDone?'done-card':''}">
      <div class="lift-tag">Day ${d.day} · ${m.phase} · Week ${w.week}</div>
      <div class="lift-name">${esc(d.exercises[0].name)}${exCount>1?' <span style="color:var(--dim);font-size:16px">+ '+(exCount-1)+' more</span>':''}</div>
      <div class="lift-meta">${exCount} lifts · <b>${sessDone?'Session complete ✓':'beat your last numbers'}</b></div>
      <button class="btn-primary" onclick="enterSession()">${sessDone?'Review session →':'Enter the session →'}</button>
      <div class="day-pills">${pills}</div>
    </div>
    <div class="rest-row">
      <button class="rest-btn ${rested?'logged':''}" onclick="toggleRest()">🌿 ${rested?'Active rest logged ✓ — streak safe':'Log active rest day'}</button>
    </div>`;

  const travelBlock = `
    <div class="sect-label">No Gym? No Excuse.</div>
    <div class="travel-intro">Pick a circuit, run it, mark it done. Counts toward your streak and your week.</div>
    <button class="circuit" onclick="openCircuit('A')">
      <div class="circuit-tag">Circuit A · 5 movements</div>
      <div class="circuit-name">The Hotel Sweat</div>
      <div class="circuit-meta">Squats, push ups, planks, cobra, side plank</div>
    </button>
    <button class="circuit" onclick="openCircuit('B')">
      <div class="circuit-tag">Circuit B · 5 movements</div>
      <div class="circuit-name">The Quick Burn</div>
      <div class="circuit-meta">Split squats, tri push ups, lunge jumps, abs, climbers</div>
    </button>`;

  document.getElementById('app').innerHTML = `
    <div class="topbar">
      <div><div class="eyebrow">${dateStr}</div><div class="date-main">${dateMain}</div></div>
      <div class="top-right">
        ${cloudBadge()}
        <button class="streak" onclick="openCalendar()"><span class="streak-flame">🔥</span><div>
          <div class="streak-num">${liveStreak()}</div><div class="streak-label">Day streak</div></div></button>
      </div>
    </div>

    <div class="switch ${mode==='travel'?'travel':''}">
      <div class="switch-glide"></div>
      <button class="switch-btn ${mode==='program'?'active':''}" onclick="setMode('program')">Program</button>
      <button class="switch-btn ${mode==='travel'?'active':''}" onclick="setMode('travel')">Travel</button>
    </div>

    <button class="prog-strip" style="width:100%;text-align:left;border:1px solid var(--line)" onclick="openPosPicker()">
      <div class="prog-top"><div class="prog-title">The 7-Month Program</div><div class="prog-pct">${progPct}%</div></div>
      <div class="prog-bar">${monthSegs}</div>
      <div class="prog-sub">Month <b>${m.index} of 7</b> · ${m.phase} · Week <b>${w.week}</b> · <b>${totalProgDays-doneProgDays}</b> sessions left · tap to change</div>
    </button>

    <div class="scoreboard">
      <div class="sb-head"><div class="sb-title">This Week</div>
        <div class="sb-sub">${m.phase} · Week ${w.week} · <b>${totalDays-daysDone} to go</b></div></div>
      <div class="ring-row">
        <div class="ring-wrap">
          <svg width="104" height="104" viewBox="0 0 104 104">
            <circle cx="52" cy="52" r="44" fill="none" stroke="#262a33" stroke-width="9"/>
            <circle cx="52" cy="52" r="44" fill="none" stroke="var(--win)" stroke-width="9"
              stroke-linecap="round" transform="rotate(-90 52 52)"
              stroke-dasharray="276.5" stroke-dashoffset="${off}" style="transition:stroke-dashoffset .6s"/>
          </svg>
          <div class="ring-center"><div class="ring-big">${ringPct}%</div><div class="ring-small">Week</div></div>
        </div>
        <div class="legend">
          <div class="leg-item"><span class="leg-dot" style="background:var(--win)"></span>
            <span class="leg-txt"><b>Sessions</b> done</span><span class="leg-count ${daysDone?'done':''}">${daysDone}/${totalDays}</span></div>
          <div class="leg-item"><span class="leg-dot" style="background:var(--hold)"></span>
            <span class="leg-txt"><b>Water</b> today</span><span class="leg-count ${waterOn?'done':''}">${waterOn?'✓':'—'}</span></div>
          <div class="leg-item"><span class="leg-dot" style="background:var(--warn)"></span>
            <span class="leg-txt"><b>On track</b> today</span><span class="leg-count ${ate?'done':''}">${ate?ate.toUpperCase():'—'}</span></div>
        </div>
      </div>
    </div>

    ${mode==='program'?programBlock:travelBlock}

    <div class="sect-label">Daily Check-In</div>
    <div class="checks">
      <div class="check water ${waterOn?'on':''}" onclick="toggleWater()">
        <div class="check-top"><div class="check-q">Drank enough water?</div><div class="check-icon">💧</div></div>
        <div class="check-state">${waterOn?'Locked in ✓':'Tap to log'}</div>
      </div>
      <div class="check">
        <div class="check-top"><div class="check-q">Ate on track?</div><div class="check-icon">🍽️</div></div>
        <div class="track-opts">
          <button class="track-opt ${ate==='yes'?'sel':''}" data-v="yes" onclick="setAte('yes')">Yes</button>
          <button class="track-opt ${ate==='close'?'sel':''}" data-v="close" onclick="setAte('close')">Close</button>
          <button class="track-opt ${ate==='no'?'sel':''}" data-v="no" onclick="setAte('no')">No</button>
        </div>
      </div>
    </div>

    ${bwStrip()}
    <button class="mini-link" onclick="openHistory()">View workout log →</button>
    <div class="footnote">Month ${m.index} of 7 · ${D.meta.totalExercises} exercises loaded<br>
      ${offlineMode||!pass ? 'Local only. Tap the badge up top to connect.' : 'Progress saves to the server on every change.'}</div>
    <input type="file" id="importFile" accept="application/json" class="hidden" onchange="handleImport(event)">
  `;
}

function bwStrip(){
  const arr = S.bw;
  const latest = arr.length ? arr[arr.length-1].lb : null;
  let trend = '', cls = 'flat';
  if(arr.length >= 2){
    const diff = latest - arr[0].lb;
    if(diff < -0.05){ cls='down'; trend='▼ '+Math.abs(diff).toFixed(1)+' lb'; }
    else if(diff > 0.05){ cls='up'; trend='▲ '+diff.toFixed(1)+' lb'; }
    else { cls='flat'; trend='— steady'; }
  }
  return `<div class="bw-strip">
    <div onclick="openBWGraph()" style="flex:1"><div class="bw-label">Bodyweight</div>
      <div class="bw-val">${latest!==null?latest:'—'} <small>lb</small></div></div>
    <div style="text-align:right" onclick="openBWGraph()">
      <div class="bw-trend ${cls}">${trend||'Tap to see graph'}</div></div>
    <button class="modal-btn save" style="flex:0;margin-left:14px;padding:11px 16px;font-size:14px" onclick="event.stopPropagation();logBW()">Log +</button>
  </div>`;
}

/* ============ HOME ACTIONS ============ */

function setMode(mm){ mode = mm; render(); }
function jumpDay(i){ S.pos.d = i; save(); render(); }
function toggleWater(){ const dy = dayObj(); dy.water = !dy.water; touchStreak(); save(); render(); }
function setAte(v){ const dy = dayObj(); dy.ate = dy.ate === v ? null : v; touchStreak(); save(); render(); }
function toggleRest(){ const dy = dayObj(); dy.rest = !dy.rest; touchStreak(); save(); render(); }

function openPosPicker(){
  const m = document.createElement('div');
  m.className = 'modal-bg'; m.id = 'posModal';
  let monthOpts = '';
  D.program.forEach((mm,i) => { monthOpts += `<option value="${i}" ${i===S.pos.m?'selected':''}>Month ${mm.index} · ${mm.phase}</option>`; });
  let weekOpts = '';
  D.program[S.pos.m].weeks.forEach((ww,i) => { weekOpts += `<option value="${i}" ${i===S.pos.w?'selected':''}>Week ${ww.week}</option>`; });
  let dayOpts = '';
  D.program[S.pos.m].weeks[S.pos.w].days.forEach((dd,i) => { dayOpts += `<option value="${i}" ${i===S.pos.d?'selected':''}>Day ${dd.day}</option>`; });
  m.innerHTML = `<div class="modal">
    <div class="modal-title">Where are you?</div>
    <div class="modal-sub">Set your place in the program. Nothing already logged is affected.</div>
    <select class="sel" id="posM" onchange="posMonthChange()">${monthOpts}</select>
    <select class="sel" id="posW">${weekOpts}</select>
    <select class="sel" id="posD">${dayOpts}</select>
    <div class="modal-row" style="margin-top:14px">
      <button class="modal-btn cancel" onclick="closePos()">Cancel</button>
      <button class="modal-btn save" onclick="savePos()">Set</button>
    </div></div>`;
  document.body.appendChild(m);
  m.addEventListener('click', e => { if(e.target === m) closePos(); });
}
function posMonthChange(){
  const mi = parseInt(document.getElementById('posM').value);
  const wSel = document.getElementById('posW'), dSel = document.getElementById('posD');
  wSel.innerHTML = D.program[mi].weeks.map((ww,i) => `<option value="${i}">Week ${ww.week}</option>`).join('');
  dSel.innerHTML = D.program[mi].weeks[0].days.map((dd,i) => `<option value="${i}">Day ${dd.day}</option>`).join('');
}
function closePos(){ const m = document.getElementById('posModal'); if(m) m.remove(); }
function savePos(){
  const mi = parseInt(document.getElementById('posM').value);
  const wi = parseInt(document.getElementById('posW').value);
  const di = parseInt(document.getElementById('posD').value);
  S.pos = { m: mi, w: wi, d: di };
  save(); closePos(); render();
}

function logBW(){
  const m = document.createElement('div');
  m.className = 'modal-bg'; m.id = 'bwModal';
  const last = S.bw.length ? S.bw[S.bw.length-1].lb : '';
  m.innerHTML = `<div class="modal">
    <div class="modal-title">Log Bodyweight</div>
    <div class="modal-sub">${new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'})}</div>
    <input class="modal-inp" id="bwInput" inputmode="decimal" type="number" placeholder="${last||'0'}" value="">
    <div class="modal-row">
      <button class="modal-btn cancel" onclick="closeBW()">Cancel</button>
      <button class="modal-btn save" onclick="saveBW()">Save</button>
    </div></div>`;
  document.body.appendChild(m);
  setTimeout(() => { const i = document.getElementById('bwInput'); if(i) i.focus(); }, 50);
  m.addEventListener('click', e => { if(e.target === m) closeBW(); });
}
function closeBW(){ const m = document.getElementById('bwModal'); if(m) m.remove(); }
function saveBW(){
  const v = parseFloat(document.getElementById('bwInput').value);
  if(isNaN(v) || v <= 0){ closeBW(); return; }
  const t = today();
  const idx = S.bw.findIndex(e => e.date === t);
  if(idx >= 0) S.bw[idx].lb = v; else S.bw.push({ date:t, lb:v });
  S.bw.sort((a,b) => a.date < b.date ? -1 : 1);
  save(); closeBW(); render();
}

function markWorkoutDay(){ const dy = dayObj(); dy.workout = true; }

/* The streak stored in state only moves when you log something. If you miss
   days, that stored number goes stale and the home screen would keep showing it.
   This recomputes what the streak actually is as of right now, so the number on
   screen is always honest. */
function liveStreak(){
  if(!S.lastStreakDate) return 0;
  const t = today();
  const yd = new Date(Date.now()-86400000);
  const y = yd.getFullYear()+'-'+String(yd.getMonth()+1).padStart(2,'0')+'-'+String(yd.getDate()).padStart(2,'0');
  // Still alive only if the last active day was today or yesterday.
  if(S.lastStreakDate === t || S.lastStreakDate === y) return S.streak;
  return 0;
}

function touchStreak(){
  const dy = dayObj();
  if(dy.workout || dy.travel || dy.rest){
    const t = today();
    if(S.lastStreakDate !== t){
      const yd = new Date(Date.now()-86400000);
      const y = yd.getFullYear()+'-'+String(yd.getMonth()+1).padStart(2,'0')+'-'+String(yd.getDate()).padStart(2,'0');
      S.streak = (S.lastStreakDate === y) ? S.streak+1 : 1;
      S.lastStreakDate = t;
    }
  }
}

/* ============ SESSION ============ */

let sessionClock = null;
let peakHit = {};

function enterSession(){
  const key = sessionKey();
  S.sessions[key] = S.sessions[key] || { logged:{}, done:false };
  const sess = S.sessions[key];
  // Open a session, get pulled away, come back tomorrow: without this the clock
  // would read 26:00:00 and the summary would claim a 26 hour workout. If the
  // stamp is not from today, treat this as a fresh start.
  const stale = sess.startedAt && (
    new Date(sess.startedAt).toDateString() !== new Date().toDateString() ||
    Date.now() - sess.startedAt > 6*3600000
  );
  if(!sess.startedAt || (stale && !sess.done)){ sess.startedAt = Date.now(); save(); }
  peakHit = {};
  view = 'session';
  render();
  window.scrollTo(0,0);
}
function backHome(){ stopSessionClock(); view = 'home'; render(); window.scrollTo(0,0); }

function startSessionClock(){
  stopSessionClock();
  sessionClock = setInterval(() => {
    const el = document.getElementById('sessClock');
    const sess = S.sessions[sessionKey()];
    if(el && sess && sess.startedAt) el.textContent = fmtClock(Date.now() - sess.startedAt);
  }, 1000);
}
function stopSessionClock(){ if(sessionClock){ clearInterval(sessionClock); sessionClock = null; } }

function renderSession(){
  const { m, w, d } = curDay();
  const key = sessionKey();
  S.sessions[key] = S.sessions[key] || { logged:{}, done:false };
  const sess = S.sessions[key];
  const logged = sess.logged;

  let html = `
    <div class="shead"><button class="back" onclick="backHome()">← Exit</button>
      <div class="shead-meta">Month ${m.index} · Week ${w.week} · Day ${d.day}</div></div>
    <div class="stitle">${m.phase} · Day ${d.day}</div>
    <div class="meter">
      <div class="meter-row">
        <div class="meter-label">Session progress</div>
        <div class="clock-wrap">
          <span class="clock-start">Started ${sess.startedAt ? fmtTimeOfDay(sess.startedAt) : '—'}</span>
          <span class="clock" id="sessClock">${sess.startedAt ? fmtClock(Date.now()-sess.startedAt) : '0:00'}</span>
        </div>
        <div class="meter-pct" id="pct">0%</div>
      </div>
      <div class="meter-bar"><div class="meter-fill" id="fill"></div></div>
    </div>`;

  d.exercises.forEach((ex, ei) => {
    const name = ex.name;
    const t = targetFor(name, key);
    const repMode = t.repMode;
    const mr = minRep(ex.targetReps);
    const existing = logged[name] || [];
    const setCount = Math.max(existing.length, 3);
    const meta = META[name];

    let ttb;
    if(t.work > 0){
      const label = repMode ? 'Reps to beat' : 'Work to beat';
      const num = repMode ? t.str : `${esc(t.str)} = ${fmt(t.work)}`;
      const src = t.source === 'seed' ? '<span class="est">from old log</span>' : (t.inferred ? '<span class="est">est</span>' : '');
      ttb = `<div class="ttb"><span class="ttb-icon">🎯</span>
        <span class="ttb-label">${label}</span>
        <span class="ttb-num">${num}${src}</span></div>`;
    } else {
      ttb = `<div class="ttb first"><span class="ttb-icon">⚑</span>
        <span class="ttb-label">First time</span><span class="ttb-num">Set your baseline</span></div>`;
    }
    const peakLine = t.peak > 0
      ? `<div class="peakline"><span class="star">★</span> All-time peak ${esc(t.peakStr)}${repMode?'':' = '+fmt(t.peak)} — the boss fight</div>` : '';

    const cueBlock = meta ? `
      <button class="cue-btn" onclick="toggleCue(${ei})">Form cue</button>
      <div class="cue-panel hidden" id="cue${ei}">
        <div class="cue-muscle">Feel it in: <b>${esc(meta[0])}</b></div>
        <div class="cue-text">${esc(meta[1])}</div>
      </div>` : '';

    let rows = '';
    for(let si=0; si<setCount; si++){
      const e0 = existing[si] || {};
      rows += buildRow(si+1, repMode, e0, mr, t);
    }

    html += `<div class="ex ${repMode?'repmode':''}" id="ex${ei}" data-name="${encodeURIComponent(name)}" data-target="${t.work}" data-peak="${t.peak}" data-rep="${repMode?1:0}">
      <div class="ex-head">
        <div>
          <div class="ex-letter">${ex.group}</div>
          <div class="ex-name">${esc(name)}</div>
          <div class="ex-reps">Target reps <b>${ex.targetReps||'—'}</b>${repMode?' · <span style="color:var(--hold)">reps only</span>':''}</div>
        </div>
        <button class="mode-toggle" title="Switch between weight and reps only" onclick="toggleRepOnly(decodeURIComponent('${encodeURIComponent(name)}'))">${repMode?'reps':'lbs'}</button>
      </div>
      ${ttb}${peakLine}${cueBlock}
      <div class="set-row head ${repMode?'reps-only':''}"><div></div>${repMode?'':'<div class="set-h">Weight</div>'}<div class="set-h">Reps</div><div></div></div>
      ${rows}
      <button class="addset" onclick="addSet(${ei})">+ Add set</button>
      <div class="ex-result under" id="res${ei}">${resultPlaceholder(t)}</div>
    </div>`;
  });

  html += `<div style="height:100px"></div>
    <div class="finish-bar"><button class="btn-primary" id="finishBtn" onclick="finishSession()">Finish session</button></div>`;

  document.getElementById('app').innerHTML = html;
  document.querySelectorAll('.ex').forEach(ex => rollup(ex));
  refreshMeter();
  startSessionClock();
}

function buildRow(n, repMode, e0, mr, t){
  const cls = 'set-row' + (repMode ? ' reps-only' : '');
  const repPh = mr != null ? mr : '—';
  const wPh = (!repMode && t && t.work > 0 && mr) ? Math.round(t.work/mr) : '—';
  const wField = repMode ? '' :
    `<input class="inp" inputmode="decimal" type="number" placeholder="${wPh}" value="${e0.w ?? ''}" oninput="judge(this)">`;
  const repPhFinal = repMode && t && t.work > 0 ? t.work : repPh;
  return `<div class="${cls}">
    <div class="set-n">${n}</div>
    ${wField}
    <input class="inp" inputmode="numeric" type="number" placeholder="${repPhFinal}" value="${e0.r ?? ''}" oninput="judge(this)">
    <div class="set-mark"><span class="dot"></span></div></div>`;
}

function resultPlaceholder(t){
  if(t.work > 0) return t.repMode ? 'Beat '+fmt(t.work)+' reps on any set' : 'Beat '+fmt(t.work)+' of work on any set';
  return 'No target yet — today sets the bar';
}

function toggleCue(ei){
  const p = document.getElementById('cue'+ei);
  if(p) p.classList.toggle('hidden');
}

function addSet(ei){
  const ex = document.getElementById('ex'+ei);
  const repMode = ex.dataset.rep === '1';
  const rows = ex.querySelectorAll('.set-row:not(.head)');
  const n = rows.length + 1;
  const div = document.createElement('div');
  div.className = 'set-row' + (repMode ? ' reps-only' : '');
  div.innerHTML = `<div class="set-n">${n}</div>
    ${repMode ? '' : '<input class="inp" inputmode="decimal" type="number" placeholder="—" oninput="judge(this)">'}
    <input class="inp" inputmode="numeric" type="number" placeholder="—" oninput="judge(this)">
    <div class="set-mark"><span class="dot"></span></div>`;
  ex.querySelector('.addset').before(div);
}

/* Read one set row into {w, r} */
function readRow(row, repMode){
  const inputs = row.querySelectorAll('.inp');
  if(repMode){
    const r = parseFloat(inputs[0].value);
    return { w:null, r: isNaN(r) ? null : r };
  }
  const w = parseFloat(inputs[0].value);
  const r = parseFloat(inputs[1].value);
  return { w: isNaN(w) ? null : w, r: isNaN(r) ? null : r };
}

function judge(input){
  const row = input.closest('.set-row');
  const ex = row.closest('.ex');
  rollup(ex);
  persistSession();
}

function rollup(ex){
  const repMode = ex.dataset.rep === '1';
  const name = decodeURIComponent(ex.dataset.name);
  const target = parseFloat(ex.dataset.target) || 0;
  const peak = parseFloat(ex.dataset.peak) || 0;
  const rows = [...ex.querySelectorAll('.set-row:not(.head)')];
  const res = ex.querySelector('.ex-result');

  let best = 0, bestStr = '';

  rows.forEach(row => {
    const s = readRow(row, repMode);
    const wk = setWork(name, s);
    const mark = row.querySelector('.set-mark');
    row.classList.remove('won','held','under','peakset');
    if(wk <= 0){ mark.innerHTML = '<span class="dot"></span>'; return; }
    if(wk > best){ best = wk; bestStr = setStr(name, s); }
    if(peak > 0 && wk > peak){ row.classList.add('peakset'); mark.textContent = '★'; }
    else if(target > 0 && wk > target){ row.classList.add('won'); mark.textContent = '▲'; }
    else if(target > 0 && wk === target){ row.classList.add('held'); mark.textContent = '='; }
    else if(target > 0){ row.classList.add('under'); mark.textContent = '·'; }
    else { row.classList.add('won'); mark.textContent = '▲'; }
  });

  ex.classList.remove('beaten','peaked');
  res.classList.remove('win','peak','hold','under');

  if(best === 0){
    res.classList.add('under');
    res.textContent = target > 0
      ? (repMode ? 'Beat '+fmt(target)+' reps on any set' : 'Beat '+fmt(target)+' of work on any set')
      : 'No target yet — today sets the bar';
    return;
  }
  const unit = repMode ? '' : ' work';
  if(peak > 0 && best > peak){
    ex.classList.add('peaked'); res.classList.add('peak');
    res.textContent = '★ NEW PEAK — ' + bestStr;
    if(!peakHit[ex.id]){ peakHit[ex.id] = true; toast('★ New Peak — ' + ex.querySelector('.ex-name').textContent, 'boss fight won','peak'); }
  } else if(target > 0 && best > target){
    ex.classList.add('beaten'); res.classList.add('win');
    res.textContent = '▲ Beaten — ' + bestStr + ' = ' + fmt(best) + unit;
    peakHit[ex.id] = false;
  } else if(target > 0 && best === target){
    res.classList.add('hold'); res.textContent = '= Held the line — ' + fmt(best);
  } else if(target > 0){
    res.classList.add('under'); res.textContent = 'Logged ' + fmt(best) + ' — bar stays at ' + fmt(target);
  } else {
    ex.classList.add('beaten'); res.classList.add('win');
    res.textContent = 'Baseline set — ' + bestStr;
  }
}

function persistSession(){
  const key = sessionKey();
  S.sessions[key] = S.sessions[key] || { logged:{}, done:false };
  document.querySelectorAll('.ex').forEach(ex => {
    const name = decodeURIComponent(ex.dataset.name);
    const repMode = ex.dataset.rep === '1';
    const sets = [];
    ex.querySelectorAll('.set-row:not(.head)').forEach(row => {
      const s = readRow(row, repMode);
      if(setWork(name, s) > 0) sets.push(s);
    });
    if(sets.length) S.sessions[key].logged[name] = sets;
    else delete S.sessions[key].logged[name];
  });
  save();
  refreshMeter();
}

function refreshMeter(){
  const exs = [...document.querySelectorAll('.ex')];
  if(!exs.length) return;
  let done = 0;
  exs.forEach(ex => {
    const name = decodeURIComponent(ex.dataset.name);
    const repMode = ex.dataset.rep === '1';
    const any = [...ex.querySelectorAll('.set-row:not(.head)')].some(row => setWork(name, readRow(row, repMode)) > 0);
    if(any) done++;
  });
  const pct = Math.round(done/exs.length*100);
  const pe = document.getElementById('pct'), fe = document.getElementById('fill'), fb = document.getElementById('finishBtn');
  if(pe) pe.textContent = pct+'%';
  if(fe) fe.style.width = pct+'%';
  if(fb) fb.textContent = done === exs.length ? 'Finish session ✓' : 'Finish — '+done+' of '+exs.length+' done';
}

/* ============ FINISH + SUMMARY ============ */

function finishSession(){
  const key = sessionKey();
  persistSession();
  const sess = S.sessions[key];
  const { m, w, d } = curDay();

  const startedAt = sess.startedAt || Date.now();
  const endedAt = Date.now();

  let totalWork = 0, setCount = 0, prs = [], beaten = 0, exLogged = 0;

  d.exercises.forEach(ex => {
    const name = ex.name;
    const sets = sess.logged[name];
    if(!sets || !sets.length) return;
    exLogged++;
    const t = targetFor(name, key);
    let best = 0, bestStr = '';
    sets.forEach(s => {
      const wk = setWork(name, s);
      totalWork += wk; setCount++;
      if(wk > best){ best = wk; bestStr = setStr(name, s); }
    });
    if(t.peak > 0 && best > t.peak) prs.push({ name, str: bestStr, work: best, old: t.peak, repMode: t.repMode });
    else if(t.work > 0 && best > t.work) beaten++;
    else if(t.work === 0) beaten++;
  });

  summaryData = {
    key, startedAt, endedAt,
    elapsed: endedAt - startedAt,
    totalWork, setCount, prs, beaten, exLogged,
    exTotal: d.exercises.length,
    label: `${m.phase} · Week ${w.week} · Day ${d.day}`,
    pump: sess.pump || null
  };
  view = 'summary';
  render();
  window.scrollTo(0,0);
}

function renderSummary(){
  const s = summaryData;
  if(!s){ backHome(); return; }

  const prRows = s.prs.map(p => `
    <div class="pr-row">
      <div class="pr-name">${esc(p.name)}</div>
      <div class="pr-val">${esc(p.str)}<span class="pr-old">was ${fmt(p.old)}</span></div>
    </div>`).join('');

  const pumpChips = [1,2,3,4,5,6,7,8,9,10].map(n =>
    `<button class="pump ${s.pump===n?'sel':''}" onclick="setPump(${n})">${n}</button>`).join('');

  document.getElementById('app').innerHTML = `
    <div class="sum-wrap">
      <div class="sum-burst">
        <svg width="120" height="120" viewBox="0 0 120 120">
          <circle class="burst-ring" cx="60" cy="60" r="52" fill="none" stroke="var(--win)" stroke-width="4"
            stroke-linecap="round" stroke-dasharray="327" stroke-dashoffset="327" transform="rotate(-90 60 60)"/>
          <path class="burst-check" d="M38 61 L53 76 L83 46" fill="none" stroke="var(--win)" stroke-width="6"
            stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="70" stroke-dashoffset="70"/>
        </svg>
      </div>
      <div class="sum-title">Session complete</div>
      <div class="sum-sub">${esc(s.label)}</div>

      <div class="sum-stats">
        <div class="sum-stat s1"><div class="sum-num">${fmt(s.totalWork)}</div><div class="sum-lbl">Total work</div></div>
        <div class="sum-stat s2"><div class="sum-num">${fmtMinutes(s.elapsed)}</div><div class="sum-lbl">Time</div></div>
        <div class="sum-stat s3"><div class="sum-num">${s.prs.length}</div><div class="sum-lbl">New peaks</div></div>
      </div>

      <div class="sum-line s4">
        <span>Started ${fmtTimeOfDay(s.startedAt)}</span><span>Finished ${fmtTimeOfDay(s.endedAt)}</span>
      </div>
      <div class="sum-line s4">
        <span>${s.setCount} sets logged</span><span>${s.exLogged} of ${s.exTotal} lifts</span>
      </div>
      <div class="sum-line s4">
        <span>Targets beaten</span><span style="color:var(--win)">${s.beaten}</span>
      </div>

      ${s.prs.length ? `<div class="sect-label s5" style="margin-top:22px">★ New Peaks</div>
        <div class="pr-card s5">${prRows}</div>` : ''}

      <div class="sect-label s5" style="margin-top:22px">Rate the pump</div>
      <div class="pump-row s5">${pumpChips}</div>

      <button class="btn-primary s6" style="margin-top:22px" onclick="lockItIn()">Lock it in</button>
      <button class="mini-link s6" onclick="reopenSession()">Back to the session</button>
      <div style="height:40px"></div>
    </div>`;
}

function setPump(n){
  summaryData.pump = n;
  renderSummary();
}
function reopenSession(){ view = 'session'; render(); window.scrollTo(0,0); }

function lockItIn(){
  const s = summaryData;
  const sess = S.sessions[s.key];
  sess.done = true;
  sess.finishedAt = s.endedAt;
  if(s.pump) sess.pump = s.pump;
  markWorkoutDay();
  touchStreak();
  save();
  advanceDay();
  summaryData = null;
  toast('Session locked in','the bar just moved','green');
  setTimeout(backHome, 600);
}

function advanceDay(){
  const m = D.program[S.pos.m];
  const w = m.weeks[S.pos.w];
  if(S.pos.d < w.days.length-1){ S.pos.d++; }
  else if(S.pos.w < m.weeks.length-1){ S.pos.w++; S.pos.d = 0; }
  else if(S.pos.m < D.program.length-1){ S.pos.m++; S.pos.w = 0; S.pos.d = 0; }
  save();
}

/* ============ TRAVEL CIRCUITS ============ */

const CIRCUITS = {
  A: { name:'The Hotel Sweat', groups:['A1','A2','A3','A4','A5'] },
  B: { name:'The Quick Burn',  groups:['B1','B2','B3','B4','B5'] }
};
let circuitChecks = {};
let timers = {};

function openCircuit(id){ activeCircuit = id; circuitChecks = {}; clearAllTimers(); timers = {}; view = 'circuit'; render(); window.scrollTo(0,0); }
function clearAllTimers(){ Object.values(timers).forEach(t => { if(t && t.interval) clearInterval(t.interval); }); }

function renderCircuit(){
  const c = CIRCUITS[activeCircuit];
  const exs = D.extras[0].exercises.filter(e => c.groups.indexOf(e.group) !== -1);
  let moves = '';
  exs.forEach((e,i) => {
    const done = circuitChecks[i];
    const spec = e.spec || {};
    const specLabel = spec.sec ? spec.label : (spec.reps || '');
    const meta = META[e.name];
    let right = '';
    if(spec.sec){
      const t = timers[i];
      let label, cls = '';
      if(t && t.finished){ label = 'Done ✓'; cls = 'done'; }
      else if(t && t.running){ label = t.remaining+'s'+(spec.perSide?(' · '+(t.side===1?'L':'R')):''); cls = 'running'; }
      else if(t && t.remaining !== undefined && t.remaining < spec.sec){ label = 'Resume'; }
      else label = spec.perSide ? 'Start L' : 'Start';
      right = `<button id="tbtn${i}" class="timer-btn ${cls}" onclick="event.stopPropagation();tapTimer(${i},${spec.sec},${spec.perSide?1:0})">${label}</button>`;
    }
    moves += `<div class="move ${done?'done':''}">
      <button class="move-check" style="background:none" onclick="toggleMove(${i})">${done?'✓':''}</button>
      <div class="move-body" onclick="toggleMove(${i})">
        <div class="move-grp">${e.group}</div>
        <div class="move-name">${esc(e.name)}</div>
        <div class="move-spec">${esc(specLabel)}</div>
      </div>
      ${right}</div>
      ${meta ? `<button class="cue-btn cue-inline" onclick="toggleCue('c'+${i})">Form cue</button>
      <div class="cue-panel hidden" id="cuec${i}">
        <div class="cue-muscle">Feel it in: <b>${esc(meta[0])}</b></div>
        <div class="cue-text">${esc(meta[1])}</div></div>` : ''}`;
  });
  const doneCount = Object.values(circuitChecks).filter(Boolean).length;
  document.getElementById('app').innerHTML = `
    <div class="shead"><button class="back" onclick="exitCircuit()">← Exit</button>
      <div class="shead-meta">Travel · Bodyweight</div></div>
    <div class="stitle" style="color:var(--warn)">${c.name}</div>
    <div class="travel-intro">Hit each one. Rep movements: tap to check off. Timed holds: tap the timer.</div>
    ${moves}
    <div style="height:90px"></div>
    <div class="finish-bar"><button class="btn-primary" style="background:var(--warn);color:#1c1304" onclick="finishCircuit()">
      ${doneCount===exs.length?'Mark circuit done ✓':'Finish circuit ('+doneCount+'/'+exs.length+')'}</button></div>`;
}

function tapTimer(i, sec, perSide){
  let t = timers[i];
  if(t && t.running){ clearInterval(t.interval); t.running = false; renderCircuit(); return; }
  if(!t || t.finished){ t = { remaining:sec, side:1, running:false, finished:false }; timers[i] = t; }
  t.running = true;
  if(t.remaining === undefined) t.remaining = sec;
  t.interval = setInterval(() => {
    t.remaining--;
    if(t.remaining <= 0){
      clearInterval(t.interval); t.running = false;
      if(perSide && t.side === 1){ t.side = 2; t.remaining = sec; buzz(); renderCircuit(); return; }
      t.finished = true; circuitChecks[i] = true; buzz(); renderCircuit(); return;
    }
    const btn = document.getElementById('tbtn'+i);
    if(btn) btn.textContent = t.remaining+'s'+(perSide?(' · '+(t.side===1?'L':'R')):'');
  }, 1000);
  renderCircuit();
}
function buzz(){ if(navigator.vibrate) navigator.vibrate(200); }
function toggleMove(i){ circuitChecks[i] = !circuitChecks[i]; renderCircuit(); }
function exitCircuit(){ clearAllTimers(); mode = 'travel'; view = 'home'; render(); window.scrollTo(0,0); }
function finishCircuit(){
  clearAllTimers();
  const dy = dayObj(); dy.travel = true; S.travelDone[today()] = activeCircuit;
  touchStreak(); save();
  toast('Circuit complete','streak kept alive','green');
  setTimeout(() => { mode = 'program'; backHome(); }, 700);
}

/* ============ HISTORY ============ */

function openHistory(){ view = 'history'; render(); window.scrollTo(0,0); }

function renderHistory(){
  const entries = [];
  D.program.forEach((m,mi) => m.weeks.forEach((w,wi) => w.days.forEach((dd,di) => {
    const key = mi+'-'+wi+'-'+di;
    const sess = S.sessions[key];
    if(sess && (sess.done || Object.keys(sess.logged||{}).length)) entries.push({ mi,wi,di,m,w,dd,sess,key });
  })));
  entries.sort((a,b) => (b.sess.finishedAt||b.sess.startedAt||0) - (a.sess.finishedAt||a.sess.startedAt||0));

  let body;
  if(!entries.length){
    body = `<div class="hist-empty">No sessions logged yet.<br>Finish a workout and it shows up here.</div>`;
  } else {
    body = '';
    entries.forEach(e => {
      let exLines = '';
      let total = 0;
      Object.keys(e.sess.logged||{}).forEach(name => {
        const sets = e.sess.logged[name];
        const str = sets.map(s => setStr(name, s)).join(', ');
        sets.forEach(s => total += setWork(name, s));
        exLines += `<div class="hist-ex"><span class="hist-ex-name">${esc(name)}</span><span class="hist-ex-sets">${esc(str)}</span></div>`;
      });
      if(!exLines) exLines = `<div class="hist-ex"><span class="hist-ex-name" style="color:var(--dim)">Marked done, no sets logged</span></div>`;
      const st = e.sess.startedAt, fi = e.sess.finishedAt;
      const dateLine = st ? new Date(st).toLocaleDateString('en-US',{month:'short',day:'numeric'}) : '';
      const timeLine = st ? fmtTimeOfDay(st) + (fi ? ' · ' + fmtMinutes(fi-st) : '') : (e.sess.done ? '✓ complete' : 'in progress');
      body += `<div class="hist-card">
        <div class="hist-head">
          <div class="hist-day">M${e.m.index} W${e.w.week} · Day ${e.dd.day}</div>
          <div class="hist-when">${dateLine}${dateLine?' · ':''}${timeLine}</div>
        </div>
        <div class="hist-sub">${total?fmt(total)+' total work':''}${e.sess.pump?' · pump '+e.sess.pump+'/10':''}</div>
        ${exLines}</div>`;
    });
  }
  document.getElementById('app').innerHTML = `
    <div class="shead"><button class="back" onclick="backHome()">← Back</button>
      <div class="shead-meta">Your Workout Log</div></div>
    <div class="stitle">History</div>
    ${body}
    <div style="height:40px"></div>`;
}

/* ============ CALENDAR ============ */

let calMonth = null;
function openCalendar(){ const n = new Date(); calMonth = { y:n.getFullYear(), m:n.getMonth() }; view = 'calendar'; render(); window.scrollTo(0,0); }
function calShift(dd){ let mo = calMonth.m+dd, y = calMonth.y; if(mo<0){ mo=11; y--; } if(mo>11){ mo=0; y++; } calMonth = { y, m:mo }; render(); }

function renderCalendar(){
  const { y, m } = calMonth;
  const first = new Date(y,m,1);
  const startDow = first.getDay();
  const daysInMonth = new Date(y,m+1,0).getDate();
  const monthName = first.toLocaleDateString('en-US',{month:'long',year:'numeric'});
  const todayStr = today();

  let gymCount = 0, cells = '';
  ['S','M','T','W','T','F','S'].forEach(d => cells += `<div class="cal-dow">${d}</div>`);
  for(let i=0;i<startDow;i++) cells += `<div class="cal-cell empty"></div>`;
  for(let day=1; day<=daysInMonth; day++){
    const ds = `${y}-${String(m+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const act = S.daily[ds] || {};
    let cls = '';
    if(act.workout){ cls = 'gym'; gymCount++; }
    else if(act.travel) cls = 'travel';
    else if(act.rest) cls = 'rest';
    cells += `<div class="cal-cell ${cls} ${ds===todayStr?'today':''}"><span>${day}</span><span class="cal-dot"></span></div>`;
  }

  document.getElementById('app').innerHTML = `
    <div class="shead"><button class="back" onclick="backHome()">← Back</button>
      <div class="shead-meta">Activity Calendar</div></div>
    <div class="stitle">🔥 ${liveStreak()} day streak</div>
    <div class="cal-card">
      <div class="cal-head">
        <button class="cal-nav" onclick="calShift(-1)">‹</button>
        <div class="cal-month">${monthName}</div>
        <button class="cal-nav" onclick="calShift(1)">›</button>
      </div>
      <div class="cal-grid">${cells}</div>
      <div class="cal-legend">
        <div class="cal-leg"><span class="cal-leg-dot" style="background:var(--win)"></span>Gym</div>
        <div class="cal-leg"><span class="cal-leg-dot" style="background:var(--warn)"></span>Travel</div>
        <div class="cal-leg"><span class="cal-leg-dot" style="background:var(--hold)"></span>Rest</div>
      </div>
    </div>
    <div class="cal-card" style="text-align:center;padding:16px">
      <div style="font-family:'Barlow Condensed',sans-serif;font-weight:800;font-size:28px;line-height:1">${gymCount}</div>
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:.12em;color:var(--muted);margin-top:3px">Gym sessions in ${first.toLocaleDateString('en-US',{month:'long'})}</div>
    </div>
    <div style="height:40px"></div>`;
}

/* ============ BODYWEIGHT GRAPH ============ */

function openBWGraph(){ view = 'bwgraph'; render(); window.scrollTo(0,0); }

function renderBWGraph(){
  const arr = S.bw.slice();
  let body;
  if(!arr.length){
    body = `<div class="hist-empty">No bodyweight logged yet.<br>Tap "Log +" on the home screen to start.</div>`;
  } else {
    const vals = arr.map(e => e.lb);
    const min = Math.min(...vals), max = Math.max(...vals);
    const latest = vals[vals.length-1], firstV = vals[0];
    const diff = latest - firstV;
    const pad = (max-min)*0.15 || 2;
    const lo = min-pad, hi = max+pad;
    const W = 300, H = 160;
    let pts, path = '', dots = '';
    if(arr.length === 1) pts = [[W/2, H/2]];
    else pts = arr.map((e,i) => [ (i/(arr.length-1))*W, H - ((e.lb-lo)/(hi-lo))*H ]);
    pts.forEach((p,i) => {
      path += (i===0?'M':'L')+p[0].toFixed(1)+' '+p[1].toFixed(1)+' ';
      dots += `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3.5" fill="var(--win)"/>`;
    });
    const area = pts.length>1 ? `<path d="${path} L ${W} ${H} L 0 ${H} Z" fill="url(#bwgrad)" opacity="0.18"/>` : '';
    const trendCls = diff<-0.05?'down':(diff>0.05?'up':'flat');
    const trendStr = Math.abs(diff)<0.05 ? '—' : (diff<0?'▼ '+Math.abs(diff).toFixed(1):'▲ '+diff.toFixed(1));

    let logRows = '';
    arr.slice().reverse().forEach(e => {
      const dt = new Date(e.date+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'});
      logRows += `<div class="glog-row"><span class="glog-date">${dt}</span><span class="glog-val">${e.lb} lb</span></div>`;
    });

    body = `
      <div class="graph-card">
        <div class="graph-stats">
          <div class="gstat"><div class="gstat-num">${latest}</div><div class="gstat-lbl">Current lb</div></div>
          <div class="gstat"><div class="gstat-num bw-trend ${trendCls}" style="font-size:24px">${trendStr}</div><div class="gstat-lbl">Since start</div></div>
          <div class="gstat"><div class="gstat-num">${arr.length}</div><div class="gstat-lbl">Entries</div></div>
        </div>
        <svg width="100%" viewBox="-6 -10 ${W+12} ${H+24}" style="overflow:visible">
          <defs><linearGradient id="bwgrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="var(--win)"/><stop offset="100%" stop-color="var(--win)" stop-opacity="0"/></linearGradient></defs>
          ${area}
          <path d="${path}" fill="none" stroke="var(--win)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
          ${dots}
          <text x="0" y="${H+18}" fill="var(--dim)" font-size="10">${new Date(arr[0].date+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'})}</text>
          <text x="${W}" y="${H+18}" fill="var(--dim)" font-size="10" text-anchor="end">${new Date(arr[arr.length-1].date+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'})}</text>
        </svg>
      </div>
      <div class="sect-label">All Entries</div>
      <div class="graph-card" style="padding:6px 16px">${logRows}</div>`;
  }
  document.getElementById('app').innerHTML = `
    <div class="shead"><button class="back" onclick="backHome()">← Back</button>
      <div class="shead-meta">Bodyweight Trend</div></div>
    <div class="stitle">Bodyweight</div>
    ${body}
    <button class="btn-primary" style="margin-top:8px" onclick="logBW()">Log today's weight +</button>
    <div style="height:40px"></div>`;
}

/* ============ EXPORT / IMPORT ============ */

function exportData(){
  closeSync();
  const payload = { app:'YouVsYou', version:2, exported_at:new Date().toISOString(), state:S };
  const blob = new Blob([JSON.stringify(payload,null,2)], { type:'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'YouVsYou-backup-'+new Date().toISOString().slice(0,10)+'.json';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('Backup downloaded','keep it somewhere safe','green');
}

function triggerImport(){
  closeSync();
  const el = document.getElementById('importFile');
  if(el) el.click();
}

function handleImport(evt){
  const file = evt.target.files && evt.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try{
      const parsed = JSON.parse(reader.result);
      const incoming = parsed.state || parsed;
      if(!incoming || typeof incoming !== 'object' || !incoming.sessions) throw new Error('not a YouVsYou backup');
      confirmImport(incoming);
    }catch(e){
      toast('That file will not load','not a valid backup','peak');
    }
    evt.target.value = '';
  };
  reader.readAsText(file);
}

function confirmImport(incoming){
  const count = Object.keys(incoming.sessions || {}).length;
  const m = document.createElement('div');
  m.className = 'modal-bg'; m.id = 'impModal';
  m.innerHTML = `<div class="modal">
    <div class="modal-title">Restore this backup?</div>
    <div class="modal-sub">${count} sessions, ${(incoming.bw||[]).length} bodyweight entries. This replaces everything currently in the app and pushes the result to the server.</div>
    <div class="modal-row">
      <button class="modal-btn cancel" onclick="closeImp()">Cancel</button>
      <button class="modal-btn save" onclick="doImport()">Restore</button>
    </div></div>`;
  document.body.appendChild(m);
  window.__pendingImport = incoming;
  m.addEventListener('click', e => { if(e.target === m) closeImp(); });
}
function closeImp(){ const m = document.getElementById('impModal'); if(m) m.remove(); window.__pendingImport = null; }
function doImport(){
  const incoming = window.__pendingImport;
  if(!incoming) return closeImp();
  S = Object.assign(blankState(), incoming);
  closeImp();
  save();
  pushRemote();
  render();
  toast('Backup restored','your numbers are back','green');
}

/* ============ TOAST ============ */

let toastTimer = null;
function toast(main, sub, kind){
  const t = document.getElementById('toast');
  if(!t) return;
  t.className = 'toast show ' + (kind || '');
  t.innerHTML = esc(main) + (sub ? '<small>'+esc(sub)+'</small>' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
}

/* ============ BOOT ============ */

/* Push any pending write the moment the app goes to the background or closes.
   Saves are debounced, so without this the last change waits for the next
   launch to reach the server. Listening on document because Safari has been
   unreliable delivering visibilitychange on window. */
function flushPending(){
  if(!pass || offlineMode) return;
  clearTimeout(saveTimer);
  pushRemote();
}

document.addEventListener('visibilitychange', () => {
  if(document.visibilityState === 'hidden') flushPending();
  else if(pass && !offlineMode && (syncStatus === 'offline' || syncStatus === 'saving')) pushRemote();
});
window.addEventListener('pagehide', flushPending);

if(!pass){
  view = 'gate';
  render();
} else {
  render();
  bootSync();
}

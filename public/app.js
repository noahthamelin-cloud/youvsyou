/* ============================================================
   You vs You - v3
   Personal workout tracker.

   v3 adds: multiple programs (7-Month Foundation + PPL 8-Day),
   kg/lb units with live conversion, guided timed circuits,
   cardio logging, macro logging, and a sync diagnostics screen.

   Core engine lives here. Timed circuits are in app-circuits.js,
   cardio/macros/history/graphs are in app-extras.js.
   See MANUAL.md for the plain-language guide.
   ============================================================ */

const LOCAL_KEY = 'yvy_state_v2';   // kept: v3 migrates in place
const PASS_KEY  = 'yvy_pass';
const API       = '/api/state';
const HEALTH    = '/api/health';

const D    = window.WORKOUT_DATA;
const META = window.EX_META || {};
const REP_ONLY_DEFAULTS = window.REP_ONLY_DEFAULTS || [];
const PPL  = window.PPL_PROGRAM;
const CIRCUITS = window.CIRCUITS || {};

const LB_PER_KG = 2.2046226218;

/* ============ PROGRAM REGISTRY ============ */

const PROGRAMS = {
  foundation: {
    id:'foundation', kind:'blocks',
    title:'7-Month Foundation', short:'Foundation',
    blurb:'The original four-day block program. Foundation, hypertrophy, strength.'
  },
  ppl: {
    id:'ppl', kind:'cycle',
    title: PPL.title, short: PPL.short, blurb: PPL.blurb
  }
};

/* ============ STATE ============ */

function blankState(){
  return {
    v: 3,
    program: 'ppl',
    units: 'lb',
    pos: { foundation:{ m:0, w:3, d:0 }, ppl:{ d:0 } },
    sessions: {},
    daily: {},
    bw: [{ date:'2026-06-20', lb:210 }],
    cardio: [],
    macros: {},
    circuits: {},
    streak: 0,
    lastStreakDate: null,
    travelDone: {},
    repOnly: {},
    updatedAt: 0
  };
}

/* Brings any older saved state up to the v3 shape without losing anything. */
function migrate(s){
  if(!s || typeof s !== 'object') return blankState();
  const base = blankState();
  if(!s.v || s.v < 3){
    const legacyPos = s.pos && typeof s.pos.m === 'number' ? s.pos : { m:0, w:3, d:0 };
    s.pos = { foundation: legacyPos, ppl:{ d:0 } };
    s.program = 'ppl';          // PPL Day 1 is the new starting point
    s.units = s.units || 'lb';
    s.cardio = s.cardio || [];
    s.macros = s.macros || {};
    s.circuits = s.circuits || {};
    s.v = 3;
  }
  const out = Object.assign(base, s);
  // guard against a half-written pos from any older build
  if(!out.pos || !out.pos.foundation) out.pos = base.pos;
  if(!out.pos.ppl) out.pos.ppl = { d:0 };
  return out;
}

function loadLocal(){
  try{
    const raw = localStorage.getItem(LOCAL_KEY);
    if(raw) return migrate(JSON.parse(raw));
  }catch(e){}
  return blankState();
}

let S = loadLocal();
let pass = '';
try { pass = localStorage.getItem(PASS_KEY) || ''; } catch(e){}

/* ============ SYNC ============ */

let syncStatus = 'idle';
let saveTimer = null;
let lastSavedAt = null;
let lastSyncError = null;   // kept for the diagnostics screen
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
    offline: ['⚠','Not synced','var(--warn)'],
    locked:  ['🔒','Local only','var(--dim)']
  };
  const [icon,label,color] = map[syncStatus] || map.idle;
  return `<button id="cloudBadge" class="cloud" style="color:${color}" onclick="openSyncMenu()">
    <span class="cloud-dot">${icon}</span><span class="cloud-txt">${label}</span></button>`;
}

function localSave(){
  try{ localStorage.setItem(LOCAL_KEY, JSON.stringify(S)); }catch(e){}
}

function save(){
  S.updatedAt = Date.now();
  localSave();
  if(!pass || offlineMode){ setSync('locked'); return; }
  setSync('saving');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(pushRemote, 1200);
}

/* Records exactly what went wrong so the diagnostics screen can show it. */
function noteError(where, status, detail){
  lastSyncError = { where, status, detail: String(detail || '').slice(0, 600), at: Date.now() };
}

async function pushRemote(){
  if(!pass || offlineMode) return;
  try{
    const res = await fetch(API, {
      method:'PUT',
      headers:{ 'content-type':'application/json', 'x-yvy-pass':pass },
      body: JSON.stringify(S)
    });
    if(res.status === 401){
      noteError('save', 401, 'Passcode rejected by the server.');
      setSync('offline'); toast('Wrong passcode','tap the badge to fix','peak'); return;
    }
    if(!res.ok){
      const body = await res.text().catch(()=> '');
      noteError('save', res.status, body);
      throw new Error('status '+res.status);
    }
    const j = await res.json();
    lastSavedAt = j.savedAt;
    lastSyncError = null;
    setSync('saved');
  }catch(e){
    if(!lastSyncError) noteError('save', 0, e && e.message);
    setSync('offline');
  }
}

async function pullRemote(){
  if(!pass || offlineMode) return { ok:false, reason:'no-pass' };
  setSync('loading');
  try{
    const res = await fetch(API, { headers:{ 'x-yvy-pass':pass } });
    if(res.status === 401){ noteError('load', 401, 'Passcode rejected by the server.'); return { ok:false, reason:'unauthorized' }; }
    if(!res.ok){
      const body = await res.text().catch(()=> '');
      noteError('load', res.status, body);
      throw new Error('status '+res.status);
    }
    const j = await res.json();
    lastSyncError = null;
    setSync('saved');
    return { ok:true, state: j.state };
  }catch(e){
    if(!lastSyncError) noteError('load', 0, e && e.message);
    setSync('offline');
    return { ok:false, reason:'network' };
  }
}

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
    S = migrate(remote);
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
function dayStr(back){
  const x = new Date(Date.now() - back*86400000);
  return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0');
}
function dayObj(){ const t = today(); S.daily[t] = S.daily[t] || {}; return S.daily[t]; }
function fmt(n){ return Math.round(n).toLocaleString(); }
function esc(s){ return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function fmtClock(ms){
  const s = Math.max(0, Math.floor(ms/1000));
  const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sec = s%60;
  if(h) return h+':'+String(m).padStart(2,'0')+':'+String(sec).padStart(2,'0');
  return m+':'+String(sec).padStart(2,'0');
}
function fmtTimeOfDay(ts){ return new Date(ts).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}); }
function fmtMinutes(ms){
  const min = Math.round(ms/60000);
  if(min < 60) return min+' min';
  return Math.floor(min/60)+'h '+(min%60)+'m';
}
function minRep(target){
  if(!target) return null;
  let t = (''+target).toLowerCase().trim();
  if(t === 'amrap') return null;
  t = t.split('/')[0].trim();
  let mm = t.match(/^(\d+)\s*-\s*(\d+)$/); if(mm) return parseInt(mm[1]);
  mm = t.match(/^(\d+)$/); if(mm) return parseInt(mm[1]);
  return null;
}

/* ============ UNITS ============ */

function unit(){ return S.units === 'kg' ? 'kg' : 'lb'; }
function other(){ return unit() === 'kg' ? 'lb' : 'kg'; }
function toLb(v, u){ return u === 'kg' ? v * LB_PER_KG : v; }
function fromLb(lb, u){ return u === 'kg' ? lb / LB_PER_KG : lb; }
function roundFor(v, u){ return u === 'kg' ? Math.round(v*10)/10 : Math.round(v*2)/2; }

/* Canonical weight of a stored set, always in pounds. */
function setLb(s){
  if(!s || s.w == null || isNaN(s.w)) return 0;
  return toLb(Number(s.w), s.u === 'kg' ? 'kg' : 'lb');
}
/* A pound figure shown in the user's chosen unit. */
function dispW(lb){ return roundFor(fromLb(lb, unit()), unit()); }
/* "60 kg · 132 lb" - the conversion line he asked for. */
function bothUnits(lb){
  const a = roundFor(fromLb(lb, unit()), unit());
  const b = roundFor(fromLb(lb, other()), other());
  return a + ' ' + unit() + ' <span class="conv">· ' + b + ' ' + other() + '</span>';
}

function toggleUnits(){
  S.units = unit() === 'kg' ? 'lb' : 'kg';
  save();
  render();
  toast('Now showing ' + unit().toUpperCase(), 'all weights converted', 'green');
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

/* Work for one set. Weighted: pounds x reps. Rep-only: reps. */
function setWork(name, s){
  const reps = (!s || s.r == null || isNaN(s.r) || s.r <= 0) ? 0 : Number(s.r);
  if(isRepOnly(name)) return reps;
  const lb = setLb(s);
  if(lb <= 0) return 0;
  return lb * (reps || 1);
}
function setStr(name, s){
  if(!s) return '';
  if(isRepOnly(name)) return (s.r || 0) + ' reps';
  const u = s.u === 'kg' ? 'kg' : 'lb';
  const shown = roundFor(fromLb(setLb(s), unit()), unit());
  return shown + ' ' + unit() + (s.r ? ' x ' + s.r : '');
}

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

/* Reads real session history first, falls back to the old spreadsheet seed.
   History is global by exercise name, so a lift shared between the Foundation
   program and PPL keeps one continuous record. */
function targetFor(name, excludeKey){
  const hist = loggedHistory(name, excludeKey);
  const repMode = isRepOnly(name);
  const seed = repMode ? null : (D.byExercise[name] || null);

  let work = 0, str = '', inferred = false, peak = 0, peakStr = '', source = 'none';

  if(hist.length){
    const last = hist[hist.length - 1];
    work = last.work;
    str = setStr(name, last.set);
    source = 'app';
    hist.forEach(h => { if(h.work > peak){ peak = h.work; peakStr = setStr(name, h.set); } });
  } else if(seed && seed.bestWork > 0){
    work = seed.bestWork;
    str = seedStr(seed.bestStr, seed.bestWork);
    inferred = !!seed.anyInferred;
    source = 'seed';
    peak = seed.peakWork;
    peakStr = seedStr(seed.peakStr, seed.peakWork);
  }
  if(seed && seed.peakWork > peak){ peak = seed.peakWork; peakStr = seedStr(seed.peakStr, seed.peakWork); }

  return { work, str, inferred, peak, peakStr, source, sessions: hist.length, repMode };
}

/* Old spreadsheet strings are pounds. Re-render them in the chosen unit. */
function seedStr(str, work){
  if(!str) return '';
  const m = (''+str).match(/^([\d.]+)\s*x\s*([\d.]+)$/i);
  if(!m) return str;
  const lb = parseFloat(m[1]);
  return roundFor(fromLb(lb, unit()), unit()) + ' ' + unit() + ' x ' + m[2];
}

/* ============ PROGRAM ACCESS ============ */

function prog(){ return PROGRAMS[S.program] ? S.program : 'ppl'; }

/* One shape for today's work, whichever program is active. */
function curDay(){
  if(prog() === 'ppl'){
    const i = Math.min(Math.max(S.pos.ppl.d|0, 0), PPL.days.length-1);
    const d = PPL.days[i];
    return {
      progId:'ppl', idx:i,
      title: d.name,
      label: 'Day ' + d.n + ' · ' + d.focus,
      sub: PPL.short + ' · Day ' + d.n + ' of 8',
      emphasis: d.emphasis,
      priority: d.priority,
      circuit: d.circuit || null,
      cardio: d.cardio || null,
      exercises: d.exercises || []
    };
  }
  const m = D.program[S.pos.foundation.m];
  const w = m.weeks[S.pos.foundation.w];
  const d = w.days[S.pos.foundation.d];
  return {
    progId:'foundation', idx:S.pos.foundation.d,
    title: 'Day ' + d.day,
    label: m.phase + ' · Week ' + w.week + ' · Day ' + d.day,
    sub: 'Month ' + m.index + ' of 7 · Week ' + w.week,
    emphasis: 'program',
    priority: '',
    circuit: null, cardio: null,
    exercises: d.exercises.map(e => Object.assign({ sets:3 }, e))
  };
}

function sessionKey(){
  if(prog() === 'ppl') return 'ppl:' + (S.pos.ppl.d|0) + ':' + today();
  const p = S.pos.foundation;
  return p.m + '-' + p.w + '-' + p.d;
}

function advanceDay(){
  if(prog() === 'ppl'){
    S.pos.ppl.d = ((S.pos.ppl.d|0) + 1) % PPL.days.length;
    save();
    return;
  }
  const p = S.pos.foundation;
  const m = D.program[p.m];
  const w = m.weeks[p.w];
  if(p.d < w.days.length-1){ p.d++; }
  else if(p.w < m.weeks.length-1){ p.w++; p.d = 0; }
  else if(p.m < D.program.length-1){ p.m++; p.w = 0; p.d = 0; }
  save();
}

function switchProgram(id){
  if(!PROGRAMS[id]) return;
  S.program = id;
  save();
  closeProgramMenu();
  render();
  toast(PROGRAMS[id].short + ' active', PROGRAMS[id].blurb, 'green');
}

/* ============ ROUTER ============ */

let view = 'home';
let summaryData = null;

function render(){
  if(view === 'gate') return renderGate();
  stopSessionClock();
  if(view === 'home') renderHome();
  else if(view === 'session') renderSession();
  else if(view === 'summary') renderSummary();
  else if(view === 'circuit') renderCircuit();
  else if(view === 'circuitList') renderCircuitList();
  else if(view === 'circuitDone') renderCircuitDone();
  else if(view === 'cardio') renderCardio();
  else if(view === 'macros') renderMacros();
  else if(view === 'history') renderHistory();
  else if(view === 'bwgraph') renderBWGraph();
  else if(view === 'calendar') renderCalendar();
  else if(view === 'settings') renderSettings();
  else if(view === 'diag') renderDiagnostics();
}

function go(v){ view = v; render(); window.scrollTo(0,0); }
function backHome(){ stopSessionClock(); view = 'home'; render(); window.scrollTo(0,0); }

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
      <button class="mini-link" onclick="go('diag')">Sync not working? Run diagnostics →</button>
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
    if(remote && (remote.updatedAt || 0) >= (S.updatedAt || 0)){ S = migrate(remote); localSave(); }
    else { await pushRemote(); }
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
  const warn = lastSyncError
    ? `<div class="diag-warn">Last error: ${esc(lastSyncError.where)} returned ${esc(String(lastSyncError.status||'no response'))}</div>` : '';
  m.innerHTML = `<div class="modal">
    <div class="modal-title">Your data</div>
    <div class="modal-sub">Last server save: ${stamp}<br>${offlineMode || !pass ? 'This device is saving locally only.' : 'Syncing to the server on every change.'}</div>
    ${warn}
    <button class="modal-btn save" style="width:100%;margin-bottom:9px" onclick="forcePush()">Push this device to the server</button>
    <button class="modal-btn cancel" style="width:100%;margin-bottom:9px" onclick="forcePull()">Pull the server copy down</button>
    <button class="modal-btn cancel" style="width:100%;margin-bottom:9px" onclick="closeSync();go('diag')">Run sync diagnostics</button>
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
  if(r.ok && r.state){ S = migrate(r.state); localSave(); render(); toast('Pulled from server','server copy loaded','green'); }
  else toast('Nothing to pull','server has no copy yet','peak');
}
function changePass(){ closeSync(); try{ localStorage.removeItem(PASS_KEY); }catch(e){} pass=''; view='gate'; render(); }

/* ============ DIAGNOSTICS ============
   Turns "it isn't syncing" into a line you can read off the screen. */

let diagResult = null;

function renderDiagnostics(){
  const r = diagResult;
  let body;
  if(!r){
    body = `<div class="diag-card"><div class="diag-idle">Tap below and the app will call the server, then print exactly what came back.</div></div>`;
  } else {
    body = r.lines.map(l => `
      <div class="diag-row ${l.ok===true?'good':(l.ok===false?'bad':'')}">
        <div class="diag-k">${esc(l.k)}</div>
        <div class="diag-v">${esc(l.v)}</div>
      </div>`).join('');
    body = `<div class="diag-card">${body}</div>
      <div class="sect-label">What it means</div>
      <div class="diag-card"><div class="diag-verdict">${r.verdict}</div></div>`;
  }
  document.getElementById('app').innerHTML = `
    <div class="shead"><button class="back" onclick="backHome()">← Back</button>
      <div class="shead-meta">Sync Diagnostics</div></div>
    <div class="stitle">Diagnostics</div>
    ${body}
    <button class="btn-primary" style="margin-top:14px" onclick="runDiagnostics()">${r?'Run again':'Run the check'}</button>
    <button class="mini-link" onclick="copyDiag()">Copy the result as text</button>
    <div style="height:40px"></div>`;
}

async function runDiagnostics(){
  const lines = [];
  const add = (k,v,ok)=>lines.push({k,v,ok});
  add('App origin', location.origin, null);
  add('Passcode on device', pass ? 'yes' : 'no', !!pass);
  add('Local sessions', String(Object.keys(S.sessions).length), null);

  // 1. is the function deployed at all?
  let healthOk = false, fnDeployed = false;
  try{
    const res = await fetch(HEALTH, { cache:'no-store' });
    const ct = res.headers.get('content-type') || '';
    add('GET /api/health', res.status + ' ' + (ct.split(';')[0] || 'no content-type'), res.ok);
    if(ct.indexOf('json') === -1){
      add('Health response', 'HTML, not JSON. The function is not deployed at this path.', false);
    } else {
      fnDeployed = true;
      const j = await res.json();
      add('Passcode env var set', j.passcodeSet ? 'yes' : 'NO', !!j.passcodeSet);
      add('Blobs store reachable', j.blobsOk ? 'yes' : 'NO', !!j.blobsOk);
      if(j.blobsError) add('Blobs error', j.blobsError, false);
      add('Function runtime', j.node || 'unknown', null);
      healthOk = !!j.passcodeSet && !!j.blobsOk;
    }
  }catch(e){
    add('GET /api/health', 'request failed: ' + (e && e.message), false);
  }

  // 2. does the real endpoint accept this passcode?
  if(pass){
    try{
      const res = await fetch(API, { headers:{ 'x-yvy-pass':pass }, cache:'no-store' });
      const ct = res.headers.get('content-type') || '';
      add('GET /api/state', res.status + ' ' + (ct.split(';')[0] || 'no content-type'), res.ok);
      const txt = await res.text();
      if(res.ok && ct.indexOf('json') !== -1){
        const j = JSON.parse(txt);
        const n = j.state ? Object.keys(j.state.sessions || {}).length : 0;
        add('Sessions on server', String(n), true);
        add('Server last saved', j.state && j.state.savedAt ? j.state.savedAt : 'never', null);
      } else {
        add('Response body', txt.slice(0,200), false);
      }
    }catch(e){
      add('GET /api/state', 'request failed: ' + (e && e.message), false);
    }
  }

  if(lastSyncError){
    add('Last sync error', lastSyncError.where + ' → ' + (lastSyncError.status || 'no response'), false);
    if(lastSyncError.detail) add('Error detail', lastSyncError.detail.slice(0,200), false);
  }

  // verdict
  const bad = lines.filter(l => l.ok === false);
  let verdict;
  if(!bad.length){
    verdict = 'Everything checks out. The server is reachable, the passcode is accepted, and your data is stored. If a second phone is out of date, open the data menu there and pull the server copy down.';
  } else if(!fnDeployed){
    verdict = 'The function is not responding as JSON, which means <b>/api/state was never deployed</b>. In Netlify check that the functions directory is <b>netlify/functions</b> and that it sits <b>outside</b> the publish directory. Then redeploy.';
  } else if(lines.some(l => l.k==='Passcode env var set' && l.ok===false)){
    verdict = 'The function is live but <b>YVY_PASSCODE is not set</b>. Add it in Netlify under Site configuration → Environment variables, then trigger a fresh deploy so the function picks it up.';
  } else if(lines.some(l => l.k==='Blobs store reachable' && l.ok===false)){
    verdict = 'The function is live and the passcode is set, but <b>Netlify Blobs is not available</b>. That is usually an old @netlify/blobs version or blobs not being enabled for the site. The error line above says which.';
  } else {
    verdict = 'Something in the chain failed. The red lines above are the ones to act on.';
  }
  diagResult = { lines, verdict, at: Date.now() };
  render();
}

function copyDiag(){
  if(!diagResult) return toast('Run the check first','nothing to copy','peak');
  const txt = diagResult.lines.map(l => l.k + ': ' + l.v).join('\n');
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(txt).then(
      ()=>toast('Copied','paste it anywhere','green'),
      ()=>toast('Could not copy','read it off the screen','peak'));
  } else toast('Could not copy','read it off the screen','peak');
}

/* ============ HOME ============ */

function renderHome(){
  const cd = curDay();
  const P = PROGRAMS[prog()];
  const dateStr  = new Date().toLocaleDateString('en-US',{weekday:'long'});
  const dateMain = new Date().toLocaleDateString('en-US',{month:'long',day:'numeric'});
  const dy = dayObj();
  const key = sessionKey();
  const sessDone = S.sessions[key] && S.sessions[key].done;

  document.getElementById('app').innerHTML = `
    <div class="topbar">
      <div><div class="eyebrow">${dateStr}</div><div class="date-main">${dateMain}</div></div>
      <div class="top-right">
        ${cloudBadge()}
        <button class="streak" onclick="go('calendar')"><span class="streak-flame">🔥</span><div>
          <div class="streak-num">${liveStreak()}</div><div class="streak-label">Day streak</div></div></button>
      </div>
    </div>

    <button class="prog-strip" style="width:100%;text-align:left;border:1px solid var(--line)" onclick="openProgramMenu()">
      <div class="prog-top"><div class="prog-title">${esc(P.title)}</div><div class="prog-pct">Switch</div></div>
      ${progressBar()}
      <div class="prog-sub">${esc(cd.sub)} · tap to change program or day</div>
    </button>

    ${todayCard(cd, sessDone)}

    <div class="sect-label">Quick Log</div>
    <div class="tile-row">
      <button class="tile core" onclick="go('circuitList')">
        <div class="tile-ico">◴</div><div class="tile-name">Core</div>
        <div class="tile-sub">${coreTileSub()}</div></button>
      <button class="tile cardio" onclick="go('cardio')">
        <div class="tile-ico">▲</div><div class="tile-name">Cardio</div>
        <div class="tile-sub">${cardioTileSub()}</div></button>
      <button class="tile macro" onclick="go('macros')">
        <div class="tile-ico">◇</div><div class="tile-name">Macros</div>
        <div class="tile-sub">${macroTileSub()}</div></button>
    </div>

    <div class="sect-label">Daily Check-In</div>
    <div class="checks">
      <div class="check water ${dy.water?'on':''}" onclick="toggleWater()">
        <div class="check-top"><div class="check-q">Drank enough water?</div><div class="check-icon">💧</div></div>
        <div class="check-state">${dy.water?'Locked in ✓':'Tap to log'}</div>
      </div>
      <div class="check">
        <div class="check-top"><div class="check-q">Ate on track?</div><div class="check-icon">🍽️</div></div>
        <div class="track-opts">
          <button class="track-opt ${dy.ate==='yes'?'sel':''}" onclick="setAte('yes')">Yes</button>
          <button class="track-opt ${dy.ate==='close'?'sel':''}" onclick="setAte('close')">Close</button>
          <button class="track-opt ${dy.ate==='no'?'sel':''}" onclick="setAte('no')">No</button>
        </div>
      </div>
    </div>
    <div class="rest-row">
      <button class="rest-btn ${dy.rest?'logged':''}" onclick="toggleRest()">🌿 ${dy.rest?'Active rest logged ✓ — streak safe':'Log active rest day'}</button>
    </div>

    ${bwStrip()}
    <button class="mini-link" onclick="go('history')">View workout log →</button>
    <button class="mini-link" onclick="go('settings')">Settings →</button>
    <div class="footnote">${esc(P.title)} · weights in ${unit().toUpperCase()}<br>
      ${offlineMode||!pass ? 'Local only. Tap the badge up top to connect.' : 'Progress saves to the server on every change.'}</div>
    <input type="file" id="importFile" accept="application/json" class="hidden" onchange="handleImport(event)">
  `;
}

function progressBar(){
  if(prog() === 'ppl'){
    let segs = '';
    PPL.days.forEach((d,i) => {
      const cls = i < S.pos.ppl.d ? 'done' : (i === S.pos.ppl.d ? 'cur' : '');
      const rec = d.emphasis === 'recovery' ? ' rec' : '';
      segs += `<div class="prog-seg ${cls}${rec}"></div>`;
    });
    return `<div class="prog-bar">${segs}</div>`;
  }
  let segs = '';
  D.program.forEach((mm,mi) => {
    const cls = mi < S.pos.foundation.m ? 'done' : (mi === S.pos.foundation.m ? 'cur' : '');
    segs += `<div class="prog-seg ${cls}"></div>`;
  });
  return `<div class="prog-bar">${segs}</div>`;
}

function todayCard(cd, sessDone){
  if(cd.circuit){
    const c = CIRCUITS[cd.circuit];
    const doneToday = (S.circuits[today()]||[]).some(x => x.id === cd.circuit);
    return `
      <div class="sect-label">Today · Recovery Day</div>
      <div class="lift-card rec ${doneToday?'done-card':''}">
        <div class="lift-tag">Day ${cd.label}</div>
        <div class="lift-name">${esc(c.title)}</div>
        <div class="lift-meta">${esc(cd.priority)}</div>
        <button class="btn-primary warn" onclick="startCircuit('${cd.circuit}')">${doneToday?'Run it again →':'Start guided routine →'}</button>
        ${cd.cardio ? `<button class="sub-btn" onclick="go('cardio')">Log cardio · ${esc(cd.cardio.label)}, ${esc(cd.cardio.mins)} min</button>` : ''}
        <button class="sub-btn" onclick="skipToNext()">Skip to the next day →</button>
      </div>`;
  }
  const exCount = cd.exercises.length;
  const first = exCount ? cd.exercises[0].name : '';
  const tag = cd.emphasis === 'strength' ? 'Strength' : (cd.emphasis === 'hypertrophy' ? 'Growth' : '');
  return `
    <div class="sect-label">Today's Session</div>
    <div class="lift-card ${sessDone?'done-card':''}">
      <div class="lift-tag">${esc(cd.label)}${tag?' · '+tag:''}</div>
      <div class="lift-name">${esc(cd.title)}</div>
      <div class="lift-meta">${exCount} lifts · starting with ${esc(first)}</div>
      <button class="btn-primary" onclick="enterSession()">${sessDone?'Review session →':'Enter the session →'}</button>
      ${prog()==='ppl' ? dayPills() : foundationPills()}
    </div>`;
}

function dayPills(){
  let pills = '';
  PPL.days.forEach((d,i) => {
    const cur = i === S.pos.ppl.d;
    const rec = d.emphasis === 'recovery';
    pills += `<button class="day-pill ${cur?'cur':''} ${rec?'rec':''}" onclick="jumpPPL(${i})">
      <span class="dp-day">${rec?'Rec':d.name.replace(' ','')}</span>${d.n}</button>`;
  });
  return `<div class="day-pills wrap">${pills}</div>`;
}
function foundationPills(){
  const p = S.pos.foundation;
  const days = D.program[p.m].weeks[p.w].days;
  let pills = '';
  days.forEach((dd,i) => {
    const done = S.sessions[p.m+'-'+p.w+'-'+i] && S.sessions[p.m+'-'+p.w+'-'+i].done;
    const cur = i === p.d;
    pills += `<button class="day-pill ${cur?'cur':''} ${done?'done':''}" onclick="jumpFoundation(${i})">
      <span class="dp-day">Day ${dd.day}</span>${done?'✓':(cur?'●':'·')}</button>`;
  });
  return `<div class="day-pills">${pills}</div>`;
}

function jumpPPL(i){ S.pos.ppl.d = i; save(); render(); }
function jumpFoundation(i){ S.pos.foundation.d = i; save(); render(); }
function skipToNext(){ advanceDay(); render(); toast('Moved on','next day ready','green'); }

function coreTileSub(){
  const n = (S.circuits[today()]||[]).length;
  return n ? n + ' done today' : 'Guided routine';
}
function cardioTileSub(){
  const t = (S.cardio||[]).filter(c => c.date === today());
  if(t.length) return t.reduce((a,c)=>a+(c.mins||0),0) + ' min today';
  const last = (S.cardio||[])[S.cardio.length-1];
  return last ? 'Last ' + last.mins + ' min' : 'Log a session';
}
function macroTileSub(){
  const m = S.macros[today()];
  if(!m) return 'Nothing logged';
  return (m.kcal||0) + ' kcal · ' + (m.protein||0) + 'g P';
}

/* ============ PROGRAM MENU ============ */

function openProgramMenu(){
  const m = document.createElement('div');
  m.className = 'modal-bg'; m.id = 'progModal';
  const cards = Object.keys(PROGRAMS).map(id => {
    const P = PROGRAMS[id];
    const on = id === prog();
    return `<button class="prog-card ${on?'on':''}" onclick="switchProgram('${id}')">
      <div class="pc-top"><div class="pc-title">${esc(P.title)}</div>${on?'<span class="pc-on">Active</span>':''}</div>
      <div class="pc-sub">${esc(P.blurb)}</div></button>`;
  }).join('');
  const posCtl = prog() === 'ppl'
    ? `<div class="modal-sub" style="margin-top:14px">Currently on Day ${S.pos.ppl.d+1} of 8. Tap any day chip on the home card to jump.</div>`
    : `<button class="modal-btn cancel" style="width:100%;margin-top:12px" onclick="closeProgramMenu();openPosPicker()">Change month / week / day</button>`;
  m.innerHTML = `<div class="modal">
    <div class="modal-title">Choose a program</div>
    <div class="modal-sub">Your lift history is shared. A bench press PR counts in both programs.</div>
    ${cards}
    ${posCtl}
    <button class="modal-btn cancel" style="width:100%;margin-top:12px" onclick="closeProgramMenu()">Close</button>
  </div>`;
  document.body.appendChild(m);
  m.addEventListener('click', e => { if(e.target === m) closeProgramMenu(); });
}
function closeProgramMenu(){ const m = document.getElementById('progModal'); if(m) m.remove(); }

function openPosPicker(){
  const m = document.createElement('div');
  m.className = 'modal-bg'; m.id = 'posModal';
  const p = S.pos.foundation;
  const monthOpts = D.program.map((mm,i)=>`<option value="${i}" ${i===p.m?'selected':''}>Month ${mm.index} · ${mm.phase}</option>`).join('');
  const weekOpts = D.program[p.m].weeks.map((ww,i)=>`<option value="${i}" ${i===p.w?'selected':''}>Week ${ww.week}</option>`).join('');
  const dayOpts = D.program[p.m].weeks[p.w].days.map((dd,i)=>`<option value="${i}" ${i===p.d?'selected':''}>Day ${dd.day}</option>`).join('');
  m.innerHTML = `<div class="modal">
    <div class="modal-title">Where are you?</div>
    <div class="modal-sub">Set your place in the Foundation program. Nothing already logged is affected.</div>
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
  document.getElementById('posW').innerHTML = D.program[mi].weeks.map((ww,i)=>`<option value="${i}">Week ${ww.week}</option>`).join('');
  document.getElementById('posD').innerHTML = D.program[mi].weeks[0].days.map((dd,i)=>`<option value="${i}">Day ${dd.day}</option>`).join('');
}
function closePos(){ const m = document.getElementById('posModal'); if(m) m.remove(); }
function savePos(){
  S.pos.foundation = {
    m: parseInt(document.getElementById('posM').value),
    w: parseInt(document.getElementById('posW').value),
    d: parseInt(document.getElementById('posD').value)
  };
  S.program = 'foundation';
  save(); closePos(); render();
}

/* ============ SETTINGS ============ */

function renderSettings(){
  const u = unit();
  document.getElementById('app').innerHTML = `
    <div class="shead"><button class="back" onclick="backHome()">← Back</button>
      <div class="shead-meta">Settings</div></div>
    <div class="stitle">Settings</div>

    <div class="sect-label">Weight Units</div>
    <div class="set-card">
      <div class="switch units">
        <button class="switch-btn ${u==='lb'?'active':''}" onclick="setUnit('lb')">Pounds</button>
        <button class="switch-btn ${u==='kg'?'active':''}" onclick="setUnit('kg')">Kilograms</button>
      </div>
      <div class="set-note">Everything you have already logged is converted on the fly. Nothing is rewritten, so switching back and forth is always safe.</div>
    </div>

    <div class="sect-label">Quick Converter</div>
    <div class="set-card">
      <div class="conv-row">
        <input class="modal-inp conv-inp" id="cvLb" inputmode="decimal" type="number" placeholder="lb" oninput="convFrom('lb')">
        <div class="conv-eq">=</div>
        <input class="modal-inp conv-inp" id="cvKg" inputmode="decimal" type="number" placeholder="kg" oninput="convFrom('kg')">
      </div>
      <div class="conv-ref">
        <span>20 kg = 44.1 lb</span><span>60 kg = 132.3 lb</span><span>100 kg = 220.5 lb</span>
      </div>
    </div>

    <div class="sect-label">Data</div>
    <div class="set-card">
      <button class="modal-btn cancel" style="width:100%;margin-bottom:9px" onclick="openSyncMenu()">Sync and backup menu</button>
      <button class="modal-btn cancel" style="width:100%;margin-bottom:9px" onclick="go('diag')">Sync diagnostics</button>
      <div class="set-note">${Object.keys(S.sessions).length} sessions · ${(S.cardio||[]).length} cardio entries · ${Object.keys(S.circuits||{}).length} circuit days · ${(S.bw||[]).length} weigh-ins</div>
    </div>
    <div style="height:40px"></div>
    <input type="file" id="importFile" accept="application/json" class="hidden" onchange="handleImport(event)">`;
}
function setUnit(u){ if(unit()===u) return; S.units = u; save(); render(); }
function convFrom(src){
  const lbEl = document.getElementById('cvLb'), kgEl = document.getElementById('cvKg');
  if(src === 'lb'){
    const v = parseFloat(lbEl.value);
    kgEl.value = isNaN(v) ? '' : (Math.round(v/LB_PER_KG*10)/10);
  } else {
    const v = parseFloat(kgEl.value);
    lbEl.value = isNaN(v) ? '' : (Math.round(v*LB_PER_KG*10)/10);
  }
}

/* ============ HOME ACTIONS ============ */

function toggleWater(){ const dy = dayObj(); dy.water = !dy.water; touchStreak(); save(); render(); }
function setAte(v){ const dy = dayObj(); dy.ate = dy.ate === v ? null : v; touchStreak(); save(); render(); }
function toggleRest(){ const dy = dayObj(); dy.rest = !dy.rest; touchStreak(); save(); render(); }
function markWorkoutDay(){ const dy = dayObj(); dy.workout = true; }

function liveStreak(){
  if(!S.lastStreakDate) return 0;
  const t = today(), y = dayStr(1);
  if(S.lastStreakDate === t || S.lastStreakDate === y) return S.streak;
  return 0;
}
function touchStreak(){
  const dy = dayObj();
  if(dy.workout || dy.travel || dy.rest || dy.core){
    const t = today();
    if(S.lastStreakDate !== t){
      S.streak = (S.lastStreakDate === dayStr(1)) ? S.streak+1 : 1;
      S.lastStreakDate = t;
    }
  }
}

function bwStrip(){
  const arr = S.bw || [];
  const latest = arr.length ? arr[arr.length-1].lb : null;
  let trend = '', cls = 'flat';
  if(arr.length >= 2){
    const diff = latest - arr[0].lb;
    if(diff < -0.05){ cls='down'; trend='▼ '+Math.abs(diff).toFixed(1)+' lb'; }
    else if(diff > 0.05){ cls='up'; trend='▲ '+diff.toFixed(1)+' lb'; }
    else { cls='flat'; trend='— steady'; }
  }
  const shown = latest===null ? '—' : (unit()==='kg' ? (Math.round(latest/LB_PER_KG*10)/10) : latest);
  return `<div class="bw-strip">
    <div onclick="go('bwgraph')" style="flex:1"><div class="bw-label">Bodyweight</div>
      <div class="bw-val">${shown} <small>${unit()}</small></div></div>
    <div style="text-align:right" onclick="go('bwgraph')">
      <div class="bw-trend ${cls}">${trend||'Tap to see graph'}</div></div>
    <button class="modal-btn save" style="flex:0;margin-left:14px;padding:11px 16px;font-size:14px" onclick="event.stopPropagation();logBW()">Log +</button>
  </div>`;
}

function logBW(){
  const m = document.createElement('div');
  m.className = 'modal-bg'; m.id = 'bwModal';
  m.innerHTML = `<div class="modal">
    <div class="modal-title">Log Bodyweight</div>
    <div class="modal-sub">${new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'})} · entering in ${unit()}</div>
    <input class="modal-inp" id="bwInput" inputmode="decimal" type="number" placeholder="${unit()}">
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
  const lb = unit()==='kg' ? v*LB_PER_KG : v;
  const t = today();
  const idx = S.bw.findIndex(e => e.date === t);
  if(idx >= 0) S.bw[idx].lb = Math.round(lb*10)/10; else S.bw.push({ date:t, lb:Math.round(lb*10)/10 });
  S.bw.sort((a,b) => a.date < b.date ? -1 : 1);
  save(); closeBW(); render();
}

/* ============ SESSION ============ */

let sessionClock = null;
let peakHit = {};

function enterSession(){
  const key = sessionKey();
  S.sessions[key] = S.sessions[key] || { logged:{}, done:false, prog: prog() };
  const sess = S.sessions[key];
  const stale = sess.startedAt && (
    new Date(sess.startedAt).toDateString() !== new Date().toDateString() ||
    Date.now() - sess.startedAt > 6*3600000
  );
  if(!sess.startedAt || (stale && !sess.done)){ sess.startedAt = Date.now(); save(); }
  peakHit = {};
  go('session');
}

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
  const cd = curDay();
  const key = sessionKey();
  S.sessions[key] = S.sessions[key] || { logged:{}, done:false, prog: prog() };
  const sess = S.sessions[key];
  const logged = sess.logged;
  const tag = cd.emphasis === 'strength' ? 'Strength emphasis'
            : cd.emphasis === 'hypertrophy' ? 'Growth emphasis' : '';

  let html = `
    <div class="shead"><button class="back" onclick="backHome()">← Exit</button>
      <div class="shead-meta">${esc(cd.sub)}</div></div>
    <div class="stitle">${esc(cd.title)}</div>
    ${tag?`<div class="emph ${cd.emphasis}">${tag} · ${esc(cd.priority||'')}</div>`:''}
    <div class="meter">
      <div class="meter-row">
        <div class="meter-label">Session progress</div>
        <div class="clock-wrap">
          <span class="clock-start">Started ${sess.startedAt ? fmtTimeOfDay(sess.startedAt) : '—'}</span>
          <span class="clock" id="sessClock">${sess.startedAt ? fmtClock(Date.now()-sess.startedAt) : '0:00'}</span>
        </div>
        <button class="unit-chip" onclick="toggleUnits()">${unit().toUpperCase()}</button>
        <div class="meter-pct" id="pct">0%</div>
      </div>
      <div class="meter-bar"><div class="meter-fill" id="fill"></div></div>
    </div>`;

  cd.exercises.forEach((ex, ei) => {
    const name = ex.name;
    const t = targetFor(name, key);
    const repMode = t.repMode;
    const mr = minRep(ex.targetReps);
    const existing = logged[name] || [];
    const setCount = Math.max(existing.length, ex.sets || 3);
    const meta = META[name];

    let ttb;
    if(t.work > 0){
      const label = repMode ? 'Reps to beat' : 'Work to beat';
      const num = repMode ? t.str : `${esc(t.str)} <span class="ttb-work">= ${fmt(t.work)}</span>`;
      const src = t.source === 'seed' ? '<span class="est">from old log</span>' : (t.inferred ? '<span class="est">est</span>' : '');
      ttb = `<div class="ttb"><span class="ttb-icon">🎯</span>
        <span class="ttb-label">${label}</span>
        <span class="ttb-num">${num}${src}</span></div>`;
    } else {
      ttb = `<div class="ttb first"><span class="ttb-icon">⚑</span>
        <span class="ttb-label">First time</span><span class="ttb-num">Set your baseline</span></div>`;
    }
    const peakLine = t.peak > 0
      ? `<div class="peakline"><span class="star">★</span> All-time peak ${esc(t.peakStr)} — the boss fight</div>` : '';

    const cueBlock = meta ? `
      <button class="cue-btn" onclick="toggleCue(${ei})">Form cue</button>
      <div class="cue-panel hidden" id="cue${ei}">
        <div class="cue-muscle">Feel it in: <b>${esc(meta[0])}</b></div>
        <div class="cue-text">${esc(meta[1])}</div>
      </div>` : '';

    let rows = '';
    for(let si=0; si<setCount; si++) rows += buildRow(si+1, repMode, existing[si] || {}, mr, t, name);

    html += `<div class="ex ${repMode?'repmode':''}" id="ex${ei}" data-name="${encodeURIComponent(name)}" data-target="${t.work}" data-peak="${t.peak}" data-rep="${repMode?1:0}">
      <div class="ex-head">
        <div>
          <div class="ex-letter">${esc(ex.group||'')}</div>
          <div class="ex-name">${esc(name)}</div>
          <div class="ex-reps">${ex.sets?ex.sets+' sets · ':''}Target reps <b>${esc(ex.targetReps||'—')}</b>${repMode?' · <span style="color:var(--hold)">reps only</span>':''}</div>
        </div>
        <button class="mode-toggle" title="Switch between weight and reps only" onclick="toggleRepOnly(decodeURIComponent('${encodeURIComponent(name)}'))">${repMode?'reps':'lbs'}</button>
      </div>
      ${ttb}${peakLine}${cueBlock}
      <div class="set-row head ${repMode?'reps-only':''}"><div></div>${repMode?'':`<div class="set-h">Weight (${unit()})</div>`}<div class="set-h">Reps</div><div></div></div>
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

function buildRow(n, repMode, e0, mr, t, name){
  const cls = 'set-row' + (repMode ? ' reps-only' : '');
  const repPh = mr != null ? mr : '—';
  const wPh = (!repMode && t && t.work > 0 && mr) ? roundFor(fromLb(t.work/mr, unit()), unit()) : '—';
  const wVal = (e0 && e0.w != null && !isNaN(e0.w)) ? roundFor(fromLb(setLb(e0), unit()), unit()) : '';
  const wField = repMode ? '' :
    `<input class="inp" inputmode="decimal" type="number" step="any" placeholder="${wPh}" value="${wVal}" oninput="judge(this)">`;
  const repPhFinal = repMode && t && t.work > 0 ? t.work : repPh;
  return `<div class="${cls}">
    <div class="set-n">${n}</div>
    ${wField}
    <input class="inp" inputmode="numeric" type="number" placeholder="${repPhFinal}" value="${e0.r != null ? e0.r : ''}" oninput="judge(this)">
    <div class="set-mark"><span class="dot"></span></div></div>`;
}

function resultPlaceholder(t){
  if(t.work > 0) return t.repMode ? 'Beat '+fmt(t.work)+' reps on any set' : 'Beat '+fmt(t.work)+' of work on any set';
  return 'No target yet — today sets the bar';
}

function toggleCue(ei){ const p = document.getElementById('cue'+ei); if(p) p.classList.toggle('hidden'); }

function addSet(ei){
  const ex = document.getElementById('ex'+ei);
  const repMode = ex.dataset.rep === '1';
  const n = ex.querySelectorAll('.set-row:not(.head)').length + 1;
  const div = document.createElement('div');
  div.className = 'set-row' + (repMode ? ' reps-only' : '');
  div.innerHTML = `<div class="set-n">${n}</div>
    ${repMode ? '' : '<input class="inp" inputmode="decimal" type="number" step="any" placeholder="—" oninput="judge(this)">'}
    <input class="inp" inputmode="numeric" type="number" placeholder="—" oninput="judge(this)">
    <div class="set-mark"><span class="dot"></span></div>`;
  ex.querySelector('.addset').before(div);
}

/* Reads a row. Weight is typed in whatever unit is on screen, and the
   unit is stored with the number so nothing drifts on conversion. */
function readRow(row, repMode){
  const inputs = row.querySelectorAll('.inp');
  if(repMode){
    const r = parseFloat(inputs[0].value);
    return { w:null, r: isNaN(r) ? null : r };
  }
  const w = parseFloat(inputs[0].value);
  const r = parseFloat(inputs[1].value);
  return { w: isNaN(w) ? null : w, u: unit(), r: isNaN(r) ? null : r };
}

function judge(input){
  rollup(input.closest('.ex'));
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
    else if(target > 0 && Math.abs(wk - target) < 0.01){ row.classList.add('held'); mark.textContent = '='; }
    else if(target > 0){ row.classList.add('under'); mark.textContent = '·'; }
    else { row.classList.add('won'); mark.textContent = '▲'; }
  });

  ex.classList.remove('beaten','peaked');
  res.classList.remove('win','peak','hold','under');

  if(best === 0){
    res.classList.add('under');
    res.textContent = resultPlaceholder({ work:target, repMode });
    return;
  }
  const unitLabel = repMode ? '' : ' work';
  if(peak > 0 && best > peak){
    ex.classList.add('peaked'); res.classList.add('peak');
    res.textContent = '★ NEW PEAK — ' + bestStr;
    if(!peakHit[ex.id]){ peakHit[ex.id] = true; toast('★ New Peak — ' + ex.querySelector('.ex-name').textContent, 'boss fight won','peak'); buzz([120,60,120]); }
  } else if(target > 0 && best > target){
    ex.classList.add('beaten'); res.classList.add('win');
    res.textContent = '▲ Beaten — ' + bestStr + ' = ' + fmt(best) + unitLabel;
    peakHit[ex.id] = false;
  } else if(target > 0 && Math.abs(best - target) < 0.01){
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
  S.sessions[key] = S.sessions[key] || { logged:{}, done:false, prog: prog() };
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
    if([...ex.querySelectorAll('.set-row:not(.head)')].some(row => setWork(name, readRow(row, repMode)) > 0)) done++;
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
  const cd = curDay();
  const startedAt = sess.startedAt || Date.now();
  const endedAt = Date.now();

  let totalWork = 0, setCount = 0, prs = [], beaten = 0, exLogged = 0;

  cd.exercises.forEach(ex => {
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
    key, startedAt, endedAt, elapsed: endedAt - startedAt,
    totalWork, setCount, prs, beaten, exLogged,
    exTotal: cd.exercises.length,
    label: cd.label,
    pump: sess.pump || null
  };
  go('summary');
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

      <div class="sum-line s4"><span>Started ${fmtTimeOfDay(s.startedAt)}</span><span>Finished ${fmtTimeOfDay(s.endedAt)}</span></div>
      <div class="sum-line s4"><span>${s.setCount} sets logged</span><span>${s.exLogged} of ${s.exTotal} lifts</span></div>
      <div class="sum-line s4"><span>Targets beaten</span><span style="color:var(--win)">${s.beaten}</span></div>

      ${s.prs.length ? `<div class="sect-label s5" style="margin-top:22px">★ New Peaks</div>
        <div class="pr-card s5">${prRows}</div>` : ''}

      <div class="sect-label s5" style="margin-top:22px">Rate the pump</div>
      <div class="pump-row s5">${pumpChips}</div>

      <button class="btn-primary s6" style="margin-top:22px" onclick="lockItIn()">Lock it in</button>
      <button class="mini-link s6" onclick="go('session')">Back to the session</button>
      <div style="height:40px"></div>
    </div>`;
}

function setPump(n){ summaryData.pump = n; renderSummary(); }

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
  buzz([200,80,200]);
  toast('Session locked in','the bar just moved','green');
  setTimeout(backHome, 600);
}

/* ============ EXPORT / IMPORT ============ */

function exportData(){
  closeSync();
  const payload = { app:'YouVsYou', version:3, exported_at:new Date().toISOString(), state:S };
  const blob = new Blob([JSON.stringify(payload,null,2)], { type:'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'YouVsYou-backup-'+today()+'.json';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('Backup downloaded','keep it somewhere safe','green');
}
function triggerImport(){ closeSync(); const el = document.getElementById('importFile'); if(el) el.click(); }
function handleImport(evt){
  const file = evt.target.files && evt.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try{
      const parsed = JSON.parse(reader.result);
      const incoming = parsed.state || parsed;
      if(!incoming || typeof incoming !== 'object' || !incoming.sessions) throw new Error('not a backup');
      confirmImport(incoming);
    }catch(e){ toast('That file will not load','not a valid backup','peak'); }
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
  S = migrate(incoming);
  closeImp(); save(); pushRemote(); render();
  toast('Backup restored','your numbers are back','green');
}

/* ============ SHARED UI ============ */

let toastTimer = null;
function toast(main, sub, kind){
  const t = document.getElementById('toast');
  if(!t) return;
  t.className = 'toast show ' + (kind || '');
  t.innerHTML = esc(main) + (sub ? '<small>'+esc(sub)+'</small>' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
}
function buzz(pattern){
  try{ if(navigator.vibrate) navigator.vibrate(pattern || 200); }catch(e){}
}

/* ============ BOOT ============ */

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

if(!pass){ view = 'gate'; render(); }
else { render(); bootSync(); }

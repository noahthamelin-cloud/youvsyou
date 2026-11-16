/* ============================================================
   You vs You - Guided timed circuits
   Hands-free routines: the app counts each movement down on a
   ring, buzzes, and moves you straight into the next one.

   Timing runs off wall-clock timestamps rather than a decrementing
   counter, because phone browsers throttle background timers and a
   counter would drift badly over a twelve minute routine.
   ============================================================ */

const RING_R = 76;
const RING_C = 2 * Math.PI * RING_R;
const LEAD_IN = 10;   // seconds of "get ready" before the first movement

let run = null;       // the active routine
let runTimer = null;
let wakeLock = null;

/* ---------- picker ---------- */

function renderCircuitList(){
  const order = ['core','mobility','endurance'];
  const doneToday = (S.circuits[today()] || []).map(x => x.id);
  const cards = order.filter(id => CIRCUITS[id]).map(id => {
    const c = CIRCUITS[id];
    const mins = circuitMinutes(c);
    const done = doneToday.indexOf(id) !== -1;
    return `<button class="circuit ${done?'done':''}" onclick="startCircuit('${id}')">
      <div class="circuit-tag">${c.rounds > 1 ? c.rounds+' rounds · ' : ''}${c.movements.length} movements · ~${mins} min${done?' · done today ✓':''}</div>
      <div class="circuit-name">${esc(c.title)}</div>
      <div class="circuit-meta">${esc(c.blurb)}</div>
    </button>`;
  }).join('');

  const log = (S.circuits[today()] || []).map(x =>
    `<div class="hist-ex"><span class="hist-ex-name">${esc(x.title)}</span><span class="hist-ex-sets">${fmtTimeOfDay(x.at)}</span></div>`).join('');

  document.getElementById('app').innerHTML = `
    <div class="shead"><button class="back" onclick="backHome()">← Back</button>
      <div class="shead-meta">Guided Routines</div></div>
    <div class="stitle">Core &amp; Recovery</div>
    <div class="travel-intro">Pick one and put the phone down. It counts every movement, buzzes, and walks you through the whole thing.</div>
    ${cards}
    ${log ? `<div class="sect-label">Done today</div><div class="hist-card">${log}</div>` : ''}
    <div style="height:40px"></div>`;
}

function circuitMinutes(c){
  let t = 0;
  c.movements.forEach(m => { const reps = m.side ? 2 : 1; t += (m.sec + c.rest) * reps; });
  t *= c.rounds;
  (c.finisher || []).forEach(m => t += m.sec);
  return Math.round(t / 60);
}

/* ---------- queue ---------- */

function buildQueue(c){
  const q = [{ type:'ready', sec:LEAD_IN, name:'Get ready', cue:'First up: ' + c.movements[0].name, img:null }];
  for(let r = 0; r < c.rounds; r++){
    c.movements.forEach((m, mi) => {
      const sides = m.side ? ['Left','Right'] : [null];
      sides.forEach(side => {
        q.push({ type:'go', sec:m.sec, mv:m, side, round:r+1, name:m.name, cue:m.cue, img:m.img, target:m.target });
        q.push({ type:'rest', sec:c.rest, name:'Rest', cue:'', img:null });
      });
    });
  }
  (c.finisher || []).forEach(m => {
    q.push({ type:'go', sec:m.sec, mv:m, side:null, round:0, name:m.name, cue:m.cue, img:m.img, target:m.target, finisher:true });
    q.push({ type:'rest', sec:c.rest, name:'Rest', cue:'', img:null });
  });
  while(q.length && q[q.length-1].type === 'rest') q.pop();
  // tell each rest what is coming next
  q.forEach((step, i) => {
    if(step.type === 'rest' && q[i+1]) step.cue = 'Next: ' + q[i+1].name + (q[i+1].side ? ' · ' + q[i+1].side : '');
  });
  return q;
}

/* ---------- lifecycle ---------- */

function startCircuit(id){
  const c = CIRCUITS[id];
  if(!c) return;
  run = {
    cid: id, c,
    queue: buildQueue(c),
    i: 0,
    endsAt: Date.now() + LEAD_IN*1000,
    pausedLeft: null,
    startedAt: Date.now(),
    totalGo: 0
  };
  run.queue.forEach(s => { if(s.type === 'go') run.totalGo++; });
  requestWake();
  go('circuit');
  tickLoop();
}

function exitCircuit(){
  stopLoop(); releaseWake(); run = null;
  backHome();
}

function tickLoop(){
  stopLoop();
  runTimer = setInterval(tick, 250);
}
function stopLoop(){ if(runTimer){ clearInterval(runTimer); runTimer = null; } }

function remainingSec(){
  if(!run) return 0;
  if(run.pausedLeft != null) return Math.ceil(run.pausedLeft / 1000);
  return Math.max(0, Math.ceil((run.endsAt - Date.now()) / 1000));
}

function tick(){
  if(!run || run.pausedLeft != null) return;
  if(run.endsAt > Date.now()){ paintTimer(); return; }
  catchUp();
}

/* Phone browsers throttle background timers hard, so by the time the loop
   runs again several steps may have elapsed. Advancing one step per tick
   would leave the routine minutes behind the clock, so this walks forward
   until the queue agrees with the wall clock, rendering once at the end. */
const MAX_CATCHUP = 5 * 60 * 1000;   // away longer than this and we stop, not sprint

function catchUp(){
  if(!run || run.pausedLeft != null) return false;
  const gap = Date.now() - run.endsAt;
  if(gap <= 0) return false;
  if(gap > MAX_CATCHUP){
    // Gone long enough that racing through the queue would log a routine
    // you did not actually do. Freeze on the current movement instead and
    // let the resume button decide.
    run.pausedLeft = run.queue[run.i].sec * 1000;
    renderCircuit();
    toast('Picked up where you left off','tap resume when you are ready','peak');
    return false;
  }
  let moved = 0, guard = 0;
  while(run && run.pausedLeft == null && run.endsAt <= Date.now() && guard++ < 1000){
    advanceStep(true);
    moved++;
  }
  if(moved && run){ buzz([180]); renderCircuit(); }
  return moved > 0;
}

function advanceStep(silent){
  const prevEnd = run.endsAt;
  const cur = run.queue[run.i];
  if(!silent) buzz(cur && cur.type === 'go' ? [180] : [60]);

  run.i++;
  if(run.i >= run.queue.length){ finishCircuit(); return; }
  // Catching up chains from when this step SHOULD have ended, so a gap flows
  // through as many steps as really elapsed. A manual skip restarts from now.
  const base = silent ? prevEnd : Date.now();
  run.endsAt = base + run.queue[run.i].sec * 1000;
  if(!silent) renderCircuit();
}

function pauseCircuit(){
  if(!run) return;
  if(run.pausedLeft == null){ run.pausedLeft = Math.max(0, run.endsAt - Date.now()); }
  else { run.endsAt = Date.now() + run.pausedLeft; run.pausedLeft = null; }
  renderCircuit();
}
function skipStep(){ if(run) advanceStep(); }
function prevStep(){
  if(!run || run.i === 0) return;
  run.i--;
  run.pausedLeft = null;
  run.endsAt = Date.now() + run.queue[run.i].sec * 1000;
  renderCircuit();
}
function addTen(){
  if(!run) return;
  if(run.pausedLeft != null) run.pausedLeft += 10000;
  else run.endsAt += 10000;
  paintTimer();
}

/* ---------- screen ---------- */

function renderCircuit(){
  if(!run) return backHome();
  const step = run.queue[run.i];
  const left = remainingSec();
  const paused = run.pausedLeft != null;
  const isRest = step.type === 'rest';
  const isReady = step.type === 'ready';

  let goneBy = 0;
  for(let k = 0; k < run.i; k++) if(run.queue[k].type === 'go') goneBy++;
  const goIndex = step.type === 'go' ? goneBy + 1 : goneBy;

  const imgBlock = step.img ? `
    <div class="cq-img" id="cqImg">
      <img src="images/core/${esc(step.img)}.png" alt="" onerror="this.closest('.cq-img').classList.add('noimg')">
      <div class="cq-img-fb"><span>${esc(step.name)}</span></div>
    </div>` : '';

  const roundTag = run.c.rounds > 1 && step.type === 'go' && !step.finisher
    ? `<span class="cq-round">Round ${step.round} of ${run.c.rounds}</span>` : '';

  document.getElementById('app').innerHTML = `
    <div class="cq ${isRest?'rest':''} ${isReady?'ready':''} ${paused?'paused':''}">
      <div class="cq-head">
        <button class="back" onclick="exitCircuit()">← End</button>
        <div class="cq-prog">${esc(run.c.title)} · ${goIndex} of ${run.totalGo}</div>
      </div>

      <div class="cq-ring">
        <svg viewBox="0 0 180 180">
          <circle cx="90" cy="90" r="${RING_R}" fill="none" stroke="var(--line)" stroke-width="10"/>
          <circle id="cqArc" cx="90" cy="90" r="${RING_R}" fill="none"
            stroke="${isRest?'var(--hold)':(isReady?'var(--warn)':'var(--win)')}" stroke-width="10"
            stroke-linecap="round" transform="rotate(-90 90 90)"
            stroke-dasharray="${RING_C.toFixed(1)}" stroke-dashoffset="0"/>
        </svg>
        <div class="cq-center">
          <div class="cq-count" id="cqCount">${left}</div>
          <div class="cq-unit">${paused?'paused':'seconds'}</div>
        </div>
      </div>

      <div class="cq-name">${esc(step.name)}${step.side?` <span class="cq-side">${esc(step.side)}</span>`:''}</div>
      ${step.target?`<div class="cq-target">Feel it in: <b>${esc(step.target)}</b></div>`:''}
      ${roundTag}
      ${imgBlock}
      ${step.cue?`<div class="cq-cue">${esc(step.cue)}</div>`:''}

      <div class="cq-controls">
        <button class="cq-btn" onclick="prevStep()">‹ Back</button>
        <button class="cq-btn big ${paused?'go':''}" onclick="pauseCircuit()">${paused?'Resume':'Pause'}</button>
        <button class="cq-btn" onclick="skipStep()">Skip ›</button>
      </div>
      <button class="mini-link" onclick="addTen()">+10 seconds</button>
      <div style="height:30px"></div>
    </div>`;
  paintTimer();
}

/* Only the number and the arc change every tick, so the whole screen
   is never re-rendered mid-countdown. */
function paintTimer(){
  if(!run) return;
  const step = run.queue[run.i];
  const left = remainingSec();
  const el = document.getElementById('cqCount');
  const arc = document.getElementById('cqArc');
  if(el) el.textContent = left;
  if(arc){
    const frac = Math.max(0, Math.min(1, left / step.sec));
    arc.style.strokeDashoffset = (RING_C * (1 - frac)).toFixed(1);
  }
}

/* ---------- finish ---------- */

function finishCircuit(){
  stopLoop(); releaseWake();
  const c = run.c;
  const elapsed = Date.now() - run.startedAt;
  const t = today();
  S.circuits[t] = S.circuits[t] || [];
  S.circuits[t].push({ id:c.id, title:c.title, at:Date.now(), secs:Math.round(elapsed/1000) });
  const dy = dayObj();
  dy.core = true;
  touchStreak();
  save();
  buzz([300,120,300]);
  window.__lastCircuit = { title:c.title, elapsed, moves:run.totalGo };
  run = null;
  go('circuitDone');
}

function renderCircuitDone(){
  const r = window.__lastCircuit || { title:'Routine', elapsed:0, moves:0 };
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
      <div class="sum-title">Routine complete</div>
      <div class="sum-sub">${esc(r.title)}</div>
      <div class="sum-stats">
        <div class="sum-stat s1"><div class="sum-num">${fmtMinutes(r.elapsed)}</div><div class="sum-lbl">Time</div></div>
        <div class="sum-stat s2"><div class="sum-num">${r.moves}</div><div class="sum-lbl">Movements</div></div>
        <div class="sum-stat s3"><div class="sum-num">${liveStreak()}</div><div class="sum-lbl">Day streak</div></div>
      </div>
      <button class="btn-primary s6" style="margin-top:22px" onclick="backHome()">Done</button>
      <button class="mini-link s6" onclick="go('circuitList')">Run another →</button>
      <div style="height:40px"></div>
    </div>`;
}

/* ---------- keep the screen awake ---------- */

async function requestWake(){
  try{
    if('wakeLock' in navigator){ wakeLock = await navigator.wakeLock.request('screen'); }
  }catch(e){ wakeLock = null; }
}
function releaseWake(){
  try{ if(wakeLock){ wakeLock.release(); wakeLock = null; } }catch(e){}
}
/* Coming back to the app re-acquires the wake lock and resyncs the queue
   with the clock. Not gated on visibilityState, because the catch-up is
   safe to run any time and some browsers report that field oddly. */
function resumeFromBackground(){
  if(!run) return;
  if(document.visibilityState !== 'hidden') requestWake();
  if(view !== 'circuit') return;
  catchUp();
  if(run){ paintTimer(); tickLoop(); }
}
document.addEventListener('visibilitychange', resumeFromBackground);
window.addEventListener('pageshow', resumeFromBackground);
window.addEventListener('focus', resumeFromBackground);

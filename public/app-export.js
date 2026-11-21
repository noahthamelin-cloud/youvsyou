/* ============================================================
   You vs You - Workout review and export

   Produces a plain-text YVY-WORKOUT v1 block for one 8-day PPL
   cycle, for a coach to read or to paste into a chat for analysis.

   Nothing here invents data. A field that was never recorded is
   left out of the output rather than guessed at or zero-filled,
   so an absent line means "not recorded", never "zero".
   ============================================================ */

const CYCLE_LEN = 8;

/* Date arithmetic on YYYY-MM-DD strings, done entirely in UTC.
   Building a Date at local midnight and reading it back with toISOString
   shifts the day by one in any timezone east or west of UTC, which would
   quietly misdate every cycle boundary. */
function addDays(iso, n){
  const [y,m,d] = iso.split('-').map(Number);
  const t = Date.UTC(y, m-1, d) + n * 86400000;
  const x = new Date(t);
  return x.getUTCFullYear() + '-' +
    String(x.getUTCMonth()+1).padStart(2,'0') + '-' +
    String(x.getUTCDate()).padStart(2,'0');
}

/* ---------- cycle derivation ----------
   Sessions were never tagged with a cycle number, so cycles are
   reconstructed from the day sequence: walking the PPL sessions in
   date order, a new cycle begins whenever the day index stops moving
   forward. That handles a repeated day, a skipped day, and a rotation
   restarted mid-week without needing anything stored. */

function buildCycles(){
  const sessions = [];
  Object.keys(S.sessions).forEach(key => {
    if(key.indexOf('ppl:') !== 0) return;
    const parts = key.split(':');
    const dayIdx = parseInt(parts[1], 10);
    const date = parts[2];
    const sess = S.sessions[key];
    if(isNaN(dayIdx) || !date) return;
    if(!sess || (!sess.done && !Object.keys(sess.logged || {}).length)) return;
    sessions.push({ key, dayIdx, date, sess });
  });

  sessions.sort((a,b) => a.date === b.date
    ? (a.sess.startedAt || 0) - (b.sess.startedAt || 0)
    : (a.date < b.date ? -1 : 1));

  const cycles = [];
  let cur = null, prevIdx = -1;
  sessions.forEach(s => {
    if(!cur || s.dayIdx <= prevIdx){
      cur = { n: cycles.length + 1, sessions: [] };
      cycles.push(cur);
    }
    cur.sessions.push(s);
    prevIdx = s.dayIdx;
  });

  // Starts first, in their own pass: the end of one cycle is derived from
  // the start of the next, which does not exist yet during a single pass.
  cycles.forEach(c => { c.start = c.sessions[0].date; });

  cycles.forEach((c, i) => {
    const lastLogged = c.sessions[c.sessions.length - 1].date;
    const next = cycles[i+1];
    if(next){
      const end = addDays(next.start, -1);
      c.end = end < lastLogged ? lastLogged : end;
    } else {
      // Current cycle: runs to today, or to its natural 8th day if that has
      // already passed and nothing newer has been logged.
      const natural = addDays(c.start, CYCLE_LEN - 1);
      const t = today();
      c.end = t < natural ? t : (natural > lastLogged ? natural : lastLogged);
      c.current = true;
    }
    c.id = 'C' + String(c.n).padStart(2,'0') + '-' + c.start;
  });

  return cycles.reverse();   // newest first
}

/* ---------- formatting helpers ---------- */

function xDate(iso){
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US',
    { weekday:'short', month:'short', day:'numeric', year:'numeric' });
}
function xShort(iso){
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month:'short', day:'numeric' });
}
function xClock(ts){
  return new Date(ts).toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit' });
}
function xMins(ms){ return Math.round(ms / 60000) + ' min'; }

/* A set exactly as it was entered. No unit conversion, so nothing is
   implied that the person did not actually type. */
function xSet(s){
  if(s.w == null || isNaN(s.w)) return (s.r || 0) + ' reps';
  const u = s.u === 'kg' ? 'kg' : 'lb';
  const w = Math.round(Number(s.w) * 100) / 100;
  return w + ' ' + u + (s.r ? ' x ' + s.r + ' reps' : '');
}

const CI_TEXT = {
  difficulty: { easy:'Easy', moderate:'Moderate', hard:'Hard', max:'Maximum' },
  performance:{ stronger:'Stronger than expected', expected:'As expected', weaker:'Weaker than expected' },
  feeling:    { good:'Good', exhausted:'Exhausted', pain:'Unusual pain or discomfort' }
};

function xCheckin(ci){
  if(!ci) return null;
  const bits = [];
  if(ci.energy) bits.push('energy ' + ci.energy + '/5');
  if(ci.difficulty) bits.push('difficulty ' + (CI_TEXT.difficulty[ci.difficulty] || ci.difficulty));
  if(ci.performance) bits.push('performance ' + (CI_TEXT.performance[ci.performance] || ci.performance));
  if(ci.feeling) bits.push('felt ' + (CI_TEXT.feeling[ci.feeling] || ci.feeling));
  return bits.length ? bits.join(' | ') : null;
}

/* ---------- the export itself ---------- */

function formatCycle(c){
  const L = [];
  const push = (...xs) => xs.forEach(x => L.push(x));   // must accept a spread

  // Which units actually appear, so a reader is never left guessing.
  const units = new Set();
  c.sessions.forEach(s => Object.values(s.sess.logged || {})
    .forEach(sets => sets.forEach(st => { if(st.w != null && !isNaN(st.w)) units.add(st.u === 'kg' ? 'kg' : 'lb'); })));

  push('YVY-WORKOUT v1');
  push('Cycle ' + c.n + '  (id ' + c.id + ')' + (c.current ? '  [in progress]' : ''));
  push('Dates: ' + xDate(c.start) + '  to  ' + xDate(c.end));
  push('Program: PPL 8-day rotation. Days 1-3 strength, 5-7 hypertrophy, 4 and 8 recovery.');
  push('Lifting days logged: ' + c.sessions.length + ' of 6');
  if(units.size) push('Weight units: ' + [...units].join(' and '));
  push('RIR = reps left in reserve on the final hard working set. Warm-ups excluded.');
  push('Blank fields were not recorded. Nothing below is estimated.');
  push('');

  // Everything that happened in the window, in order.
  const events = [];
  c.sessions.forEach(s => events.push({ date:s.date, t:s.sess.startedAt || 0, kind:'lift', s }));

  Object.keys(S.circuits || {}).forEach(d => {
    if(d < c.start || d > c.end) return;
    (S.circuits[d] || []).forEach(x => events.push({ date:d, t:x.at || 0, kind:'circuit', x }));
  });
  (S.cardio || []).forEach(x => {
    if(x.date < c.start || x.date > c.end) return;
    events.push({ date:x.date, t:x.at || 0, kind:'cardio', x });
  });

  events.sort((a,b) => a.date === b.date ? a.t - b.t : (a.date < b.date ? -1 : 1));

  events.forEach(ev => {
    if(ev.kind === 'lift') push(...formatLift(ev.s));
    else if(ev.kind === 'circuit'){
      push('--- Recovery · ' + xDate(ev.date) + ' ---');
      push('  ' + ev.x.title + (ev.x.secs ? '  (' + Math.round(ev.x.secs/60) + ' min)' : ''));
      push('');
    } else {
      push('--- Cardio · ' + xDate(ev.date) + ' ---');
      const bits = ['  ' + (ev.x.type || 'Cardio') + '  ' + ev.x.mins + ' min'];
      if(ev.x.speed) bits.push(ev.x.speed + ' mph');
      if(ev.x.incline != null && ev.x.incline !== '') bits.push(ev.x.incline + '% incline');
      if(ev.x.dist) bits.push(ev.x.dist + ' mi');
      push(bits.join('  |  '));
      if(ev.x.notes) push('  Note: ' + ev.x.notes);
      push('');
    }
  });

  // Bodyweight in the window, factual and useful for reading progression.
  const bw = (S.bw || []).filter(e => e.date >= c.start && e.date <= c.end);
  if(bw.length){
    push('--- Bodyweight ---');
    bw.forEach(e => push('  ' + xShort(e.date) + '  ' + e.lb + ' lb'));
    push('');
  }

  push('--- End of cycle ' + c.n + ' ---');
  return L.join('\n');
}

function formatLift(entry){
  const { dayIdx, date, sess } = entry;
  const day = PPL.days[dayIdx] || { n: dayIdx+1, name:'Session', emphasis:'', exercises:[] };
  const out = [];

  let head = '--- Day ' + day.n + ' · ' + day.name + ' · ' + xDate(date);
  if(sess.startedAt && sess.finishedAt) head += ' · ' + xMins(sess.finishedAt - sess.startedAt);
  head += ' ---';
  out.push(head);

  if(day.emphasis) out.push('Emphasis: ' + day.emphasis);
  if(sess.startedAt) out.push('Started ' + xClock(sess.startedAt) + (sess.finishedAt ? ', finished ' + xClock(sess.finishedAt) : ''));
  if(!sess.done) out.push('Status: not marked complete');

  const ci = xCheckin(sess.checkin);
  if(ci) out.push('Check-in: ' + ci);
  if(sess.pump) out.push('Pump: ' + sess.pump + '/10');
  out.push('');

  const logged = sess.logged || {};
  const programmed = day.exercises || [];
  const seen = {};
  let totalWork = 0, totalSets = 0;

  programmed.forEach(ex => {
    const sets = logged[ex.name];
    if(!sets || !sets.length) return;
    seen[ex.name] = true;
    out.push(...formatExercise(ex.name, ex, sets, sess));
    sets.forEach(st => {
      totalSets++;
      if(st.w != null && !isNaN(st.w) && st.r) {
        const lb = (st.u === 'kg') ? Number(st.w) * 2.2046226218 : Number(st.w);
        totalWork += lb * Number(st.r);
      }
    });
  });

  // Anything logged that is not in the day's programme (a substitution).
  Object.keys(logged).forEach(name => {
    if(seen[name]) return;
    out.push(...formatExercise(name, null, logged[name], sess));
    logged[name].forEach(st => {
      totalSets++;
      if(st.w != null && !isNaN(st.w) && st.r){
        const lb = (st.u === 'kg') ? Number(st.w) * 2.2046226218 : Number(st.w);
        totalWork += lb * Number(st.r);
      }
    });
  });

  // Programmed but never logged. Only meaningful once the session is done,
  // otherwise it is simply unfinished rather than skipped.
  if(sess.done){
    const skipped = programmed.filter(ex => !logged[ex.name] || !logged[ex.name].length).map(ex => ex.name);
    if(skipped.length) out.push('Skipped: ' + skipped.join(', '));
  }

  out.push('Session totals: ' + totalSets + ' working sets, ' +
    Math.round(totalWork).toLocaleString('en-US') + ' total work (weight x reps, lb)');
  out.push('');
  return out;
}

function formatExercise(name, ex, sets, sess){
  const out = [];
  let head = name;
  if(ex){
    const meta = [];
    if(ex.group) meta.push(ex.group);
    if(ex.sets) meta.push(ex.sets + ' planned');
    if(ex.targetReps) meta.push('target ' + ex.targetReps);
    if(meta.length) head += '  (' + meta.join(', ') + ')';
  } else {
    head += '  (not in the day\'s programme)';
  }
  const rir = sess.rir ? sess.rir[name] : undefined;
  if(rir !== undefined && rir !== null) head += '  RIR ' + (rir === 4 ? '4+' : rir);
  out.push(head);
  sets.forEach((st, i) => out.push('   ' + (i+1) + '. ' + xSet(st)));
  return out;
}

/* ---------- screen ---------- */

let exportCycles = null;
let exportPick = 0;
let exportText = '';

function openExport(){
  exportCycles = buildCycles();
  exportPick = 0;
  exportText = exportCycles.length ? formatCycle(exportCycles[0]) : '';
  go('exportWorkouts');
}

function pickCycle(i){
  exportPick = i;
  exportText = formatCycle(exportCycles[i]);
  render();
  window.scrollTo(0,0);
}

function renderExport(){
  if(!exportCycles) exportCycles = buildCycles();

  if(!exportCycles.length){
    document.getElementById('app').innerHTML = `
      <div class="shead"><button class="back" onclick="backHome()">← Back</button>
        <div class="shead-meta">Workout Export</div></div>
      <div class="stitle">Export</div>
      <div class="hist-empty">No PPL sessions logged yet.<br>
        Finish a workout on the 8-day rotation and it will show up here as a cycle.</div>
      <div style="height:40px"></div>`;
    return;
  }

  const tabs = exportCycles.map((c,i) => `
    <button class="cyc-tab ${i===exportPick?'sel':''}" onclick="pickCycle(${i})">
      <span class="cyc-n">Cycle ${c.n}${c.current?' ·':''}</span>
      <span class="cyc-d">${xShort(c.start)} – ${xShort(c.end)}</span>
      <span class="cyc-c">${c.sessions.length}/6 days</span>
    </button>`).join('');

  const c = exportCycles[exportPick];

  document.getElementById('app').innerHTML = `
    <div class="shead"><button class="back" onclick="backHome()">← Back</button>
      <div class="shead-meta">Workout Export</div></div>
    <div class="stitle">Export for your coach</div>
    <div class="travel-intro">Plain text, one 8-day cycle at a time. Copy it and paste it wherever you want it reviewed.</div>

    <div class="sect-label">Pick a cycle</div>
    <div class="cyc-row">${tabs}</div>

    <div class="sect-label">Cycle ${c.n}${c.current?' (in progress)':''}</div>
    <div class="sum-stats" style="margin-bottom:12px">
      <div class="sum-stat"><div class="sum-num">${c.sessions.length}</div><div class="sum-lbl">Lifting days</div></div>
      <div class="sum-stat"><div class="sum-num">${cycleSets(c)}</div><div class="sum-lbl">Working sets</div></div>
      <div class="sum-stat"><div class="sum-num">${cycleCheckins(c)}</div><div class="sum-lbl">Check-ins</div></div>
    </div>

    <button class="btn-primary" onclick="copyExport()">Copy export</button>
    <button class="sub-btn" onclick="downloadExport()">Download as .txt</button>

    <div class="sect-label">Preview</div>
    <div class="set-card" style="padding:12px">
      <pre class="export-pre" id="exportPre">${esc(exportText)}</pre>
    </div>
    <div class="set-note" style="padding:0 2px">If the copy button is blocked, long-press the text above and copy it by hand.</div>
    <div style="height:40px"></div>`;
}

function cycleSets(c){
  let n = 0;
  c.sessions.forEach(s => Object.values(s.sess.logged || {}).forEach(sets => n += sets.length));
  return n;
}
function cycleCheckins(c){
  return c.sessions.filter(s => s.sess.checkin && Object.keys(s.sess.checkin).length).length;
}

function copyExport(){
  const done = () => toast('Copied', 'paste it wherever you need it', 'green');
  const fail = () => toast('Could not copy', 'long-press the preview text instead', 'peak');

  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(exportText).then(done, () => legacyCopy(done, fail));
  } else {
    legacyCopy(done, fail);
  }
}

/* execCommand is deprecated but still the only thing that works in a few
   standalone-mode browsers where the async clipboard API is refused. */
function legacyCopy(done, fail){
  try{
    const ta = document.createElement('textarea');
    ta.value = exportText;
    ta.setAttribute('readonly','');
    ta.style.position = 'fixed';
    ta.style.top = '-1000px';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, exportText.length);
    const ok = document.execCommand('copy');
    ta.remove();
    ok ? done() : fail();
  }catch(e){ fail(); }
}

function downloadExport(){
  try{
    const c = exportCycles[exportPick];
    const blob = new Blob([exportText], { type:'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'YVY-workout-cycle-' + c.n + '-' + c.start + '.txt';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Downloaded', '', 'green');
  }catch(e){ toast('Could not download', 'use Copy instead', 'peak'); }
}

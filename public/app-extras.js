/* ============================================================
   You vs You - Cardio, macros, history, calendar, bodyweight
   ============================================================ */

/* Speed and distance follow the weight unit: pounds means mph and
   miles, kilograms means km/h and kilometres. */
function spdUnit(){ return unit() === 'kg' ? 'km/h' : 'mph'; }
function distUnit(){ return unit() === 'kg' ? 'km' : 'mi'; }
const KM_PER_MI = 1.609344;

const CARDIO_TYPES = ['Treadmill','Walk','Bike','Elliptical'];

/* ============ CARDIO ============ */

let cardioDraft = { type:'Treadmill', mins:'', speed:'', incline:'', notes:'' };

function renderCardio(){
  const list = (S.cardio || []).slice().reverse();
  const weekMins = (S.cardio || [])
    .filter(c => c.date >= dayStr(6))
    .reduce((a,c) => a + (c.mins || 0), 0);
  const last = (S.cardio || [])[S.cardio.length-1];

  const typeChips = CARDIO_TYPES.map(t =>
    `<button class="chip ${cardioDraft.type===t?'sel':''}" onclick="setCardioType('${t}')">${t}</button>`).join('');

  const isMill = cardioDraft.type === 'Treadmill';

  const rows = list.map((c,i) => {
    const d = new Date(c.date+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'});
    const bits = [];
    if(c.speed) bits.push(showSpeed(c) + ' ' + spdUnit());
    if(c.incline != null && c.incline !== '') bits.push(c.incline + '% incline');
    if(c.dist) bits.push(showDist(c) + ' ' + distUnit());
    return `<div class="cardio-row">
      <div class="cr-left">
        <div class="cr-type">${esc(c.type || 'Cardio')}<span class="cr-date">${d}</span></div>
        <div class="cr-detail">${esc(bits.join(' · ')) || '&nbsp;'}${c.notes?' · '+esc(c.notes):''}</div>
      </div>
      <div class="cr-mins">${c.mins}<small>min</small></div>
      <button class="cr-del" onclick="deleteCardio(${S.cardio.length-1-i})">×</button>
    </div>`;
  }).join('');

  document.getElementById('app').innerHTML = `
    <div class="shead"><button class="back" onclick="backHome()">← Back</button>
      <div class="shead-meta">Cardio Log</div></div>
    <div class="stitle">Cardio</div>

    <div class="sum-stats" style="margin-bottom:16px">
      <div class="sum-stat"><div class="sum-num">${weekMins}</div><div class="sum-lbl">Min this week</div></div>
      <div class="sum-stat"><div class="sum-num">${(S.cardio||[]).length}</div><div class="sum-lbl">Sessions</div></div>
      <div class="sum-stat"><div class="sum-num">${last?last.mins:'—'}</div><div class="sum-lbl">Last session</div></div>
    </div>

    <div class="sect-label">Log a session</div>
    <div class="set-card">
      <div class="chip-row">${typeChips}</div>
      <div class="field-row">
        <label class="field"><span>Minutes</span>
          <input class="modal-inp" id="cdMins" inputmode="numeric" type="number" value="${cardioDraft.mins}" oninput="cardioInput()"></label>
        <label class="field"><span>Speed (${spdUnit()})</span>
          <input class="modal-inp" id="cdSpeed" inputmode="decimal" type="number" step="any" value="${cardioDraft.speed}" oninput="cardioInput()"></label>
      </div>
      <div class="field-row">
        <label class="field ${isMill?'':'dim'}"><span>Incline %</span>
          <input class="modal-inp" id="cdIncline" inputmode="decimal" type="number" step="any" value="${cardioDraft.incline}" oninput="cardioInput()"></label>
        <label class="field"><span>Distance (${distUnit()})</span>
          <input class="modal-inp" id="cdDist" inputmode="decimal" type="number" step="any" placeholder="${estDist()}" oninput="cardioInput()"></label>
      </div>
      <label class="field full"><span>Note (optional)</span>
        <input class="modal-inp" id="cdNotes" type="text" value="${esc(cardioDraft.notes)}" oninput="cardioInput()"></label>
      <div class="set-note" id="cdHint">${cardioHint()}</div>
      <button class="btn-primary" onclick="saveCardio()">Log it</button>
    </div>

    <div class="sect-label">History</div>
    ${rows ? `<div class="hist-card plain">${rows}</div>` : `<div class="hist-empty">Nothing logged yet.<br>Your first treadmill session shows up here.</div>`}
    <div style="height:40px"></div>`;
}

function setCardioType(t){ cardioDraft.type = t; readCardio(); renderCardio(); }
function readCardio(){
  const g = id => { const e = document.getElementById(id); return e ? e.value : ''; };
  cardioDraft.mins = g('cdMins');
  cardioDraft.speed = g('cdSpeed');
  cardioDraft.incline = g('cdIncline');
  cardioDraft.notes = g('cdNotes');
}
function cardioInput(){
  readCardio();
  const h = document.getElementById('cdHint');
  if(h) h.innerHTML = cardioHint();
  const d = document.getElementById('cdDist');
  if(d) d.placeholder = estDist();
}
function estDist(){
  const s = parseFloat(cardioDraft.speed), m = parseFloat(cardioDraft.mins);
  if(isNaN(s) || isNaN(m) || s <= 0 || m <= 0) return '—';
  return (Math.round(s * (m/60) * 100) / 100);
}
function cardioHint(){
  const s = parseFloat(cardioDraft.speed), m = parseFloat(cardioDraft.mins);
  if(isNaN(s) || isNaN(m) || s <= 0 || m <= 0) return 'Distance fills in automatically once speed and minutes are in.';
  const d = s * (m/60);
  const otherS = unit()==='kg' ? (s/KM_PER_MI) : (s*KM_PER_MI);
  const otherU = unit()==='kg' ? 'mph' : 'km/h';
  const pace = 60 / s;
  const pm = Math.floor(pace), ps = Math.round((pace-pm)*60);
  return `About <b>${Math.round(d*100)/100} ${distUnit()}</b> · ${Math.round(otherS*10)/10} ${otherU} · pace ${pm}:${String(ps).padStart(2,'0')} per ${distUnit()}`;
}
function showSpeed(c){
  // stored canonical in mph
  const v = unit()==='kg' ? c.speed*KM_PER_MI : c.speed;
  return Math.round(v*10)/10;
}
function showDist(c){
  const v = unit()==='kg' ? c.dist*KM_PER_MI : c.dist;
  return Math.round(v*100)/100;
}

function saveCardio(){
  readCardio();
  const mins = parseFloat(cardioDraft.mins);
  if(isNaN(mins) || mins <= 0){ toast('Add the minutes','that is the one required field','peak'); return; }
  const rawSpeed = parseFloat(cardioDraft.speed);
  const rawDistEl = document.getElementById('cdDist');
  const rawDist = rawDistEl && rawDistEl.value !== '' ? parseFloat(rawDistEl.value) : NaN;
  // store canonical in mph / miles
  const speedMph = isNaN(rawSpeed) ? null : (unit()==='kg' ? rawSpeed/KM_PER_MI : rawSpeed);
  let distMi = isNaN(rawDist) ? null : (unit()==='kg' ? rawDist/KM_PER_MI : rawDist);
  if(distMi == null && speedMph) distMi = speedMph * (mins/60);

  S.cardio = S.cardio || [];
  S.cardio.push({
    date: today(), at: Date.now(),
    type: cardioDraft.type,
    mins: Math.round(mins),
    speed: speedMph ? Math.round(speedMph*100)/100 : null,
    incline: cardioDraft.incline === '' ? null : parseFloat(cardioDraft.incline),
    dist: distMi ? Math.round(distMi*1000)/1000 : null,
    notes: (cardioDraft.notes || '').slice(0,120)
  });
  const dy = dayObj(); dy.cardio = true;
  touchStreak();
  cardioDraft = { type:cardioDraft.type, mins:'', speed:'', incline:'', notes:'' };
  save();
  render();
  toast('Cardio logged', Math.round(mins)+' minutes in the book','green');
}

function deleteCardio(idx){
  if(idx < 0 || idx >= (S.cardio||[]).length) return;
  S.cardio.splice(idx,1);
  save(); render();
  toast('Entry removed','','peak');
}

/* ============ MACROS ============ */

function renderMacros(){
  const t = today();
  const m = S.macros[t] || {};
  const days = Object.keys(S.macros).sort().reverse();
  const recent = days.slice(0,14);

  const logged = days.filter(d => d >= dayStr(6) && S.macros[d] && S.macros[d].kcal);
  const avgKcal = logged.length ? Math.round(logged.reduce((a,d)=>a+(S.macros[d].kcal||0),0)/logged.length) : 0;
  const avgPro  = logged.length ? Math.round(logged.reduce((a,d)=>a+(S.macros[d].protein||0),0)/logged.length) : 0;

  const rows = recent.map(d => {
    const e = S.macros[d] || {};
    const label = d === t ? 'Today' : new Date(d+'T00:00:00').toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'});
    const bits = [];
    if(e.protein) bits.push(e.protein+'g P');
    if(e.carbs) bits.push(e.carbs+'g C');
    if(e.fat) bits.push(e.fat+'g F');
    return `<div class="macro-row ${d===t?'today':''}">
      <div><div class="mr-day">${esc(label)}</div><div class="mr-sub">${esc(bits.join(' · '))||'&nbsp;'}</div></div>
      <div class="mr-kcal">${e.kcal||0}<small>kcal</small></div>
    </div>`;
  }).join('');

  document.getElementById('app').innerHTML = `
    <div class="shead"><button class="back" onclick="backHome()">← Back</button>
      <div class="shead-meta">Macros</div></div>
    <div class="stitle">Macros</div>
    <div class="travel-intro">Rough daily totals. No targets, no judgement, just a record so you can see the pattern over a week.</div>

    <div class="sum-stats" style="margin-bottom:16px">
      <div class="sum-stat"><div class="sum-num">${m.kcal||0}</div><div class="sum-lbl">Today kcal</div></div>
      <div class="sum-stat"><div class="sum-num">${avgKcal||'—'}</div><div class="sum-lbl">7-day avg</div></div>
      <div class="sum-stat"><div class="sum-num">${avgPro||'—'}</div><div class="sum-lbl">Avg protein</div></div>
    </div>

    <div class="sect-label">Today</div>
    <div class="set-card">
      <div class="field-row">
        <label class="field"><span>Calories</span>
          <input class="modal-inp" id="mcKcal" inputmode="numeric" type="number" value="${m.kcal||''}"></label>
        <label class="field"><span>Protein (g)</span>
          <input class="modal-inp" id="mcPro" inputmode="numeric" type="number" value="${m.protein||''}"></label>
      </div>
      <div class="field-row">
        <label class="field"><span>Carbs (g)</span>
          <input class="modal-inp" id="mcCarb" inputmode="numeric" type="number" value="${m.carbs||''}"></label>
        <label class="field"><span>Fat (g)</span>
          <input class="modal-inp" id="mcFat" inputmode="numeric" type="number" value="${m.fat||''}"></label>
      </div>
      <button class="btn-primary" onclick="saveMacros()">Save today</button>
    </div>

    <div class="sect-label">From your tracker</div>
    <div class="set-card">
      <button class="modal-btn cancel" style="width:100%" onclick="openMacroImport()">Paste an export →</button>
      <div class="set-note">Bulk-fill days from wherever you log food. You see exactly what it read before anything saves.</div>
    </div>

    <div class="sect-label">Last two weeks</div>
    ${rows ? `<div class="hist-card plain">${rows}</div>` : `<div class="hist-empty">Nothing logged yet.</div>`}
    <div style="height:40px"></div>`;
}

function saveMacros(){
  const num = id => { const e = document.getElementById(id); const v = parseFloat(e ? e.value : ''); return isNaN(v) ? 0 : Math.round(v); };
  const entry = { kcal:num('mcKcal'), protein:num('mcPro'), carbs:num('mcCarb'), fat:num('mcFat') };
  if(!entry.kcal && !entry.protein && !entry.carbs && !entry.fat){
    delete S.macros[today()];
  } else {
    S.macros[today()] = entry;
  }
  save(); render();
  toast('Macros saved','','green');
}

/* ============ HISTORY ============ */

/* Sessions are keyed differently per program, so this turns any key
   back into something readable. */
function labelForKey(key, sess){
  if(key.indexOf('ppl:') === 0){
    const parts = key.split(':');
    const d = PPL.days[parseInt(parts[1])] || { n:'?', name:'Session' };
    return { title: 'PPL · ' + d.name, date: parts[2] || '' };
  }
  const p = key.split('-').map(Number);
  const m = D.program[p[0]], w = m && m.weeks[p[1]], dd = w && w.days[p[2]];
  if(!dd) return { title:'Session', date:'' };
  return { title: 'M' + m.index + ' W' + w.week + ' · Day ' + dd.day, date:'' };
}

function renderHistory(){
  const entries = Object.keys(S.sessions)
    .map(k => ({ k, sess: S.sessions[k] }))
    .filter(e => e.sess && (e.sess.done || Object.keys(e.sess.logged||{}).length))
    .sort((a,b) => (b.sess.finishedAt||b.sess.startedAt||0) - (a.sess.finishedAt||a.sess.startedAt||0));

  let body;
  if(!entries.length){
    body = `<div class="hist-empty">No sessions logged yet.<br>Finish a workout and it shows up here.</div>`;
  } else {
    body = entries.map(e => {
      const lab = labelForKey(e.k, e.sess);
      let exLines = '', total = 0;
      Object.keys(e.sess.logged||{}).forEach(name => {
        const sets = e.sess.logged[name];
        const str = sets.map(s => setStr(name, s)).join(', ');
        sets.forEach(s => total += setWork(name, s));
        exLines += `<div class="hist-ex"><span class="hist-ex-name">${esc(name)}</span><span class="hist-ex-sets">${esc(str)}</span></div>`;
      });
      if(!exLines) exLines = `<div class="hist-ex"><span class="hist-ex-name" style="color:var(--dim)">Marked done, no sets logged</span></div>`;
      const st = e.sess.startedAt, fi = e.sess.finishedAt;
      const dateLine = st ? new Date(st).toLocaleDateString('en-US',{month:'short',day:'numeric'}) : lab.date;
      const timeLine = st ? fmtTimeOfDay(st) + (fi ? ' · ' + fmtMinutes(fi-st) : '') : (e.sess.done ? '✓ complete' : 'in progress');
      return `<div class="hist-card">
        <div class="hist-head">
          <div class="hist-day">${esc(lab.title)}</div>
          <div class="hist-when">${esc(dateLine)}${dateLine?' · ':''}${esc(timeLine)}</div>
        </div>
        <div class="hist-sub">${total?fmt(total)+' total work':''}${e.sess.pump?' · pump '+e.sess.pump+'/10':''}</div>
        ${exLines}</div>`;
    }).join('');
  }
  document.getElementById('app').innerHTML = `
    <div class="shead"><button class="back" onclick="backHome()">← Back</button>
      <div class="shead-meta">Your Workout Log</div></div>
    <div class="stitle">History</div>
    <button class="sub-btn" style="margin-bottom:16px" onclick="openExport()">Export an 8-day cycle for your coach →</button>
    ${body}
    <div style="height:40px"></div>`;
}

/* ============ CALENDAR ============ */

let calMonth = null;

function renderCalendar(){
  if(!calMonth){ const n = new Date(); calMonth = { y:n.getFullYear(), m:n.getMonth() }; }
  const { y, m } = calMonth;
  const first = new Date(y,m,1);
  const startDow = first.getDay();
  const daysInMonth = new Date(y,m+1,0).getDate();
  const monthName = first.toLocaleDateString('en-US',{month:'long',year:'numeric'});
  const todayStr = today();

  let gymCount = 0, coreCount = 0, cardioCount = 0, cells = '';
  ['S','M','T','W','T','F','S'].forEach(d => cells += `<div class="cal-dow">${d}</div>`);
  for(let i=0;i<startDow;i++) cells += `<div class="cal-cell empty"></div>`;
  for(let day=1; day<=daysInMonth; day++){
    const ds = `${y}-${String(m+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const act = S.daily[ds] || {};
    let cls = '';
    if(act.workout){ cls = 'gym'; gymCount++; }
    else if(act.core){ cls = 'core'; }
    else if(act.cardio){ cls = 'cardioday'; }
    else if(act.travel) cls = 'travel';
    else if(act.rest) cls = 'rest';
    if(act.core) coreCount++;
    if(act.cardio) cardioCount++;
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
        <div class="cal-leg"><span class="cal-leg-dot" style="background:var(--win)"></span>Lift</div>
        <div class="cal-leg"><span class="cal-leg-dot" style="background:var(--peak)"></span>Core</div>
        <div class="cal-leg"><span class="cal-leg-dot" style="background:#5ac8fa"></span>Cardio</div>
        <div class="cal-leg"><span class="cal-leg-dot" style="background:var(--hold)"></span>Rest</div>
      </div>
    </div>
    <div class="sum-stats">
      <div class="sum-stat"><div class="sum-num">${gymCount}</div><div class="sum-lbl">Lift days</div></div>
      <div class="sum-stat"><div class="sum-num">${coreCount}</div><div class="sum-lbl">Core days</div></div>
      <div class="sum-stat"><div class="sum-num">${cardioCount}</div><div class="sum-lbl">Cardio days</div></div>
    </div>
    <div style="height:40px"></div>`;
}
function calShift(dd){
  let mo = calMonth.m + dd, y = calMonth.y;
  if(mo < 0){ mo = 11; y--; }
  if(mo > 11){ mo = 0; y++; }
  calMonth = { y, m:mo };
  render();
}

/* ============ BODYWEIGHT GRAPH ============ */

function renderBWGraph(){
  const arr = (S.bw || []).slice();
  const u = unit();
  const conv = lb => u==='kg' ? Math.round(lb/LB_PER_KG*10)/10 : Math.round(lb*10)/10;
  let body;
  if(!arr.length){
    body = `<div class="hist-empty">No bodyweight logged yet.<br>Tap "Log +" on the home screen to start.</div>`;
  } else {
    const vals = arr.map(e => conv(e.lb));
    const min = Math.min(...vals), max = Math.max(...vals);
    const latest = vals[vals.length-1], firstV = vals[0];
    const diff = latest - firstV;
    const pad = (max-min)*0.15 || 2;
    const lo = min-pad, hi = max+pad;
    const W = 300, H = 160;
    let pts, path = '', dots = '';
    if(arr.length === 1) pts = [[W/2, H/2]];
    else pts = arr.map((e,i) => [ (i/(arr.length-1))*W, H - ((conv(e.lb)-lo)/(hi-lo))*H ]);
    pts.forEach((p,i) => {
      path += (i===0?'M':'L')+p[0].toFixed(1)+' '+p[1].toFixed(1)+' ';
      dots += `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3.5" fill="var(--win)"/>`;
    });
    const area = pts.length>1 ? `<path d="${path} L ${W} ${H} L 0 ${H} Z" fill="url(#bwgrad)" opacity="0.18"/>` : '';
    const trendCls = diff<-0.05?'down':(diff>0.05?'up':'flat');
    const trendStr = Math.abs(diff)<0.05 ? '—' : (diff<0?'▼ '+Math.abs(diff).toFixed(1):'▲ '+diff.toFixed(1));

    const logRows = arr.slice().reverse().map(e => {
      const dt = new Date(e.date+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'});
      return `<div class="glog-row"><span class="glog-date">${dt}</span><span class="glog-val">${conv(e.lb)} ${u}</span></div>`;
    }).join('');

    body = `
      <div class="graph-card">
        <div class="graph-stats">
          <div class="gstat"><div class="gstat-num">${latest}</div><div class="gstat-lbl">Current ${u}</div></div>
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

/* ============================================================
   MACRO IMPORT
   Paste an export from wherever you actually log food, preview
   what it read, then commit. Nothing is written until you confirm,
   because a silent import that clobbers a week of days because the
   source changed its formatting is the failure worth preventing.
   ============================================================ */

let macroPaste = '';
let macroParsed = null;

/* Tolerant on purpose. Labels are matched by name, so field order does not
   matter and the other end can reformat without breaking this. Anything the
   parser cannot read is reported back rather than silently dropped. */
function parseMacroPaste(text){
  const rows = [], skipped = [];

  String(text || '').split(/\r?\n/).forEach(line => {
    const raw = line.trim();
    if(!raw) return;
    if(/^```/.test(raw)) return;                       // markdown fence
    if(/^yvy[-\s]?macros/i.test(raw)) return;          // our header line
    if(/^[|\s:+\-=_]+$/.test(raw)) return;             // table rule

    const dm = raw.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
    if(!dm){ skipped.push(raw); return; }

    const date = dm[1] + '-' + String(+dm[2]).padStart(2,'0') + '-' + String(+dm[3]).padStart(2,'0');
    if(!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(date)){ skipped.push(raw); return; }

    const rest = raw.slice(dm.index + dm[0].length);
    const grab = re => { const m = rest.match(re); return m ? Math.round(parseFloat(m[1])) : null; };

    // Label-first ("protein: 196") is tried before number-first ("196 P").
    // The other way round, "kcal: 2410 protein: 196" lets the protein pattern
    // swallow "2410 protein" and record the calories as grams of protein.
    let kcal    = grab(/(?:kcal|cal(?:ories)?)\s*[:=]\s*([\d.]+)/i) ?? grab(/([\d.]+)\s*(?:kcal|cal(?:ories)?)\b/i);
    let protein = grab(/protein\s*[:=]\s*([\d.]+)/i)              ?? grab(/([\d.]+)\s*g?\s*(?:p\b|protein)/i);
    let carbs   = grab(/carb\w*\s*[:=]\s*([\d.]+)/i)              ?? grab(/([\d.]+)\s*g?\s*(?:c\b|carb\w*)/i);
    let fat     = grab(/fat\s*[:=]\s*([\d.]+)/i)                  ?? grab(/([\d.]+)\s*g?\s*(?:f\b|fat)/i);

    // Fallback: a bare "date 2410 196 229 72" with no labels at all.
    if(kcal === null && protein === null && carbs === null && fat === null){
      const nums = (rest.match(/[\d.]+/g) || []).map(n => Math.round(parseFloat(n)));
      if(nums.length === 4){ kcal = nums[0]; protein = nums[1]; carbs = nums[2]; fat = nums[3]; }
      else { skipped.push(raw); return; }
    }

    const row = { date, kcal: kcal||0, protein: protein||0, carbs: carbs||0, fat: fat||0, raw };
    if(!row.kcal && !row.protein && !row.carbs && !row.fat){ skipped.push(raw); return; }
    rows.push(row);
  });

  // Same day twice in one paste: the later line wins, and say so.
  const byDate = {}, dupes = [];
  rows.forEach(r => { if(byDate[r.date]) dupes.push(r.date); byDate[r.date] = r; });

  const out = Object.keys(byDate).sort().map(d => byDate[d]);
  const t = today();
  out.forEach(r => {
    const cur = S.macros[r.date];
    r.replaces = cur ? (cur.kcal || 0) : null;
    r.future = r.date > t;
  });
  return { rows: out, skipped, dupes: [...new Set(dupes)] };
}

function openMacroImport(){
  macroPaste = '';
  macroParsed = null;
  go('macroImport');
}

function renderMacroImport(){
  const p = macroParsed;

  let body;
  if(!p){
    body = `
      <div class="set-card">
        <div class="set-note" style="margin-top:0;margin-bottom:11px">
          Paste the block from wherever you log your food. One line per day.
          Nothing is saved until you have seen what it read.
        </div>
        <textarea class="modal-inp paste-box" id="macroPasteBox" spellcheck="false"
          placeholder="YVY-MACROS v1&#10;2026-11-15 | 2280 kcal | 201 P | 198 C | 71 F&#10;2026-11-16 | 2410 kcal | 196 P | 229 C | 72 F">${esc(macroPaste)}</textarea>
        <button class="btn-primary" onclick="runMacroParse()">Read it</button>
      </div>
      <div class="sect-label">The format</div>
      <div class="set-card">
        <div class="fmt-sample">2026-11-16 | 2410 kcal | 196 P | 229 C | 72 F</div>
        <div class="set-note">Field order does not matter and labels can be spelled out
        (<b>protein</b>, <b>carbs</b>, <b>fat</b>). A missing field counts as zero. Lines it
        cannot read are listed back to you rather than dropped.</div>
      </div>`;
  } else {
    const rows = p.rows.map(r => {
      const d = new Date(r.date+'T00:00:00').toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'});
      const bits = [];
      if(r.protein) bits.push(r.protein+'g P');
      if(r.carbs) bits.push(r.carbs+'g C');
      if(r.fat) bits.push(r.fat+'g F');
      const tag = r.replaces !== null
        ? `<span class="imp-tag replace">replaces ${fmt(r.replaces)}</span>`
        : `<span class="imp-tag new">new</span>`;
      return `<div class="macro-row">
        <div><div class="mr-day">${esc(d)} ${tag}${r.future?'<span class="imp-tag future">future</span>':''}</div>
          <div class="mr-sub">${esc(bits.join(' · '))||'&nbsp;'}</div></div>
        <div class="mr-kcal">${r.kcal}<small>kcal</small></div>
      </div>`;
    }).join('');

    const willReplace = p.rows.filter(r => r.replaces !== null).length;

    body = `
      <div class="sum-stats" style="margin-bottom:14px">
        <div class="sum-stat"><div class="sum-num">${p.rows.length}</div><div class="sum-lbl">Days read</div></div>
        <div class="sum-stat"><div class="sum-num">${willReplace}</div><div class="sum-lbl">Overwrites</div></div>
        <div class="sum-stat"><div class="sum-num">${p.skipped.length}</div><div class="sum-lbl">Skipped</div></div>
      </div>
      ${p.rows.length ? `<div class="hist-card plain">${rows}</div>`
        : `<div class="hist-empty">Nothing readable in that paste.<br>Check the format below and try again.</div>`}
      ${p.dupes.length ? `<div class="diag-warn">Same day listed more than once (${esc(p.dupes.join(', '))}). The last line for each day is the one kept.</div>` : ''}
      ${p.skipped.length ? `<div class="sect-label">Lines it skipped</div>
        <div class="set-card"><div class="skip-list">${p.skipped.slice(0,12).map(s=>`<div>${esc(s)}</div>`).join('')}
        ${p.skipped.length>12?`<div style="color:var(--dim)">and ${p.skipped.length-12} more</div>`:''}</div></div>` : ''}
      ${p.rows.length ? `<button class="btn-primary" style="margin-top:14px" onclick="commitMacroImport()">Import ${p.rows.length} day${p.rows.length===1?'':'s'}</button>` : ''}
      <button class="mini-link" onclick="resetMacroImport()">Paste something else</button>`;
  }

  document.getElementById('app').innerHTML = `
    <div class="shead"><button class="back" onclick="go('macros')">← Back</button>
      <div class="shead-meta">Import Macros</div></div>
    <div class="stitle">Paste from tracker</div>
    ${body}
    <div style="height:40px"></div>`;
}

function runMacroParse(){
  const el = document.getElementById('macroPasteBox');
  macroPaste = el ? el.value : '';
  if(!macroPaste.trim()){ toast('Nothing pasted','drop the block in first','peak'); return; }
  macroParsed = parseMacroPaste(macroPaste);
  render();
  window.scrollTo(0,0);
}

function resetMacroImport(){ macroParsed = null; render(); window.scrollTo(0,0); }

function commitMacroImport(){
  if(!macroParsed || !macroParsed.rows.length) return;
  const n = macroParsed.rows.length;
  macroParsed.rows.forEach(r => {
    S.macros[r.date] = { kcal:r.kcal, protein:r.protein, carbs:r.carbs, fat:r.fat };
  });
  save();
  macroPaste = ''; macroParsed = null;
  go('macros');
  toast('Imported ' + n + ' day' + (n===1?'':'s'), 'macros updated', 'green');
}

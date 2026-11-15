// Training Arc: views and routing.
import * as S from './store.js';
import * as P from './program.js';
import { EXERCISES, EQUIPMENT, ytSearch } from './data/exercises.js';
import { CATEGORIES } from './data/workouts.js';
import {
  adaptWorkout, workoutMeta, compile, warmCoolPlan, warmup, cooldown, rankFor, RANKS,
  INJURY_REGIONS, INJURY_LEVELS, parseEntry, allExerciseIds,
} from './engine.js';
import { startPlayer } from './player.js';
import { unlockAudio, englishVoices, setVoice, say } from './audio.js';
import * as Sync from './sync.js';

const $app = document.getElementById('app');
const $player = document.getElementById('player');
const h = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const LVL_NAMES = ['', 'Easy', 'Steady', 'Solid', 'Hard', 'Savage'];
const SLOT_NAMES = { ...CATEGORIES, recovery: 'Recovery' };

function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.classList.add('out'), 2200);
  setTimeout(() => t.remove(), 2700);
}

// ---------- small render helpers ----------
const lvlPips = (n) => `<span class="pips" title="Level ${n}: ${LVL_NAMES[n]}">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= n ? 'on' : ''}"></i>`).join('')}</span>`;
function eqLabel(eq) { return eq.length ? eq.map((q) => EQUIPMENT[q]?.short || q).join(' + ') : 'No equipment'; }
function durLabel(w) {
  const p = warmCoolPlan(w);
  return p.extra ? `${w.min} min <small>+ ${Math.round((p.warm + p.cool) / 60)} warm-up</small>` : `${w.min} min`;
}

function workoutCard(w, extra = '') {
  const a = adaptWorkout(w, S.ctx());
  const m = workoutMeta(a.workout);
  const r = S.avgRating(w.id);
  return `<a class="wcard ${a.blocked ? 'blocked' : ''}" href="#/w/${encodeURIComponent(w.id)}">
    <div class="wcard-top"><span class="cat cat-${w.cat[0]}">${h(SLOT_NAMES[w.cat[0]])}</span>${w.bench ? '<span class="tag boss">Boss</span>' : ''}${w.custom ? '<span class="tag">Yours</span>' : ''}${w.squadShared ? `<span class="tag sq">Squad · ${h(w.byName || '')}</span>` : ''}${(w.custom || w.squadShared) ? (S.rankedLevelFor(w.id) ? '<span class="tag b">Ranked</span>' : '<span class="tag">Unranked · L1 XP</span>') : ''}${r ? `<span class="tag star">★ ${r.toFixed(1)}</span>` : ''}</div>
    <div class="wcard-name">${h(w.name)}</div>
    <div class="wcard-meta">${durLabel(w)} · ${h(eqLabel(m.eq))} · ${h(w.fmt || '')}</div>
    <div class="wcard-foot">${lvlPips(w.lvl)}${m.quiet ? '<span class="tag q">Quiet</span>' : ''}${m.backFriendly ? '<span class="tag b">Back-friendly</span>' : ''}${a.swaps.length ? `<span class="tag sw">${a.swaps.length} swap${a.swaps.length > 1 ? 's' : ''}</span>` : ''}${a.blocked ? `<span class="tag no">${a.missing.length ? 'Needs ' + h(eqLabel(a.missing)) : 'Not possible right now'}</span>` : ''}</div>
    ${extra}
  </a>`;
}

function blockText(b) {
  const names = (list) => list.map((s) => {
    const e = parseEntry(s);
    const ex = EXERCISES[e.id];
    const unit = ex.unit === 's' ? 's' : ex.unit === 'm' ? ' m' : '';
    const q = e.qty === 'n' ? 'n' : e.qty;
    return `${q != null ? q + unit + ' ' : ''}${ex.name}${e.mult !== 1 ? ` (×${e.mult})` : ''}${ex.uni && ex.unit === 'r' ? ' each side' : ''}`;
  });
  switch (b.t) {
    case 'sets': return `<b>${b.sets} sets</b>, rest ${b.rest}s: ${names(b.ex).join(' + ')}`;
    case 'int': return `<b>${b.rounds} rounds</b> · ${b.work}s on / ${b.rest}s off${b.rrest ? ` · ${b.rrest}s between rounds` : ''}: ${names(b.ex).join(', ')}`;
    case 'emom': return `<b>EMOM ${b.min} min</b>${b.rising ? ' (reps = minute number)' : ''}: ${names(b.ex).map((n, i) => `<span class="nb">min ${i + 1}: ${n}</span>`).join(' ')}`;
    case 'amrap': return `<b>AMRAP ${b.min} min</b>: ${names(b.ex).join(', ')}`;
    case 'ladder': return `<b>Reps ${b.reps.join('-')}</b>${b.cap ? ` · cap ${b.cap} min` : ''}: ${names(b.ex).join(', ')}`;
    case 'rounds': return `<b>${b.rounds} rounds</b>${b.rest ? `, rest ${b.rest}s` : ''}${b.cap ? ` · cap ${b.cap} min` : ''}: ${names(b.ex).join(', ')}`;
    case 'chip': return `<b>For time</b>${b.cap ? ` (cap ${b.cap} min)` : ''}: ${names(b.ex).join(' → ')}`;
    case 'flow': return `<b>${b.rounds > 1 ? b.rounds + '× ' : ''}Flow</b>: ${names(b.ex).join(', ')}`;
    case 'timed': return `<b>${Math.round(b.sec / 60)} min</b> ${names([b.ex])[0].replace(/^\d+s /, '')}`;
    case 'note': return `<b>${{ amrap: `AMRAP ${b.min} min`, emom: `EMOM ${b.min} min`, int: `${b.rounds} × ${b.work}s on / ${b.rest}s off`, fortime: `For time${b.min ? ` (cap ${b.min} min)` : ''}` }[b.mode]}</b><div class="note">${h(b.text).replace(/\n/g, '<br>')}</div>`;
  }
  return '';
}

// ================= VIEWS =================
const views = {};

views.home = () => {
  const st = S.get();
  const xp = S.xpTotal();
  const rank = rankFor(xp);
  const today = S.todayISO();
  const mon = S.mondayOf();
  const needCheckin = !st.checkins[mon];
  let mission = '';
  let dayInfo = null;
  if (st.program) dayInfo = P.programDay(st.program, today);
  if (dayInfo) {
    const w = P.workoutForDay(dayInfo);
    const wt = P.WEEK_TYPES[dayInfo.type];
    const doneToday = st.history.some((x) => x.date.slice(0, 10) === today && x.min > 0);
    mission = `<div class="mission ${dayInfo.bench ? 'boss' : ''}">
      <div class="mission-kicker">${dayInfo.bench ? 'Boss fight day' : "Today's mission"} · Week ${dayInfo.week + 1} ${h(wt.name)} · ${h(SLOT_NAMES[dayInfo.slot])}</div>
      ${w ? `<div class="mission-name">${h(w.name)}</div>
      <div class="mission-meta">${durLabel(w)} · ${h(eqLabel(workoutMeta(adaptWorkout(w, S.ctx()).workout).eq))} · ${lvlPips(w.lvl)}</div>
      <div class="row"><a class="btn big" href="#/w/${encodeURIComponent(w.id)}?planned=1">${doneToday ? 'Go again' : 'Start'}</a><button class="btn ghost" data-act="reroll">Swap workout</button></div>`
      : '<p>No workout fits today with your current equipment and injuries. Try the library.</p>'}
      ${doneToday ? '<div class="done-stamp">CLEARED</div>' : ''}
    </div>`;
  } else {
    const c = S.ctx();
    const target = st.settings.defaultMin || 30;
    const pool = S.allWorkouts().filter((w) => !w.recovery && !adaptWorkout(w, c).blocked && Math.abs(w.min - target) <= 10);
    pool.sort((a, b) => S.scoreWorkout(b, today) - S.scoreWorkout(a, today));
    const w = pool[0];
    mission = `<div class="mission">
      <div class="mission-kicker">Suggested for today</div>
      ${w ? `<div class="mission-name">${h(w.name)}</div>
      <div class="mission-meta">${durLabel(w)} · ${h(SLOT_NAMES[w.cat[0]])} · ${lvlPips(w.lvl)}</div>
      <div class="row"><a class="btn big" href="#/w/${encodeURIComponent(w.id)}">Start</a><a class="btn ghost" href="#/arc">Start a training arc</a></div>`
      : '<p>Tick the equipment you own in settings to unlock workouts.</p><a class="btn" href="#/settings">Settings</a>'}
    </div>`;
  }

  const week = DAYS.map((d, i) => {
    const iso = S.addDays(mon, i);
    const done = st.history.some((x) => x.date.slice(0, 10) === iso && x.min > 0);
    const pd = st.program ? P.programDay(st.program, iso) : null;
    return `<div class="wk-day ${done ? 'done' : ''} ${iso === today ? 'today' : ''}"><b>${d[0]}</b><small>${pd ? h((SLOT_NAMES[pd.slot] || '').split(' ')[0]) : ''}</small></div>`;
  }).join('');

  const lastBW = st.bodyweight[st.bodyweight.length - 1];
  const recent = st.history.filter((x) => x.min > 0).slice(0, 3);

  return `
    ${!st.profile.name ? `<div class="card hero-setup"><div class="burst">NEW ARC BEGINS</div>
      <p>Welcome. Set your name and tick the equipment you have so workouts fit your kit.</p>
      <a class="btn big" href="#/settings">Set up</a></div>` : ''}
    <div class="rankbar">
      <div class="rank-badge r-${rank.r}">${rank.r}</div>
      <div class="rank-info"><div class="rank-name">${h(st.profile.name || 'Fighter')} · ${h(rank.title)}</div>
        <div class="xpbar"><i style="width:${Math.round(rank.progress * 100)}%"></i></div>
        <div class="xp-text">${xp} XP${rank.next ? ` · ${rank.next.xp - xp} to ${rank.next.r}-rank` : ' · max rank'} · 🔥 ${S.streak()} day streak</div></div>
    </div>
    <div class="seg" role="group" aria-label="Where are you training?">
      <button class="${!st.settings.quiet ? 'on' : ''}" data-act="quiet" data-v="0">Outside / anything goes</button>
      <button class="${st.settings.quiet ? 'on' : ''}" data-act="quiet" data-v="1">Inside · quiet mode</button>
    </div>
    ${needCheckin ? `<a class="banner" href="#/checkin"><b>Weekly check-in</b><span>How's the body? Set your days for this week. +25 XP</span></a>` : ''}
    ${mission}
    <div class="card"><div class="card-h">This week</div><div class="wk">${week}</div>
      <div class="muted small">${S.pointsBetween(mon, S.addDays(mon, 6))} XP this week</div></div>
    <div class="card"><div class="card-h">Body weight</div>
      <form class="row" data-form="bw"><input type="number" step="0.1" inputmode="decimal" name="kg" placeholder="${lastBW ? lastBW.kg : 'kg'}" aria-label="Body weight in kg"><button class="btn">Log</button></form>
      ${lastBW ? `<div class="muted small">Last: ${lastBW.kg} kg on ${lastBW.date}</div>` : ''}</div>
    ${recent.length ? `<div class="card"><div class="card-h">Recent</div>${recent.map((x) => `<div class="hist"><span>${h(x.name)}</span><small>${x.date.slice(0, 10)} · ${x.min} min · +${x.points} XP${x.score ? ' · ' + h(S.fmtScore(x.score)) : ''}</small></div>`).join('')}</div>` : ''}
    <div class="row center"><a class="btn ghost" href="#/build">+ Add your own workout</a></div>`;
};

// ---------- library ----------
const LF = { q: '', cat: '', eq: '', len: '', lvl: '', quiet: false, back: false, bench: false, squad: false, all: false };
views.library = () => {
  const c = S.ctx();
  const st = S.get();
  let list = S.allWorkouts().map((w) => ({ w, a: adaptWorkout(w, c) }));
  if (!LF.all) list = list.filter((x) => !x.a.blocked);
  if (LF.q) { const q = LF.q.toLowerCase(); list = list.filter(({ w }) => (w.name + ' ' + w.desc + ' ' + w.fmt + ' ' + allExerciseIds(w).map((i) => EXERCISES[i]?.name).join(' ')).toLowerCase().includes(q)); }
  if (LF.cat) list = list.filter(({ w }) => w.cat.includes(LF.cat));
  if (LF.eq) list = list.filter(({ a }) => (LF.eq === 'none' ? workoutMeta(a.workout).eq.length === 0 : workoutMeta(a.workout).eq.includes(LF.eq)));
  if (LF.len) { const [lo, hi] = LF.len.split('-').map(Number); list = list.filter(({ w }) => w.min >= lo && w.min <= hi); }
  if (LF.lvl) { const [lo, hi] = LF.lvl.split('-').map(Number); list = list.filter(({ w }) => w.lvl >= lo && w.lvl <= hi); }
  if (LF.quiet) list = list.filter(({ a }) => workoutMeta(a.workout).quiet);
  if (LF.back) list = list.filter(({ a }) => workoutMeta(a.workout).backFriendly);
  if (LF.bench) list = list.filter(({ w }) => w.bench);
  if (LF.squad) list = list.filter(({ w }) => w.squadShared || w.custom);
  list.sort((x, y) => (x.a.blocked - y.a.blocked) || S.scoreWorkout(y.w) - S.scoreWorkout(x.w));
  const owned = ['none', ...st.settings.owned.filter((q) => q !== 'run')];
  const chip = (key, val, label) => `<button class="chip ${LF[key] === val ? 'on' : ''}" data-act="lf" data-k="${key}" data-v="${val}">${h(label)}</button>`;
  const tog = (key, label) => `<button class="chip ${LF[key] ? 'on' : ''}" data-act="lft" data-k="${key}">${h(label)}</button>`;
  return `
    <h1 class="title">Library</h1>
    <input class="search" type="search" placeholder="Search workouts or exercises" value="${h(LF.q)}" data-input="lfq">
    <div class="chips scroll">${chip('cat', '', 'All types')}${Object.entries(CATEGORIES).map(([k, v]) => chip('cat', k, v)).join('')}</div>
    <div class="chips scroll">${chip('eq', '', 'Any kit')}${owned.map((q) => chip('eq', q, q === 'none' ? 'Bodyweight only' : EQUIPMENT[q].name)).join('')}</div>
    <div class="chips scroll">${chip('len', '', 'Any length')}${chip('len', '10-20', '≤20 min')}${chip('len', '25-35', '25–35 min')}${chip('len', '40-45', '40–45 min')}
      ${chip('lvl', '', 'Any level')}${chip('lvl', '1-2', 'Easy')}${chip('lvl', '3-3', 'Solid')}${chip('lvl', '4-5', 'Hard')}</div>
    <div class="chips scroll">${tog('quiet', 'Quiet')}${tog('back', 'Back-friendly')}${tog('squad', 'Squad workouts')}${tog('bench', 'Boss fights')}${tog('all', 'Show locked')}</div>
    <div class="muted small">${list.length} workouts</div>
    <div class="wlist">${list.map(({ w }) => workoutCard(w)).join('') || '<p class="muted">Nothing matches. Loosen a filter or add equipment in settings.</p>'}</div>`;
};

// ---------- workout detail ----------
let pendingWeights = {};
views.workout = (id, params) => {
  const w = S.workoutById(id);
  if (!w) return '<p>Workout not found.</p>';
  const c = S.ctx();
  const a = adaptWorkout(w, c);
  const m = workoutMeta(a.workout);
  const plan = warmCoolPlan(w);
  const wu = warmup(w, c), cd = cooldown(w, c);
  const loaded = allExerciseIds(a.workout).filter((x) => S.loadedEquipment(x));
  const st = S.get();
  const easeWeek = st.program && (() => { const d = P.programDay(st.program, S.todayISO()); return d && (d.type === 'ease' || d.type === 'deload'); })();
  pendingWeights = {};
  loaded.forEach((x) => { const s = S.suggestWeight(x); if (s) pendingWeights[x] = s.kg; });
  const best = w.bench ? st.history.filter((x) => x.wid === w.id && x.score).sort((x, y) => (S.betterScore(x.score, y.score) ? -1 : 1))[0] : null;
  const r = S.avgRating(w.id);
  return `
    <a class="back" href="javascript:history.back()">← Back</a>
    <div class="detail-head cat-bg-${w.cat[0]}">
      <div class="chips">${w.cat.map((k) => `<span class="cat cat-${k}">${h(SLOT_NAMES[k])}</span>`).join('')}${w.bench ? '<span class="tag boss">Boss fight</span>' : ''}</div>
      <h1 class="title">${h(w.name)}</h1>
      <div class="detail-meta">${durLabel(w)} · ${h(w.fmt || '')} · ${lvlPips(w.lvl)} ${LVL_NAMES[w.lvl]}</div>
      <div class="detail-meta">${h(eqLabel(m.eq))}${m.quiet ? ' · <span class="tag q">Quiet</span>' : ' · <span class="tag">Noisy: outside best</span>'}${m.backFriendly ? ' <span class="tag b">Back-friendly</span>' : ''}${r ? ` <span class="tag star">★ ${r.toFixed(1)}</span>` : ''}</div>
      <p>${h(w.desc || '')}</p>
    </div>
    ${a.blocked ? `<div class="warn">${a.missing.length ? `You need ${h(eqLabel(a.missing))} for this one. Tick it in settings once you have it.` : 'With your current injury settings there is no safe swap for part of this workout.'}</div>` : ''}
    ${a.swaps.length ? `<div class="info"><b>Adjusted for you</b> (${[st.settings.quiet ? 'quiet mode' : '', Object.values(st.injuries).some((v) => v) ? 'injuries' : ''].filter(Boolean).join(', ') || 'your kit'}):<ul>${a.swaps.map((s) => `<li>${h(EXERCISES[s.from].name)} → <b>${h(EXERCISES[s.to].name)}</b></li>`).join('')}</ul></div>` : ''}
    ${easeWeek ? '<div class="info">Ease-in / deload week: pick weights you could do for twice the reps.</div>' : ''}
    ${best ? `<div class="info"><b>Best score:</b> ${h(S.fmtScore(best.score))} (${best.date.slice(0, 10)})</div>` : ''}
    <div class="card">
      ${wu.length ? `<div class="blk warm"><b>Warm-up${plan.extra ? ' (extra)' : ''}</b> · ${Math.round(plan.warm / 60)} min: ${wu.map((x) => h(EXERCISES[x.id].name)).join(', ')}</div>` : ''}
      ${a.workout.blocks.map((b) => `<div class="blk">${blockText(b)}</div>`).join('')}
      ${cd.length ? `<div class="blk cool"><b>Cool-down</b> · ${Math.round(plan.cool / 60)} min: ${cd.map((x) => h(EXERCISES[x.id].name)).join(', ')}</div>` : ''}
    </div>
    ${loaded.length ? `<div class="card"><div class="card-h">Set your weights (kg)</div><p class="muted small">Pick once now. The workout won't ask you to change mid-session.</p>
      ${loaded.map((x) => { const s = S.suggestWeight(x); return `<label class="w-row"><span>${h(EXERCISES[x].name)}${s ? `<small>${h(s.why)}</small>` : ''}</span><input type="number" step="0.5" min="0" inputmode="decimal" data-input="pw" data-id="${x}" value="${s ? s.kg : ''}" placeholder="kg"></label>`; }).join('')}</div>` : ''}
    ${plan.extra ? `<label class="check"><input type="checkbox" id="opt-warm" checked> Include the ${Math.round((plan.warm + plan.cool) / 60)}-min warm-up and cool-down</label>` : ''}
    <div class="sticky-cta"><button class="btn big wide" data-act="start" data-id="${h(w.id)}" data-planned="${params.get('planned') ? 1 : 0}" ${a.blocked ? 'disabled' : ''}>Start workout</button></div>
    <details class="card"><summary>Exercise demos and cues</summary>
      ${allExerciseIds(a.workout).map((x) => `<div class="exinfo"><b>${h(EXERCISES[x].name)}</b><span>${h(EXERCISES[x].cue)}</span><a href="${ytSearch(EXERCISES[x].name)}" target="_blank" rel="noopener">Video ↗</a></div>`).join('')}
    </details>
    ${Sync.shareControls(w)}
    ${w.custom ? `<button class="btn ghost danger" data-act="delcustom" data-id="${h(w.id)}">Delete this workout</button>` : ''}`;
};

function startWorkout(id, planned) {
  const w = S.workoutById(id);
  const c = S.ctx();
  const a = adaptWorkout(w, c);
  const plan = warmCoolPlan(w);
  const optWarm = document.getElementById('opt-warm');
  const incl = !plan.extra || !optWarm || optWarm.checked;
  const steps = compile(a.workout, c, { warmup: incl, cooldown: incl });
  unlockAudio();
  startPlayer({
    root: $player, original: w, workout: a.workout, steps, weights: { ...pendingWeights }, planned: !!planned,
    onExit: (entry) => {
      if (entry) {
        toast(`+${entry.points} XP${entry.pr ? ' · NEW RECORD!' : ''}`);
        if (st().program && planned) S.update((s) => { s.program.done[S.todayISO()] = entry.id; });
        if (entry.levelVote) Sync.fetchSquadWorkouts(true);
        location.hash = '#/home';
      }
      render();
    },
  });
}
const st = () => S.get();

// ---------- training arc ----------
views.arc = () => {
  const s = st();
  const p = s.program;
  if (!p) {
    const benches = P.benchOptions();
    const fresh = s.history.filter((x) => x.min > 0).length < 5;
    const nextMon = S.mondayOf(new Date(Date.now() + 6 * 86400000));
    return `
      <h1 class="title">New training arc</h1>
      <p class="muted">A plan of 1–8 weeks. It builds, pushes, then backs off so you recover, with boss-fight benchmarks to show progress.</p>
      <form data-form="arc" class="card form">
        <label>Length <select name="weeks">${[1, 2, 3, 4, 5, 6, 7, 8].map((n) => `<option value="${n}" ${n === 6 ? 'selected' : ''}>${n} week${n > 1 ? 's' : ''}</option>`).join('')}</select></label>
        <div class="lbl">Focus</div>
        <div class="focus-grid">${Object.entries(P.FOCUSES).map(([k, f], i) => `<label class="focus"><input type="radio" name="focus" value="${k}" ${i === 0 ? 'checked' : ''}><b>${h(f.name)}</b><small>${h(f.desc)}</small></label>`).join('')}</div>
        <label class="check"><input type="checkbox" name="ramp" ${fresh ? 'checked' : ''}> Start with a 2-week ease-in (lighter weights, more mobility)</label>
        <label>Start <select name="start"><option value="${S.mondayOf()}">This week (from Monday ${S.mondayOf()})</option><option value="${nextMon}">Next week (${nextMon})</option></select></label>
        <label>Benchmark boss fight <select name="bench">${benches.map((b) => `<option value="${b.id}">${h(b.name.replace('Boss fight: ', ''))} · ${h(eqLabel(workoutMeta(b).eq))}</option>`).join('')}</select></label>
        <button class="btn big wide">Begin the arc</button>
      </form>`;
  }
  const today = S.todayISO();
  const di = P.programDay(p, today);
  const curWeek = di ? di.week : (today < p.start ? 0 : p.weeks - 1);
  const weeksHtml = p.types.map((t, wi) => {
    const wt = P.WEEK_TYPES[t];
    const monISO = S.addDays(p.start, wi * 7);
    const open = wi === curWeek;
    const days = DAYS.map((d, i) => {
      const iso = S.addDays(monISO, i);
      const pd = P.programDay(p, iso);
      const done = s.history.some((x) => x.date.slice(0, 10) === iso && x.min > 0);
      let name = '';
      if (open) { const w = P.workoutForDay(pd); name = w ? `<a href="#/w/${encodeURIComponent(w.id)}${iso === today ? '?planned=1' : ''}">${h(w.name)}</a> <small>${w.min} min · L${w.lvl}</small>` : '<small>No match</small>'; }
      return `<div class="aday ${done ? 'done' : ''} ${iso === today ? 'today' : ''}"><span class="d">${d}</span><span class="slot ${pd.bench ? 'boss' : ''}">${pd.bench ? 'Boss fight' : h(SLOT_NAMES[pd.slot])}${pd.hard && pd.slot !== 'recovery' ? ' 🔥' : ''}</span><span class="n">${name}</span>${done ? '<span class="tick">✓</span>' : ''}</div>`;
    }).join('');
    return `<details class="aweek t-${t}" ${open ? 'open' : ''}><summary><b>Week ${wi + 1}</b> · ${h(wt.name)} <small>${monISO}</small></summary><p class="muted small">${h(wt.note)}</p>${days}</details>`;
  }).join('');
  const benchHist = s.history.filter((x) => x.bench && x.score);
  return `
    <h1 class="title">${h(p.name)}</h1>
    <div class="arc-strip">${p.types.map((t, i) => `<i class="t-${t} ${i === curWeek ? 'cur' : ''}" title="Week ${i + 1}: ${P.WEEK_TYPES[t].name}"></i>`).join('')}</div>
    <div class="muted small">Week ${curWeek + 1} of ${p.weeks}. Tap a workout to see it, or swap it from the home screen.</div>
    <div class="row"><a class="btn" href="#/checkin">Weekly check-in</a><button class="btn ghost" data-act="rerollweek">Reshuffle this week</button></div>
    ${weeksHtml}
    ${benchHist.length ? `<div class="card"><div class="card-h">Boss fight results</div>${benchHist.map((x) => `<div class="hist"><span>${h(x.name)}</span><small>${x.date.slice(0, 10)} · ${h(S.fmtScore(x.score))}${x.pr ? ' · PR!' : ''}</small></div>`).join('')}</div>` : ''}
    <button class="btn ghost danger" data-act="endarc">End this arc</button>`;
};

// ---------- weekly check-in ----------
views.checkin = () => {
  const s = st();
  const mon = s.program ? (() => { const d = P.programDay(s.program, S.todayISO()); return d ? S.addDays(s.program.start, d.week * 7) : S.mondayOf(); })() : S.mondayOf();
  const prevKeys = Object.keys(s.checkins).sort();
  const cur = s.checkins[mon] || s.checkins[prevKeys[prevKeys.length - 1]] || {};
  const dm = s.settings.defaultMin || 30;
  const days = cur.days || { 0: dm, 1: dm, 2: dm, 3: dm, 4: dm, 5: dm, 6: 0 };
  const opts = [0, 15, 20, 25, 30, 35, 40, 45];
  return `
    <h1 class="title">Weekly check-in</h1>
    <p class="muted">Week of ${mon}. Anything you mark here changes which exercises you get, straight away.</p>
    <form data-form="checkin" data-week="${mon}">
      <div class="card"><div class="card-h">Body check</div>
        <p class="muted small">Tap an area to cycle: Fine → Niggle → Go easy → Off-limits.</p>
        <div class="inj-grid">${INJURY_REGIONS.map((r) => { const v = s.injuries[r.key] || 0; return `<button type="button" class="inj l${v}" data-act="inj" data-k="${r.key}"><span>${h(r.label)}</span><b>${INJURY_LEVELS[v].label}</b></button>`; }).join('')}</div>
        <div class="row"><button type="button" class="chip" data-act="injleg" data-side="l">Whole left leg: go easy</button><button type="button" class="chip" data-act="injleg" data-side="r">Whole right leg: go easy</button><button type="button" class="chip" data-act="injclear">All clear</button></div>
      </div>
      <div class="card"><div class="card-h">How's the back?</div>
        <div class="chips">${[[1, 'Sore'], [2, 'Tight'], [3, 'OK'], [4, 'Good'], [5, 'Great']].map(([v, l]) => `<label class="chip radio"><input type="radio" name="back" value="${v}" ${(cur.back || 3) === v ? 'checked' : ''}>${l}</label>`).join('')}</div>
        <div class="card-h">Energy this week</div>
        <div class="chips">${[[1, 'Flat'], [2, 'Low'], [3, 'Normal'], [4, 'Good'], [5, 'Fired up']].map(([v, l]) => `<label class="chip radio"><input type="radio" name="energy" value="${v}" ${(cur.energy || 3) === v ? 'checked' : ''}>${l}</label>`).join('')}</div>
      </div>
      <div class="card"><div class="card-h">Your week</div><p class="muted small">How long can you train each day? "Rest" gives a short walk-and-stretch recovery session.</p>
        ${DAYS.map((d, i) => `<label class="w-row"><span>${d}</span><select name="d${i}">${opts.map((o) => `<option value="${o}" ${Number(days[i]) === o ? 'selected' : ''}>${o ? o + ' min' : 'Rest'}</option>`).join('')}</select></label>`).join('')}
      </div>
      <button class="btn big wide">Save check-in${s.checkins[mon] ? '' : ' (+25 XP)'}</button>
    </form>`;
};

// ---------- me / stats ----------
views.me = () => {
  const s = st();
  const sessions = s.history.filter((x) => x.min > 0);
  const mins = sessions.reduce((a, x) => a + x.min, 0);
  const xp = S.xpTotal();
  const rank = rankFor(xp);
  const mon = S.mondayOf();
  const monthStart = S.todayISO().slice(0, 8) + '01';
  const bw = s.bodyweight.slice(-30);
  let chart = '';
  if (bw.length >= 2) {
    const ks = bw.map((x) => x.kg), lo = Math.min(...ks) - 0.5, hi = Math.max(...ks) + 0.5;
    const pts = bw.map((x, i) => `${(i / (bw.length - 1)) * 300},${100 - ((x.kg - lo) / (hi - lo)) * 90 - 5}`).join(' ');
    chart = `<svg viewBox="0 0 300 100" class="bwchart" preserveAspectRatio="none"><polyline points="${pts}" /></svg>
      <div class="muted small">${bw[0].kg} kg → ${bw[bw.length - 1].kg} kg (${(bw[bw.length - 1].kg - bw[0].kg).toFixed(1)})</div>`;
  }
  return `
    <h1 class="title">${h(s.profile.name || 'You')}</h1>
    <div class="stats">
      <div><span class="rank-badge sm r-${rank.r}">${rank.r}</span><small>${h(rank.title)}</small></div>
      <div><span>${xp}</span><small>total XP</small></div>
      <div><span>${sessions.length}</span><small>sessions</small></div>
      <div><span>${Math.round(mins / 60 * 10) / 10}</span><small>hours</small></div>
      <div><span>${S.pointsBetween(mon, S.addDays(mon, 6))}</span><small>XP this week</small></div>
      <div><span>${S.pointsBetween(monthStart, S.todayISO())}</span><small>XP this month</small></div>
    </div>
    <div class="card"><div class="card-h">Rank ladder</div><div class="ranks">${RANKS.map((r) => `<span class="${xp >= r.xp ? 'got' : ''}"><b class="rank-badge sm r-${r.r}">${r.r}</b><small>${r.xp}</small></span>`).join('')}</div></div>
    <div class="card"><div class="card-h">Body weight</div>${chart || '<p class="muted small">Log your weight a couple of times to see a trend.</p>'}
      <form class="row" data-form="bw"><input type="number" step="0.1" inputmode="decimal" name="kg" placeholder="kg" aria-label="Body weight in kg"><button class="btn">Log</button></form></div>
    <div class="card"><div class="card-h">Squads</div>${Sync.squadsCard()}</div>
    <div class="card"><div class="card-h">History</div>${s.history.slice(0, 40).map((x) => `<div class="hist"><span>${h(x.name)}</span><small>${x.date.slice(0, 10)}${x.min ? ` · ${x.min} min` : ''} · +${x.points} XP${x.provisional ? ' (L1, awaiting squad rank)' : ''}${x.backpaid ? ` (incl. ${x.backpaid} back-paid)` : ''}${x.rating ? ' · ' + '★'.repeat(x.rating) : ''}${x.score ? ' · ' + h(S.fmtScore(x.score)) : ''}</small><button class="x" data-act="delhist" data-id="${x.id}" aria-label="Delete">✕</button></div>`).join('') || '<p class="muted small">Nothing yet. Your first mission is waiting.</p>'}</div>
    <a class="btn ghost wide" href="#/settings">Settings and equipment</a>`;
};

// ---------- settings ----------
views.settings = () => {
  const s = st();
  const se = s.settings;
  const eqKeys = Object.keys(EQUIPMENT).filter((q) => q !== 'bw');
  const tog = (k, label) => `<label class="switch"><input type="checkbox" data-act="set" data-k="${k}" ${se[k] ? 'checked' : ''}><span>${label}</span></label>`;
  return `
    <h1 class="title">Settings</h1>
    <div class="card form"><label>Your name <input type="text" data-input="name" value="${h(s.profile.name)}" placeholder="Billy"></label>
      <label>Usual session length <select data-input="defmin">${[15, 20, 25, 30, 35, 40, 45].map((m) => `<option ${se.defaultMin === m ? 'selected' : ''}>${m}</option>`).join('')}</select></label></div>
    <div class="card"><div class="card-h">Equipment you have</div><p class="muted small">Workouts only use what's ticked. Max two pieces per workout.</p>
      <div class="chips">${eqKeys.map((q) => `<button class="chip ${se.owned.includes(q) ? 'on' : ''}" data-act="own" data-q="${q}">${h(EQUIPMENT[q].name)}</button>`).join('')}</div></div>
    <div class="card"><div class="card-h">During workouts</div>
      ${tog('quiet', 'Quiet mode (no jumping, slamming or throwing)')}
      ${tog('voice', 'Voice cues')}${tog('beeps', 'Countdown beeps')}${tog('vibrate', 'Vibrate')}
      ${tog('tvMode', 'TV mode (giant timer for a big screen)')}
      ${(() => { const vs = englishVoices(); return vs.length ? `<label class="w-row"><span>Voice</span><select data-input="voice" style="width:190px"><option value="">Automatic</option>${vs.map((v) => `<option value="${h(v.name)}" ${se.voiceName === v.name ? 'selected' : ''}>${h(v.name)} (${h(v.lang)})</option>`).join('')}</select></label>` : '<p class="muted small">No voices found on this device yet. See the tip below.</p>'; })()}
      <label class="w-row"><span>Speaking speed</span><select data-input="vrate" style="width:190px">${[[0.8, 'Slow'], [0.9, 'Relaxed'], [0.95, 'Normal'], [1.05, 'Brisk'], [1.15, 'Fast']].map(([v, l]) => `<option value="${v}" ${(se.voiceRate || 0.95) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <div class="row"><button class="btn ghost" data-act="testaudio">Test beeps</button><button class="btn ghost" data-act="testvoice">Test voice</button></div>
      <details><summary class="muted small">Voice not working?</summary><p class="muted small">Make sure media volume is up. On Samsung phones go to <b>Settings → General management → Text-to-speech</b>, set the preferred engine to <b>Speech Services by Google</b>, and tap the cog to install English voice data. Then fully close and reopen the app.</p></details>
      <p class="muted small">Tip: try a few voices. On Android the ones with "Google" in the name, or marked network or online, usually sound the most natural.</p></div>
    <div class="card"><div class="card-h">Cloud sync</div><p class="muted small">${Sync.status()}</p>${Sync.controls()}</div>
    <div class="card"><div class="card-h">Your data</div>
      <div class="row"><button class="btn ghost" data-act="export">Export backup</button><label class="btn ghost">Import backup<input type="file" accept="application/json" data-input="import" hidden></label></div>
      <button class="btn ghost danger" data-act="reset">Reset everything</button></div>
    <p class="muted small center">Training Arc v0.1 · Built for home training</p>`;
};

// ---------- custom workouts ----------
const B = { mode: 'build', name: '', cat: ['full'], lvl: 3, min: 30, t: 'rounds', p: { rounds: 5, sets: 3, rest: 60, work: 40, rest2: 20, min: 12, reps: '10,9,8,7,6,5,4,3,2,1', cap: 20 }, ex: [] , note: '', nmode: 'amrap' };
views.build = () => {
  const s = st();
  const exOptions = Object.values(EXERCISES).filter((e) => e.eq.every((q) => q === 'bw' || s.settings.owned.includes(q))).sort((a, b) => a.name.localeCompare(b.name));
  const tab = (k, l) => `<button class="chip ${B.mode === k ? 'on' : ''}" data-act="bmode" data-v="${k}">${l}</button>`;
  const num = (k, label) => `<label>${label} <input type="number" data-input="bp" data-k="${k}" value="${h(B.p[k])}"></label>`;
  const params = {
    rounds: num('rounds', 'Rounds') + num('rest', 'Rest between rounds (s)') + num('cap', 'Time cap (min)'),
    sets: num('sets', 'Sets') + num('rest', 'Rest between sets (s)'),
    int: num('rounds', 'Rounds') + num('work', 'Work (s)') + num('rest2', 'Rest (s)'),
    emom: num('min', 'Minutes'),
    amrap: num('min', 'Minutes'),
    ladder: `<label>Reps per round <input type="text" data-input="bp" data-k="reps" value="${h(B.p.reps)}"></label>` + num('cap', 'Time cap (min)'),
    flow: num('rounds', 'Rounds'),
  };
  const timeLike = ['int', 'flow'].includes(B.t);
  const common = `
    <label>Name <input type="text" data-input="bname" value="${h(B.name)}" placeholder="My workout"></label>
    <div class="lbl">Type</div><div class="chips">${Object.entries(CATEGORIES).map(([k, v]) => `<button class="chip ${B.cat.includes(k) ? 'on' : ''}" data-act="bcat" data-v="${k}">${v}</button>`).join('')}</div>
    <div class="row"><label>Level <select data-input="blvl">${[1, 2, 3, 4, 5].map((n) => `<option value="${n}" ${B.lvl === n ? 'selected' : ''}>${n} · ${LVL_NAMES[n]}</option>`).join('')}</select></label>
    <label>Total minutes <input type="number" data-input="bmin" value="${B.min}"></label></div>`;
  let body = '';
  if (B.mode === 'build') {
    body = `<div class="card form">${common}
      <div class="lbl">Format</div><div class="chips">${[['rounds', 'Rounds'], ['sets', 'Supersets'], ['int', 'Intervals'], ['emom', 'EMOM'], ['amrap', 'AMRAP'], ['ladder', 'Ladder'], ['flow', 'Stretch flow']].map(([k, l]) => `<button class="chip ${B.t === k ? 'on' : ''}" data-act="bt" data-v="${k}">${l}</button>`).join('')}</div>
      <div class="row wrap">${params[B.t]}</div>
      <div class="lbl">Exercises${timeLike ? ' (timed)' : ''}</div>
      ${B.ex.map((e, i) => `<div class="w-row"><span>${h(EXERCISES[e.id].name)}</span>${timeLike && B.t === 'int' ? '' : `<input type="number" data-input="bexq" data-i="${i}" value="${e.qty ?? ''}" placeholder="${EXERCISES[e.id].unit === 's' || B.t === 'flow' ? 'sec' : 'reps'}">`}<button class="x" data-act="bexdel" data-i="${i}">✕</button></div>`).join('')}
      <div class="row"><select data-input="bexadd"><option value="">+ Add exercise…</option>${exOptions.map((e) => `<option value="${e.id}">${h(e.name)}</option>`).join('')}</select></div>
      <button class="btn big wide" data-act="bsave">Save workout</button></div>`;
  } else if (B.mode === 'quick') {
    body = `<div class="card form"><p class="muted small">Found a workout online? Paste or type it here and pick a timer. The app runs the clock and you tap through.</p>${common}
      <label>Workout text <textarea rows="6" data-input="bnote" placeholder="5 rounds:\n10 KB swings\n10 push-ups\n200 m run">${h(B.note)}</textarea></label>
      <div class="lbl">Timer</div><div class="chips">${[['amrap', 'AMRAP'], ['emom', 'EMOM'], ['fortime', 'For time'], ['int', 'Intervals']].map(([k, l]) => `<button class="chip ${B.nmode === k ? 'on' : ''}" data-act="bnm" data-v="${k}">${l}</button>`).join('')}</div>
      <div class="row wrap">${B.nmode === 'int' ? num('rounds', 'Rounds') + num('work', 'Work (s)') + num('rest2', 'Rest (s)') : num('min', B.nmode === 'fortime' ? 'Time cap (min)' : 'Minutes')}</div>
      <button class="btn big wide" data-act="bsave">Save workout</button></div>`;
  } else {
    body = `<div class="card form"><p class="muted small">Paste workout code (JSON) here. Claude can write new workouts in this format for you.</p>
      <textarea rows="10" data-input="bjson" placeholder='{"name":"...","cat":["full"],"lvl":3,"min":30,"blocks":[...]}'></textarea>
      <button class="btn big wide" data-act="bimport">Import</button></div>`;
  }
  return `<a class="back" href="javascript:history.back()">← Back</a><h1 class="title">Add a workout</h1>
    <div class="chips">${tab('build', 'Build')}${tab('quick', 'Paste and time')}${tab('import', 'Import code')}</div>
    ${body}
    ${s.custom.length ? `<div class="card"><div class="card-h">Your workouts</div><div class="wlist">${s.custom.map((w) => workoutCard(w)).join('')}</div></div>` : ''}`;
};

function saveBuilt() {
  if (!B.name.trim()) return toast('Give it a name');
  if (!B.cat.length) return toast('Pick at least one type');
  let block;
  const p = B.p;
  if (B.mode === 'quick') {
    if (!B.note.trim()) return toast('Add the workout text');
    block = { t: 'note', mode: B.nmode, text: B.note.trim(), min: Number(p.min), rounds: Number(p.rounds), work: Number(p.work), rest: Number(p.rest2) };
  } else {
    if (!B.ex.length) return toast('Add some exercises');
    const ex = B.ex.map((e) => (B.t === 'int' ? e.id : `${e.id}${e.qty ? ':' + e.qty : (B.t === 'flow' ? ':45' : ':10')}`));
    const exL = B.ex.map((e) => e.id);
    block = {
      rounds: { t: 'rounds', rounds: +p.rounds, rest: +p.rest, cap: +p.cap || undefined, ex },
      sets: { t: 'sets', sets: +p.sets, rest: +p.rest, ex },
      int: { t: 'int', rounds: +p.rounds, work: +p.work, rest: +p.rest2, ex: exL },
      emom: { t: 'emom', min: +p.min, ex },
      amrap: { t: 'amrap', min: +p.min, ex },
      ladder: { t: 'ladder', reps: String(p.reps).split(/[,\s-]+/).map(Number).filter(Boolean), cap: +p.cap || undefined, ex: exL },
      flow: { t: 'flow', rounds: +p.rounds || 1, ex },
    }[B.t];
  }
  const w = { id: 'c' + Date.now(), custom: true, name: B.name.trim(), cat: B.cat, lvl: B.lvl, min: B.min, fmt: B.mode === 'quick' ? { amrap: 'AMRAP', emom: 'EMOM', fortime: 'For time', int: 'Intervals' }[B.nmode] : { rounds: 'Rounds', sets: 'Supersets', int: 'Intervals', emom: 'EMOM', amrap: 'AMRAP', ladder: 'Ladder', flow: 'Flow' }[B.t], desc: 'Your own workout.', blocks: [block], noWarm: B.cat.length === 1 && B.cat[0] === 'mobility' };
  const m = workoutMeta(w);
  if (m.eq.length > 2) return toast('Max two pieces of equipment per workout');
  S.update((s) => { s.custom.push(w); });
  B.ex = []; B.name = ''; B.note = '';
  toast('Saved');
  location.hash = '#/w/' + w.id;
}

function importJSON(text) {
  let data;
  try { data = JSON.parse(text); } catch { return toast('That is not valid workout code'); }
  const list = Array.isArray(data) ? data : [data];
  let n = 0;
  for (const raw of list) {
    try {
      if (!raw.name || !Array.isArray(raw.blocks)) throw new Error('missing name or blocks');
      const w = { cat: ['full'], lvl: 3, min: 30, fmt: 'Custom', desc: '', ...raw, id: 'c' + Date.now() + '-' + n, custom: true };
      allExerciseIds(w).forEach((id) => { if (!EXERCISES[id]) throw new Error('unknown exercise ' + id); });
      if (workoutMeta(w).eq.length > 2) throw new Error('more than two pieces of equipment');
      S.update((s) => { s.custom.push(w); });
      n++;
    } catch (e) { toast(`Skipped "${raw.name || '?'}": ${e.message}`); }
  }
  if (n) { toast(`Imported ${n} workout${n > 1 ? 's' : ''}`); location.hash = '#/library'; }
}

// ================= ROUTER =================
function route() {
  const hash = location.hash || '#/home';
  const [path, qs] = hash.slice(1).split('?');
  const parts = path.split('/').filter(Boolean);
  const params = new URLSearchParams(qs || '');
  const name = parts[0] || 'home';
  if (name === 'w') return { view: 'workout', arg: decodeURIComponent(parts[1] || ''), params, tab: 'library' };
  if (name === 'squad') return { view: 'squad', arg: (parts[1] || '').toUpperCase(), params, tab: 'me' };
  const tabs = { home: 'home', library: 'library', arc: 'arc', checkin: 'arc', me: 'me', settings: 'me', build: 'library' };
  return { view: views[name] ? name : 'home', params, tab: tabs[name] || 'home' };
}

function render() {
  const r = route();
  const html = r.view === 'workout' ? views.workout(r.arg, r.params) : r.view === 'squad' ? Sync.squadView(r.arg) : views[r.view](r.params);
  $app.innerHTML = html;
  if (r.view === 'squad') Sync.loadSquad(r.arg);
  document.querySelectorAll('.nav a').forEach((a) => a.classList.toggle('on', a.dataset.tab === r.tab));
}

window.addEventListener('hashchange', () => {
  render(); window.scrollTo(0, 0);
  if (/^#\/(library|home|me|squad)/.test(location.hash)) Sync.fetchSquadWorkouts();
});
window.addEventListener('voices-ready', () => { if (route().view === 'settings') render(); });
S.subscribe(() => { if ($player.hidden) render(); });

// ================= EVENTS =================
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act;
  const s = st();
  switch (act) {
    case 'quiet': S.update((x) => { x.settings.quiet = el.dataset.v === '1'; }); break;
    case 'reroll': {
      const d = P.programDay(s.program, S.todayISO());
      P.workoutForDay(d, true); render(); break;
    }
    case 'rerollweek': S.update((x) => { const mon = S.mondayOf(); for (let i = 0; i < 7; i++) delete x.program.chosen[S.addDays(mon, i)]; }); break;
    case 'endarc': if (confirm('End this training arc? Your history and XP stay.')) S.update((x) => { x.program = null; }); break;
    case 'lf': LF[el.dataset.k] = el.dataset.v; render(); break;
    case 'lft': LF[el.dataset.k] = !LF[el.dataset.k]; render(); break;
    case 'start': startWorkout(el.dataset.id, el.dataset.planned === '1'); break;
    case 'delcustom': if (confirm('Delete this workout?')) { S.update((x) => { x.custom = x.custom.filter((w) => w.id !== el.dataset.id); x.deleted = [...(x.deleted || []), el.dataset.id]; }); location.hash = '#/library'; } break;
    case 'own': S.update((x) => { const q = el.dataset.q; x.settings.owned = x.settings.owned.includes(q) ? x.settings.owned.filter((y) => y !== q) : [...x.settings.owned, q]; }); break;
    case 'testaudio': unlockAudio(); import('./audio.js').then((A) => { A.tick(); setTimeout(A.tick, 500); setTimeout(A.go, 1000); }); break;
    case 'testvoice': unlockAudio(); say('Round three. Ten kettlebell swings. Let us go.', true); break;
    case 'export': {
      const blob = new Blob([S.exportData()], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `training-arc-backup-${S.todayISO()}.json`; a.click();
      break;
    }
    case 'reset': if (confirm('Delete ALL your data on this device? This cannot be undone.')) { localStorage.clear(); location.reload(); } break;
    case 'delhist': if (confirm('Delete this entry? Its XP is removed too.')) S.update((x) => { x.history = x.history.filter((y) => y.id !== el.dataset.id); x.deleted = [...(x.deleted || []), el.dataset.id]; }); break;
    case 'inj': {
      const k = el.dataset.k;
      S.update((x) => { x.injuries[k] = ((x.injuries[k] || 0) + 1) % 4; if (x.program) x.program.chosen = {}; }, { silent: true });
      const v = st().injuries[k];
      el.className = `inj l${v}`; el.querySelector('b').textContent = INJURY_LEVELS[v].label;
      break;
    }
    case 'injleg': S.update((x) => { for (const p of ['hip', 'knee', 'ankle']) x.injuries[`${p}_${el.dataset.side}`] = Math.max(2, x.injuries[`${p}_${el.dataset.side}`] || 0); if (x.program) x.program.chosen = {}; }); break;
    case 'injclear': S.update((x) => { x.injuries = {}; if (x.program) x.program.chosen = {}; }); break;
    case 'set': S.update((x) => { x.settings[el.dataset.k] = el.checked; }); break;
    case 'bmode': B.mode = el.dataset.v; render(); break;
    case 'bcat': { const v = el.dataset.v; B.cat = B.cat.includes(v) ? B.cat.filter((x) => x !== v) : [...B.cat, v]; render(); break; }
    case 'bt': B.t = el.dataset.v; render(); break;
    case 'bnm': B.nmode = el.dataset.v; render(); break;
    case 'bexdel': B.ex.splice(Number(el.dataset.i), 1); render(); break;
    case 'bsave': saveBuilt(); break;
    case 'bimport': importJSON(document.querySelector('[data-input="bjson"]').value); break;
    default: Sync.handle(act, el);
  }
});

document.addEventListener('input', (e) => {
  const el = e.target.closest('[data-input]');
  if (!el) return;
  const k = el.dataset.input;
  if (k === 'lfq') { LF.q = el.value; clearTimeout(window._lfq); window._lfq = setTimeout(() => { render(); const i = document.querySelector('.search'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 350); }
  if (k === 'pw') pendingWeights[el.dataset.id] = Number(el.value) || 0;
  if (k === 'bname') B.name = el.value;
  if (k === 'bnote') B.note = el.value;
  if (k === 'bmin') B.min = Number(el.value) || 30;
  if (k === 'bp') B.p[el.dataset.k] = el.value;
  if (k === 'bexq') B.ex[Number(el.dataset.i)].qty = Number(el.value) || null;
});
document.addEventListener('change', (e) => {
  const el = e.target.closest('[data-input]');
  if (!el) return;
  const k = el.dataset.input;
  if (k === 'name') S.update((x) => { x.profile.name = el.value.trim(); if (!x.profile.createdAt) x.profile.createdAt = new Date().toISOString(); });
  if (k === 'voice') { S.update((x) => { x.settings.voiceName = el.value; }); setVoice(); say('This is my voice.', true); }
  if (k === 'vrate') { S.update((x) => { x.settings.voiceRate = Number(el.value); }); say('Round three. Ten kettlebell swings. Let us go.', true); }
  if (k === 'defmin') S.update((x) => { x.settings.defaultMin = Number(el.value); });
  if (k === 'blvl') B.lvl = Number(el.value);
  if (k === 'bexadd' && el.value) { B.ex.push({ id: el.value, qty: null }); render(); }
  if (k === 'import' && el.files[0]) {
    el.files[0].text().then((t) => {
      try { const d = JSON.parse(t); if (!d.history) throw 0; if (confirm('Replace the data on this device with this backup?')) { S.replaceAll(d); toast('Backup restored'); } } catch { toast('That file is not a Training Arc backup'); }
    });
  }
});

document.addEventListener('submit', (e) => {
  const f = e.target.closest('[data-form]');
  if (!f) return;
  e.preventDefault();
  const fd = new FormData(f);
  const kind = f.dataset.form;
  if (kind === 'bw') {
    const kg = Number(fd.get('kg'));
    if (!kg || kg < 30 || kg > 300) return toast('Enter your weight in kg');
    S.update((x) => { const d = S.todayISO(); x.bodyweight = x.bodyweight.filter((b) => b.date !== d); x.bodyweight.push({ date: d, kg }); });
    toast('Logged');
  }
  if (kind === 'arc') {
    const p = P.createProgram({ weeks: Number(fd.get('weeks')), focus: fd.get('focus'), ramp: !!fd.get('ramp'), startISO: fd.get('start'), benchId: fd.get('bench') });
    S.update((x) => { x.program = p; });
    toast('The arc begins!');
    location.hash = st().checkins[p.start] ? '#/arc' : '#/checkin';
  }
  if (kind === 'checkin') {
    const week = f.dataset.week;
    const days = {};
    for (let i = 0; i < 7; i++) days[i] = Number(fd.get('d' + i));
    const back = Number(fd.get('back'));
    const first = !st().checkins[week];
    S.update((x) => {
      x.checkins[week] = { days, back, energy: Number(fd.get('energy')), date: S.nowLocal() };
      if (back <= 2 && !(x.injuries.back > 0)) x.injuries.back = back === 1 ? 2 : 1;
      if (x.program) for (let i = 0; i < 7; i++) { const d = S.addDays(week, i); if (d >= S.todayISO()) delete x.program.chosen[d]; }
      if (first) x.history.unshift({ id: 'ci' + Date.now(), wid: 'checkin', name: 'Weekly check-in', date: S.nowLocal(), min: 0, lvl: 0, points: 25 });
    });
    toast(first ? 'Check-in saved · +25 XP' : 'Check-in updated');
    location.hash = '#/home';
  }
});

// ================= BOOT =================
render();
Sync.init({ rerender: render, toast });
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js');

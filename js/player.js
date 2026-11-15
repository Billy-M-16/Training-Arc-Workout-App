// Workout player: timers, tap-to-complete rounds, cues, pause, and the end-of-session report.
import { EXERCISES, ytSearch } from './data/exercises.js';
import { itemText, fmtTime, sessionPoints, allExerciseIds } from './engine.js';
import * as A from './audio.js';
import * as S from './store.js';

const h = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function startPlayer({ root, original, workout, steps, weights = {}, planned = false, onExit }) {
  const P = {
    idx: 0, clock: 0, last: performance.now(), paused: false, stepStart: 0,
    blockStart: {}, blockTimes: {}, capped: {}, amrapRounds: {}, lastTap: 0, lastSec: null, cues: new Set(), finished: false,
  };
  const tv = S.get().settings.tvMode || window.innerWidth > 1100;
  root.innerHTML = '';
  root.className = 'player' + (tv ? ' tv' : '');
  root.hidden = false;
  document.body.classList.add('playing');
  A.keepAwake(true);

  const step = () => steps[P.idx];
  const stepElapsed = () => (P.clock - P.stepStart) / 1000;

  function nextWorkStep(from) {
    for (let i = from; i < steps.length; i++) if (steps[i].phase !== 'rest' && steps[i].phase !== 'prep') return steps[i];
    return null;
  }
  function describe(s) {
    if (!s) return 'Finish';
    if (s.type === 'timer' && s.items.length === 1 && !s.emom) return s.label;
    return s.items.map((it) => itemText(it)).join(', ') || s.label;
  }
  function isFinalRound(s) {
    if (!s || s.phase !== 'work') return false;
    const later = steps.slice(P.idx + 1).filter((x) => x.block === s.block && x.phase === 'work');
    return later.length === 0 && steps.filter((x) => x.block === s.block && x.phase === 'work').length > 2;
  }
  const wt = (id) => (weights[id] ? ` <span class="wt">@ ${weights[id]} kg</span>` : '');

  function announce() {
    const s = step();
    P.cues.clear();
    if (s.block != null && P.blockStart[s.block] == null) P.blockStart[s.block] = P.clock;
    if (s.phase === 'rest') {
      const n = nextWorkStep(P.idx + 1);
      A.say(`${s.label}. Next up: ${describe(n)}`);
    } else if (s.phase === 'prep') {
      A.say(s.label);
    } else {
      A.go();
      if (s.type === 'tap') A.say(isFinalRound(s) ? `Final round. ${s.label}` : s.label);
      else if (s.type === 'amrap') A.say(`${s.label}. Go`);
      else if (s.emom) A.say(`${s.info}. ${s.items.map((it) => itemText(it)).join(', ')}`);
      else A.say(s.label);
    }
  }

  function advance() {
    const s = step();
    if (s && s.forTime) {
      const remainingInBlock = steps.slice(P.idx + 1).some((x) => x.block === s.block && x.phase === 'work');
      if (!remainingInBlock) P.blockTimes[s.block] = (P.clock - P.blockStart[s.block]) / 1000;
    }
    P.idx++;
    P.stepStart = P.clock;
    if (P.idx >= steps.length) return finish();
    announce();
    render();
  }
  function back() {
    if (P.idx === 0) return;
    P.idx--;
    P.stepStart = P.clock;
    announce();
    render();
  }
  function skipBlock(blockId) {
    while (P.idx < steps.length && steps[P.idx].block === blockId) P.idx++;
    P.idx--;
    advance();
  }

  function loop() {
    if (P.finished) return;
    const now = performance.now();
    if (!P.paused) P.clock += now - P.last;
    P.last = now;
    const s = step();
    if (!s) return;
    if (s.type === 'timer' || s.type === 'amrap') {
      const rem = s.sec - stepElapsed();
      const sec = Math.ceil(rem);
      if (!P.paused && sec !== P.lastSec) {
        P.lastSec = sec;
        if (sec <= 3 && sec >= 1) A.tick();
        if (s.sec >= 40 && sec === 10 && !P.cues.has('10')) { P.cues.add('10'); if (s.phase !== 'rest') A.say('Ten seconds'); }
        if (s.sec >= 120 && Math.abs(rem - s.sec / 2) < 0.6 && !P.cues.has('half')) { P.cues.add('half'); A.say(s.hold ? 'Switch sides if needed' : 'Halfway'); }
        if (s.type === 'amrap' && s.sec >= 300 && sec === 60 && !P.cues.has('60')) { P.cues.add('60'); A.say('One minute left'); }
      }
      if (rem <= 0) return advance();
    } else if (s.type === 'tap' && s.cap != null && !P.paused) {
      const blockEl = (P.clock - P.blockStart[s.block]) / 1000;
      if (blockEl >= s.cap) {
        P.capped[s.block] = true;
        P.blockTimes[s.block] = s.cap;
        A.done();
        A.say('Time cap. Great work.');
        return skipBlock(s.block);
      }
    }
    updateClocks();
  }

  function updateClocks() {
    const s = step();
    const q = (sel) => root.querySelector(sel);
    const total = q('#p-total');
    if (total) total.textContent = fmtTime(P.clock / 1000);
    if (!s) return;
    if (s.type === 'timer' || s.type === 'amrap') {
      const el = q('#p-big');
      if (el) el.textContent = fmtTime(Math.ceil(s.sec - stepElapsed()));
      const bar = q('#p-bar');
      if (bar) bar.style.width = Math.min(100, (stepElapsed() / s.sec) * 100) + '%';
    } else {
      const el = q('#p-big');
      if (el) el.textContent = fmtTime(stepElapsed());
      const cap = q('#p-cap');
      if (cap && s.cap != null) cap.textContent = 'Cap ' + fmtTime(s.cap - (P.clock - P.blockStart[s.block]) / 1000);
    }
  }

  function phaseName(s) {
    return { warm: 'Warm-up', cool: 'Cool-down', rest: 'Rest', prep: 'Get ready', work: 'Work' }[s.phase] || '';
  }

  function render() {
    const s = step();
    const next = steps[P.idx + 1];
    const final = isFinalRound(s);
    let body = '';
    if (s.type === 'timer') {
      const ex = s.items[0] && EXERCISES[s.items[0].id];
      body = `
        <div class="p-info">${h(s.info || '')}</div>
        <div class="p-label ${s.phase}">${h(s.emom ? s.info : s.label)}</div>
        ${s.note ? `<div class="p-note">${h(s.note)}</div>` : ''}
        ${s.emom ? `<ul class="p-items">${s.items.map((it) => `<li>${h(itemText(it))}${wt(it.id)}</li>`).join('')}</ul>` : ''}
        <div class="p-big" id="p-big">${fmtTime(s.sec)}</div>
        <div class="p-barwrap"><div class="p-bar" id="p-bar"></div></div>
        ${ex && s.phase !== 'rest' && !s.emom ? `<div class="p-cue">${h(ex.cue)}${wt(ex.id)}</div>` : ''}
        <div class="p-next">Next: <b>${h(next ? (next.phase === 'rest' ? 'Rest' : describe(next)) : 'Finish')}</b></div>`;
    } else if (s.type === 'tap') {
      body = `
        <div class="p-info">${s.cap != null ? `<span id="p-cap"></span>` : ''}</div>
        <div class="p-label work">${h(s.label)}</div>
        ${s.note ? `<div class="p-note">${h(s.note)}</div>` : ''}
        <ul class="p-items big">${s.items.map((it) => `<li>${h(itemText(it))}${wt(it.id)}</li>`).join('')}</ul>
        ${s.upNext && s.upNext.length ? `<div class="p-next">Then: ${s.upNext.slice(0, 3).map((x) => h(itemText(x))).join(' · ')}</div>` : ''}
        <div class="p-big small" id="p-big">0:00</div>
        <button class="p-tapzone" id="p-tap">${h(s.tapText || 'Done')}</button>`;
    } else if (s.type === 'amrap') {
      const r = P.amrapRounds[P.idx] || 0;
      body = `
        <div class="p-label work">${h(s.label)}</div>
        ${s.note ? `<div class="p-note">${h(s.note)}</div>` : ''}
        <ul class="p-items big">${s.items.map((it) => `<li>${h(itemText(it))}${wt(it.id)}</li>`).join('')}</ul>
        <div class="p-big" id="p-big">${fmtTime(s.sec)}</div>
        <div class="p-barwrap"><div class="p-bar" id="p-bar"></div></div>
        <div class="p-rounds">Rounds: <b>${r}</b></div>
        <button class="p-tapzone" id="p-tap">${h(s.tapText || 'Round done')}</button>`;
    }
    root.innerHTML = `
      <div class="p-top">
        <button class="p-icon" id="p-close" aria-label="End workout">✕</button>
        <div class="p-title">${h(original.name)}</div>
        <div class="p-total" id="p-total">0:00</div>
      </div>
      <div class="p-phase ${s.phase}">${phaseName(s)} · ${P.idx + 1}/${steps.length}</div>
      ${final ? '<div class="p-final">FINAL ROUND!</div>' : ''}
      <div class="p-main" id="p-main">${body}</div>
      <div class="p-controls">
        <button class="p-btn" id="p-back" aria-label="Previous">⏮</button>
        <button class="p-btn main" id="p-pause">${P.paused ? '▶ Resume' : '❚❚ Pause'}</button>
        <button class="p-btn" id="p-skip" aria-label="Skip">⏭</button>
      </div>
      ${s.items && s.items[0] ? `<a class="p-demo" href="${ytSearch(EXERCISES[s.items[0].id].name)}" target="_blank" rel="noopener">Demo video ↗</a>` : ''}
      ${P.paused ? `<div class="p-paused"><div class="burst">PAUSED</div>
        <button class="btn big" id="p-resume">Resume</button>
        <button class="btn ghost" id="p-end">End and log what I did</button>
        <button class="btn ghost" id="p-quit">Quit without saving</button></div>` : ''}`;
    root.querySelector('#p-close').onclick = () => { P.paused = true; render(); };
    root.querySelector('#p-pause').onclick = togglePause;
    root.querySelector('#p-back').onclick = back;
    root.querySelector('#p-skip').onclick = () => { if (step().type === 'amrap') return advance(); advance(); };
    const tapz = root.querySelector('#p-tap');
    const main = root.querySelector('#p-main');
    if (tapz) {
      const onTap = (e) => {
        if (e.target.closest('a,.p-controls,.p-top')) return;
        const now = performance.now();
        if (now - P.lastTap < 700 || P.paused) return;
        P.lastTap = now;
        if (step().type === 'amrap') {
          P.amrapRounds[P.idx] = (P.amrapRounds[P.idx] || 0) + 1;
          A.buzz([60]);
          A.beep(1100, 0.08);
          const rr = root.querySelector('.p-rounds b');
          if (rr) rr.textContent = P.amrapRounds[P.idx];
        } else {
          A.buzz([60]);
          advance();
        }
      };
      main.onclick = onTap;
    }
    if (P.paused) {
      root.querySelector('#p-resume').onclick = togglePause;
      root.querySelector('#p-end').onclick = () => finish(true);
      root.querySelector('#p-quit').onclick = () => { if (confirmQuit()) exit(null); };
    }
    updateClocks();
  }
  function confirmQuit() { return window.confirm('Quit without saving this session?'); }

  function togglePause() {
    P.paused = !P.paused;
    if (P.paused) { A.say('Paused'); if ('speechSynthesis' in window) setTimeout(() => speechSynthesis.cancel(), 900); }
    else A.say('Back to it');
    render();
  }

  function score() {
    const amrapTotal = Object.values(P.amrapRounds).reduce((a, b) => a + b, 0);
    if (Object.keys(P.amrapRounds).length) return { type: 'rounds', rounds: amrapTotal };
    const times = Object.entries(P.blockTimes);
    if (times.length) {
      const [blk, sec] = times[times.length - 1];
      return { type: 'time', sec: Math.round(sec), capped: !!P.capped[blk] };
    }
    return null;
  }

  function finish(early = false) {
    P.finished = true;
    clearInterval(timer);
    A.done();
    A.say(early ? 'Session logged.' : 'Mission complete. Great work.');
    A.keepAwake(false);
    const minutes = P.clock / 60000;
    const sc = score();
    const exIds = allExerciseIds(workout).filter((id) => EXERCISES[id] && EXERCISES[id].pattern !== 'mobility' || workout.cat.includes('mobility'));
    const loaded = exIds.filter((id) => S.loadedEquipment(id));
    const pts = sessionPoints(original, minutes, { planned });
    const R = { rating: 0, rpe: 'right', ex: {}, w: { ...weights } };
    root.className = 'player report' + (tv ? ' tv' : '');
    root.innerHTML = `
      <div class="report-wrap">
        <div class="burst big">${early ? 'SESSION LOGGED' : 'MISSION COMPLETE!'}</div>
        <div class="report-stats">
          <div><span>${fmtTime(P.clock / 1000)}</span><small>time</small></div>
          <div><span>+${pts}</span><small>XP (est.)</small></div>
          ${sc ? `<div><span>${h(S.fmtScore(sc))}${sc.capped ? '*' : ''}</span><small>${sc.capped ? 'capped' : 'score'}</small></div>` : ''}
        </div>
        <h3>Rate the workout</h3>
        <div class="stars" id="r-stars">${[1, 2, 3, 4, 5].map((n) => `<button data-n="${n}">★</button>`).join('')}</div>
        <h3>How hard was it?</h3>
        <div class="chips" id="r-rpe">${[['easy', 'Easy'], ['right', 'Just right'], ['hard', 'Hard'], ['brutal', 'Brutal']].map(([k, l]) => `<button class="chip ${k === 'right' ? 'on' : ''}" data-k="${k}">${l}</button>`).join('')}</div>
        <h3>Exercises: more or less of these?</h3>
        <div class="ex-rate">${exIds.map((id) => `
          <div class="ex-row" data-id="${id}"><span>${h(EXERCISES[id].name)}</span>
            <button class="thumb" data-v="1" aria-label="More">👍</button><button class="thumb" data-v="-1" aria-label="Less">👎</button></div>`).join('')}</div>
        ${loaded.length ? `<h3>Weights used (kg)</h3><div class="weights">${loaded.map((id) => `
          <label class="w-row"><span>${h(EXERCISES[id].name)}</span><input type="number" inputmode="decimal" step="0.5" min="0" data-id="${id}" value="${weights[id] ?? ''}"></label>`).join('')}</div>` : ''}
        <button class="btn big" id="r-save">Save and claim XP</button>
        <button class="btn ghost" id="r-discard">Discard</button>
      </div>`;
    root.querySelectorAll('#r-stars button').forEach((b) => (b.onclick = () => {
      R.rating = Number(b.dataset.n);
      root.querySelectorAll('#r-stars button').forEach((x) => x.classList.toggle('on', Number(x.dataset.n) <= R.rating));
    }));
    root.querySelectorAll('#r-rpe button').forEach((b) => (b.onclick = () => {
      R.rpe = b.dataset.k;
      root.querySelectorAll('#r-rpe button').forEach((x) => x.classList.toggle('on', x === b));
    }));
    root.querySelectorAll('.ex-row').forEach((row) => row.querySelectorAll('.thumb').forEach((b) => (b.onclick = () => {
      const v = Number(b.dataset.v);
      const id = row.dataset.id;
      R.ex[id] = R.ex[id] === v ? 0 : v;
      row.querySelectorAll('.thumb').forEach((x) => x.classList.toggle('on', Number(x.dataset.v) === R.ex[id]));
    })));
    root.querySelectorAll('.weights input').forEach((inp) => (inp.oninput = () => { R.w[inp.dataset.id] = Number(inp.value) || 0; }));
    root.querySelector('#r-save').onclick = () => {
      const entry = S.recordSession({ workout: original, minutes, rating: R.rating || null, rpe: R.rpe, exRatings: R.ex, weights: R.w, score: sc, planned });
      exit(entry);
    };
    root.querySelector('#r-discard').onclick = () => { if (confirmQuit()) exit(null); };
  }

  function exit(entry) {
    P.finished = true;
    clearInterval(timer);
    A.keepAwake(false);
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    root.hidden = true;
    root.innerHTML = '';
    document.body.classList.remove('playing');
    onExit && onExit(entry);
  }

  announce();
  render();
  const timer = setInterval(loop, 100);
  return { exit };
}

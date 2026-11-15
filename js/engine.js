// Workout engine: metadata, personal adaptation (equipment, quiet mode, injuries),
// warm-ups and cool-downs, and compiling a workout into player steps.
import { EXERCISES, FREE_EQUIPMENT, PATTERN_FALLBACK } from './data/exercises.js';

export function parseEntry(s) {
  const m = /^([a-z0-9_]+)(?:\*(\d+(?:\.\d+)?))?(?::(n|\d+))?$/.exec(s);
  if (!m) throw new Error('Bad exercise entry: ' + s);
  return { id: m[1], mult: m[2] ? Number(m[2]) : 1, qty: m[3] === 'n' ? 'n' : m[3] ? Number(m[3]) : null };
}
const fmtEntry = (e) => e.id + (e.mult !== 1 ? '*' + e.mult : '') + (e.qty != null ? ':' + e.qty : '');

export function blockEntries(b) {
  if (b.t === 'note') return [];
  return b.t === 'timed' ? [parseEntry(b.ex)] : b.ex.map(parseEntry);
}
export function allExerciseIds(w) {
  return [...new Set(w.blocks.flatMap((b) => blockEntries(b).map((e) => e.id)))];
}

export function workoutMeta(w) {
  const ids = allExerciseIds(w);
  const exs = ids.map((id) => EXERCISES[id]).filter(Boolean);
  const eq = [...new Set(exs.flatMap((e) => e.eq))].filter((q) => !FREE_EQUIPMENT.has(q));
  return {
    eq,
    usesRun: exs.some((e) => e.eq.includes('run')),
    quiet: !exs.some((e) => e.loud),
    backFriendly: !exs.some((e) => (e.stress.b || 0) >= 2),
    outdoor: exs.some((e) => e.outdoor || e.loud),
    exerciseCount: ids.length,
  };
}

// ---------- personal context ----------
// injuries: { 'knee_r': 2, 'back': 1, ... } -> stress letter -> level
export const INJURY_REGIONS = [
  { key: 'back', label: 'Lower back', letters: ['b'] },
  { key: 'neck', label: 'Neck', letters: ['n'] },
  { key: 'shoulder_l', label: 'Left shoulder', letters: ['s'] },
  { key: 'shoulder_r', label: 'Right shoulder', letters: ['s'] },
  { key: 'arm_l', label: 'Left elbow / wrist', letters: ['e', 'w'] },
  { key: 'arm_r', label: 'Right elbow / wrist', letters: ['e', 'w'] },
  { key: 'hip_l', label: 'Left hip', letters: ['h'] },
  { key: 'hip_r', label: 'Right hip', letters: ['h'] },
  { key: 'knee_l', label: 'Left knee', letters: ['k'] },
  { key: 'knee_r', label: 'Right knee', letters: ['k'] },
  { key: 'ankle_l', label: 'Left ankle / foot', letters: ['a'] },
  { key: 'ankle_r', label: 'Right ankle / foot', letters: ['a'] },
];
export const INJURY_LEVELS = [
  { v: 0, label: 'Fine' },
  { v: 1, label: 'Niggle', help: 'Swap the hardest moves for that area' },
  { v: 2, label: 'Go easy', help: 'No heavy or explosive work for that area' },
  { v: 3, label: 'Off-limits', help: 'Nothing that loads it' },
];

export function makeContext(settings, injuries = {}) {
  const limits = {};
  for (const r of INJURY_REGIONS) {
    const lvl = injuries[r.key] || 0;
    for (const l of r.letters) limits[l] = Math.max(limits[l] || 0, lvl);
  }
  return {
    owned: new Set(['bw', ...(settings.owned || [])]),
    quiet: !!settings.quiet,
    maxEq: settings.maxEq || 2,
    limits,
  };
}

function exerciseOk(ex, ctx) {
  if (!ex) return false;
  if (!ex.eq.every((q) => ctx.owned.has(q))) return false;
  if (ctx.quiet && ex.loud) return false;
  for (const [letter, lvl] of Object.entries(ctx.limits)) {
    if (!lvl) continue;
    const s = ex.stress[letter] || 0;
    const threshold = 4 - lvl; // niggle: >=3, go easy: >=2, off-limits: >=1
    if (s >= threshold) return false;
  }
  return true;
}

// rough seconds per rep, so swapped exercises keep a similar workload
const SPR = { skip: 0.5, mountain_climber: 1, plank_shoulder_tap: 1.5, kb_swing: 2, air_squat: 2, calf_raise: 1.5, db_calf_raise: 1.5,
  burpee: 4, burpee_no_jump: 4, db_devil_press: 6, kb_tgu: 20, band_lateral_walk: 1.5, glute_bridge: 2, dead_bug: 2, bird_dog: 2.5,
  russian_twist: 1, kb_russian_twist: 1, db_russian_twist: 1, mb_russian_twist: 1, fast_feet: 1 };
const spr = (id) => SPR[id] || 3;

function convertQty(qty, fromUnit, toUnit, fromId, toId) {
  if (qty == null || qty === 'n') return qty;
  if (fromUnit === 'r' && toUnit === 'r') return Math.max(4, Math.round(qty * spr(fromId) / spr(toId)));
  if (fromUnit === toUnit) return qty;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  if (fromUnit === 'r' && toUnit === 's') return clamp(Math.round(qty * 3 / 5) * 5, 20, 60);
  if (fromUnit === 's' && toUnit === 'r') return clamp(Math.round(qty / 3), 6, 20);
  if (fromUnit === 'm' && toUnit === 's') return Math.round(qty * 0.3);
  if (fromUnit === 'm' && toUnit === 'r') return clamp(Math.round(qty / 20), 10, 60);
  return qty;
}

const stressSum = (ex) => Object.values(ex.stress).reduce((a, b) => a + b, 0);

export function findSwap(id, ctx, allowedEq, used = new Set()) {
  const orig = EXERCISES[id];
  const chain = PATTERN_FALLBACK[orig.pattern] || [orig.pattern];
  for (const pattern of chain) {
    const cands = Object.values(EXERCISES).filter((e) => e.pattern === pattern && e.id !== id
      && e.eq.every((q) => allowedEq.has(q) && ctx.owned.has(q)) && exerciseOk(e, ctx)
      && !(pattern === 'mobility' && orig.pattern !== 'mobility' && orig.pattern !== 'core'));
    if (!cands.length) continue;
    cands.sort((a, b) => {
      const da = used.has(a.id) ? 1 : 0, db = used.has(b.id) ? 1 : 0;
      if (da !== db) return da - db;
      const sa = a.eq.some((q) => orig.eq.includes(q)) ? 0 : 1;
      const sb = b.eq.some((q) => orig.eq.includes(q)) ? 0 : 1;
      if (sa !== sb) return sa - sb;
      const ua = a.unit === orig.unit ? 0 : 1, ub = b.unit === orig.unit ? 0 : 1;
      if (ua !== ub) return ua - ub;
      return stressSum(a) - stressSum(b);
    });
    return cands[0];
  }
  return null;
}

// Returns { workout (adapted copy), swaps: [{from,to}], blocked: bool, missing: [eq] }
export function adaptWorkout(w, ctx) {
  const meta = workoutMeta(w);
  const missing = meta.eq.filter((q) => !ctx.owned.has(q));
  const tooMany = meta.eq.length > (ctx.maxEq || 4);
  const allowedEq = new Set(['bw', 'run', ...meta.eq]);
  const swaps = [];
  const used = new Set(allExerciseIds(w));
  let blocked = missing.length > 0 || tooMany;
  const blocks = w.blocks.map((b) => {
    const entries = blockEntries(b).map((e) => {
      const ex = EXERCISES[e.id];
      if (exerciseOk(ex, ctx)) return e;
      const alt = findSwap(e.id, ctx, allowedEq, used);
      if (!alt) { blocked = true; return e; }
      used.add(alt.id);
      if (!swaps.some((x) => x.from === e.id)) swaps.push({ from: e.id, to: alt.id });
      const mult = e.mult !== 1 ? Math.max(1, Math.round(e.mult * spr(e.id) / spr(alt.id))) : 1;
      let qty = convertQty(e.qty, ex.unit, alt.unit, e.id, alt.id);
      if (alt.uni && !ex.uni && typeof qty === 'number' && alt.unit === 'r') qty = Math.max(5, Math.round(qty / 2));
      return { id: alt.id, mult, qty };
    });
    const nb = { ...b };
    if (b.t === 'note') return nb;
    if (b.t === 'timed') nb.ex = fmtEntry(entries[0]);
    else nb.ex = entries.map(fmtEntry);
    return nb;
  });
  return { workout: { ...w, blocks }, swaps, blocked, missing, tooMany, eqCount: meta.eq.length };
}

// ---------- warm-up / cool-down ----------
const WARM_LISTS = {
  upper: ['arm_circles', 'shoulder_cars', 'inchworm', 'thread_needle', 'knee_pushup', 'band_pull_apart', 'march'],
  lower: ['march', 'leg_swings', 'hip_90_90', 'air_squat', 'glute_bridge', 'ankle_rocks', 'worlds_greatest'],
  full: ['march', 'arm_circles', 'leg_swings', 'inchworm', 'worlds_greatest', 'air_squat', 'glute_bridge'],
  cardio: ['march', 'fast_feet', 'leg_swings', 'squat_reach', 'inchworm', 'worlds_greatest', 'arm_circles'],
  core: ['cat_cow', 'dead_bug', 'bird_dog', 'glute_bridge', 'inchworm', 'march'],
};
const COOL_LIST = ['childs_pose', 'hamstring_stretch', 'figure_four', 'couch_stretch', 'doorway_pec', 'open_book', 'sphinx', 'breathing'];

export function warmCoolPlan(w) {
  if (w.noWarm) return { warm: 0, cool: 0, extra: false };
  if (w.min <= 20) return { warm: 180, cool: 120, extra: true };
  if (w.min <= 35) return { warm: 300, cool: 180, extra: false };
  return { warm: 420, cool: 300, extra: false };
}

function pickTimed(list, total, per, ctx) {
  const ok = list.filter((id) => EXERCISES[id] && exerciseOk(EXERCISES[id], ctx) && EXERCISES[id].eq.every((q) => ctx.owned.has(q)));
  const n = Math.max(1, Math.round(total / per));
  const out = [];
  for (let i = 0; i < n && ok.length; i++) out.push(ok[i % ok.length]);
  return out;
}

export function warmup(w, ctx) {
  const plan = warmCoolPlan(w);
  if (!plan.warm) return [];
  let list = WARM_LISTS[w.cat[0]] || WARM_LISTS.full;
  if ((ctx.limits.b || 0) > 0) list = ['cat_cow', 'pelvic_tilt', ...list];
  return pickTimed(list, plan.warm, 45, ctx).map((id) => ({ id, sec: 45 }));
}
export function cooldown(w, ctx) {
  const plan = warmCoolPlan(w);
  if (!plan.cool) return [];
  let list = COOL_LIST;
  if ((ctx.limits.b || 0) > 0) list = ['sphinx', 'knee_to_chest', ...COOL_LIST.filter((x) => x !== 'sphinx')];
  return pickTimed(list, plan.cool, 60, ctx).map((id) => ({ id, sec: 60 }));
}

// ---------- compile to player steps ----------
const qtyFor = (e, reps) => (e.qty === 'n' ? reps : e.qty != null ? e.qty : reps != null ? Math.round(reps * e.mult) : null);

export function compile(w, ctx, opts = {}) {
  const steps = [];
  const push = (s) => steps.push(s);
  const rest = (sec, label = 'Rest', phase = 'rest') => sec > 0 && push({ type: 'timer', sec, label, phase, items: [] });

  if (opts.warmup !== false) {
    const wu = warmup(w, ctx);
    if (wu.length) {
      push({ type: 'timer', sec: 10, label: 'Get ready', phase: 'prep', items: [] });
      wu.forEach((x, i) => push({ type: 'timer', sec: x.sec, label: EXERCISES[x.id].name, phase: 'warm', items: [{ id: x.id }], info: `Warm-up ${i + 1}/${wu.length}` }));
    }
  }
  push({ type: 'timer', sec: 10, label: 'Here we go', phase: 'prep', items: [] });

  w.blocks.forEach((b, bi) => {
    const entries = blockEntries(b);
    if (bi > 0) rest(b.pre ?? 45, 'Next block');
    const blockTag = { block: bi, cap: b.cap ? b.cap * 60 : null };
    switch (b.t) {
      case 'sets':
        for (let s = 1; s <= b.sets; s++) {
          push({ type: 'tap', ...blockTag, phase: 'work', label: `Set ${s} of ${b.sets}`, tapText: 'Set done', items: entries.map((e) => ({ id: e.id, qty: qtyFor(e) })) });
          if (s < b.sets) rest(b.rest);
        }
        break;
      case 'int': {
        const n = b.rounds * entries.length;
        let k = 0;
        for (let r = 1; r <= b.rounds; r++) {
          entries.forEach((e, i) => {
            k++;
            push({ type: 'timer', ...blockTag, sec: b.work, phase: 'work', label: EXERCISES[e.id].name, items: [{ id: e.id }], info: `Round ${r}/${b.rounds} · ${i + 1}/${entries.length}` });
            const last = k === n;
            if (!last && b.rest) rest(b.rest, b.restName || 'Rest');
          });
          if (r < b.rounds && b.rrest) rest(b.rrest, 'Round break');
        }
        break;
      }
      case 'emom':
        for (let m = 1; m <= b.min; m++) {
          const items = b.rising ? entries.map((e) => ({ id: e.id, qty: m })) : [entries[(m - 1) % entries.length]].map((e) => ({ id: e.id, qty: qtyFor(e) }));
          push({ type: 'timer', ...blockTag, sec: 60, phase: 'work', emom: true, label: items.map((x) => EXERCISES[x.id].name).join(' + '), items, info: `Minute ${m}/${b.min}` });
        }
        break;
      case 'amrap':
        push({ type: 'amrap', ...blockTag, sec: b.min * 60, phase: 'work', label: `AMRAP ${b.min}`, tapText: 'Round done', items: entries.map((e) => ({ id: e.id, qty: qtyFor(e) })) });
        break;
      case 'ladder':
        b.reps.forEach((reps, i) => push({ type: 'tap', ...blockTag, phase: 'work', label: `Round ${i + 1} of ${b.reps.length} · ${reps} reps`, tapText: 'Round done', items: entries.map((e) => ({ id: e.id, qty: qtyFor(e, reps) })), forTime: true }));
        break;
      case 'rounds':
        for (let r = 1; r <= b.rounds; r++) {
          push({ type: 'tap', ...blockTag, phase: 'work', label: `Round ${r} of ${b.rounds}`, tapText: 'Round done', items: entries.map((e) => ({ id: e.id, qty: qtyFor(e) })), forTime: true });
          if (r < b.rounds && b.rest) rest(b.rest);
        }
        break;
      case 'chip':
        entries.forEach((e, i) => push({ type: 'tap', ...blockTag, phase: 'work', label: `${i + 1} of ${entries.length}`, tapText: 'Done', items: [{ id: e.id, qty: qtyFor(e) }], forTime: true, chip: true, upNext: entries.slice(i + 1).map((x) => ({ id: x.id, qty: qtyFor(x) })) }));
        break;
      case 'flow': {
        const rounds = b.rounds || 1;
        for (let r = 1; r <= rounds; r++) entries.forEach((e, i) => push({ type: 'timer', ...blockTag, sec: e.qty || 45, phase: 'work', hold: true, label: EXERCISES[e.id].name, items: [{ id: e.id }], info: (rounds > 1 ? `Round ${r}/${rounds} · ` : '') + `${i + 1}/${entries.length}` }));
        break;
      }
      case 'note': {
        const note = b.text || '';
        if (b.mode === 'amrap') push({ type: 'amrap', ...blockTag, sec: b.min * 60, phase: 'work', label: `AMRAP ${b.min}`, tapText: 'Round done', items: [], note });
        else if (b.mode === 'emom') for (let m = 1; m <= b.min; m++) push({ type: 'timer', ...blockTag, sec: 60, phase: 'work', emom: true, label: `Minute ${m}`, info: `Minute ${m}/${b.min}`, items: [], note });
        else if (b.mode === 'int') {
          for (let r = 1; r <= b.rounds; r++) {
            push({ type: 'timer', ...blockTag, sec: b.work, phase: 'work', label: `Round ${r} of ${b.rounds}`, info: `Round ${r}/${b.rounds}`, items: [], note });
            if (r < b.rounds && b.rest) rest(b.rest);
          }
        } else push({ type: 'tap', ...blockTag, cap: b.min ? b.min * 60 : null, phase: 'work', label: 'For time', tapText: 'Finished', items: [], note, forTime: true });
        break;
      }
      case 'timed':
        push({ type: 'timer', ...blockTag, sec: b.sec, phase: 'work', label: EXERCISES[entries[0].id].name, items: [{ id: entries[0].id }] });
        break;
    }
  });

  if (opts.cooldown !== false) {
    const cd = cooldown(w, ctx);
    cd.forEach((x, i) => push({ type: 'timer', sec: x.sec, label: EXERCISES[x.id].name, phase: 'cool', items: [{ id: x.id }], info: `Cool-down ${i + 1}/${cd.length}` }));
  }
  return steps;
}

export function itemText(it) {
  const ex = EXERCISES[it.id];
  if (!ex) return it.id;
  if (it.qty == null) return ex.name;
  const unit = ex.unit === 's' ? ' s' : ex.unit === 'm' ? ' m' : '';
  return `${it.qty}${unit} ${ex.name}${ex.uni ? ' (each side)' : ''}`;
}

export function fmtTime(sec) {
  sec = Math.max(0, Math.round(sec));
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// Points: effort-based so everyone can compete regardless of kit or injuries.
export function sessionPoints(w, minutesDone, { planned = false, benchmarkPR = false } = {}) {
  if (w.recovery) return 15 + (planned ? 10 : 0);
  const base = Math.round(Math.min(minutesDone, 60) * w.lvl * 2);
  return base + (planned ? 20 : 0) + (benchmarkPR ? 50 : 0);
}
export const DAILY_CAP = 300;

export const RANKS = [
  { r: 'E', xp: 0, title: 'Rookie' },
  { r: 'D', xp: 1000, title: 'Trainee' },
  { r: 'C', xp: 3000, title: 'Fighter' },
  { r: 'B', xp: 7000, title: 'Veteran' },
  { r: 'A', xp: 15000, title: 'Elite' },
  { r: 'S', xp: 30000, title: 'Legend' },
];
export function rankFor(xp) {
  let i = 0;
  while (i + 1 < RANKS.length && xp >= RANKS[i + 1].xp) i++;
  const cur = RANKS[i], next = RANKS[i + 1];
  return { ...cur, next, progress: next ? (xp - cur.xp) / (next.xp - cur.xp) : 1 };
}

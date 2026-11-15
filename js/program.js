// Training arc (program) generator and day-by-day workout picking.
import * as S from './store.js';
import { adaptWorkout, workoutMeta } from './engine.js';

export const FOCUSES = {
  rebuild: { name: 'Rebuild', desc: 'All-round fitness and fat loss. A bit of everything.',
    week: ['full', 'cardio', 'lower', 'mobility', 'upper', 'full', 'recovery'], hard: [1, 0, 1, 0, 1, 1, 0] },
  engine: { name: 'Engine', desc: 'Conditioning first. Intervals, EMOMs and runs.',
    week: ['cardio', 'full', 'core', 'cardio', 'mobility', 'full', 'recovery'], hard: [1, 1, 0, 1, 0, 1, 0] },
  strength: { name: 'Strength endurance', desc: 'More sets and reps work, still with plenty of sweat.',
    week: ['upper', 'lower', 'cardio', 'mobility', 'full', 'upper', 'recovery'], hard: [1, 1, 0, 0, 1, 0, 0] },
  backcare: { name: 'Back-care rebuild', desc: 'Extra mobility and core, back-friendly picks.',
    week: ['full', 'mobility', 'core', 'lower', 'mobility', 'cardio', 'recovery'], hard: [1, 0, 0, 1, 0, 1, 0] },
};

export const WEEK_TYPES = {
  ease: { name: 'Ease-in', lvl: [1, 2], maxMin: 30, note: 'Light weights, lots of mobility. Leave some in the tank.' },
  build: { name: 'Build', lvl: [2, 3], maxMin: 45, note: 'Steady progress. Add a little weight where it felt easy.' },
  peak: { name: 'Push', lvl: [3, 5], maxMin: 45, note: 'The hard week. Go after it, but listen to the back.' },
  deload: { name: 'Deload', lvl: [1, 2], maxMin: 30, note: 'Recovery week. Lighter, shorter, absorb the work.' },
  test: { name: 'Boss week', lvl: [2, 4], maxMin: 40, note: 'Benchmark retest. Show what the arc built.' },
};

export function weekPlan(weeks, ramp) {
  const out = [];
  if (ramp) for (let i = 0; i < Math.min(2, weeks); i++) out.push('ease');
  const cyc = ['build', 'peak', 'deload'];
  let i = 0;
  while (out.length < weeks) out.push(cyc[i++ % 3]);
  if (weeks >= 4) out[weeks - 1] = 'test';
  return out;
}

export function createProgram({ weeks, focus, ramp, startISO, benchId }) {
  const types = weekPlan(weeks, ramp);
  const benchWeeks = new Set();
  benchWeeks.add(Math.min(weeks, ramp ? 2 : 1) - 1);
  types.forEach((t, i) => { if (t === 'test') benchWeeks.add(i); });
  if (weeks >= 7) benchWeeks.add(Math.floor(weeks / 2) + (ramp ? 0 : -1));
  return {
    id: 'p' + Date.now(), name: `Training arc: ${FOCUSES[focus].name}`, focus, weeks, ramp,
    start: S.mondayOf(new Date(startISO + 'T12:00:00')), types, benchWeeks: [...benchWeeks].sort(), benchId,
    chosen: {}, done: {},
  };
}

export function programDay(p, iso) {
  const start = p.start;
  const diff = Math.round((new Date(iso + 'T12:00:00') - new Date(start + 'T12:00:00')) / 86400000);
  if (diff < 0 || diff >= p.weeks * 7) return null;
  const week = Math.floor(diff / 7), dow = diff % 7;
  const type = p.types[week];
  const focus = FOCUSES[p.focus];
  const checkin = S.get().checkins[S.addDays(start, week * 7)];
  const mins = checkin?.days?.[dow];
  let slot = focus.week[dow];
  let hard = !!focus.hard[dow];
  if (mins === 0) { slot = 'recovery'; hard = false; }
  // Bench slot: last hard day of a bench week
  let bench = false;
  if (p.benchWeeks.includes(week)) {
    const hardDays = focus.hard.map((h, i) => (h && (checkin?.days?.[i] ?? 1) !== 0 ? i : -1)).filter((i) => i >= 0);
    if (hardDays.length && dow === hardDays[hardDays.length - 1]) bench = true;
  }
  const wt = WEEK_TYPES[type];
  const target = slot === 'recovery' ? 15 : Math.min(wt.maxMin, mins || S.get().settings.defaultMin || 30);
  const lvl = hard ? wt.lvl : [wt.lvl[0], Math.max(wt.lvl[0], wt.lvl[1] - 1)];
  if (slot === 'mobility') lvl[0] = 1;
  return { week, dow, type, slot, hard, bench, target, lvl, iso };
}

function eligible(w, c) {
  const a = adaptWorkout(w, c);
  return !a.blocked;
}

export function candidatesFor(day, opts = {}) {
  const c = S.ctx();
  const st = S.get();
  let pool = S.allWorkouts().filter((w) => eligible(w, c));
  if (day.slot === 'recovery') pool = pool.filter((w) => w.recovery);
  else if (day.bench) {
    const p = st.program;
    const benches = pool.filter((w) => w.bench);
    const fixed = benches.find((w) => w.id === p?.benchId);
    pool = fixed ? [fixed] : benches.filter((w) => w.lvl <= day.lvl[1] + 1);
  } else {
    pool = pool.filter((w) => !w.recovery && !w.bench && w.cat.includes(day.slot));
    const inLvl = pool.filter((w) => w.lvl >= day.lvl[0] && w.lvl <= day.lvl[1]);
    if (inLvl.length) pool = inLvl;
    const fits = pool.filter((w) => w.min <= day.target + 5 && w.min >= day.target - 15);
    if (fits.length) pool = fits;
    if ((c.limits.b || 0) >= 1 || st.program?.focus === 'backcare') {
      const bf = pool.filter((w) => workoutMeta(adaptWorkout(w, c).workout).backFriendly);
      if (bf.length) pool = bf;
    }
  }
  const seed = (st.program?.id || '') + day.iso;
  return pool.map((w) => ({ w, s: S.scoreWorkout(w, seed) - Math.abs(w.min - day.target) * 0.05 })).sort((a, b) => b.s - a.s).map((x) => x.w);
}

export function workoutForDay(day, reroll = false) {
  const st = S.get();
  const p = st.program;
  const key = day.iso;
  const cur = p?.chosen?.[key];
  if (cur && !reroll && S.workoutById(cur)) return S.workoutById(cur);
  const cands = candidatesFor(day);
  if (!cands.length) return null;
  let pick = cands[0];
  if (reroll && cur) {
    const i = cands.findIndex((w) => w.id === cur);
    pick = cands[(i + 1) % cands.length];
  }
  if (p) S.update((s) => { s.program.chosen[key] = pick.id; }, { silent: true });
  return pick;
}

// Benchmarks to offer when creating an arc, filtered to what the user can do
export function benchOptions() {
  const c = S.ctx();
  return S.allWorkouts().filter((w) => w.bench && !adaptWorkout(w, c).blocked);
}

// Local-first state. Everything lives in localStorage; cloud sync (Firebase) hooks in via onSave.
import { WORKOUTS } from './data/workouts.js';
import { EXERCISES, WEIGHT_STEP, LOADED } from './data/exercises.js';
import { makeContext, sessionPoints, DAILY_CAP } from './engine.js';

const KEY = 'training-arc-v1';

const DEFAULT = {
  v: 1,
  profile: { name: '', createdAt: null },
  settings: {
    owned: ['run'], quiet: false, voice: true, beeps: true, vibrate: true, tvMode: false,
    defaultMin: 30, restDays: 'active',
  },
  injuries: {},
  history: [],
  wRatings: {},     // workoutId -> { sum, n }
  exRatings: {},    // exerciseId -> score (+1 / -1 accumulating)
  weights: {},      // exerciseId -> { kg, date, feel }
  bodyweight: [],   // [{ date, kg }]
  program: null,
  checkins: {},     // weekKey -> { days:{0..6:min}, back, energy, date }
  custom: [],       // custom workouts
  squads: [],       // squad invite codes
  deleted: [],      // ids deleted on this device (so sync doesn't bring them back)
  updatedAt: 0,
};

let state = load();
const listeners = new Set();
export const onSave = new Set();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return deepMerge(structuredClone(DEFAULT), JSON.parse(raw));
  } catch (e) { console.warn('load failed', e); }
  return structuredClone(DEFAULT);
}
function deepMerge(base, over) {
  for (const [k, v] of Object.entries(over || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) base[k] = deepMerge(base[k], v);
    else base[k] = v;
  }
  return base;
}

export function get() { return state; }
export function update(fn, { silent = false } = {}) {
  fn(state);
  state.updatedAt = Date.now();
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { console.warn('save failed', e); }
  if (!silent) listeners.forEach((l) => l(state));
  onSave.forEach((f) => f(state));
}
export function replaceAll(newState) {
  state = deepMerge(structuredClone(DEFAULT), newState);
  localStorage.setItem(KEY, JSON.stringify(state));
  listeners.forEach((l) => l(state));
}
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }

// ---------- helpers ----------
export const todayISO = (d = new Date()) => {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
};
export const nowLocal = () => {
  const d = new Date();
  return todayISO(d) + 'T' + d.toTimeString().slice(0, 8);
};
export function mondayOf(d = new Date()) {
  const x = new Date(d); x.setHours(12, 0, 0, 0);
  const day = (x.getDay() + 6) % 7; x.setDate(x.getDate() - day);
  return todayISO(x);
}
export function addDays(iso, n) {
  const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return todayISO(d);
}
export const dayIndex = (iso) => (new Date(iso + 'T12:00:00').getDay() + 6) % 7; // Mon=0

export function allWorkouts() { return [...WORKOUTS, ...state.custom]; }
export function workoutById(id) { return allWorkouts().find((w) => w.id === id); }
export function ctx() { return makeContext(state.settings, state.injuries); }

export function xpTotal() { return state.history.reduce((a, h) => a + (h.points || 0), 0); }
export function pointsOn(dateISO) { return state.history.filter((h) => h.date.slice(0, 10) === dateISO).reduce((a, h) => a + (h.points || 0), 0); }
export function pointsBetween(fromISO, toISO) {
  return state.history.filter((h) => h.date.slice(0, 10) >= fromISO && h.date.slice(0, 10) <= toISO).reduce((a, h) => a + (h.points || 0), 0);
}

export function streak() {
  const days = new Set(state.history.map((h) => h.date.slice(0, 10)));
  let n = 0, d = todayISO();
  if (!days.has(d)) d = addDays(d, -1);
  while (days.has(d)) { n++; d = addDays(d, -1); }
  return n;
}

export function avgRating(wid) {
  const r = state.wRatings[wid];
  return r && r.n ? r.sum / r.n : null;
}

// ---------- weights ----------
export function loadedEquipment(exId) {
  const ex = EXERCISES[exId];
  return ex ? ex.eq.find((q) => LOADED.has(q)) : null;
}
export function suggestWeight(exId) {
  const eq = loadedEquipment(exId);
  if (!eq) return null;
  const last = state.weights[exId];
  if (!last) return null;
  const step = WEIGHT_STEP[eq] || 2;
  if (last.feel === 'easy') return { kg: last.kg + step, why: 'Felt easy last time: up one step' };
  if (last.feel === 'brutal') return { kg: Math.max(step, last.kg - step), why: 'Brutal last time: down one step' };
  return { kg: last.kg, why: 'Same as last time' };
}

// ---------- recording a session ----------
export function recordSession({ workout, minutes, rating, rpe, exRatings = {}, weights = {}, score = null, planned = false }) {
  const date = nowLocal();
  const today = todayISO();
  let benchmarkPR = false;
  if (workout.bench && score) {
    const prev = state.history.filter((h) => h.wid === workout.id && h.score);
    benchmarkPR = prev.length > 0 && prev.every((h) => betterScore(score, h.score));
  }
  let pts = sessionPoints(workout, minutes, { planned, benchmarkPR });
  const already = pointsOn(today);
  pts = Math.max(0, Math.min(pts, DAILY_CAP - already));
  const entry = { id: 's' + Date.now(), wid: workout.id, name: workout.name, cat: workout.cat, date, min: Math.round(minutes), lvl: workout.lvl, points: pts, rating, rpe, score, planned, bench: !!workout.bench, pr: benchmarkPR };
  update((s) => {
    s.history.unshift(entry);
    if (rating) { const r = s.wRatings[workout.id] || { sum: 0, n: 0 }; r.sum += rating; r.n += 1; s.wRatings[workout.id] = r; }
    for (const [id, v] of Object.entries(exRatings)) s.exRatings[id] = (s.exRatings[id] || 0) + v;
    for (const [id, kg] of Object.entries(weights)) if (kg > 0) s.weights[id] = { kg: Number(kg), date, feel: rpe };
  });
  return entry;
}

// score: { type: 'time', sec } | { type: 'rounds', rounds, extra }
export function betterScore(a, b) {
  if (!a || !b || a.type !== b.type) return false;
  if (a.type === 'time') return a.sec < b.sec;
  return a.rounds > b.rounds;
}
export function fmtScore(s) {
  if (!s) return '';
  if (s.type === 'time') return `${Math.floor(s.sec / 60)}:${String(Math.round(s.sec % 60)).padStart(2, '0')}`;
  return `${s.rounds} rounds`;
}

// ---------- recommendations ----------
function hash(str) { let h = 2166136261; for (const c of str) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; }

export function scoreWorkout(w, seed = '') {
  const r = avgRating(w.id);
  let score = r == null ? 3.4 : r;           // unrated workouts get a fair go
  const exIds = w.blocks.flatMap((b) => (b.t === 'timed' ? [b.ex] : b.ex)).map((x) => x.split(/[:*]/)[0]);
  score += exIds.reduce((a, id) => a + Math.max(-2, Math.min(2, state.exRatings[id] || 0)), 0) * 0.15;
  const lastDone = state.history.find((h) => h.wid === w.id);
  if (lastDone) {
    const days = (Date.now() - new Date(lastDone.date).getTime()) / 86400000;
    if (days < 4) score -= 2; else if (days < 10) score -= 0.7;
  }
  score += hash(w.id + seed) * 0.8;          // stable variety
  return score;
}

export function exportData() { return JSON.stringify(state, null, 2); }

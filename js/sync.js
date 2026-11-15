// Cloud sync (Firebase Auth + Firestore) and squads with leaderboards.
// Local storage stays the source of truth while offline; Firestore keeps devices and friends in step.
import { FIREBASE_CONFIG } from './firebase-config.js';
import * as S from './store.js';
import { rankFor } from './engine.js';

const V = '10.14.1';
const CDN = `https://www.gstatic.com/firebasejs/${V}`;
let fb = null;          // { auth, db, fns... }
let user = null;
let ready = false;
let loadErr = null;
let hooks = { rerender: () => {}, toast: () => {} };
let pushTimer = null;
let lastPushed = 0;
let unsubDoc = null;
const lb = { tab: 'week', cache: {} };

const h = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export async function init(opts) {
  hooks = { ...hooks, ...opts };
  if (!FIREBASE_CONFIG) return;
  try {
    const [appM, authM, fsM] = await Promise.all([
      import(`${CDN}/firebase-app.js`), import(`${CDN}/firebase-auth.js`), import(`${CDN}/firebase-firestore.js`),
    ]);
    const app = appM.initializeApp(FIREBASE_CONFIG);
    const auth = authM.getAuth(app);
    const db = fsM.getFirestore(app);
    fb = { auth, db, ...authM, ...fsM };
    ready = true;
    authM.onAuthStateChanged(auth, async (u) => {
      user = u;
      S.session.uid = u ? u.uid : null;
      if (unsubDoc) { unsubDoc(); unsubDoc = null; }
      if (u) await startSync();
      hooks.rerender();
    });
    S.onSave.add(() => schedulePush());
    hooks.rerender();
  } catch (e) {
    loadErr = e;
    console.warn('Firebase failed to load (offline?)', e);
  }
}

export function signedIn() { return !!user; }

export function status() {
  if (!FIREBASE_CONFIG) return 'Not set up. Data is saved on this device only.';
  if (loadErr) return 'Offline right now. Your data is safe on this device and will sync when you are back online.';
  if (!ready) return 'Connecting…';
  if (!user) return 'Sign in with Google to sync between your phone, laptop and TV, and to join a squad.';
  return `Signed in as <b>${h(user.displayName || user.email)}</b>. Syncing across your devices.`;
}

export function controls() {
  if (!ready) return '';
  if (!user) return '<button class="btn" data-act="signin">Sign in with Google</button>';
  return '<div class="row"><button class="btn ghost" data-act="syncnow">Sync now</button><button class="btn ghost" data-act="signout">Sign out</button></div>';
}

// ---------- state merge ----------
function unionBy(a = [], b = [], key) {
  const m = new Map();
  for (const x of b) m.set(x[key], x);
  for (const x of a) m.set(x[key], x); // a (newer base) wins on conflict
  return [...m.values()];
}
function merge(local, remote) {
  const newer = (remote.updatedAt || 0) > (local.updatedAt || 0) ? remote : local;
  const older = newer === remote ? local : remote;
  const out = structuredClone(newer);
  const deleted = new Set([...(local.deleted || []), ...(remote.deleted || [])]);
  out.deleted = [...deleted].slice(-500);
  out.history = unionBy(newer.history, older.history, 'id').filter((x) => !deleted.has(x.id)).sort((x, y) => (y.date > x.date ? 1 : -1));
  out.bodyweight = unionBy(newer.bodyweight, older.bodyweight, 'date').sort((x, y) => (x.date > y.date ? 1 : -1));
  out.custom = unionBy(newer.custom, older.custom, 'id').filter((x) => !deleted.has(x.id));
  out.checkins = { ...(older.checkins || {}), ...(newer.checkins || {}) };
  out.squads = [...new Set([...(newer.squads || []), ...(older.squads || [])])].filter((c) => !deleted.has('squad:' + c));
  return out;
}

async function startSync() {
  const { doc, getDoc, onSnapshot } = fb;
  const ref = doc(fb.db, 'users', user.uid);
  try {
    const snap = await getDoc(ref);
    const local = S.get();
    if (snap.exists()) {
      const remote = JSON.parse(snap.data().state || '{}');
      const merged = merge(local, remote);
      if (!merged.profile.name && user.displayName) merged.profile.name = user.displayName.split(' ')[0];
      S.replaceAll(merged);
    } else if (!local.profile.name && user.displayName) {
      S.update((s) => { s.profile.name = user.displayName.split(' ')[0]; }, { silent: true });
    }
    await push();
    fetchSquadWorkouts(true);
    hooks.toast('Synced');
  } catch (e) { console.warn('initial sync failed', e); hooks.toast('Sync failed: ' + (e.code || e.message)); }
  unsubDoc = onSnapshot(ref, (snap) => {
    if (!snap.exists() || snap.metadata.hasPendingWrites) return;
    const d = snap.data();
    if ((d.updatedAt || 0) <= lastPushed) return;
    const remote = JSON.parse(d.state || '{}');
    if ((remote.updatedAt || 0) <= (S.get().updatedAt || 0)) return;
    S.replaceAll(merge(S.get(), remote));
    lastPushed = d.updatedAt;
  });
}

function schedulePush() {
  if (!user) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => push().catch((e) => console.warn('push failed', e)), 1500);
}

function weekKey(iso) { return S.mondayOf(new Date(iso + 'T12:00:00')); }

function memberSummary(st) {
  const weekly = {}, monthly = {};
  for (const x of st.history) {
    const d = x.date.slice(0, 10);
    const wk = weekKey(d), mo = d.slice(0, 7);
    weekly[wk] = (weekly[wk] || 0) + (x.points || 0);
    monthly[mo] = (monthly[mo] || 0) + (x.points || 0);
  }
  const keep = (o, n) => Object.fromEntries(Object.entries(o).sort().slice(-n));
  const xp = S.xpTotal();
  return {
    name: st.profile.name || 'Fighter',
    rank: rankFor(xp).r,
    xp,
    weekly: keep(weekly, 10),
    monthly: keep(monthly, 12),
    sessions: st.history.filter((x) => x.min > 0).length,
    streak: S.streak(),
    recent: st.history.filter((x) => x.min > 0).slice(0, 5).map((x) => ({ name: x.name, date: x.date.slice(0, 10), points: x.points, min: x.min })),
    updatedAt: Date.now(),
  };
}

async function push() {
  if (!user) return;
  const { doc, setDoc } = fb;
  const st = S.get();
  const now = Date.now();
  lastPushed = now;
  await setDoc(doc(fb.db, 'users', user.uid), { state: JSON.stringify(st), updatedAt: now, name: st.profile.name || '' });
  const sum = memberSummary(st);
  await Promise.all((st.squads || []).map((code) => setDoc(doc(fb.db, 'squads', code, 'members', user.uid), sum).catch((e) => console.warn('squad push', code, e))));
}

// ---------- squad workouts ----------
let lastFetch = 0;
export async function fetchSquadWorkouts(force = false) {
  if (!user || !fb) return;
  if (!force && Date.now() - lastFetch < 120000) return;
  lastFetch = Date.now();
  const { collection, getDocs, doc, getDoc, setDoc, updateDoc } = fb;
  const out = [];
  const me = S.get();
  for (const code of me.squads || []) {
    try {
      if (!lb.cache[code]) { const sq = await getDoc(doc(fb.db, 'squads', code)); if (sq.exists()) lb.cache[code] = { name: sq.data().name }; }
      const memberCount = (await getDocs(collection(fb.db, 'squads', code, 'members'))).size;
      const needed = Math.min(5, Math.max(1, memberCount));
      const snap = await getDocs(collection(fb.db, 'squads', code, 'workouts'));
      for (const d of snap.docs) {
        try {
          const data = d.data();
          const w = JSON.parse(data.workout);
          const sqId = `sq-${code}-${d.id}`;
          let ranked = data.ranked || null;
          let votes = 0;
          if (!ranked) {
            const vs = await getDocs(collection(fb.db, 'squads', code, 'workouts', d.id, 'votes'));
            const levels = vs.docs.map((v) => v.data().level);
            // send my vote if I have one saved locally and haven't sent it yet
            if (!vs.docs.some((v) => v.id === user.uid)) {
              const mine = me.history.find((e) => e.levelVote && (e.wid === sqId || (data.by === user.uid && e.wid === data.srcId)));
              if (mine) {
                await setDoc(doc(fb.db, 'squads', code, 'workouts', d.id, 'votes', user.uid), { level: mine.levelVote, name: me.profile.name || '', at: Date.now() });
                levels.push(mine.levelVote);
              }
            }
            votes = levels.length;
            if (votes >= needed) {
              const avg = levels.reduce((a, b) => a + b, 0) / votes;
              const r = { level: Math.min(5, Math.max(1, Math.round(avg))), votes, avg: Math.round(avg * 10) / 10, at: Date.now() };
              try { await updateDoc(doc(fb.db, 'squads', code, 'workouts', d.id), { ranked: r }); ranked = r; } catch (e) { console.warn('rank failed', e); }
            }
          }
          out.push({ ...w, declaredLvl: w.lvl, lvl: ranked ? ranked.level : w.lvl, id: sqId, docId: d.id, squad: code, squadName: lb.cache[code]?.name || code,
            sharedFrom: data.srcId, byUid: data.by, byName: data.byName, custom: false, squadShared: true, ranked, votes: ranked ? ranked.votes : votes, needed });
        } catch (e) { console.warn('bad shared workout', d.id, e); }
      }
    } catch (e) { console.warn('squad workouts', code, e); }
  }
  S.setSquadWorkouts(out);
  // Keep a ranked level on my own copy, so it stays ranked even if I leave the squad
  const toLock = me.custom.filter((c) => !c.rankedLevel && out.some((x) => x.ranked && x.sharedFrom === c.id && x.byUid === user.uid));
  if (toLock.length) {
    S.update((st) => {
      for (const c of st.custom) {
        const r = out.find((x) => x.ranked && x.sharedFrom === c.id && x.byUid === user.uid);
        if (r && !c.rankedLevel) { c.rankedLevel = r.ranked.level; c.lvl = r.ranked.level; }
      }
    });
  }
  const paid = S.applyBackpay();
  if (paid) hooks.toast(`+${paid} XP back-paid: a squad workout was ranked!`);
}

function rankLine(w) {
  if (w.ranked) return `<b>Squad-ranked: level ${w.ranked.level}</b> (average ${w.ranked.avg ?? w.ranked.level} from ${w.ranked.votes} votes).`;
  return `<b>Unranked:</b> ${w.votes || 0} of ${w.needed || 5} votes so far. Earns level-1 XP until ranked; everyone gets back-paid once it is.`;
}

export function shareControls(w) {
  if (w.squadShared) {
    const mine = user && w.byUid === user.uid;
    return `<div class="info">Shared by <b>${h(w.byName || 'a squad mate')}</b> in <b>${h(w.squadName)}</b>.<br>${rankLine(w)}
      <div class="row"><button class="btn ghost" data-act="sqcopy" data-id="${h(w.id)}">Save a copy to my workouts</button>
      ${mine ? `<button class="btn ghost danger" data-act="squnshare" data-code="${h(w.squad)}" data-doc="${h(w.docId)}">Remove from squad</button>` : ''}</div></div>`;
  }
  if (!w.custom) return '';
  const lvlNote = '<p class="muted small">Your own workouts earn level-1 XP. Share one with your squad: once 5 members (or everyone, in smaller squads) have done it and voted on its level, it gets that level and earlier sessions are back-paid.</p>';
  const codes = S.get().squads || [];
  if (!user) return `<div class="info">Sign in and join a squad to share this workout with your friends.${lvlNote}</div>`;
  if (!codes.length) return `<div class="info">Join or create a squad (Me → Squads) to share this workout.${lvlNote}</div>`;
  const shared = S.getSquadWorkouts().filter((x) => x.sharedFrom === w.id && x.byUid === user.uid);
  return `<div class="card"><div class="card-h">Share with your squad</div>${codes.map((c) => {
    const ex = shared.find((x) => x.squad === c);
    const name = h(lb.cache[c]?.name || 'Squad ' + c);
    return ex
      ? `<div class="sharerow"><div>✓ Shared with ${name}</div><div class="muted small">${rankLine(ex)}</div><div class="row">${ex.ranked ? '' : `<button class="btn ghost" data-act="sqshare" data-code="${h(c)}" data-id="${h(w.id)}">Update</button>`}<button class="btn ghost danger" data-act="squnshare" data-code="${h(c)}" data-doc="${h(ex.docId)}">Unshare</button></div></div>`
      : `<button class="btn" data-act="sqshare" data-code="${h(c)}" data-id="${h(w.id)}">Share with ${name}</button>`;
  }).join('')}${lvlNote}</div>`;
}

// ---------- squads ----------
function newCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c = '';
  const r = crypto.getRandomValues(new Uint32Array(6));
  for (const n of r) c += A[n % A.length];
  return c;
}

export function squadsCard() {
  const st = S.get();
  if (!ready) return `<p class="muted small">${status()}</p>`;
  if (!user) return `<p class="muted small">Sign in to create or join a squad with your friends.</p><button class="btn" data-act="signin">Sign in with Google</button>`;
  const list = (st.squads || []).map((c) => `<a class="btn ghost wide" href="#/squad/${c}">⚔️ ${h(lb.cache[c]?.name || 'Squad ' + c)}</a>`).join('');
  return `${list ? list + '<p class="muted small">Tap a squad to see its leaderboard, invite code, or to leave it.</p>' : ''}${list ? '' : '<p class="muted small">No squad yet. Create one and share the code, or join a friend\'s.</p>'}
    <div class="row"><input type="text" id="sq-name" placeholder="Squad name" maxlength="30"><button class="btn" data-act="squadcreate">Create</button></div>
    <div class="row"><input type="text" id="sq-code" placeholder="Invite code" maxlength="6" style="text-transform:uppercase"><button class="btn ghost" data-act="squadjoin">Join</button></div>`;
}

export function squadView(code) {
  return `<a class="back" href="#/me">← Back</a>
    <h1 class="title" id="sq-title">${h(lb.cache[code]?.name || 'Squad')}</h1>
    <div class="info">Invite code: <b style="font-size:22px;letter-spacing:2px">${h(code)}</b> <button class="btn ghost" data-act="sharecode" data-code="${h(code)}">Share</button></div>
    <div class="seg">${[['week', 'This week'], ['month', 'This month'], ['all', 'All time']].map(([k, l]) => `<button class="${lb.tab === k ? 'on' : ''}" data-act="lbtab" data-v="${k}" data-code="${h(code)}">${l}</button>`).join('')}</div>
    <div id="lb" class="card"><p class="muted">Loading the leaderboard…</p></div>
    <p class="muted small">Points are based on effort (time × level), plus bonuses for planned sessions, check-ins and boss-fight records. Capped at 300 a day. Friends only see your name, rank, points and recent session names.</p>
    <button class="btn ghost danger" data-act="squadleave" data-code="${h(code)}">Leave squad</button>`;
}

export async function loadSquad(code) {
  const el = document.getElementById('lb');
  if (!el) return;
  if (!ready || !user) { el.innerHTML = `<p class="muted">${status()}</p>${controls()}`; return; }
  const { doc, getDoc, collection, getDocs } = fb;
  try {
    const sq = await getDoc(doc(fb.db, 'squads', code));
    if (!sq.exists()) { el.innerHTML = '<p>That squad no longer exists.</p>'; return; }
    lb.cache[code] = { name: sq.data().name };
    const t = document.getElementById('sq-title'); if (t) t.textContent = sq.data().name;
    const ms = await getDocs(collection(fb.db, 'squads', code, 'members'));
    const wk = S.mondayOf(), mo = S.todayISO().slice(0, 7);
    const rows = ms.docs.map((d) => {
      const m = d.data();
      const score = lb.tab === 'week' ? (m.weekly?.[wk] || 0) : lb.tab === 'month' ? (m.monthly?.[mo] || 0) : (m.xp || 0);
      return { uid: d.id, ...m, score };
    }).sort((a, b) => b.score - a.score);
    const medal = ['🥇', '🥈', '🥉'];
    el.innerHTML = rows.map((m, i) => `
      <div class="lb-row ${m.uid === user.uid ? 'me' : ''}">
        <span class="lb-pos">${medal[i] || i + 1}</span>
        <span class="rank-badge sm r-${h(m.rank)}">${h(m.rank)}</span>
        <span class="lb-name">${h(m.name)}<small>${m.sessions} sessions · 🔥 ${m.streak}${m.recent?.[0] ? ` · last: ${h(m.recent[0].name)} (${h(m.recent[0].date)})` : ''}</small></span>
        <span class="lb-score">${m.score}</span>
      </div>`).join('') || '<p class="muted">No members yet.</p>';
  } catch (e) {
    el.innerHTML = `<p class="warn">Could not load the squad: ${h(e.code || e.message)}</p>`;
  }
}

export async function handle(act, el) {
  const { toast, rerender } = hooks;
  try {
    if (act === 'signin') {
      if (!ready) return toast('Still connecting, try again in a moment');
      const provider = new fb.GoogleAuthProvider();
      try { await fb.signInWithPopup(fb.auth, provider); } catch (e) {
        if (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment') await fb.signInWithRedirect(fb.auth, provider);
        else throw e;
      }
    }
    if (act === 'signout') { await fb.signOut(fb.auth); toast('Signed out. Data stays on this device.'); }
    if (act === 'syncnow') { await push(); toast('Synced'); }
    if (act === 'squadcreate') {
      const name = document.getElementById('sq-name').value.trim();
      if (!name) return toast('Give your squad a name');
      const code = newCode();
      await fb.setDoc(fb.doc(fb.db, 'squads', code), { name, owner: user.uid, createdAt: Date.now() });
      S.update((s) => { s.squads = [...new Set([...(s.squads || []), code])]; });
      await push();
      lb.cache[code] = { name };
      location.hash = '#/squad/' + code;
    }
    if (act === 'squadjoin') {
      const code = document.getElementById('sq-code').value.trim().toUpperCase();
      if (code.length !== 6) return toast('Codes are 6 characters');
      const sq = await fb.getDoc(fb.doc(fb.db, 'squads', code));
      if (!sq.exists()) return toast('No squad with that code');
      S.update((s) => { s.squads = [...new Set([...(s.squads || []), code])]; s.deleted = (s.deleted || []).filter((x) => x !== 'squad:' + code); });
      await push();
      lb.cache[code] = { name: sq.data().name };
      fetchSquadWorkouts(true);
      toast(`Joined ${sq.data().name}!`);
      location.hash = '#/squad/' + code;
    }
    if (act === 'squadleave') {
      const code = el.dataset.code;
      if (!confirm('Leave this squad? You will drop off its leaderboard and stop seeing its shared workouts. Any workouts you shared stay in the squad for your mates. Your own workouts, history and XP stay with you.')) return;
      await fb.deleteDoc(fb.doc(fb.db, 'squads', code, 'members', user.uid)).catch(() => {});
      S.update((s) => { s.squads = (s.squads || []).filter((c) => c !== code); s.deleted = [...(s.deleted || []), 'squad:' + code]; });
      S.setSquadWorkouts(S.getSquadWorkouts().filter((w) => w.squad !== code));
      location.hash = '#/me';
    }
    if (act === 'sqshare') {
      const w = S.get().custom.find((x) => x.id === el.dataset.id);
      if (!w) return;
      const clean = { ...w };
      delete clean.custom;
      await fb.setDoc(fb.doc(fb.db, 'squads', el.dataset.code, 'workouts', `${user.uid}_${w.id}`), {
        workout: JSON.stringify(clean), by: user.uid, byName: S.get().profile.name || user.displayName || 'Squad mate', srcId: w.id, name: w.name, createdAt: Date.now(),
      }, { merge: true });
      await fetchSquadWorkouts(true);
      toast('Shared with the squad');
      rerender();
    }
    if (act === 'squnshare') {
      if (!confirm('Remove this workout from the squad?')) return;
      await fb.deleteDoc(fb.doc(fb.db, 'squads', el.dataset.code, 'workouts', el.dataset.doc));
      await fetchSquadWorkouts(true);
      toast('Removed');
      if (location.hash.includes('/w/sq-')) location.hash = '#/library'; else rerender();
    }
    if (act === 'sqcopy') {
      const w = S.allWorkouts().find((x) => x.id === el.dataset.id);
      if (!w) return;
      const copy = { ...w, id: 'c' + Date.now(), custom: true, squadShared: false, desc: (w.desc || '') + ` (from ${w.byName || 'squad'})`, copiedFrom: w.id };
      if (w.ranked) { copy.rankedLevel = w.ranked.level; copy.lvl = w.ranked.level; }
      ['docId', 'squad', 'squadName', 'sharedFrom', 'byUid', 'byName', 'ranked', 'votes', 'needed', 'declaredLvl'].forEach((k) => delete copy[k]);
      S.update((st) => { st.custom.push(copy); });
      toast('Saved to your workouts');
      location.hash = '#/w/' + copy.id;
    }
    if (act === 'lbtab') { lb.tab = el.dataset.v; rerender(); }
    if (act === 'sharecode') {
      const code = el.dataset.code;
      const text = `Join my Training Arc squad! Open ${location.origin}${location.pathname} , sign in, then Me → Squads → Join with code ${code}`;
      if (navigator.share) navigator.share({ title: 'Training Arc squad', text }).catch(() => {});
      else { await navigator.clipboard.writeText(text); toast('Invite copied'); }
    }
  } catch (e) {
    console.warn(act, e);
    toast((e.code || e.message || 'Something went wrong').replace('auth/', ''));
  }
}

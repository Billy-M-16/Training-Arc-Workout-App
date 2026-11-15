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
  out.squadRequests = [...new Set([...(newer.squadRequests || []), ...(older.squadRequests || [])])].filter((c) => !deleted.has('req:' + c) && !out.squads.includes(c));
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
    refreshSquads(true);
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


// =====================================================================
// SQUADS: membership with moderator approval, shared workouts, ranking,
// moderation (join requests, workout approval, reports, remove/block).
// =====================================================================
const D = (...p) => fb.doc(fb.db, ...p);
const C = (...p) => fb.collection(fb.db, ...p);

function isModOf(code) {
  const sq = lb.cache[code];
  return !!(sq && user && (sq.owner === user.uid || (sq.mods || []).includes(user.uid)));
}
const isOwnerOf = (code) => !!(lb.cache[code] && user && lb.cache[code].owner === user.uid);

async function loadSquadDoc(code) {
  const sq = await fb.getDoc(D('squads', code));
  if (!sq.exists()) return null;
  lb.cache[code] = { ...(lb.cache[code] || {}), ...sq.data(), mods: sq.data().mods || [] };
  return lb.cache[code];
}

function forgetSquad(code, msg) {
  S.update((s) => {
    s.squads = (s.squads || []).filter((c) => c !== code);
    s.squadRequests = (s.squadRequests || []).filter((c) => c !== code);
    s.deleted = [...(s.deleted || []), 'squad:' + code, 'req:' + code];
  });
  S.setSquadWorkouts(S.getSquadWorkouts().filter((w) => w.squad !== code));
  if (msg) hooks.toast(msg);
}

// One-off upgrade for squads created before moderation existed (run by the owner).
async function migrateIfOwner(code) {
  const sq = lb.cache[code];
  if (!isOwnerOf(code) || 'approveWorkouts' in sq) return;
  await fb.setDoc(D('squads', code, 'approved', user.uid), { name: S.get().profile.name || 'Owner', at: Date.now() });
  const ms = await fb.getDocs(C('squads', code, 'members'));
  for (const m of ms.docs) if (m.id !== user.uid) await fb.setDoc(D('squads', code, 'approved', m.id), { name: m.data().name || 'Member', at: Date.now() }).catch(() => {});
  const ws = await fb.getDocs(C('squads', code, 'workouts'));
  for (const w of ws.docs) if (!w.data().status) await fb.updateDoc(w.ref, { status: 'approved' }).catch(() => {});
  await fb.updateDoc(D('squads', code), { approveWorkouts: true, mods: sq.mods || [] });
  sq.approveWorkouts = true;
}

let lastFetch = 0;
export async function refreshSquads(force = false) {
  if (!user || !fb) return;
  if (!force && Date.now() - lastFetch < 120000) return;
  lastFetch = Date.now();
  const me = S.get();

  // pending join requests: accepted, declined, or still waiting?
  for (const code of me.squadRequests || []) {
    try {
      const ok = await fb.getDoc(D('squads', code, 'approved', user.uid));
      if (ok.exists()) {
        const sq = await loadSquadDoc(code);
        S.update((s) => { s.squadRequests = (s.squadRequests || []).filter((c) => c !== code); s.squads = [...new Set([...(s.squads || []), code])]; s.deleted = (s.deleted || []).filter((x) => x !== 'squad:' + code); });
        await fb.deleteDoc(D('squads', code, 'requests', user.uid)).catch(() => {});
        hooks.toast(`You're in! Welcome to ${sq?.name || 'the squad'}`);
        continue;
      }
      const req = await fb.getDoc(D('squads', code, 'requests', user.uid));
      if (!req.exists()) forgetSquad(code, 'Your request to join a squad was declined');
    } catch (e) { console.warn('request check', code, e); }
  }

  const out = [];
  for (const code of S.get().squads || []) {
    try {
      const sq = await loadSquadDoc(code);
      if (!sq) { forgetSquad(code, 'A squad you were in no longer exists'); continue; }
      await migrateIfOwner(code);
      if (!('approveWorkouts' in sq)) continue; // older squad: waits for its owner to open the app once
      const ok = await fb.getDoc(D('squads', code, 'approved', user.uid));
      if (!ok.exists()) { forgetSquad(code, `You are no longer a member of ${sq.name}`); continue; }

      const memberCount = (await fb.getDocs(C('squads', code, 'approved'))).size;
      const needed = Math.min(5, Math.max(1, memberCount));
      // members only see approved workouts (plus their own pending); mods see everything
      let docs;
      if (isModOf(code)) docs = (await fb.getDocs(C('squads', code, 'workouts'))).docs;
      else {
        const [a, b] = await Promise.all([
          fb.getDocs(fb.query(C('squads', code, 'workouts'), fb.where('status', '==', 'approved'))),
          fb.getDocs(fb.query(C('squads', code, 'workouts'), fb.where('by', '==', user.uid))),
        ]);
        const m = new Map(); [...a.docs, ...b.docs].forEach((d) => m.set(d.id, d)); docs = [...m.values()];
      }
      for (const d of docs) {
        try {
          const data = d.data();
          const w = JSON.parse(data.workout);
          const sqId = `sq-${code}-${d.id}`;
          const approved = data.status === 'approved';
          let ranked = data.ranked || null;
          let votes = 0;
          if (approved && !ranked) {
            const vs = await fb.getDocs(C('squads', code, 'workouts', d.id, 'votes'));
            const levels = vs.docs.map((v) => v.data().level);
            if (!vs.docs.some((v) => v.id === user.uid)) {
              const mine = S.get().history.find((e) => e.levelVote && (e.wid === sqId || (data.by === user.uid && e.wid === data.srcId)));
              if (mine) {
                await fb.setDoc(D('squads', code, 'workouts', d.id, 'votes', user.uid), { level: mine.levelVote, name: S.get().profile.name || '', at: Date.now() });
                levels.push(mine.levelVote);
              }
            }
            votes = levels.length;
            if (votes >= needed) {
              const avg = levels.reduce((x, y) => x + y, 0) / votes;
              const r = { level: Math.min(5, Math.max(1, Math.round(avg))), votes, avg: Math.round(avg * 10) / 10, at: Date.now() };
              try { await fb.updateDoc(d.ref, { ranked: r }); ranked = r; } catch (e) { console.warn('rank failed', e); }
            }
          }
          out.push({ ...w, declaredLvl: w.lvl, lvl: ranked ? ranked.level : w.lvl, id: sqId, docId: d.id, squad: code, squadName: sq.name,
            sharedFrom: data.srcId, byUid: data.by, byName: data.byName, custom: false, squadShared: true, status: data.status || 'approved',
            ranked, votes: ranked ? ranked.votes : votes, needed });
        } catch (e) { console.warn('bad shared workout', d.id, e); }
      }
    } catch (e) { console.warn('squad refresh', code, e); }
  }
  S.setSquadWorkouts(out);
  const toLock = S.get().custom.filter((c) => !c.rankedLevel && out.some((x) => x.ranked && x.sharedFrom === c.id && x.byUid === user.uid));
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
export const fetchSquadWorkouts = refreshSquads;

function rankLine(w) {
  if (w.status === 'pending') return '<b>Waiting for a moderator to approve it.</b>';
  if (w.ranked) return `<b>Squad-ranked: level ${w.ranked.level}</b> (average ${w.ranked.avg ?? w.ranked.level} from ${w.ranked.votes} votes).`;
  return `<b>Unranked:</b> ${w.votes || 0} of ${w.needed || 5} votes so far. Earns level-1 XP until ranked; everyone gets back-paid once it is.`;
}

export function shareControls(w) {
  if (w.squadShared) {
    const mine = user && w.byUid === user.uid;
    const mod = isModOf(w.squad);
    return `<div class="info">Shared by <b>${h(w.byName || 'a squad mate')}</b> in <b>${h(w.squadName)}</b>.<br>${rankLine(w)}
      <div class="row">
      ${w.status === 'pending' && mod ? `<button class="btn" data-act="modapprovew" data-code="${h(w.squad)}" data-doc="${h(w.docId)}">Approve</button><button class="btn ghost danger" data-act="modrejectw" data-code="${h(w.squad)}" data-doc="${h(w.docId)}">Reject</button>` : ''}
      ${w.status !== 'pending' ? `<button class="btn ghost" data-act="sqcopy" data-id="${h(w.id)}">Save a copy to my workouts</button>` : ''}
      ${mine ? `<button class="btn ghost danger" data-act="squnshare" data-code="${h(w.squad)}" data-doc="${h(w.docId)}">Remove from squad</button>`
        : mod && w.status !== 'pending' ? `<button class="btn ghost danger" data-act="modrejectw" data-code="${h(w.squad)}" data-doc="${h(w.docId)}">Remove (moderator)</button>`
        : w.status !== 'pending' ? `<button class="btn ghost" data-act="report" data-code="${h(w.squad)}" data-doc="${h(w.docId)}" data-name="${h(w.name)}">Report</button>` : ''}
      </div></div>`;
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
    const needsOk = lb.cache[c]?.approveWorkouts !== false && !isModOf(c);
    return ex
      ? `<div class="sharerow"><div>✓ Shared with ${name}</div><div class="muted small">${rankLine(ex)}</div><div class="row">${ex.ranked ? '' : `<button class="btn ghost" data-act="sqshare" data-code="${h(c)}" data-id="${h(w.id)}">Update</button>`}<button class="btn ghost danger" data-act="squnshare" data-code="${h(c)}" data-doc="${h(ex.docId)}">Unshare</button></div></div>`
      : `<button class="btn" data-act="sqshare" data-code="${h(c)}" data-id="${h(w.id)}">Share with ${name}</button>${needsOk ? '<div class="muted small">A moderator approves it before the squad sees it.</div>' : ''}`;
  }).join('')}${lvlNote}</div>`;
}

function newCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c = '';
  for (const n of crypto.getRandomValues(new Uint32Array(6))) c += A[n % A.length];
  return c;
}

export function squadsCard() {
  const st = S.get();
  if (!ready) return `<p class="muted small">${status()}</p>`;
  if (!user) return `<p class="muted small">Sign in to create or join a squad with your friends.</p><button class="btn" data-act="signin">Sign in with Google</button>`;
  const list = (st.squads || []).map((c) => `<a class="btn ghost wide" href="#/squad/${c}">⚔️ ${h(lb.cache[c]?.name || 'Squad ' + c)}${isModOf(c) ? ' <span class="tag boss">Mod</span>' : ''}</a>`).join('');
  const reqs = (st.squadRequests || []).map((c) => `<div class="hist"><span>⏳ Request sent: ${h(c)}</span><small>Waiting for a moderator to accept you.</small><button class="x" data-act="cancelreq" data-code="${h(c)}" aria-label="Cancel request">✕</button></div>`).join('');
  return `${list}${list ? '<p class="muted small">Tap a squad to see its leaderboard and members, or to leave it.</p>' : ''}${reqs}
    ${!list && !reqs ? '<p class="muted small">No squad yet. Create one and share the code, or ask to join a friend\'s.</p>' : ''}
    <div class="row"><input type="text" id="sq-name" placeholder="Squad name" maxlength="30"><button class="btn" data-act="squadcreate">Create</button></div>
    <div class="row"><input type="text" id="sq-code" placeholder="Invite code" maxlength="6" style="text-transform:uppercase"><button class="btn ghost" data-act="squadjoin">Ask to join</button></div>`;
}

export function squadView(code) {
  const mod = isModOf(code), owner = isOwnerOf(code);
  return `<a class="back" href="#/me">← Back</a>
    <h1 class="title" id="sq-title">${h(lb.cache[code]?.name || 'Squad')}</h1>
    <div class="info">Invite code: <b style="font-size:22px;letter-spacing:2px">${h(code)}</b> <button class="btn ghost" data-act="sharecode" data-code="${h(code)}">Share</button>
      <div class="muted small">New people ask to join with this code, and a moderator accepts them.</div></div>
    <div id="sq-mod"></div>
    <div class="seg">${[['week', 'This week'], ['month', 'This month'], ['all', 'All time']].map(([k, l]) => `<button class="${lb.tab === k ? 'on' : ''}" data-act="lbtab" data-v="${k}" data-code="${h(code)}">${l}</button>`).join('')}</div>
    <div id="lb" class="card"><p class="muted">Loading the leaderboard…</p></div>
    <div id="sq-members" class="card"><div class="card-h">Members</div><p class="muted small">Loading…</p></div>
    ${owner ? `<div class="card"><div class="card-h">Squad settings</div>
      <label class="switch"><input type="checkbox" data-act="modtoggleapprove" data-code="${h(code)}" ${lb.cache[code]?.approveWorkouts !== false ? 'checked' : ''}><span>Moderators approve shared workouts before the squad sees them</span></label></div>` : ''}
    <p class="muted small">Points are based on effort (time × level), plus bonuses for planned sessions, check-ins and boss-fight records. Capped at 300 a day. Friends only see your name, rank, points and recent session names.</p>
    <button class="btn ghost danger" data-act="squadleave" data-code="${h(code)}">Leave squad</button>`;
}

export async function loadSquad(code) {
  const el = document.getElementById('lb');
  if (!el) return;
  if (!ready || !user) { el.innerHTML = `<p class="muted">${status()}</p>${controls()}`; return; }
  try {
    const hadCache = !!lb.cache[code]?.owner;
    const sq = await loadSquadDoc(code);
    if (!sq) { el.innerHTML = '<p>That squad no longer exists.</p>'; return; }
    if (!hadCache) { hooks.rerender(); return; }
    const t = document.getElementById('sq-title'); if (t) t.textContent = sq.name;
    const [ms, ap] = await Promise.all([fb.getDocs(C('squads', code, 'members')), fb.getDocs(C('squads', code, 'approved'))]);
    const approvedIds = new Set(ap.docs.map((d) => d.id));
    const wk = S.mondayOf(), mo = S.todayISO().slice(0, 7);
    const rows = ms.docs.filter((d) => approvedIds.has(d.id)).map((d) => {
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

    // members list with roles (and moderator tools)
    const mod = isModOf(code), owner = isOwnerOf(code);
    const role = (uid) => (uid === sq.owner ? '<span class="tag boss">Owner</span>' : sq.mods.includes(uid) ? '<span class="tag sq">Mod</span>' : '');
    const mEl = document.getElementById('sq-members');
    if (mEl) mEl.innerHTML = `<div class="card-h">Members (${ap.size})</div>` + ap.docs.map((d) => {
      const uid = d.id, name = d.data().name || 'Member';
      const canAct = mod && uid !== user.uid && uid !== sq.owner && (owner || !sq.mods.includes(uid));
      return `<div class="member-row"><span>${h(name)} ${role(uid)}</span><span class="row">
        ${owner && uid !== sq.owner ? (sq.mods.includes(uid) ? `<button class="chip" data-act="moddemote" data-code="${h(code)}" data-uid="${h(uid)}">Remove mod</button>` : `<button class="chip" data-act="modpromote" data-code="${h(code)}" data-uid="${h(uid)}">Make mod</button>`) : ''}
        ${canAct ? `<button class="chip" data-act="modkick" data-code="${h(code)}" data-uid="${h(uid)}" data-name="${h(name)}">Remove</button><button class="chip danger" data-act="modban" data-code="${h(code)}" data-uid="${h(uid)}" data-name="${h(name)}">Block</button>` : ''}
      </span></div>`;
    }).join('');

    // moderator panel
    const modEl = document.getElementById('sq-mod');
    if (modEl && mod) {
      const [rq, rp, pw] = await Promise.all([fb.getDocs(C('squads', code, 'requests')), fb.getDocs(C('squads', code, 'reports')),
        fb.getDocs(fb.query(C('squads', code, 'workouts'), fb.where('status', '==', 'pending')))]);
      const pending = pw.docs.map((d) => ({ id: `sq-${code}-${d.id}`, docId: d.id, name: d.data().name, byName: d.data().byName }));
      if (pending.some((p) => !S.getSquadWorkouts().some((w) => w.id === p.id))) refreshSquads(true);
      const n = rq.size + pending.length + rp.size;
      modEl.innerHTML = `<div class="card modpanel"><div class="card-h">Moderator ${n ? `<span class="tag no">${n} to review</span>` : ''}</div>
        ${rq.size ? '<div class="lbl">Join requests</div>' + rq.docs.map((d) => `<div class="member-row"><span>${h(d.data().name || 'Someone')}<small> ${h(d.data().email || '')}</small></span><span class="row">
          <button class="chip on" data-act="modaccept" data-code="${h(code)}" data-uid="${h(d.id)}" data-name="${h(d.data().name || '')}">Accept</button>
          <button class="chip" data-act="moddecline" data-code="${h(code)}" data-uid="${h(d.id)}">Decline</button>
          <button class="chip danger" data-act="modban" data-code="${h(code)}" data-uid="${h(d.id)}" data-name="${h(d.data().name || '')}">Block</button></span></div>`).join('') : ''}
        ${pending.length ? '<div class="lbl">Workouts waiting for approval</div>' + pending.map((w) => `<div class="member-row"><span><a href="#/w/${encodeURIComponent(w.id)}">${h(w.name)}</a><small> by ${h(w.byName)}</small></span><span class="row">
          <button class="chip on" data-act="modapprovew" data-code="${h(code)}" data-doc="${h(w.docId)}">Approve</button>
          <button class="chip" data-act="modrejectw" data-code="${h(code)}" data-doc="${h(w.docId)}">Reject</button></span></div>`).join('') : ''}
        ${rp.size ? '<div class="lbl">Reports</div>' + rp.docs.map((d) => { const r = d.data(); return `<div class="member-row"><span>"${h(r.name)}"<small> reported by ${h(r.byName)}: ${h(r.reason || 'no reason given')}</small></span><span class="row">
          <button class="chip danger" data-act="modrejectw" data-code="${h(code)}" data-doc="${h(r.docId)}" data-report="${h(d.id)}">Remove workout</button>
          <button class="chip" data-act="moddismiss" data-code="${h(code)}" data-report="${h(d.id)}">Dismiss</button></span></div>`; }).join('') : ''}
        ${!n ? '<p class="muted small">All clear. Nothing waiting for review.</p>' : ''}</div>`;
    }
  } catch (e) {
    el.innerHTML = `<p class="warn">Could not load the squad: ${h(e.code || e.message)}</p>`;
  }
}

export async function handle(act, el) {
  const { toast, rerender } = hooks;
  const code = el.dataset.code;
  const myName = () => S.get().profile.name || user?.displayName || 'Squad mate';
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
    if (act === 'syncnow') { await push(); await refreshSquads(true); toast('Synced'); }

    if (act === 'squadcreate') {
      const name = document.getElementById('sq-name').value.trim();
      if (!name) return toast('Give your squad a name');
      const c = newCode();
      await fb.setDoc(D('squads', c), { name, owner: user.uid, createdAt: Date.now(), mods: [], approveWorkouts: true });
      await fb.setDoc(D('squads', c, 'approved', user.uid), { name: myName(), at: Date.now() });
      lb.cache[c] = { name, owner: user.uid, mods: [], approveWorkouts: true };
      S.update((s) => { s.squads = [...new Set([...(s.squads || []), c])]; s.deleted = (s.deleted || []).filter((x) => x !== 'squad:' + c); });
      await push();
      location.hash = '#/squad/' + c;
    }
    if (act === 'squadjoin') {
      const c = document.getElementById('sq-code').value.trim().toUpperCase();
      if (c.length !== 6) return toast('Codes are 6 characters');
      const sq = await fb.getDoc(D('squads', c));
      if (!sq.exists()) return toast('No squad with that code');
      if ((S.get().squads || []).includes(c)) return toast("You're already in that squad");
      const banned = await fb.getDoc(D('squads', c, 'banned', user.uid)).catch(() => null);
      if (banned && banned.exists()) return toast("You can't join that squad");
      await fb.setDoc(D('squads', c, 'requests', user.uid), { name: myName(), email: user.email || '', at: Date.now() });
      S.update((s) => { s.squadRequests = [...new Set([...(s.squadRequests || []), c])]; s.deleted = (s.deleted || []).filter((x) => x !== 'req:' + c && x !== 'squad:' + c); });
      toast(`Request sent to ${sq.data().name}. A moderator needs to accept you.`);
    }
    if (act === 'cancelreq') {
      await fb.deleteDoc(D('squads', code, 'requests', user.uid)).catch(() => {});
      forgetSquad(code);
    }
    if (act === 'squadleave') {
      const sq = lb.cache[code];
      if (sq && sq.owner === user.uid) {
        if (!(sq.mods || []).length) return toast('You own this squad. Make someone else a moderator before you leave.');
      }
      if (!confirm('Leave this squad? You will drop off its leaderboard and stop seeing its shared workouts. Any workouts you shared stay in the squad for your mates. Your own workouts, history and XP stay with you.')) return;
      await fb.deleteDoc(D('squads', code, 'members', user.uid)).catch(() => {});
      await fb.deleteDoc(D('squads', code, 'approved', user.uid)).catch(() => {});
      forgetSquad(code);
      location.hash = '#/me';
    }

    // ----- sharing -----
    if (act === 'sqshare') {
      const w = S.get().custom.find((x) => x.id === el.dataset.id);
      if (!w) return;
      const clean = { ...w };
      delete clean.custom;
      const ref = D('squads', code, 'workouts', `${user.uid}_${w.id}`);
      const existing = await fb.getDoc(ref).catch(() => null);
      const payload = { workout: JSON.stringify(clean), by: user.uid, byName: myName(), srcId: w.id, name: w.name, createdAt: Date.now() };
      if (!existing || !existing.exists()) payload.status = lb.cache[code]?.approveWorkouts !== false && !isModOf(code) ? 'pending' : 'approved';
      await fb.setDoc(ref, payload, { merge: true });
      await refreshSquads(true);
      toast(payload.status === 'pending' ? 'Sent to the moderator for approval' : 'Shared with the squad');
      rerender();
    }
    if (act === 'squnshare') {
      if (!confirm('Remove this workout from the squad?')) return;
      await fb.deleteDoc(D('squads', code, 'workouts', el.dataset.doc));
      await refreshSquads(true);
      toast('Removed');
      if (location.hash.includes('/w/sq-')) location.hash = '#/library'; else rerender();
    }
    if (act === 'sqcopy') {
      const w = S.allWorkouts().find((x) => x.id === el.dataset.id);
      if (!w) return;
      const copy = { ...w, id: 'c' + Date.now(), custom: true, squadShared: false, desc: (w.desc || '') + ` (from ${w.byName || 'squad'})`, copiedFrom: w.id };
      if (w.ranked) { copy.rankedLevel = w.ranked.level; copy.lvl = w.ranked.level; }
      ['docId', 'squad', 'squadName', 'sharedFrom', 'byUid', 'byName', 'ranked', 'votes', 'needed', 'declaredLvl', 'status'].forEach((k) => delete copy[k]);
      S.update((st) => { st.custom.push(copy); });
      toast('Saved to your workouts');
      location.hash = '#/w/' + copy.id;
    }
    if (act === 'report') {
      const reason = prompt(`Report "${el.dataset.name}" to the squad moderators. What's the problem? (optional)`);
      if (reason === null) return;
      await fb.addDoc(C('squads', code, 'reports'), { docId: el.dataset.doc, name: el.dataset.name, reason: reason.slice(0, 300), by: user.uid, byName: myName(), at: Date.now() });
      toast('Reported to the moderators. Thanks.');
    }

    // ----- moderation -----
    if (act === 'modaccept') {
      await fb.setDoc(D('squads', code, 'approved', el.dataset.uid), { name: el.dataset.name || 'Member', at: Date.now(), by: user.uid });
      await fb.deleteDoc(D('squads', code, 'requests', el.dataset.uid)).catch(() => {});
      toast(`${el.dataset.name || 'Member'} accepted`);
      rerender();
    }
    if (act === 'moddecline') {
      await fb.deleteDoc(D('squads', code, 'requests', el.dataset.uid));
      toast('Request declined');
      rerender();
    }
    if (act === 'modkick' || act === 'modban') {
      const block = act === 'modban';
      if (!confirm(block ? `Remove and block ${el.dataset.name || 'this person'}? They won't be able to ask to join again.` : `Remove ${el.dataset.name || 'this person'} from the squad? They can ask to rejoin later.`)) return;
      if (block) await fb.setDoc(D('squads', code, 'banned', el.dataset.uid), { name: el.dataset.name || '', at: Date.now(), by: user.uid });
      await fb.deleteDoc(D('squads', code, 'approved', el.dataset.uid)).catch(() => {});
      await fb.deleteDoc(D('squads', code, 'members', el.dataset.uid)).catch(() => {});
      await fb.deleteDoc(D('squads', code, 'requests', el.dataset.uid)).catch(() => {});
      toast(block ? 'Removed and blocked' : 'Removed from the squad');
      rerender();
    }
    if (act === 'modapprovew') {
      await fb.updateDoc(D('squads', code, 'workouts', el.dataset.doc), { status: 'approved' });
      await refreshSquads(true);
      toast('Approved. The squad can see it now.');
      rerender();
    }
    if (act === 'modrejectw') {
      if (!confirm('Remove this workout from the squad?')) return;
      await fb.deleteDoc(D('squads', code, 'workouts', el.dataset.doc)).catch(() => {});
      if (el.dataset.report) await fb.deleteDoc(D('squads', code, 'reports', el.dataset.report)).catch(() => {});
      await refreshSquads(true);
      toast('Workout removed');
      if (location.hash.includes('/w/sq-')) location.hash = '#/squad/' + code; else rerender();
    }
    if (act === 'moddismiss') {
      await fb.deleteDoc(D('squads', code, 'reports', el.dataset.report));
      rerender();
    }
    if (act === 'modpromote' || act === 'moddemote') {
      await fb.updateDoc(D('squads', code), { mods: act === 'modpromote' ? fb.arrayUnion(el.dataset.uid) : fb.arrayRemove(el.dataset.uid) });
      toast(act === 'modpromote' ? 'Now a moderator' : 'No longer a moderator');
      rerender();
    }
    if (act === 'modtoggleapprove') {
      await fb.updateDoc(D('squads', code), { approveWorkouts: el.checked });
      lb.cache[code].approveWorkouts = el.checked;
      toast(el.checked ? 'Shared workouts now need approval' : 'Shared workouts go straight to the squad');
    }

    if (act === 'lbtab') { lb.tab = el.dataset.v; rerender(); }
    if (act === 'sharecode') {
      const text = `Join my Training Arc squad! Open ${location.origin}${location.pathname} , sign in, then Me → Squads → Ask to join with code ${code}`;
      if (navigator.share) navigator.share({ title: 'Training Arc squad', text }).catch(() => {});
      else { await navigator.clipboard.writeText(text); toast('Invite copied'); }
    }
  } catch (e) {
    console.warn(act, e);
    toast((e.code || e.message || 'Something went wrong').replace('auth/', ''));
  }
}

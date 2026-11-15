// Beeps, voice cues, vibration and screen wake lock.
import * as S from './store.js';

let ac = null;
export function unlockAudio() {
  try {
    if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)();
    if (ac.state === 'suspended') ac.resume();
  } catch (e) { /* no audio */ }
  // warm up speech on a user gesture (needed on some Android builds)
  if ('speechSynthesis' in window) { speechSynthesis.getVoices(); speechSynthesis.resume(); }
}

export function beep(freq = 880, dur = 0.12, vol = 0.35) {
  if (!S.get().settings.beeps || !ac) return;
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = 'square';
  o.frequency.value = freq;
  g.gain.setValueAtTime(vol, ac.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
  o.connect(g).connect(ac.destination);
  o.start();
  o.stop(ac.currentTime + dur + 0.02);
}
export const tick = () => beep(880, 0.1);
export const go = () => { beep(1320, 0.35, 0.4); buzz([120]); };
export const done = () => { beep(990, 0.15); setTimeout(() => beep(1320, 0.15), 170); setTimeout(() => beep(1760, 0.3), 340); buzz([80, 60, 80]); };

// ---------- voice ----------
let voice = null;
const keep = []; // hold utterances so Chrome doesn't garbage-collect them mid-sentence
export function englishVoices() {
  if (!('speechSynthesis' in window)) return [];
  return speechSynthesis.getVoices().filter((v) => /^en/i.test(v.lang));
}
function pickVoice() {
  const vs = englishVoices();
  const pref = S.get().settings.voiceName;
  const by = (re) => vs.find((v) => re.test(v.lang.replace('_', '-')));
  voice = vs.find((v) => v.name === pref) || by(/en-NZ/i) || by(/en-AU/i) || by(/en-GB/i) || by(/en-US/i) || vs[0] || null;
}
if ('speechSynthesis' in window) {
  pickVoice();
  speechSynthesis.addEventListener?.('voiceschanged', () => { pickVoice(); window.dispatchEvent(new Event('voices-ready')); });
}
export function setVoice() { pickVoice(); }

// Rewrite gym shorthand into words a speech engine says naturally.
const SPOKEN = [
  [/\bKB\b/g, 'kettlebell'], [/\bDB\b/g, 'dumbbell'], [/\bBB\b/g, 'barbell'], [/\bEZ\b/g, 'curl bar'],
  [/\bRDL\b/g, 'Romanian deadlift'], [/\bEMOM\b/gi, 'E mom'], [/\bAMRAP\b/gi, 'am rap'], [/\bCARs\b/g, 'controlled circles'],
  [/90\/90/g, 'ninety ninety'], [/(\d+)\/(\d+)/g, '$1 of $2'], [/\bTGU\b/g, 'Turkish get-up'], [/Figure-4/gi, 'figure four'],
  [/\(each side\)/g, 'each side'], [/\(.*?\)/g, ''], [/(\d+) s\b/g, '$1 seconds'], [/(\d+) m\b/g, '$1 metres'],
  [/\//g, ' '], [/·/g, '.'], [/\+/g, ' and '], [/×/g, ' times '], [/→/g, ' then '], [/-/g, ' '], [/\s{2,}/g, ' '],
];
export function spoken(text) { return SPOKEN.reduce((t, [re, rep]) => t.replace(re, rep), String(text)).trim(); }

function speakNow(text) {
  const u = new SpeechSynthesisUtterance(spoken(text));
  if (voice) { u.voice = voice; u.lang = voice.lang; }
  u.rate = S.get().settings.voiceRate || 0.95;
  u.pitch = 1;
  u.volume = 1;
  keep.push(u);
  if (keep.length > 5) keep.shift();
  speechSynthesis.resume();
  speechSynthesis.speak(u);
}
export function say(text, force = false) {
  if ((!S.get().settings.voice && !force) || !('speechSynthesis' in window)) return;
  try {
    if (!voice) pickVoice();
    // Chrome on Android drops a sentence spoken straight after cancel(), so pause briefly.
    if (speechSynthesis.speaking || speechSynthesis.pending) {
      speechSynthesis.cancel();
      setTimeout(() => speakNow(text), 150);
    } else speakNow(text);
  } catch (e) { /* ignore */ }
}

export function buzz(pattern) {
  if (S.get().settings.vibrate && navigator.vibrate) navigator.vibrate(pattern);
}

// ---------- wake lock ----------
let lock = null;
let wanted = false;
export async function keepAwake(on) {
  wanted = on;
  try {
    if (on && 'wakeLock' in navigator && !lock) {
      lock = await navigator.wakeLock.request('screen');
      lock.addEventListener('release', () => { lock = null; });
    } else if (!on && lock) {
      await lock.release();
      lock = null;
    }
  } catch (e) { /* not supported or denied */ }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && wanted) keepAwake(true);
});

// Beeps, voice cues, vibration and screen wake lock.
import * as S from './store.js';

let ac = null;
export function unlockAudio() {
  try {
    if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)();
    if (ac.state === 'suspended') ac.resume();
  } catch (e) { /* no audio */ }
  // warm up speech on a user gesture (needed on some Android builds)
  if ('speechSynthesis' in window && S.get().settings.voice) {
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0;
    speechSynthesis.speak(u);
  }
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

export function say(text) {
  if (!S.get().settings.voice || !('speechSynthesis' in window)) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.05;
    u.lang = 'en-GB';
    speechSynthesis.speak(u);
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

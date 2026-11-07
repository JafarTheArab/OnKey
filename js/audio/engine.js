// Sound engine: one shared AudioContext plus iPhone Safari workarounds.
// - Created/resumed synchronously inside a tap (iOS requirement).
// - Rebuilt whenever the iOS audio session mode changes, because switching modes
//   can leave an existing context frozen.
// - While the mic is on, iOS often silences web audio sent straight to the speakers,
//   while an <audio> element still plays. So all app sound goes through `output()`,
//   which can be routed either directly or via an <audio> element.

let ctx = null, master = null, streamDest = null, sinkEl = null;
let ctxSession = null, route = 'direct', primed = false;

const SILENT_WAV = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEAgLsAAAB3AQACABAAZGF0YQQAAAAAAAAA';

const sessionType = () => (navigator.audioSession ? navigator.audioSession.type : null);

export function setSessionType(type) {
  try { if (navigator.audioSession && navigator.audioSession.type !== type) navigator.audioSession.type = type; } catch (_) {}
}

/** Call synchronously inside a tap handler. Returns a (hopefully) running AudioContext. */
export function unlockAudio({ fresh = false } = {}) {
  const stale = ctx && (fresh || ctx.state === 'closed' || ctx.state === 'interrupted' || ctxSession !== sessionType());
  if (stale) {
    try { ctx.close(); } catch (_) {}
    ctx = master = streamDest = null;
  }
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC({ latencyHint: 'interactive' });
    ctxSession = sessionType();
    master = ctx.createGain();
    master.connect(ctx.destination);
    route = 'direct';
    ctx.addEventListener('statechange', () => window.dispatchEvent(new Event('onkey-audiostate')));
    // One silent sample inside the tap wakes the context on iOS
    const b = ctx.createBuffer(1, 1, ctx.sampleRate), src = ctx.createBufferSource();
    src.buffer = b; src.connect(ctx.destination); src.start(0);
  }
  if (ctx.state !== 'running') ctx.resume().catch(() => {});
  if (!primed) {
    primed = true;
    // Playing silence through an <audio> element once puts iOS in media-playback mode
    try { const a = new Audio(SILENT_WAV); a.setAttribute('playsinline', ''); a.play().catch(() => {}); } catch (_) {}
  }
  if (!sinkEl) { sinkEl = new Audio(); sinkEl.setAttribute('playsinline', ''); }
  window.dispatchEvent(new Event('onkey-audiostate'));
  return ctx;
}

/** Wait up to `ms` for the context to be running (resume() can hang forever on iOS). */
export async function waitRunning(ms = 1000) {
  if (!ctx) return false;
  if (ctx.state === 'running') return true;
  await Promise.race([ctx.resume().catch(() => {}), new Promise((r) => setTimeout(r, ms))]);
  return ctx.state === 'running';
}

/** Where all app sound should be connected. */
export const output = () => master;

/** 'direct' = straight to speakers; 'element' = through an <audio> element (works while mic is on). Call inside a tap. */
export function setRoute(r) {
  if (!ctx || r === route) return;
  master.disconnect();
  if (r === 'element' && ctx.createMediaStreamDestination) {
    streamDest = streamDest || ctx.createMediaStreamDestination();
    master.connect(streamDest);
    sinkEl.srcObject = streamDest.stream;
    sinkEl.play().catch(() => {});
    route = 'element';
  } else {
    master.connect(ctx.destination);
    if (sinkEl) { sinkEl.pause(); sinkEl.srcObject = null; }
    route = 'direct';
  }
  window.dispatchEvent(new Event('onkey-audiostate'));
}

export const getCtx = () => ctx;
export const audioState = () => (ctx ? ctx.state : 'not started');
export const routeName = () => route;
export { sessionType };

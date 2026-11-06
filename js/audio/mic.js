// Microphone lifecycle with privacy rules:
// - only on while explicitly started
// - turns off when the app goes to the background
// - audio is analysed in memory only; nothing is recorded or sent anywhere

import { PitchTracker } from './pitch.js';

let ctx = null;
let unlocked = false;

export function setSessionType(type) {
  try { if (navigator.audioSession && navigator.audioSession.type !== type) navigator.audioSession.type = type; } catch (_) {}
}

// A tiny silent WAV. Playing it through an <audio> element once, inside a tap, moves iOS
// into "media playback" mode so web audio is audible (and not muted by the silent switch).
const SILENT_WAV = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEAgLsAAAB3AQACABAAZGF0YQQAAAAAAAAA';

/** Must be called synchronously inside a tap handler (iOS Safari requirement). */
export function unlockAudio() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (ctx && ctx.state === 'closed') ctx = null;
  if (!ctx) {
    ctx = new AC({ latencyHint: 'interactive' });
    ctx.addEventListener('statechange', () => window.dispatchEvent(new Event('onkey-audiostate')));
  }
  if (ctx.state !== 'running') ctx.resume().catch(() => {});
  if (!unlocked) {
    unlocked = true;
    try { const a = new Audio(SILENT_WAV); a.setAttribute('playsinline', ''); a.play().catch(() => {}); } catch (_) {}
    // Also play one silent sample through web audio, inside the tap
    const b = ctx.createBuffer(1, 1, ctx.sampleRate), src = ctx.createBufferSource();
    src.buffer = b; src.connect(ctx.destination); src.start(0);
  }
  return ctx;
}

export const audioState = () => (ctx ? ctx.state : 'not started');

export class Mic {
  constructor({ onFrame, onStateChange }) {
    this.onFrame = onFrame;
    this.onStateChange = onStateChange || (() => {});
    this.stream = null;
    this.timer = null;
    this.on = false;
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.stop('background');
    });
    window.addEventListener('pagehide', () => this.stop('background'));
  }

  /** Call from a tap handler. */
  async start() {
    // Tell iOS we want to play and record (keeps output on earbuds/speaker, not earpiece)
    setSessionType('play-and-record');
    const ac = unlockAudio(); // synchronous part, before any await

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 1,
      },
    });
    if (ac.state !== 'running') await ac.resume();

    this.source = ac.createMediaStreamSource(this.stream);
    this.analyser = ac.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0;
    this.source.connect(this.analyser);
    this.buf = new Float32Array(this.analyser.fftSize);
    this.tracker = new PitchTracker({ sampleRate: ac.sampleRate });

    const track = this.stream.getAudioTracks()[0];
    this.deviceLabel = track ? track.label : '';
    this.sampleRate = ac.sampleRate;

    this.on = true;
    this.onStateChange(true);
    this.timer = setInterval(() => {
      this.analyser.getFloatTimeDomainData(this.buf);
      const r = this.tracker.feed(this.buf);
      r.t = performance.now();
      this.onFrame(r);
    }, 30);
  }

  stop(reason = 'user') {
    if (!this.on && !this.stream) return;
    clearInterval(this.timer);
    this.timer = null;
    if (this.source) this.source.disconnect();
    if (this.stream) this.stream.getTracks().forEach((t) => t.stop()); // releases the mic
    this.stream = null;
    this.on = false;
    setSessionType('playback');
    this.onStateChange(false, reason);
  }
}

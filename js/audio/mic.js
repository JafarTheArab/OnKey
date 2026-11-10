// Microphone lifecycle with privacy rules:
// - only on while explicitly started
// - the on-screen indicator turns on the moment the iPhone hands over the mic
// - turns off when the app goes to the background, or if anything goes wrong
// - audio is analysed in memory only; nothing is recorded or sent anywhere

import { PitchTracker } from './pitch.js';
import { unlockAudio, waitRunning, setRoute, setSessionType } from './engine.js';

const isPhoneMic = (label = '') => /iphone|ipad|built-in|internal/i.test(label);

export class Mic {
  constructor({ onFrame, onStateChange, onWarn }) {
    this.onFrame = onFrame;
    this.onStateChange = onStateChange || (() => {});
    this.onWarn = onWarn || (() => {});
    this.stream = null;
    this.timer = null;
    this.on = false;
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.stop('background');
    });
    window.addEventListener('pagehide', () => this.stop('background'));
  }

  /**
   * Call from a tap handler. Everything before the first await runs inside the tap.
   * preferPhoneMic: listen with the iPhone's own mic even when headphones are connected.
   * (A Bluetooth headset's mic drops into low-quality "phone call" mode, which ruins pitch.)
   */
  async start({ preferPhoneMic = true } = {}) {
    this.deviceLabel = undefined; this.usingPhoneMic = false; // not known until the mic is open
    setSessionType('play-and-record');       // keeps output on earbuds/speaker, not the earpiece
    const ac = unlockAudio({ fresh: true });  // brand-new engine for this mode
    setRoute('element');                      // app sound via <audio> while the mic is on

    const base = { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 };
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: base });
    } catch (e) {
      this._resetAudio();
      throw e;
    }

    // The mic is now open: show it immediately, before anything else can go wrong
    this.stream = stream;
    this.openedAt = performance.now(); // when the mic opened (used to line up the song start)
    this.ctx = ac;
    this.on = true;
    this.onStateChange(true);

    // Device names are only readable after permission, so pick the phone's mic now if needed
    this.usingPhoneMic = isPhoneMic(stream.getAudioTracks()[0]?.label);
    if (preferPhoneMic && !this.usingPhoneMic) {
      try {
        const inputs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput');
        const phone = inputs.find((d) => isPhoneMic(d.label));
        if (phone) {
          const s2 = await navigator.mediaDevices.getUserMedia({ audio: { ...base, deviceId: { exact: phone.deviceId } } });
          stream.getTracks().forEach((t) => t.stop());
          stream = this.stream = s2;
          this.usingPhoneMic = true;
        }
      } catch (_) { /* keep the first mic */ }
    }
    if (!this.on) { stream.getTracks().forEach((t) => t.stop()); return; } // stopped meanwhile
    this.hasOtherMic = !this.usingPhoneMic || (await navigator.mediaDevices.enumerateDevices().catch(() => []))
      .filter((d) => d.kind === 'audioinput' && !isPhoneMic(d.label) && d.label).length > 0;
    const track = stream.getAudioTracks()[0];
    this.deviceLabel = track ? track.label : '';
    this.sampleRate = ac.sampleRate;
    track && track.addEventListener('ended', () => this.stop('ended'));
    this.onStateChange(true);

    try {
      if (!(await waitRunning(1500))) throw new Error(`the sound engine is stuck (${ac.state})`);
      this.source = ac.createMediaStreamSource(stream);
      this.analyser = ac.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0;
      this.source.connect(this.analyser);
      this.buf = new Float32Array(this.analyser.fftSize);
      this.tracker = new PitchTracker({ sampleRate: ac.sampleRate });

      let zeroSince = performance.now(), warned = false, healed = false;
      this.timer = setInterval(() => {
        this.analyser.getFloatTimeDomainData(this.buf);
        const r = this.tracker.feed(this.buf);
        r.t = performance.now();
        r.ct = ac.currentTime; // sound-engine clock, used to line the voice up with the music
        // Watchdog: a real mic is never perfectly silent. All zeros means no audio is arriving.
        // Switching mics on an iPhone sometimes leaves the new one silent for a while:
        // first try re-opening it once by itself, and only then tell the user.
        if (r.level > 0) zeroSince = r.t;
        else if (!healed && r.t - zeroSince > 1500) { healed = true; this._reopen(base); }
        else if (!warned && r.t - zeroSince > 4500) { warned = true; this.onWarn('nodata'); }
        this.onFrame(r);
      }, 30);
    } catch (e) {
      this.stop('error');
      throw e;
    }
  }

  /**
   * Capture `secs` seconds of exactly what the pitch detector receives, in memory only.
   * Only called when the user taps "Save 5-sec sample". Resolves to { samples, sampleRate }.
   */
  captureSample(secs = 5) {
    const ac = this.source.context;
    const node = ac.createScriptProcessor(4096, 1, 1);
    const mute = ac.createGain(); mute.gain.value = 0; // processor must be connected to run; keep it silent
    const chunks = [], need = Math.round(secs * ac.sampleRate);
    let got = 0;
    return new Promise((resolve) => {
      const finish = () => {
        this._endCapture = null;
        try { node.disconnect(); } catch (_) {}
        const out = new Float32Array(got); let o = 0;
        for (const c of chunks) { out.set(c, o); o += c.length; }
        resolve({ samples: out.subarray(0, Math.min(got, need)), sampleRate: ac.sampleRate });
      };
      this._endCapture = finish; // if the mic stops early, keep what we have
      node.onaudioprocess = (e) => {
        if (got >= need) return;
        const d = e.inputBuffer.getChannelData(0);
        chunks.push(new Float32Array(d)); got += d.length;
        if (got >= need) finish();
      };
      this.source.connect(node); node.connect(mute); mute.connect(ac.destination);
    });
  }

  /** Re-open the same microphone and reconnect it (no tap needed: the sound engine keeps running). */
  async _reopen(base) {
    try {
      const old = this.stream, id = old && old.getAudioTracks()[0]?.getSettings?.().deviceId;
      const s2 = await navigator.mediaDevices.getUserMedia({ audio: id ? { ...base, deviceId: { exact: id } } : base });
      if (!this.on || this.stream !== old) { s2.getTracks().forEach((t) => t.stop()); return; }
      old.getTracks().forEach((t) => t.stop());
      this.stream = s2;
      try { this.source.disconnect(); } catch (_) {}
      this.source = this.analyser.context.createMediaStreamSource(s2);
      this.source.connect(this.analyser);
      s2.getAudioTracks()[0]?.addEventListener('ended', () => this.stop('ended'));
    } catch (_) { /* the warning will follow */ }
  }

  _resetAudio() {
    setRoute('direct');
    setSessionType('playback');
  }

  stop(reason = 'user') {
    if (!this.on && !this.stream) return;
    clearInterval(this.timer);
    this.timer = null;
    if (this._endCapture) this._endCapture();
    try { if (this.source) this.source.disconnect(); } catch (_) {}
    this.source = null;
    if (this.stream) this.stream.getTracks().forEach((t) => t.stop()); // releases the mic
    this.stream = null;
    this.on = false;
    this._resetAudio();
    this.onStateChange(false, reason);
  }
}

/**
 * Practice, range test and timing check always listen with the iPhone's own mic: a Bluetooth headset
 * mic drops into low-quality call mode and cuts out. (The Mic check's switch is only for trying the other
 * mic and is not remembered. An earlier version did remember it, which sent everything to the headset mic.)
 */
export function preferPhoneMic() { return true; }
try { localStorage.removeItem('onkey.preferPhoneMic'); } catch (_) {}

/** Plain-language name for the mic in use. */
export const micName = (mic) => (mic.usingPhoneMic ? 'iPhone mic ✓' : `headphone mic${mic.deviceLabel ? ` (${mic.deviceLabel})` : ''}`);

/** Show "Mic on · iPhone mic ✓" (or a warning if it's the headphones' mic) in a badge element. */
export function showMicBadge(badge, mic, on) {
  badge.hidden = !on;
  const name = badge.querySelector('.micname');
  if (!name) return;
  name.textContent = on && mic.deviceLabel !== undefined ? '· ' + micName(mic) : '';
  badge.classList.toggle('warn', on && mic.deviceLabel !== undefined && !mic.usingPhoneMic);
}

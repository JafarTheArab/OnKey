// Microphone lifecycle with privacy rules:
// - only on while explicitly started
// - the on-screen indicator turns on the moment the iPhone hands over the mic
// - turns off when the app goes to the background, or if anything goes wrong
// - audio is analysed in memory only; nothing is recorded or sent anywhere

import { PitchTracker } from './pitch.js';
import { unlockAudio, waitRunning, setRoute, setSessionType } from './engine.js';

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

  /** Call from a tap handler. Everything before the first await runs inside the tap. */
  async start() {
    setSessionType('play-and-record');       // keeps output on earbuds/speaker, not the earpiece
    const ac = unlockAudio({ fresh: true });  // brand-new engine for this mode
    setRoute('element');                      // app sound via <audio> while the mic is on

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 },
      });
    } catch (e) {
      this._resetAudio();
      throw e;
    }

    // The mic is now open: show it immediately, before anything else can go wrong
    this.stream = stream;
    this.on = true;
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

      let zeroSince = performance.now(), warned = false;
      this.timer = setInterval(() => {
        this.analyser.getFloatTimeDomainData(this.buf);
        const r = this.tracker.feed(this.buf);
        r.t = performance.now();
        // Watchdog: a real mic is never perfectly silent. All zeros means no audio is arriving.
        if (r.level > 0) zeroSince = r.t;
        else if (!warned && r.t - zeroSince > 2000) { warned = true; this.onWarn('nodata'); }
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

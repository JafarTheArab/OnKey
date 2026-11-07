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

  _resetAudio() {
    setRoute('direct');
    setSessionType('playback');
  }

  stop(reason = 'user') {
    if (!this.on && !this.stream) return;
    clearInterval(this.timer);
    this.timer = null;
    try { if (this.source) this.source.disconnect(); } catch (_) {}
    this.source = null;
    if (this.stream) this.stream.getTracks().forEach((t) => t.stop()); // releases the mic
    this.stream = null;
    this.on = false;
    this._resetAudio();
    this.onStateChange(false, reason);
  }
}

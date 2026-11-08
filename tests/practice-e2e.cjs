// Full practice run in Chromium with a fake mic that "sings" verse 1 of Amazing Grace an octave down.
// The fake singer is on pitch except the long notes, which sink 35 cents flat by the end.
// Optional: node tests/practice-e2e.cjs sharp   -> sings everything 40 cents sharp
//           node tests/practice-e2e.cjs quiet   -> sings at real iPhone mic level x 0.5
const { chromium } = require('playwright');
const fs = require('fs');
const mode = process.argv[2] || 'drift';

(async () => {
  const { synthSong } = await import('./song-voice.mjs');
  const { prepareSong } = await import('../js/music/song.js');
  const raw = (await import('../js/songs/amazing-grace.js')).default;
  const song = prepareSong(raw, { transpose: -12 });
  const spb = 60 / raw.bpm;
  const LEAD = 1.2, COUNT = 5; // app starts the count-in 1.2 s after the mic opens; 5-beat count-in
  const notes = song.notes.filter((n) => n.line <= 3).map((n) => ({
    start: LEAD + (COUNT + n.beat) * spb, dur: n.dur * spb, midi: n.midi,
    cents: (t) => mode === 'sharp' ? 40 : n.dur >= 4 ? -35 * t : 0,
  }));
  const wavPath = __dirname + `/out/song-${mode}.wav`;
  fs.writeFileSync(wavPath, synthSong(48000, notes, { amp: mode === 'quiet' ? 0.06 : 1, total: LEAD + (COUNT + 49) * spb + 2 }));

  const b = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
    '--use-file-for-fake-audio-capture=' + wavPath, '--autoplay-policy=no-user-gesture-required'] });
  const ctx = await b.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, permissions: ['microphone'] });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  // This computer's built-in delay, as measured by tests/timing-e2e.cjs (run that first)
  let latency = 0.03;
  try { latency = Number(fs.readFileSync(__dirname + '/out/builtin-latency.txt', 'utf8')); } catch (_) {}
  await p.addInitScript((latency) => {
    if (!localStorage.getItem('onkey.v1')) localStorage.setItem('onkey.v1', JSON.stringify({
      range: { low: 45, high: 64, reachLow: 43, reachHigh: 67 }, latency, settings: { guide: false } }));
  }, latency);
  await p.goto('http://localhost:8765/');
  await p.screenshot({ path: __dirname + '/out/shot-home.png' });
  await p.click('#homeSing');
  await p.waitForTimeout(300);
  await p.screenshot({ path: __dirname + '/out/shot-practice-ready.png' });
  await p.click('#pOptBtn');
  await p.selectOption('#oPart', '0-3');
  await p.screenshot({ path: __dirname + '/out/shot-options.png' });
  await p.click('#pOptClose');
  await p.click('#pMsg .btn.primary');
  await p.waitForTimeout(2600);
  await p.screenshot({ path: __dirname + '/out/shot-countin.png' });
  await p.waitForTimeout(13000);
  await p.screenshot({ path: __dirname + '/out/shot-singing.png' });
  const badge = await p.isVisible('#pMicBadge');
  await p.waitForSelector('#pResults:not([hidden])', { timeout: 40000 });
  await p.screenshot({ path: __dirname + '/out/shot-results.png' });
  const score = await p.textContent('#rScore');
  const findings = await p.$$eval('#rFindings li', (l) => l.map((x) => x.textContent));
  const badgeAfter = await p.isVisible('#pMicBadge');
  const details = await p.evaluate(() => window.__onkeyPractice.attempts.map((a) => a.res.sung ? a.res.err : 'x').join(' '));
  await p.click('.res-notes summary');
  await p.screenshot({ path: __dirname + '/out/shot-results-notes.png' });
  console.log({ mode, score, badgeWhileSinging: badge, badgeAfterEnd: badgeAfter, errs });
  console.log('per-note cents:', details);
  findings.forEach((f) => console.log('  · ' + f));
  const s = Number(score);
  const ok = badge && !badgeAfter && !errs.length && (
    mode === 'drift' ? s >= 70 && findings.some((f) => /drifted flat on the long notes/.test(f)) :
    mode === 'sharp' ? findings.some((f) => /sharp: on average (3\d|4\d)% of a step high/.test(f)) :
    s >= 60);
  console.log(ok ? `PASS  practice e2e (${mode})` : `FAIL  practice e2e (${mode})`);
  await b.close(); process.exit(ok ? 0 : 1);
})();

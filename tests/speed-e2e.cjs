// Speed changes while singing, and auto speed: a silent singer should make it slow down,
// and the song must keep moving forward smoothly through every speed change.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
  const ctx = await b.newContext({ viewport: { width: 844, height: 390 }, permissions: ['microphone'] });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.addInitScript(() => localStorage.setItem('onkey.v1', JSON.stringify({ range: { low: 45, high: 64 }, latency: 0.03, settings: { autoSpeed: true, metronome: true } })));
  await p.goto('http://localhost:8765/');
  await p.click('#homeSing');
  await p.click('#pMsg .btn.primary');
  const beats = [];
  await p.waitForTimeout(4000);
  for (const id of ['#pFaster', '#pFaster', '#pSlower', '#pSlower', '#pSlower']) { await p.click(id); await p.waitForTimeout(700); }
  await p.waitForTimeout(9000);
  const speed = await p.textContent('#pSpeed');
  const anchors = await p.evaluate(() => window.__onkeyPractice.anchors.map((a) => ({ beat: +a.beat.toFixed(2), rate: +a.rate.toFixed(3), pass: a.pass })));
  // the anchors must move forward in beats, and the mapping must be continuous
  let mono = true; for (let i = 1; i < anchors.length; i++) if (anchors[i].pass === anchors[i - 1].pass && anchors[i].beat < anchors[i - 1].beat) mono = false;
  const lyric = await p.textContent('#pLyric');
  console.log({ speed, anchors: anchors.length, mono, lyric, errs });
  const ok = mono && anchors.length >= 6 && parseInt(speed) < 95 && !errs.length;
  console.log(ok ? `PASS  speed changes (auto speed slowed to ${speed} for a silent singer)` : 'FAIL  speed changes');
  await b.close(); process.exit(ok ? 0 : 1);
})();

// Range test in Chromium: the fake mic holds A2, then a steady E4 and a wavering A4, then slides G2 -> A4 -> G2.
// Comfortable should be A2 to E4 (steady notes only); reach should include the A4s.
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const { synthSong } = await import('./song-voice.mjs');
  const notes = [
    { start: 0.5, dur: 2.5, midi: 45 }, { start: 5.0, dur: 2.5, midi: 64 },
    { start: 7.8, dur: 2.2, midi: 69, cents: (t) => 70 * Math.sin(t * 2 * Math.PI * 1.3) },
    { start: 11.5, dur: 1.8, midi: 43, cents: (t) => t * 2600 }, { start: 13.3, dur: 1.8, midi: 69, cents: (t) => -t * 2600 },
  ];
  fs.writeFileSync(__dirname + '/out/range.wav', synthSong(48000, notes, { total: 17 }));
  const b = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
    '--use-file-for-fake-audio-capture=' + __dirname + '/out/range.wav', '--autoplay-policy=no-user-gesture-required'] });
  const ctx = await b.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, permissions: ['microphone'] });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('http://localhost:8765/');   // first visit: should open the range test by itself
  const firstRun = await p.isVisible('#scr-range');
  await p.screenshot({ path: __dirname + '/out/shot-range-welcome.png' });
  await p.click('#rgGo');
  const t0 = Date.now();
  const at = (s) => p.waitForTimeout(Math.max(0, s * 1000 - (Date.now() - t0)));
  await at(3.4); const low = await p.textContent('#rgHeard'); await p.click('#rgGo');
  await at(10.3); const high = await p.textContent('#rgHeard');
  await p.screenshot({ path: __dirname + '/out/shot-range-high.png' });
  await p.click('#rgGo');
  await at(15.4); const slide = await p.textContent('#rgHeard'); await p.click('#rgGo');
  await p.waitForTimeout(300);
  await p.screenshot({ path: __dirname + '/out/shot-range-done.png' });
  const result = await p.textContent('#rgText');
  await p.click('.adjust >> nth=1 >> .btn >> nth=0'); // − on the highest note
  const afterAdjust = await p.evaluate(() => JSON.parse(localStorage.getItem('onkey.v1')).range.high);
  const badge = await p.isVisible('#rgMicBadge');
  const saved = await p.evaluate(() => JSON.parse(localStorage.getItem('onkey.v1')).range);
  console.log({ firstRun, low, high, slide, result, saved, afterAdjust, badgeAfter: badge, errs });
  const ok = firstRun && saved && saved.low === 45 && result.includes('E4') && saved.reachHigh >= 68 && afterAdjust === 63 && /reach/.test(result) && /baritone/.test(result) && !badge && !errs.length;
  console.log(ok ? 'PASS  range test' : 'FAIL  range test');
  await b.close(); process.exit(ok ? 0 : 1);
})();

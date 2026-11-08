// Range test in Chromium: the fake mic holds A2, then E4, then slides G2 -> A4 -> G2.
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const { synthSong } = await import('./song-voice.mjs');
  const notes = [
    { start: 0.5, dur: 2.5, midi: 45 }, { start: 5.0, dur: 2.5, midi: 64 },
    { start: 9.5, dur: 1.8, midi: 43, cents: (t) => t * 2600 }, { start: 11.3, dur: 1.8, midi: 69, cents: (t) => -t * 2600 },
  ];
  fs.writeFileSync(__dirname + '/out/range.wav', synthSong(48000, notes, { total: 15 }));
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
  await at(7.9); const high = await p.textContent('#rgHeard');
  await p.screenshot({ path: __dirname + '/out/shot-range-high.png' });
  await p.click('#rgGo');
  await at(13.4); const slide = await p.textContent('#rgHeard'); await p.click('#rgGo');
  await p.waitForTimeout(300);
  await p.screenshot({ path: __dirname + '/out/shot-range-done.png' });
  const result = await p.textContent('#rgText');
  const badge = await p.isVisible('#rgMicBadge');
  const saved = await p.evaluate(() => JSON.parse(localStorage.getItem('onkey.v1')).range);
  console.log({ firstRun, low, high, slide, result, saved, badgeAfter: badge, errs });
  const ok = firstRun && saved && saved.low === 45 && saved.high === 64 && /baritone/.test(result) && !badge && !errs.length;
  console.log(ok ? 'PASS  range test' : 'FAIL  range test');
  await b.close(); process.exit(ok ? 0 : 1);
})();

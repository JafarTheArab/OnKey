// Timing check in Chromium: the fake mic says "ta" 150 ms after each click.
// Reports the delay OnKey measures (150 ms plus this computer's own built-in delay) and saves it.
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const { wav } = await import('./voice.mjs');
  const sr = 48000, len = sr * 9, out = new Float32Array(len), SAY = 0.15;
  for (let k = 0; k < 10; k++) {
    const i0 = Math.round((1.5 + k * 0.6 + SAY) * sr);
    for (let i = 0; i < sr * 0.12; i++) out[i0 + i] = (Math.random() - 0.5) * 0.08 * Math.exp(-i / (sr * 0.03)) + 0.05 * Math.sin(i / sr * 2 * Math.PI * 160) * Math.exp(-i / (sr * 0.05));
  }
  for (let i = 0; i < len; i++) out[i] += (Math.random() - 0.5) * 0.001;
  fs.writeFileSync(__dirname + '/out/ta.wav', wav(out, sr));
  const b = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
    '--use-file-for-fake-audio-capture=' + __dirname + '/out/ta.wav', '--autoplay-policy=no-user-gesture-required'] });
  const ctx = await b.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, permissions: ['microphone'] });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.addInitScript(() => localStorage.setItem('onkey.v1', JSON.stringify({ range: { low: 45, high: 64 } })));
  await p.goto('http://localhost:8765/#timing');
  await p.click('#tmGo');
  await p.waitForSelector('#tmSave:not([hidden])', { timeout: 15000 }).catch(() => {});
  await p.screenshot({ path: __dirname + '/out/shot-timing.png' });
  const result = await p.textContent('#tmResult');
  const ms = Number((/(\d+) ms/.exec(result) || [])[1]);
  if (ms) await p.click('#tmSave');
  console.log({ result, errs });
  const ok = ms >= 150 && ms <= 320 && !errs.length;
  console.log(ok ? `PASS  timing check measured ${ms} ms (150 said + ${ms - 150} built-in)` : 'FAIL  timing check');
  if (ok) fs.writeFileSync(__dirname + '/out/builtin-latency.txt', String((ms - 150) / 1000));
  await b.close(); process.exit(ok ? 0 : 1);
})();

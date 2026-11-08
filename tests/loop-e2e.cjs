// Repeat mode in Chromium: loop the line "I once was lost…"; the fake singer is 60 cents flat the
// first time and on pitch the second time. Each time through should be scored and shown.
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const { synthSong } = await import('./song-voice.mjs');
  const { prepareSong } = await import('../js/music/song.js');
  const raw = (await import('../js/songs/amazing-grace.js')).default;
  const song = prepareSong(raw, { transpose: -12 });
  const spb = 60 / raw.bpm, LEAD = 1.2, L = song.lines[2], per = (L.end - L.start + 5) * spb + 0.15;
  const notes = [];
  for (let k = 0; k < 2; k++) for (const n of song.notes.slice(L.firstNote, L.lastNote + 1)) {
    notes.push({ start: LEAD + k * per + (5 + n.beat - L.start) * spb, dur: n.dur * spb, midi: n.midi, cents: () => (k === 0 ? -60 : 0) });
  }
  fs.writeFileSync(__dirname + '/out/loop.wav', synthSong(48000, notes, { total: LEAD + 2 * per + 4 }));
  let latency = 0.03;
  try { latency = Number(fs.readFileSync(__dirname + '/out/builtin-latency.txt', 'utf8')); } catch (_) {}
  const b = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
    '--use-file-for-fake-audio-capture=' + __dirname + '/out/loop.wav', '--autoplay-policy=no-user-gesture-required'] });
  const ctx = await b.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, permissions: ['microphone'] });
  const p = await ctx.newPage(); const errs = [], toasts = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.addInitScript((latency) => localStorage.setItem('onkey.v1', JSON.stringify({
    range: { low: 45, high: 64 }, latency, settings: { guide: false } })), latency);
  await p.exposeFunction('__toast', (t) => toasts.push(t));
  await p.goto('http://localhost:8765/');
  await p.evaluate(() => new MutationObserver(() => { const t = document.getElementById('pToast'); if (!t.hidden) window.__toast(t.textContent); })
    .observe(document.getElementById('pToast'), { attributes: true, childList: true }));
  await p.click('#homeSing');
  await p.click('#pOptBtn');
  await p.selectOption('#oPart', '2-2');
  await p.click('#oRepeat');
  await p.click('#pOptClose');
  await p.click('#pMsg .btn.primary');
  await p.waitForTimeout((LEAD + 2 * per + 0.6) * 1000);
  await p.screenshot({ path: __dirname + '/out/shot-loop.png' });
  await p.click('#pPlay'); // pause
  await p.waitForTimeout(300);
  await p.screenshot({ path: __dirname + '/out/shot-paused.png' });
  const badgePaused = await p.isVisible('#pMicBadge');
  await p.click('text=See my score');
  await p.waitForSelector('#pResults:not([hidden])');
  const label = await p.textContent('#rScoreLabel');
  console.log({ toasts: [...new Set(toasts)], label, badgePaused, errs });
  const times = /each time: (\d+), (\d+)/.exec(label);
  const ok = times && Number(times[2]) > Number(times[1]) + 20 && !badgePaused && !errs.length;
  console.log(ok ? 'PASS  repeat a line' : 'FAIL  repeat a line');
  await b.close(); process.exit(ok ? 0 : 1);
})();

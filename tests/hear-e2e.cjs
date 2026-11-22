// "Hear my part" in Chromium: the fake singer holds the harmony BELOW on one line, four times through.
// Expect: step 1 your part sung (voice oohs) + piano; step 2 piano only; step 3 + one other voice (aahs);
// step 4 + all other voices. Recorded sounds must load, and each time through gets scored.
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const { synthSong } = await import('./song-voice.mjs');
  const { prepareSong, bestOctave } = await import('../js/music/song.js');
  const raw = (await import('../js/songs/amazing-grace.js')).default;
  const range = { low: 45, high: 64 };
  const song = prepareSong(raw, { part: 'below', transpose: bestOctave(raw, range, 'below') });
  const spb = 60 / raw.bpm, LEAD = 1.2, L = song.lines[2], per = (L.end - L.start + 5) * spb + 0.15, N = 4;
  const notes = [];
  for (let k = 0; k < N; k++) for (const n of song.notes.slice(L.firstNote, L.lastNote + 1)) {
    notes.push({ start: LEAD + k * per + (5 + n.beat - L.start) * spb, dur: n.dur * spb, midi: n.midi });
  }
  fs.writeFileSync(__dirname + '/out/hear.wav', synthSong(48000, notes, { total: LEAD + N * per + 3 }));
  let latency = 0.03;
  try { latency = Number(fs.readFileSync(__dirname + '/out/builtin-latency.txt', 'utf8')); } catch (_) {}
  const b = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
    '--use-file-for-fake-audio-capture=' + __dirname + '/out/hear.wav', '--autoplay-policy=no-user-gesture-required'] });
  const ctx = await b.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, permissions: ['microphone'] });
  const p = await ctx.newPage(); const errs = [], toasts = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.addInitScript(({ latency, range }) => localStorage.setItem('onkey.v1', JSON.stringify({
    range, latency, octaveAutoV1: true, settings: { part: 'below' } })), { latency, range });
  await p.exposeFunction('__toast', (t) => toasts.push(t));
  await p.goto('http://localhost:8765/');
  await p.evaluate(() => new MutationObserver(() => { const t = document.getElementById('pToast'); if (!t.hidden) window.__toast(t.textContent); })
    .observe(document.getElementById('pToast'), { attributes: true, childList: true }));
  await p.click('#homeSing');
  const startMsg = await p.textContent('#pMsg');
  await p.click('#pOptBtn');
  await p.selectOption('#oPart', '2-2');
  await p.click('#oHear');
  await p.screenshot({ path: __dirname + '/out/shot-hear-options.png' });
  await p.click('#pOptClose');
  await p.click('#pPlay');
  await p.waitForTimeout((LEAD + 2.5 * per) * 1000);
  await p.screenshot({ path: __dirname + '/out/shot-hear-step3.png' });
  await p.waitForTimeout((N - 2.5) * per * 1000 + 400);
  await p.screenshot({ path: __dirname + '/out/shot-hear-step4.png' });
  const info = await p.evaluate(() => ({ counts: window.__onkeyPractice.playCounts, sampled: window.__onkeyPractice.sampled, scores: window.__onkeyPractice.passScores }));
  await p.click('#pDone');
  await p.waitForSelector('#pResults:not([hidden])');
  const label = await p.textContent('#rScoreLabel');
  console.log({ startMsg: startMsg.slice(0, 110), toasts: [...new Set(toasts)], info, label, errs });
  const c = info.counts, n = L.lastNote - L.firstNote + 1;
  const ok = info.sampled && c[1].oohs >= n && c[1].piano > 0 && c[1].aahs === 0 && c[2].oohs <= 1 && c[2].aahs === 0 && c[2].piano > 0
    && c[3].aahs === n && c[4].aahs === 2 * n && info.scores.slice(0, N).every((s) => s >= 60) && /harmony below/.test(label) && !errs.length;
  console.log(ok ? 'PASS  hear my part: guide, then alone, then voices come in one at a time' : 'FAIL  hear my part');
  await b.close(); process.exit(ok ? 0 : 1);
})();

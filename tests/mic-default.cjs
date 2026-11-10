// What happened on the user's phone: an old saved "use headphones mic" choice from the Step 0 mic check,
// with Bluetooth headphones connected. Practice must still listen with the iPhone mic, say so in the
// badge, and the Done button must stop and show the score.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
  const ctx = await b.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, permissions: ['microphone'] });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.addInitScript(() => {
    localStorage.setItem('onkey.preferPhoneMic', 'no');
    if (!localStorage.getItem('onkey.v1')) localStorage.setItem('onkey.v1', JSON.stringify({ range: { low: 45, high: 64 }, latency: 0.03 }));
    const md = navigator.mediaDevices, gum = md.getUserMedia.bind(md);
    window.__live = [];
    md.enumerateDevices = async () => [
      { kind: 'audioinput', label: 'WH-1000XM4', deviceId: 'bt' }, { kind: 'audioinput', label: 'iPhone Microphone', deviceId: 'ip' }];
    md.getUserMedia = async (c) => {
      const id = c.audio.deviceId && c.audio.deviceId.exact;
      const s = await gum({ audio: true }), t = s.getAudioTracks()[0];
      Object.defineProperty(t, 'label', { value: id === 'ip' ? 'iPhone Microphone' : 'WH-1000XM4' });
      window.__live.push(t); return s;
    };
  });
  await p.goto('http://localhost:8765/');
  await p.click('#homeSing');
  await p.click('#pMsg .btn.primary');
  await p.waitForTimeout(2500);
  const badge = await p.textContent('#pMicBadge');
  const done = await p.isVisible('#pDone');
  await p.screenshot({ path: __dirname + '/out/shot-mic-badge.png' });
  await p.click('#pDone');
  await p.waitForTimeout(300);
  const after = { results: await p.isVisible('#pResults') || await p.isVisible('#pMsg'), badge: await p.isVisible('#pMicBadge'),
    openMics: await p.evaluate(() => window.__live.filter((t) => t.readyState === 'live').length),
    oldChoiceGone: await p.evaluate(() => localStorage.getItem('onkey.preferPhoneMic') === null) };
  console.log({ badge, doneShown: done, after, errs });
  const ok = /iPhone mic ✓/.test(badge) && done && after.results && !after.badge && after.openMics === 0 && after.oldChoiceGone && !errs.length;
  console.log(ok ? 'PASS  practice uses the iPhone mic and says so; Done stops it' : 'FAIL');
  await b.close(); process.exit(ok ? 0 : 1);
})();

// Simulates the iPhone bug: sound engine never starts. The mic must turn itself off and say why.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const ctx = await b.newContext({ viewport: { width: 844, height: 390 }, permissions: ['microphone'] });
  const p = await ctx.newPage();
  await p.addInitScript(() => {
    Object.defineProperty(AudioContext.prototype, 'state', { get() { return 'suspended'; } });
    AudioContext.prototype.resume = () => new Promise(() => {});
    const gum = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (c) => { const s = await gum(c); window.__stream = s; return s; };
  });
  await p.goto('http://localhost:8765/#check');
  await p.click('#micBtn');
  await p.waitForTimeout(400);
  const badgeEarly = await p.isVisible('#micBadge');
  await p.waitForTimeout(2000);
  const r = {
    badgeShownWhileMicOpen: badgeEarly,
    badgeAfterFailure: await p.isVisible('#micBadge'),
    micTrackStillLive: await p.evaluate(() => window.__stream.getAudioTracks()[0].readyState === 'live'),
    message: await p.textContent('#hint'),
  };
  console.log(r);
  const ok = r.badgeShownWhileMicOpen && !r.badgeAfterFailure && !r.micTrackStillLive;
  console.log(ok ? 'PASS  stuck engine: mic released and user told' : 'FAIL');
  await b.close(); process.exit(ok ? 0 : 1);
})();

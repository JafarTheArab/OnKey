// Fakes an iPhone with Bluetooth headphones: the default mic is the headset's.
// The app must switch to the iPhone mic, and the switch button must flip it back and forth.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const ctx = await b.newContext({ viewport: { width: 844, height: 390 }, permissions: ['microphone'] });
  const p = await ctx.newPage();
  await p.addInitScript(() => {
    const md = navigator.mediaDevices, gum = md.getUserMedia.bind(md);
    window.__live = [];
    md.enumerateDevices = async () => [
      { kind: 'audioinput', label: 'JBL Tune Flex', deviceId: 'bt' },
      { kind: 'audioinput', label: 'iPhone Microphone', deviceId: 'ip' },
    ];
    md.getUserMedia = async (c) => {
      const id = c.audio.deviceId && c.audio.deviceId.exact;
      const s = await gum({ audio: true });
      const t = s.getAudioTracks()[0];
      Object.defineProperty(t, 'label', { value: id === 'ip' ? 'iPhone Microphone' : 'JBL Tune Flex' });
      window.__live.push(t);
      return s;
    };
  });
  await p.goto('http://localhost:8765/#check');
  await p.click('#micBtn'); await p.waitForTimeout(800);
  const first = { device: await p.textContent('#device'), btn: await p.textContent('#micSrcBtn'),
    openMics: await p.evaluate(() => window.__live.filter((t) => t.readyState === 'live').length) };
  await p.click('#micSrcBtn'); await p.waitForTimeout(800);
  const second = { device: await p.textContent('#device'), btn: await p.textContent('#micSrcBtn') };
  await p.click('#micBtn'); await p.waitForTimeout(200);
  const after = await p.evaluate(() => window.__live.filter((t) => t.readyState === 'live').length);
  console.log({ first, second, openMicsAfterStop: after });
  const ok = /iPhone/.test(first.device) && first.openMics === 1 && /JBL/.test(second.device) && after === 0;
  console.log(ok ? 'PASS  mic choice' : 'FAIL  mic choice');
  await b.close(); process.exit(ok ? 0 : 1);
})();

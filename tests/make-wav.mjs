import { synth, wav } from './voice.mjs'; import fs from 'fs';
const sr = 48000;
fs.writeFileSync(new URL('./out/sing.wav', import.meta.url), wav(synth(sr, [{dur:.3},{dur:1.2,midi:52},{dur:.8,from:52,to:57},{dur:1.5,midi:57,cents:-25},{dur:.3},{dur:1.2,midi:59},{dur:1,midi:55,amp:.15}]), sr));

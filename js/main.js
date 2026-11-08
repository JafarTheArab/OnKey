// OnKey: screens and navigation. One screen shows at a time; leaving a screen always turns its mic off.
import { checkScreen } from './screens/check.js';
import { practiceScreen } from './screens/practice.js';
import { rangeScreen } from './screens/range.js';
import { timingScreen } from './screens/timing.js';
import { store } from './store.js';
import { describeRange } from './music/range.js';
import { prepareSong, lineLabel } from './music/song.js';
import { troubleLine } from './practice/scoring.js';
import song from './songs/amazing-grace.js';

const $ = (id) => document.getElementById(id);
const homeScreen = { show: renderHome, hide() {} };
const screens = { home: homeScreen, practice: practiceScreen, range: rangeScreen, timing: timingScreen, check: checkScreen };
let current = null;

export function go(name, opts = {}) {
  if (current && screens[current].hide) screens[current].hide();
  for (const k of Object.keys(screens)) $('scr-' + k).hidden = k !== name;
  current = name;
  if (location.hash.slice(1) !== name) history.replaceState(null, '', name === 'home' ? location.pathname : '#' + name);
  screens[name].show(opts);
}
window.__onkeyGo = go; // for automated tests

for (const s of [practiceScreen, rangeScreen, timingScreen]) s.init({ go, song });
$('ckBack').addEventListener('click', () => go('home'));

function renderHome() {
  const d = store.get();
  const prog = store.song(song.id);
  const prep = prepareSong(song);
  $('homeSongTitle').textContent = song.title;
  $('homeCredit').textContent = song.credit;
  const last = prog.runs[prog.runs.length - 1];
  $('homeSongInfo').textContent = `3 verses · ${song.beatsPerBar}/4 time` +
    (last ? ` · last score ${last.score}` : '') + (prog.best != null ? ` · best ${prog.best}` : '');
  const ll = prog.lastLine || 0;
  $('homeContinue').hidden = ll <= 0 || ll >= prep.lines.length;
  if (ll > 0 && ll < prep.lines.length) {
    $('homeContinue').textContent = `Continue: “${prep.lines[ll].text.split(' ').slice(0, 4).join(' ')}…”`;
    $('homeContinue').onclick = () => go('practice', { startLine: ll });
  }
  const tr = troubleLine(prep, prog.noteHist || {});
  $('homeTrouble').hidden = !tr;
  if (tr) {
    const l = prep.lines[tr.line];
    $('homeTrouble').innerHTML = '';
    $('homeTrouble').append(`Trouble spot: “${l.text}” (${lineLabel(l)}).`);
    const b = document.createElement('button');
    b.className = 'btn small inline'; b.textContent = 'Loop just this line';
    b.onclick = () => go('practice', { loopLine: tr.line });
    $('homeTrouble').append(b);
  }
  $('homeRange').textContent = d.range ? describeRange(d.range) : 'Not tested yet';
  $('homeRangeBtn').textContent = d.range ? 'Test again' : 'Test my range (1 min)';
  $('homeTiming').textContent = d.latency != null ? `Lined up (${Math.round(d.latency * 1000)} ms delay)` : 'Not lined up yet. Do this once with your earbuds in.';
  $('homeTimingBtn').textContent = d.latency != null ? 'Line up again' : 'Line up timing (20 sec)';
}
$('homeSing').addEventListener('click', () => go('practice', { startLine: 0 }));
$('homeRangeBtn').addEventListener('click', () => go('range'));
$('homeTimingBtn').addEventListener('click', () => go('timing'));
$('homeCheckBtn').addEventListener('click', () => go('check'));

// Start: a link like …/#check opens that screen; the very first visit starts with the range test
const start = location.hash.slice(1);
if (screens[start] && start !== 'practice') go(start);
else if (!store.get().range && !store.get().rangeSkipped) go('range', { firstRun: true });
else go('home');

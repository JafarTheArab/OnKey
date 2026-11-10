# OnKey: notes for Claude

Singing practice web app for one user's iPhone (landscape, Home Screen app). Static site, no build step,
no server, no dependencies yet. Hosted on GitHub Pages from `main`: https://jafarthearab.github.io/OnKey/
(pushing to `main` publishes in ~1 minute; the phone may cache for up to ~10 minutes).

The full product spec is the user's "OnKey build instructions" document. Ask the user to attach it at the
start of a session if it isn't in the conversation. Follow its hard rules (mic privacy, public-domain songs
only, no scraping, static app, stages with check-ins, ask before choosing libraries).
The user is not a developer: plain language, exact taps, no jargon.

## Status
- **Step 0: done and confirmed on the user's iPhone** (2026-11-08). Pitch check screen works with and without
  Bluetooth headphones. User approved building from scratch (AllKaraoke has no license; others too small).
- **Stage 1a: built and published to main 2026-11-08, waiting for the user to try it on the iPhone** (don't start 1b until confirmed).
  Home screen, range test (auto-opens on first visit), timing check ("ta" on clicks -> delay), practice screen
  (bars, voice line, lyrics, names toggle, count-in + starting note, metronome, speed +/- and auto speed,
  part = whole/verse/line + repeat, trouble spots), forgiving score with Gentle/Normal/Strict that tightens
  as you improve, exact breakdown (overall lean, long-note drift, after jumps, high/low notes, scoops, misses,
  hardest/strongest line, note-by-note cents). Song: Amazing Grace, 3 verses. Octave down/as written/up is
  already in Options (default picked from the range). Guide melody is a simple built-in synth (no library).
- **Then Stage 1b**: generated harmony (3rd above/below, in key), fit-my-voice, "hear my part",
  layered playback. Ask the user to approve a soundfont/synth library before 1b.
- Stage 1 was estimated at 2-3 sessions; check in after 1a.

## Code map
- `js/audio/pitch.js`: YIN + `PitchTracker` (adaptive noise gate, hysteresis while holding a note,
  octave-jump guard, median + light smoothing). No DOM, reusable by Keyfall. Its smoothing delays the
  pitch by ~0.12 s (`PITCH_LAG` in practice.js compensates).
- `js/audio/engine.js`: shared AudioContext and iOS workarounds; all app sound must go through `output()`.
- `js/audio/mic.js`: mic lifecycle and privacy; prefers the iPhone mic; frames carry `t` (performance.now)
  and `ct` (engine clock); `mic.ctx` is the fresh AudioContext of the current mic session.
- `js/main.js`: screens/navigation (home is in here). `#check`, `#range`, `#timing` in the URL open those screens.
- `js/screens/practice.js`: practice screen. Timing = list of anchors mapping engine time -> song beats
  (new anchor on speed change or repeat). Display/scoring use engine time minus the measured delay.
- `js/screens/range.js`, `timing.js`, `check.js` (the Step 0 mic check).
- `js/practice/scoring.js` (pure: per-note judging on the steady middle, octave-folded score, findings),
  `js/practice/sounds.js` (click + guide voice). `js/music/song.js` (prepare/transposition/count-in),
  `js/music/range.js` (holds, voice type), `js/music/notes.js`. `js/songs/amazing-grace.js` (PD, own arrangement).
- `js/store.js`: localStorage (`onkey.v1`): range, latency, settings, per-song runs/noteHist/lastLine/best.
- Planned: `js/songimport/` as a self-contained module (MIDI, "find this song", audio-to-notes) for Keyfall reuse.

## Hard-won iPhone facts (verified on the user's phone)
- With auto-gain off, the iPhone mic delivers a voice at only ~0.007 RMS (peak ~0.02). Gates must be low;
  the noise floor must learn only from non-musical frames (an earlier bug locked quiet voices out).
- Starting the mic switches iOS to play-and-record and can freeze an existing AudioContext; `resume()` can
  hang forever. Create a fresh context per mic session inside the tap; never `await resume()` without a timeout.
- While the mic is on, web audio sent straight to `destination` is silent; route through
  MediaStreamDestination -> `<audio>` element (engine `setRoute('element')`). Plays in headphones fine.
- Bluetooth headset mic = call mode = unusable for pitch. Re-open with the "iPhone Microphone" deviceId after
  permission; output stays on the headphones. Keep this the default.
- Show the mic badge the moment getUserMedia resolves; on any later failure stop the tracks and say why.
- 2026-11-10 (user's phone, Sony headphones): Step 0's Mic check used to SAVE "use headphones mic"; the new
  screens obeyed it, so the range test cut out and probably measured the range wrong (song came out too high).
  Now practice/range/timing always use the iPhone mic, the Mic check switch isn't remembered, and every
  "Mic on" badge names the mic. A just-switched mic can deliver silence for a while: mic.js re-opens it once.
- User: singing high strains his voice (as-written Amazing Grace was too high; he chose Octave: Down).
  Octave choice now counts notes above the range double.
- A TV or other voices nearby confuse detection (they're pitched too). "Learn the room" is a future idea.

## Tests (run from repo root; serve with `python3 -m http.server 8765` for browser tests)
See `tests/README.md`. Synthetic-voice unit tests, real-level + TV test, Playwright e2e with a fake mic,
stuck-engine privacy test, mic-choice test. `tests/out/` is gitignored and holds the user's real voice samples:
never commit them (the repo is public). Take screenshots at 844x390 and look at them before reporting a stage.

## Conventions
- Commit as the user (`Justin <justfar@live.com>`), with the Co-Authored-By/Claude-Session trailers.
- Keep `[hidden]{display:none!important}`; avoid stacked pop-ups.
- **Never show "cents" to the user** (settled in Step 0). Say "On it ✓ / A bit flat ↓ / Sharp ↑" and amounts as
  "30% of a step" (100% = one piano key). Helpers: `offWords()` and `stepPct()` in `js/music/notes.js`.
  Cents are fine inside the code only.

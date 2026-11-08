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
- **Next: Stage 1a**: range test, scrolling practice screen (bars right-to-left, live voice line, karaoke
  lyrics, note names toggle, count-in, metronome toggle, speed + auto-adjust, loop + trouble spots), scoring
  with honest end-of-song breakdown. Use one public-domain test melody (Amazing Grace: NEW BRITAIN tune
  + John Newton 1779 words, both PD; write our own arrangement).
- **Then Stage 1b**: octave up/down, generated harmony (3rd above/below, in key), fit-my-voice, "hear my part",
  layered playback. Ask the user to approve a soundfont/synth library before 1b.
- Stage 1 was estimated at 2-3 sessions; check in after 1a.

## Code map
- `js/audio/pitch.js`: YIN + `PitchTracker` (adaptive noise gate, hysteresis while holding a note,
  octave-jump guard, median + light smoothing). No DOM, reusable by Keyfall.
- `js/audio/engine.js`: shared AudioContext and iOS workarounds; all app sound must go through `output()`.
- `js/audio/mic.js`: mic lifecycle and privacy; prefers the iPhone mic; `captureSample()` for diagnosis.
- `js/audio/wav.js`: WAV encoder. `js/music/notes.js`: note names.
- `js/main.js`: the Step 0 pitch-check screen (will become the "mic check" screen).
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
- A TV or other voices nearby confuse detection (they're pitched too). "Learn the room" is a future idea.

## Tests (run from repo root; serve with `python3 -m http.server 8765` for browser tests)
See `tests/README.md`. Synthetic-voice unit tests, real-level + TV test, Playwright e2e with a fake mic,
stuck-engine privacy test, mic-choice test. `tests/out/` is gitignored and holds the user's real voice samples:
never commit them (the repo is public). Take screenshots at 844x390 and look at them before reporting a stage.

## Conventions
- Commit as the user (`Justin <justfar@live.com>`), with the Co-Authored-By/Claude-Session trailers.
- Keep `[hidden]{display:none!important}`; avoid stacked pop-ups.

# Tests
Run from the `onkey` folder:
- `node tests/pitch.test.mjs`: pitch detector on synthetic voices (on pitch, flat, sharp, low, high, quiet, slides, octave jump, silence).
- `node tests/make-wav.mjs`, then serve the folder on port 8765 (`python3 -m http.server 8765`) and run `node tests/e2e.cjs`: full page in Chromium with a fake mic; screenshots go to `tests/out/`.
- `node tests/dropout.test.mjs`: a rough, breathy held note must not cut out.
- `node tests/stuck-engine.cjs` (server running): if the sound engine never starts, the mic must switch itself off and say so.
- `node tests/analyze-sample.mjs <file.wav>`: run the detector over a sample shared from the phone ("Save 5-sec sample") and show where and why it fails.
- `node tests/real-level.test.mjs`: voice at the real iPhone mic level (measured from a real sample), soft singing, and a TV talking underneath.
- `node tests/mic-choice.cjs` (server running): with Bluetooth headphones connected, the app listens with the iPhone mic, and the switch button works.

Stage 1a (server running on 8765; run `timing-e2e` first, since the practice tests use the delay it measures):
- `node tests/scoring.test.mjs`: score and breakdown on simulated singing (on pitch, flat, drifting on long notes, sharp after jumps, octave down, scooping, a hard line, silence), score tightening, trouble spots, octave choice.
- `node tests/timing-e2e.cjs`: timing check; the fake mic says "ta" 150 ms after each click. Saves this computer's built-in delay to `tests/out/builtin-latency.txt`.
- `node tests/range-e2e.cjs`: first visit opens the range test; holds A2 and E4 and slides; expects "A2 to E4, a baritone range".
- `node tests/practice-e2e.cjs [drift|sharp|quiet]`: sings verse 1 an octave down (long notes sinking flat / 40 cents sharp / at real iPhone mic level). Screenshots in `tests/out/`.
- `node tests/loop-e2e.cjs`: repeats one line; flat the first time, on pitch the second; each time is scored.
- `node tests/speed-e2e.cjs`: speed buttons mid-song and auto speed slowing down.

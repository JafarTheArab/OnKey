# Tests
Run from the `onkey` folder:
- `node tests/pitch.test.mjs`: pitch detector on synthetic voices (on pitch, flat, sharp, low, high, quiet, slides, octave jump, silence).
- `node tests/make-wav.mjs`, then serve the folder on port 8765 (`python3 -m http.server 8765`) and run `node tests/e2e.cjs`: full page in Chromium with a fake mic; screenshots go to `tests/out/`.
- `node tests/dropout.test.mjs`: a rough, breathy held note must not cut out.
- `node tests/stuck-engine.cjs` (server running): if the sound engine never starts, the mic must switch itself off and say so.
- `node tests/analyze-sample.mjs <file.wav>`: run the detector over a sample shared from the phone ("Save 5-sec sample") and show where and why it fails.
- `node tests/real-level.test.mjs`: voice at the real iPhone mic level (measured from a real sample), soft singing, and a TV talking underneath.
- `node tests/mic-choice.cjs` (server running): with Bluetooth headphones connected, the app listens with the iPhone mic, and the switch button works.

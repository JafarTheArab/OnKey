# OnKey
Singing practice web app (iPhone, landscape). Static site, no build step, no server. Hosted on GitHub Pages: https://jafarthearab.github.io/OnKey/

- `js/audio/`: microphone lifecycle (privacy rules) and YIN pitch detection (`pitch.js` has no DOM, so it's reusable)
- `js/music/`: note naming helpers
- `js/songimport/` (Stage 2): self-contained song import (MIDI, "find this song", audio to notes), shared with Keyfall later
- `tests/`: synthetic-voice tests (see tests/README.md)

Privacy: the mic is on only while practicing, turns off in the background, and audio is analysed on the device only.

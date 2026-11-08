# OnKey
Singing practice web app (iPhone, landscape). Static site, no build step, no server. Hosted on GitHub Pages: https://jafarthearab.github.io/OnKey/

- `js/audio/`: microphone lifecycle (privacy rules) and YIN pitch detection (`pitch.js` has no DOM, so it's reusable)
- `js/music/`: notes, songs (prepare/transpose/count-in), voice range
- `js/screens/`: home is in `js/main.js`; practice, range test, timing check, mic check
- `js/practice/`: scoring (pure, no DOM) and simple built-in sounds
- `js/songs/`: built-in public-domain songs (own arrangements)
- `js/songimport/` (Stage 2): self-contained song import (MIDI, "find this song", audio to notes), shared with Keyfall later
- `tests/`: synthetic-voice tests (see tests/README.md)

Privacy: the mic is on only while practicing, turns off in the background, and audio is analysed on the device only.

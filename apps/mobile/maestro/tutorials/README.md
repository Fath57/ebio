# Tutorial recordings

Maestro flows that drive the apps on the `ebio_store` emulator for the
tutorial videos, against the demo database (see
`apps/api/scripts/demo/README.md`).

| Video | Command |
|---|---|
| Fournisseur : traiter une commande | `./record.sh supplier supplier-orders.yaml supplier-order` |
| Livreur : livrer une course | `./record.sh courier courier-run.yaml courier-run` |

Three steps per video:

1. `record.sh` resets the demo, puts it in the scenario's starting state,
   films the device while `run.sh` plays the flow, and saves the raw take in
   `~/Vidéos/ebio-tutos/` with its start time and Maestro log. On a personal
   phone (`DEVICE=<serial>`) it sets light theme, Do not disturb and no
   password autofill for the take, and restores them afterwards.
2. `python3 produce.py <take>.mp4` marks every tap with a ring at its exact
   pixel and moment, cuts the start-up wait and the status bar (it shows the
   phone owner's notification icons), compresses long stretches between
   taps, and holds the last frame. It prints each tap's time in the montage.
3. `./narrate.sh <take>-montage.mp4 narration/<video>.txt` lays the voice-over
   (`gpt-4o-mini-tts`, voice `coral`, `SPEED=1.15`), each sentence at its
   mark, never over the previous one.
4. `python3 dress.py <take>-montage-voix.mp4 narration/<video>.txt <app> "<Titre>"`
   dresses it for publishing, vertical 1080×1920: the capture in a phone
   frame on an eBio background, the step titles of the narration file
   (`MM:SS [Titre] | phrase`) numbered above it, an opening and a closing
   card. Output: `<take>-final.mp4`.
   `MUSIC=track.mp3` adds a background track, ducked under the voice; the
   voice is brought to -16 LUFS. Tracks used: Mixkit Stock Music Free
   License (social video and ads allowed, no credit; no remix, no TV/radio),
   kept in `~/Vidéos/ebio-tutos/musique/`, not in git.

`run.sh` alone plays a flow without filming.

Film the **release** builds (JS bundled, no dev menu), x86_64 for the
emulator, with plain http allowed in the generated manifest only — the demo
API is `http://localhost:3010`, forwarded to the demo API on 3020.

Emulator setup before a session: light theme (`cmd uimode night no`), GPS in
Abomey-Calavi (`emu geo fix 2.3436 6.4372`), demo status bar (9:00, full
battery, no notifications).

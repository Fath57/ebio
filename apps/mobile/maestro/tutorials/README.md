# Tutorial recordings

Maestro flows that drive the apps on the `ebio_store` emulator for the
tutorial videos, against the demo database (see
`apps/api/scripts/demo/README.md`).

| Video | Command |
|---|---|
| Fournisseur : traiter une commande | `./record.sh supplier supplier-orders.yaml supplier-order` |

`record.sh` resets the demo, puts it in the scenario's starting state, films
the emulator while `run.sh` plays the flow, and saves the take in
`~/Vidéos/ebio-tutos/`. `run.sh` alone plays a flow without filming.

Film the **release** builds (JS bundled, no dev menu), x86_64 for the
emulator, with plain http allowed in the generated manifest only — the demo
API is `http://localhost:3010`, forwarded to the demo API on 3020.

Emulator setup before a session: light theme (`cmd uimode night no`), GPS in
Abomey-Calavi (`emu geo fix 2.3436 6.4372`), demo status bar (9:00, full
battery, no notifications).

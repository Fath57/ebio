# Demo kit — tutorial videos

A separate database, `ebio_demo`, holding the real catalogue of the shops that
agreed to appear in the videos, and fictitious people only: owners' accounts,
buyers, couriers. Nothing filmed belongs to an actual customer.

## Shops shown

Mine d'or délice (supplier video), Mandagbe (courier video), Naturo,
FARINE TADAGBE. Their photos are referenced from production storage, as they
are published. Add a shop only once it has agreed: edit `SHOPS` in
`export-prod-catalog.sh`.

## Commands (from this folder)

| Step | Command |
|---|---|
| Read the catalogue from production (read-only) | `./export-prod-catalog.sh` |
| Build `ebio_demo` and its snapshot `demo-base.dump` | `./build-demo.sh` |
| Back to the snapshot between two takes | `./reset-demo.sh` |
| Put the demo in a video's starting state (demo API up) | see below |

`snapshot/` and `demo-base.dump` stay out of git.

## Demo API

Runs beside the local API, on port 3020, on `ebio_demo`, with its own Redis
database and SMS disabled (fictitious numbers):

```bash
systemd-run --user --unit=ebio-api-demo --collect -p WorkingDirectory=$PWD/../.. \
  --setenv=DATABASE_NAME=ebio_demo --setenv=API_PORT=3020 \
  --setenv=REDIS_URL=redis://localhost:6379/5 \
  --setenv=WIREPICK_USER= --setenv=WIREPICK_PASSWORD= \
  node --enable-source-maps dist/main.js
```

The apps call `localhost:3010` (`apps/mobile/.env.local`). On the emulator,
`adb reverse tcp:3010 tcp:3020` sends them to the demo API without touching
that file. Restart the demo API after `build-demo.sh` or `reset-demo.sh`:
both drop the database under it.

## Scenarios

From `apps/api`:

```bash
DATABASE_NAME=ebio_demo npx dotenvx run -q -- npx tsx scripts/demo/scenario.ts supplier-order
DATABASE_NAME=ebio_demo npx dotenvx run -q -- npx tsx scripts/demo/scenario.ts courier-run
```

- `supplier-order` — Afi Dossou orders from Mine d'or délice; the order waits
  for the shop to accept it.
- `courier-run` — Kossi Agbo orders from Mandagbe and the shop gets it ready;
  the run is offered to Rodrigue Houngbo, the only courier available.

Every demo account uses the password in `demo-accounts.ts`.

| Who | E-mail |
|---|---|
| Mine d'or délice (shop) | `mine-d-or-delice@demo.e-bio.org` |
| Mandagbe (shop) | `mandagbe@demo.e-bio.org` |
| Rodrigue Houngbo (courier) | `rodrigue@demo.e-bio.org` |
| Afi Dossou, Kossi Agbo (buyers) | `afi@…`, `kossi@demo.e-bio.org` |
| Back office | `admin@demo.e-bio.org` |

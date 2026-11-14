# Demo kit, tutorial videos

A separate database, `ebio_demo`, holding the real catalogue of the shops that
agreed to appear in the videos, and fictitious people only: owners' accounts,
buyers, couriers. Nothing filmed belongs to an actual customer.

## Shops shown

Mine d'or délice (supplier video), Mandagbe (courier video), FARINE TADAGBE
(Valise supplier video), Naturo. Their photos are referenced from production storage, as they
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
  -p StandardOutput=append:$HOME/.cache/ebio-logs/api-demo.log -p StandardError=append:$HOME/.cache/ebio-logs/api-demo.log \
  --setenv=PATH=$(dirname "$(which node)"):/usr/bin:/bin \
  --setenv=DATABASE_NAME=ebio_demo --setenv=API_PORT=3020 \
  --setenv=REDIS_URL=redis://localhost:6379/5 \
  --setenv=WIREPICK_USER= --setenv=WIREPICK_PASSWORD= \
  node --enable-source-maps dist/main.js
```

`systemctl --user restart ebio-api-demo` afterwards; if the unit is gone (it
exits when its database is dropped under it), run the command above again.

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

- `supplier-order`, Afi Dossou orders from Mine d'or délice; the order waits
  for the shop to accept it.
- `courier-run`, Kossi Agbo orders from Mandagbe and the shop gets it ready;
  the run is offered to Rodrigue Houngbo, the only courier available.
- `valise-client`, nothing to place: checks the Valise is open (France and
  Belgium) and Sika Mensah's wallet (150 000 FCFA). « Ma valise » lives in the
  app (AsyncStorage): clear the app's data for an empty suitcase.
- `valise-supplier`, Sika Mensah pays a suitcase towards France by wallet
  (pickup in Paris): 2 FARINE DE SOUCHET NATURE, 1 POUDRE DE BAOBAB, 2 BISCUITS
  DE SOUCHET À LA CANNELLE, 1 Farine d'akassa (Naturo). The FARINE TADAGBE
  order waits, PLACED, pickup mode EXPORT. Once the shop marks it ready, a
  courier run to the eBio hub is created (700 FCFA, broadcast at 5 km first:
  Rodrigue, about 13 km away, sees it once the radius has widened).
- `auth`, removes the accounts the auth take signs up (Codjo Ahouandjinou,
  `+229 01 97 00 00 00`, and Nadia Kpadé, `nadia@demo.e-bio.org`), should a
  take have run without a reset since. A reset alone removes them too.

## La Valise du pays

Seeded by `seed-valise.ts`: France and Belgium active; a fictitious agency,
Atlantique Fret, with a pickup point in Paris and one in Brussels; one open
departure (120 kg) leaving 12 days after the reset, orders closing 6 days
after it, 8 500 FCFA/kg towards France (5 kg minimum, home delivery 3 900),
9 000 FCFA/kg towards Belgium (5 kg minimum, no home delivery).
`reset-demo.sh` re-anchors these dates on the day of the take. Collection by
courier to the hub « Point eBio Cotonou » (Gbégamey, 3 km from FARINE
TADAGBE); packaging 300 g, tolerance 10 %, insurance 3 % (1 000 minimum).

Exportable: the flours, biscuits and baobab powder of FARINE TADAGBE, the
flours, aklui, mawè and adowè of Naturo, the dried tchayo, dried amanvivè and
okra powder of Mandagbe, the honey of Mine d'or délice. Not exportable (no
profile): the juices of Mine d'or délice, the fresh or precooked vegetables of
Mandagbe, the fish crisps of Naturo. FARINE DE SOUCHET AU CLOU DE GIROFLE stays
« À compléter » (storage and label photo missing) for the supplier video.
FARINE TADAGBE also sells the pack « Trio de farines de souchet » (4 500 FCFA).

## Fixed codes

Nothing leaves the demo: SMS are off, e-mails go to the Mailtrap sandbox. A
trigger on `verification` (installed by the seed, demo database only)
replaces every one-time code drawn, SMS sign-up and login, e-mail sign-up,
password reset, address change, by `DEMO_OTP_CODE`: **246810**. The API code
is unchanged; the log line `[OTP] … → ` still prints the random code it drew,
ignore it. A wrong code is still refused. Delivery codes are `2468`
(`DEMO_DELIVERY_CODE`).

Every demo account uses the password in `demo-accounts.ts`.

Demo-only triggers, so that a take filmed anywhere plays like one in
Abomey-Calavi: a courier's position stays in their zone whatever the phone
reports, and every delivery code drawn becomes `DEMO_DELIVERY_CODE` (2468), so
a scripted take can type it. The couriers' zone has no radius: the app would
otherwise warn « X km from your zone » from the phone's real position.

| Who | E-mail |
|---|---|
| Mine d'or délice (shop) | `mine-d-or-delice@demo.e-bio.org` |
| Mandagbe (shop) | `mandagbe@demo.e-bio.org` |
| FARINE TADAGBE (shop) | `farine-tadagbe@demo.e-bio.org` |
| Naturo (shop) | `naturo@demo.e-bio.org` |
| Sika Mensah (buyer in France, `+33 6 39 98 00 01`, prices in euros) | `sika@demo.e-bio.org` |
| Rodrigue Houngbo (courier) | `rodrigue@demo.e-bio.org` |
| Afi Dossou, Kossi Agbo (buyers) | `afi@…`, `kossi@demo.e-bio.org` |
| Back office | `admin@demo.e-bio.org` |

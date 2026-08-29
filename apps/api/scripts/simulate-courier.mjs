// Dev helper: moves a courier along the road to its active delivery so the
// buyer's live map can be tested from the couch. Writes the same columns the
// PATCH /couriers/me/location endpoint writes. Never use against production.
//
//   cd apps/api && ../../node_modules/.bin/dotenvx run -- node scripts/simulate-courier.mjs <courier email> [tick ms] [home lat] [home lng]
import process from 'node:process'
import pg from 'pg'

const email = process.argv[2]
const tickMs = Number(process.argv[3] ?? 5000)
if (!email) {
  console.error('Usage: simulate-courier.mjs <courier email> [tick ms]')
  process.exit(1)
}
// Parking spot while no run is active: Talensac market, Nantes (the demo shop).
const HOME = process.argv[4] && process.argv[5]
  ? { latitude: Number(process.argv[4]), longitude: Number(process.argv[5]) }
  : { latitude: 47.2212, longitude: -1.5562 }
const STEP_METERS = 30 // per tick → ~20 km/h at 5 s

const client = new pg.Client({
  host: process.env.DATABASE_HOST,
  port: Number(process.env.DATABASE_PORT ?? 5432),
  user: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE_NAME,
})
await client.connect()

const { rows: couriers } = await client.query(
  `SELECT cp.id, cp.last_latitude, cp.last_longitude FROM courier_profiles cp JOIN users u ON u.id = cp.user_id WHERE u.email = $1`,
  [email],
)
if (couriers.length === 0) {
  console.error(`Aucun profil livreur pour ${email}`)
  process.exit(1)
}
const courierId = couriers[0].id
let position = couriers[0].last_latitude != null
  ? { latitude: Number(couriers[0].last_latitude), longitude: Number(couriers[0].last_longitude) }
  : { ...HOME }

function metersBetween(a, b) {
  const r = 6371000
  const dLat = (b.latitude - a.latitude) * Math.PI / 180
  const dLng = (b.longitude - a.longitude) * Math.PI / 180
  const x = dLng * Math.cos((a.latitude + b.latitude) / 2 * Math.PI / 180)
  return Math.sqrt(dLat * dLat + x * x) * r
}

function stepToward(from, to) {
  const d = metersBetween(from, to)
  // Another city altogether (Nantes ↔ Cotonou in dev): teleport instead of crawling for days.
  if (d <= STEP_METERS || d > 50_000) {
    return { ...to }
  }
  const f = STEP_METERS / d
  return { latitude: from.latitude + (to.latitude - from.latitude) * f, longitude: from.longitude + (to.longitude - from.longitude) * f }
}

async function writePosition(p) {
  await client.query(
    `UPDATE courier_profiles
     SET last_known_location = ST_MakePoint($1, $2)::geography,
         last_latitude = $2, last_longitude = $1,
         last_location_at = NOW(), "updatedAt" = NOW()
     WHERE id = $3`,
    [p.longitude, p.latitude, courierId],
  )
}

async function tick() {
  const { rows } = await client.query(
    `SELECT d.status, d.pickup_latitude, d.pickup_longitude, o.delivery_latitude, o.delivery_longitude, o.order_number
     FROM deliveries d JOIN orders o ON o.id = d.order_id
     WHERE d.courier_id = $1 AND d.status IN ('ACCEPTED', 'PICKED_UP', 'IN_TRANSIT')
     ORDER BY d."updatedAt" DESC LIMIT 1`,
    [courierId],
  )
  let target = HOME
  let label = 'stationné (aucune course)'
  if (rows.length > 0) {
    const run = rows[0]
    if (run.status === 'ACCEPTED' && run.pickup_latitude != null) {
      target = { latitude: Number(run.pickup_latitude), longitude: Number(run.pickup_longitude) }
      label = `${run.order_number} → vers la boutique`
    }
    else if (run.delivery_latitude != null) {
      target = { latitude: Number(run.delivery_latitude), longitude: Number(run.delivery_longitude) }
      label = `${run.order_number} → vers le client`
    }
    else {
      label = `${run.order_number} (pas de point de livraison, immobile)`
      target = position
    }
  }
  position = stepToward(position, target)
  await writePosition(position)
  console.log(`${new Date().toLocaleTimeString('fr-FR')} ${label} · ${position.latitude.toFixed(5)}, ${position.longitude.toFixed(5)} · reste ${Math.round(metersBetween(position, target))} m`)
}

console.log(`Simulation du livreur ${email} (${courierId}) toutes les ${tickMs} ms — Ctrl+C pour arrêter`)
await tick()
setInterval(() => {
  tick().catch(err => console.error(err.message))
}, tickMs)

/**
 * Fills the `ebio_demo` database for the tutorial videos.
 *
 * The catalogue is the real one of the shops that agreed to appear
 * (snapshot/*.json, exported from production by export-prod-catalog.sh):
 * their own names, photos and prices. Every person is fictitious, owners'
 * accounts, buyers, couriers, with phone numbers outside any real range, so
 * that nothing filmed belongs to an actual customer.
 *
 * Orders are not created here: scenario.ts places them through the API, so
 * that deliveries, dispatch and notifications are exactly the production ones.
 *
 * Run from apps/api: DATABASE_NAME=ebio_demo npx dotenvx run -- npx tsx scripts/demo/seed-demo.ts
 */
import type { EntityManager } from '@mikro-orm/postgresql'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { MikroORM } from '@mikro-orm/postgresql'
import { hashPassword } from 'better-auth/crypto'
import { createMikroOrmOptions } from '../../src/config/mikro-orm.config'
import { Account, User, UserRole } from '../../src/modules/auth/auth.entity'
import { CourierProfile, VehicleType } from '../../src/modules/deliveries/entities/courier-profile.entity'
import { ValidationStatus } from '../../src/modules/suppliers/supplier.entity'
import { DEMO_DELIVERY_CODE, DEMO_DIASPORA_BUYER, DEMO_OTP_CODE, DEMO_PASSWORD } from './demo-accounts'
import { seedValise } from './seed-valise'

const TERMS_VERSION = '2026-09'
const SNAPSHOT_DIR = join(__dirname, 'snapshot')

/** Reference tables taken as they are from production. */
const REFERENCE_TABLES = ['categories', 'product_units', 'platform_settings', 'commission_rates']

interface SupplierRow {
  id: string
  user_id: string
  shop_name: string
  [column: string]: unknown
}

interface PersonSpec {
  name: string
  email: string
  phone: string
  role: UserRole
}

/**
 * The accounts filmed in the videos. +229 01 00 00 0x numbers are not
 * allocated to any subscriber.
 */
const BUYERS: PersonSpec[] = [
  { name: 'Afi Dossou', email: 'afi@demo.e-bio.org', phone: '+2290100000101', role: UserRole.BUYER },
  { name: 'Kossi Agbo', email: 'kossi@demo.e-bio.org', phone: '+2290100000102', role: UserRole.BUYER },
]

/**
 * Rodrigue is the courier filmed: the only one available, so that the
 * dispatch offers him the run. Mireille exists for the back-office video and
 * goes available from there when needed.
 */
const COURIERS: Array<PersonSpec & { latitude: number, longitude: number, zone: string, vehicle: VehicleType, isAvailable: boolean }> = [
  // Between the four shops, all in Abomey-Calavi.
  { name: 'Rodrigue Houngbo', email: 'rodrigue@demo.e-bio.org', phone: '+2290100000201', role: UserRole.COURIER, latitude: 6.4372, longitude: 2.3436, zone: 'Abomey-Calavi', vehicle: VehicleType.MOTO, isAvailable: true },
  { name: 'Mireille Ahouansou', email: 'mireille@demo.e-bio.org', phone: '+2290100000202', role: UserRole.COURIER, latitude: 6.4180, longitude: 2.3380, zone: 'Godomey', vehicle: VehicleType.MOTO, isAvailable: false },
]

const ADMIN: PersonSpec = { name: 'Équipe eBio', email: 'admin@demo.e-bio.org', phone: '+2290100000001', role: UserRole.ADMIN }

function readSnapshot<T>(name: string): T[] {
  return JSON.parse(readFileSync(join(SNAPSHOT_DIR, `${name}.json`), 'utf8')) as T[]
}

async function insertRows(em: EntityManager, table: string, rows: unknown[]): Promise<void> {
  if (rows.length === 0) {
    return
  }
  await em.getConnection().execute(
    `INSERT INTO "${table}" SELECT * FROM json_populate_recordset(NULL::"${table}", ?::json)`,
    [JSON.stringify(rows)],
  )
}

async function createPerson(em: EntityManager, spec: PersonSpec, passwordHash: string): Promise<User> {
  const user = em.create(User, {
    name: spec.name,
    email: spec.email,
    phone: spec.phone,
    role: spec.role,
    emailVerified: true,
    termsAcceptedAt: new Date(),
    termsAcceptedFrom: 'demo',
    termsVersion: TERMS_VERSION,
  })
  const account = new Account()
  account.user = user
  account.providerId = 'credential'
  account.accountId = randomUUID()
  account.password = passwordHash
  em.persist(account)
  await em.flush()
  return user
}

interface HistoryLine {
  daysAgo: number
  type: 'DELIVERY_EARNING' | 'TIP_EARNING'
  amount: number
  description: string
}

/** A wallet with past movements, its balance the running sum. */
async function seedCourierHistory(em: EntityManager, fullName: string, lines: HistoryLine[]): Promise<void> {
  const connection = em.getConnection()
  const [wallet] = await connection.execute(
    `INSERT INTO wallets (courier_profile_id, balance, "createdAt", "updatedAt")
     SELECT id, 0, NOW() - INTERVAL '10 days', NOW() FROM courier_profiles WHERE full_name = ?
     RETURNING id`,
    [fullName],
  ) as Array<{ id: string }>
  let balance = 0
  for (const line of lines) {
    balance += line.amount
    await connection.execute(
      `INSERT INTO wallet_transactions (wallet_id, type, amount, balance_after, description, "createdAt")
       VALUES (?, ?, ?, ?, ?, NOW() - (? * INTERVAL '1 day'))`,
      [wallet.id, line.type, line.amount, balance, line.description, line.daysAgo],
    )
  }
  await connection.execute(`UPDATE wallets SET balance = ? WHERE id = ?`, [balance, wallet.id])
}

/**
 * The buyer of the « Valise du pays » video, living in France: prices in
 * euros, and a wallet topped up enough to pay a suitcase without the card page.
 */
async function seedDiasporaBuyer(em: EntityManager, passwordHash: string): Promise<void> {
  const user = await createPerson(em, { ...DEMO_DIASPORA_BUYER, role: UserRole.BUYER }, passwordHash)
  const connection = em.getConnection()
  await connection.execute(`UPDATE users SET display_currency = 'EUR' WHERE id = ?`, [user.id])
  const [wallet] = await connection.execute(
    `INSERT INTO wallets (user_id, balance, "createdAt", "updatedAt") VALUES (?, ?, NOW() - INTERVAL '3 days', NOW()) RETURNING id`,
    [user.id, DEMO_DIASPORA_BUYER.walletBalance],
  ) as Array<{ id: string }>
  // Same type and wording as a card top-up confirmed by the API.
  await connection.execute(
    `INSERT INTO wallet_transactions (wallet_id, type, amount, balance_after, description, "createdAt")
     VALUES (?, 'TOPUP', ?, ?, 'Recharge du portefeuille', NOW() - INTERVAL '3 days')`,
    [wallet.id, DEMO_DIASPORA_BUYER.walletBalance, DEMO_DIASPORA_BUYER.walletBalance],
  )
}

function slug(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

async function main(): Promise<void> {
  if (process.env.DATABASE_NAME !== 'ebio_demo') {
    throw new Error(`Refusing to seed ${process.env.DATABASE_NAME ?? '(unset)'}: this script only writes to ebio_demo`)
  }
  const orm = await MikroORM.init(createMikroOrmOptions())
  try {
    await seed(orm.em.fork() as EntityManager)
  }
  finally {
    // An open pool keeps node alive: a failure used to hang without a word.
    await orm.close()
  }
}

async function seed(em: EntityManager): Promise<void> {
  const passwordHash = await hashPassword(DEMO_PASSWORD)

  for (const table of REFERENCE_TABLES) {
    await em.getConnection().execute(`DELETE FROM "${table}"`)
    await insertRows(em, table, readSnapshot(table))
    console.info(`${table}: loaded`)
  }

  // Each shop gets a demo owner account; its own card stays as published.
  const suppliers = readSnapshot<SupplierRow>('suppliers')
  for (const supplier of suppliers) {
    const owner = await createPerson(em, {
      name: supplier.shop_name,
      email: `${slug(supplier.shop_name)}@demo.e-bio.org`,
      phone: `+22901000003${String(suppliers.indexOf(supplier)).padStart(2, '0')}`,
      role: UserRole.SUPPLIER,
    }, passwordHash)
    supplier.user_id = owner.id
  }
  await insertRows(em, 'suppliers', suppliers)
  await insertRows(em, 'products', readSnapshot('products'))
  await insertRows(em, 'product_variants', readSnapshot('product_variants'))
  // Delivery zones belong to a shop: loaded once the shops exist.
  await insertRows(em, 'delivery_zones', readSnapshot('delivery_zones'))
  console.info(`suppliers: ${suppliers.length}, products and variants loaded`)

  for (const buyer of BUYERS) {
    await createPerson(em, buyer, passwordHash)
  }
  await seedDiasporaBuyer(em, passwordHash)
  await seedValise(em)
  await createPerson(em, ADMIN, passwordHash)

  for (const spec of COURIERS) {
    const user = await createPerson(em, spec, passwordHash)
    const profile = em.create(CourierProfile, {
      user,
      fullName: spec.name,
      phone: spec.phone,
      vehicleType: spec.vehicle,
      zone: spec.zone,
      zoneLatitude: spec.latitude,
      zoneLongitude: spec.longitude,
      // No radius: the app compares it with the phone's real position and,
      // filmed far from Abomey-Calavi, warned « 4 548 km from your zone ».
      // Dispatch does not need it, the position is pinned (trigger below).
      validationStatus: ValidationStatus.VALIDATED,
      validatedAt: new Date(),
      isAvailable: spec.isAvailable,
      lastLatitude: spec.latitude,
      lastLongitude: spec.longitude,
      lastLocationAt: new Date(),
    })
    await em.flush()
    // Same raw PostGIS write as the API: the point the dispatch reads.
    await em.getConnection().execute(
      `UPDATE courier_profiles SET last_known_location = ST_SetSRID(ST_MakePoint(?, ?), 4326)::geography WHERE id = ?`,
      [spec.longitude, spec.latitude, profile.id],
    )
  }
  // The filmed courier has a few runs behind him: the wallet that closes the
  // video shows earnings, not the lone cash commission of a first run (a
  // red « solde négatif »). Same descriptions as the API writes.
  await seedCourierHistory(em, 'Rodrigue Houngbo', [
    { daysAgo: 4, type: 'DELIVERY_EARNING', amount: 720, description: 'Gain de la course, commande #EB-20261105-002' },
    { daysAgo: 3, type: 'DELIVERY_EARNING', amount: 810, description: 'Gain de la course, commande #EB-20261106-004' },
    { daysAgo: 3, type: 'TIP_EARNING', amount: 200, description: 'Pourboire reçu, commande #EB-20261106-004' },
    { daysAgo: 1, type: 'DELIVERY_EARNING', amount: 640, description: 'Gain de la course, commande #EB-20261108-001' },
  ])

  // Demo only: a courier's position stays in their zone, whatever the phone
  // sends. Filming happens far from Abomey-Calavi, and a courier located
  // 4 500 km away is offered nothing. The position the app reports never
  // matters here; the run's dispatch does.
  await em.getConnection().execute(`
    CREATE OR REPLACE FUNCTION demo_pin_courier_location() RETURNS trigger AS $$
    BEGIN
      IF NEW.zone_latitude IS NOT NULL AND NEW.zone_longitude IS NOT NULL THEN
        NEW.last_latitude := NEW.zone_latitude;
        NEW.last_longitude := NEW.zone_longitude;
        NEW.last_known_location := ST_SetSRID(ST_MakePoint(NEW.zone_longitude, NEW.zone_latitude), 4326)::geography;
      END IF;
      RETURN NEW;
    END $$ LANGUAGE plpgsql`)
  await em.getConnection().execute(`DROP TRIGGER IF EXISTS demo_pin_courier_location ON courier_profiles`)
  await em.getConnection().execute(`
    CREATE TRIGGER demo_pin_courier_location BEFORE INSERT OR UPDATE ON courier_profiles
    FOR EACH ROW EXECUTE FUNCTION demo_pin_courier_location()`)
  // Demo only: the delivery code is drawn at random at pickup, which a
  // scripted take cannot know in advance. Every code drawn is replaced by
  // DEMO_DELIVERY_CODE, so the flow types it like the buyer would say it.
  await em.getConnection().execute(`
    CREATE OR REPLACE FUNCTION demo_fixed_delivery_code() RETURNS trigger AS $$
    BEGIN
      IF NEW.confirmation_code IS NOT NULL THEN
        NEW.confirmation_code := '${DEMO_DELIVERY_CODE}';
      END IF;
      RETURN NEW;
    END $$ LANGUAGE plpgsql`)
  for (const table of ['deliveries', 'delivery_runs']) {
    await em.getConnection().execute(`DROP TRIGGER IF EXISTS demo_fixed_delivery_code ON ${table}`)
    await em.getConnection().execute(`
      CREATE TRIGGER demo_fixed_delivery_code BEFORE INSERT OR UPDATE ON ${table}
      FOR EACH ROW EXECUTE FUNCTION demo_fixed_delivery_code()`)
  }
  // The offer stays the filmed courier's for ten minutes: time to film it.
  await em.getConnection().execute(
    `INSERT INTO platform_settings (key, value) VALUES ('courier_offer_timeout_s', '600')
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
  )
  // Demo only: every one-time code drawn (SMS sign-up and login, e-mail
  // sign-up, password reset, address change) becomes DEMO_OTP_CODE, so that
  // a scripted take types it; no SMS or e-mail leaves the demo. The codes are
  // stored in plain text in `verification`, under these prefixes only: the
  // registration tokens (`reg:`) and Better Auth's own rows are left alone.
  await em.getConnection().execute(`
    CREATE OR REPLACE FUNCTION demo_fixed_otp_code() RETURNS trigger AS $$
    BEGIN
      IF NEW.identifier LIKE 'otp:%' OR NEW.identifier LIKE 'reset:%' OR NEW.identifier LIKE 'email-change:%' THEN
        NEW.value := '${DEMO_OTP_CODE}';
      END IF;
      RETURN NEW;
    END $$ LANGUAGE plpgsql`)
  await em.getConnection().execute(`DROP TRIGGER IF EXISTS demo_fixed_otp_code ON verification`)
  await em.getConnection().execute(`
    CREATE TRIGGER demo_fixed_otp_code BEFORE INSERT ON verification
    FOR EACH ROW EXECUTE FUNCTION demo_fixed_otp_code()`)
  console.info(`buyers: ${BUYERS.length + 1}, couriers: ${COURIERS.length}, admin: 1`)
  console.info(`Password for every demo account: ${DEMO_PASSWORD}`)
}

void main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})

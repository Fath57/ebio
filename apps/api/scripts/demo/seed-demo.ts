/**
 * Fills the `ebio_demo` database for the tutorial videos.
 *
 * The catalogue is the real one of the shops that agreed to appear
 * (snapshot/*.json, exported from production by export-prod-catalog.sh):
 * their own names, photos and prices. Every person is fictitious — owners'
 * accounts, buyers, couriers — with phone numbers outside any real range, so
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
import { DEMO_PASSWORD } from './demo-accounts'

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
      zoneRadiusKm: 10,
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
  console.info(`buyers: ${BUYERS.length}, couriers: ${COURIERS.length}, admin: 1`)
  console.info(`Password for every demo account: ${DEMO_PASSWORD}`)
}

void main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})

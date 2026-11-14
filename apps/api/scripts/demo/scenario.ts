/**
 * Puts the demo in the state a video starts from, through the real API, the
 * same calls as the apps, so that deliveries, courier dispatch and
 * notifications are the production ones, not hand-made rows.
 *
 *   supplier-order  a buyer orders from Mine d'or délice: the order waits,
 *                   PLACED, for the shop to accept it on camera.
 *   courier-run     a buyer orders from Mandagbe and the shop gets it ready:
 *                   the delivery is offered to the couriers nearby.
 *   valise-client   nothing to place: checks the Valise is open (France and
 *                   Belgium, one departure) and Sika Mensah's wallet.
 *   valise-supplier Sika Mensah, in France, pays a suitcase by wallet: the
 *                   FARINE TADAGBE order waits, PLACED, for the shop.
 *   auth            removes the accounts the auth take signs up, should a
 *                   take have run without a reset since.
 *
 * Run from apps/api, demo API up on 3020 (see README in this folder):
 *   DATABASE_NAME=ebio_demo npx dotenvx run -q -- npx tsx scripts/demo/scenario.ts courier-run
 */
import pg from 'pg'
import { AUTH_TAKE_ACCOUNTS, DEMO_DIASPORA_BUYER, DEMO_OTP_CODE, DEMO_PASSWORD } from './demo-accounts'

const API_URL = process.env.DEMO_API_URL ?? 'http://localhost:3020'

/** A drop-off in Abomey-Calavi, between the shops and the couriers. */
const DROP_OFF = {
  deliveryAddress: 'Carrefour Kpota, en face de la pharmacie, Abomey-Calavi',
  deliveryLatitude: 6.4446,
  deliveryLongitude: 2.3532,
}

interface ProductPick {
  productId: string
  variantId?: string
  quantity: number
}

interface CheckoutResponse {
  orders: Array<{ orderId: string, orderNumber: string }>
}

async function signIn(email: string): Promise<string> {
  const res = await fetch(`${API_URL}/api/auth/sign-in/email`, {
    method: 'POST',
    // The apps send their API URL as origin; this is the one the emulator
    // uses, its port 3010 being forwarded to the demo API.
    headers: { 'Content-Type': 'application/json', 'Origin': 'http://localhost:3010' },
    body: JSON.stringify({ email, password: DEMO_PASSWORD }),
  })
  const token = res.headers.get('set-auth-token')
  if (!res.ok || !token) {
    throw new Error(`Sign-in failed for ${email}: ${res.status} ${await res.text()}`)
  }
  return token
}

async function call<T>(token: string, method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`${method} ${path}: ${res.status} ${text}`)
  }
  return (text ? JSON.parse(text) : undefined) as T
}

function demoClient(): pg.Client {
  return new pg.Client({
    host: process.env.DATABASE_HOST,
    port: Number(process.env.DATABASE_PORT),
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    database: 'ebio_demo',
  })
}

/** The shop's products by name, with their first variant when they have some. */
async function pickProducts(shopName: string, wanted: Array<{ name: string, quantity: number }>): Promise<ProductPick[]> {
  const client = demoClient()
  await client.connect()
  try {
    const picks: ProductPick[] = []
    for (const item of wanted) {
      const { rows } = await client.query<{ id: string, variant_id: string | null }>(
        `SELECT p.id, (SELECT v.id FROM product_variants v WHERE v.product_id = p.id ORDER BY v.price_per_unit ASC LIMIT 1) AS variant_id
         FROM products p JOIN suppliers s ON s.id = p.supplier_id
         WHERE s.shop_name = $1 AND p.name = $2`,
        [shopName, item.name],
      )
      if (!rows[0]) {
        throw new Error(`${item.name} not found at ${shopName}`)
      }
      picks.push({ productId: rows[0].id, variantId: rows[0].variant_id ?? undefined, quantity: item.quantity })
    }
    return picks
  }
  finally {
    await client.end()
  }
}

async function placeOrder(buyerEmail: string, items: ProductPick[]): Promise<CheckoutResponse['orders'][number]> {
  const token = await signIn(buyerEmail)
  const checkout = await call<CheckoutResponse>(token, 'POST', '/api/orders/checkout', {
    items,
    pickupMode: 'DELIVERY',
    paymentMethod: 'CASH_ON_DELIVERY',
    deliverySlot: 'Dès que possible',
    ...DROP_OFF,
  })
  return checkout.orders[0]
}

async function supplierOrder(): Promise<void> {
  const items = await pickProducts('Mine d\'or délice', [
    { name: 'Jus d\'ananas', quantity: 2 },
    { name: 'Miel', quantity: 1 },
  ])
  const order = await placeOrder('afi@demo.e-bio.org', items)
  console.info(`Commande ${order.orderNumber} passée par Afi Dossou : elle attend Mine d'or délice.`)
  console.info('Connexion boutique : mine-d-or-delice@demo.e-bio.org')
}

async function courierRun(): Promise<void> {
  const items = await pickProducts('Mandagbe', [
    { name: 'Macédoine de légumes', quantity: 1 },
    { name: 'Tchayo séchés', quantity: 2 },
  ])
  const order = await placeOrder('kossi@demo.e-bio.org', items)
  const shopToken = await signIn('mandagbe@demo.e-bio.org')
  await call(shopToken, 'PATCH', `/api/orders/${order.orderId}/accept`)
  await call(shopToken, 'PATCH', `/api/orders/${order.orderId}/status`, { status: 'PREPARING', prepMinutes: 5 })
  await call(shopToken, 'PATCH', `/api/orders/${order.orderId}/status`, { status: 'READY' })
  console.info(`Commande ${order.orderNumber} prête chez Mandagbe : la course est proposée aux livreurs.`)
  console.info('Connexion livreur : rodrigue@demo.e-bio.org')
}

async function publicGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { headers: { Origin: 'http://localhost:3010' } })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`GET ${path}: ${res.status} ${text}`)
  }
  return JSON.parse(text) as T
}

/** The seed is the starting state: this only checks it is the one filmed. */
async function valiseClient(): Promise<void> {
  const countries = await publicGet<Array<{ code: string }>>('/api/terroir/countries')
  const token = await signIn(DEMO_DIASPORA_BUYER.email)
  const wallet = await call<{ balance: number }>(token, 'GET', '/api/wallet/me')
  console.info(`Valise ouverte vers ${countries.map(country => country.code).join(', ')}, portefeuille de Sika Mensah : ${wallet.balance} FCFA.`)
  console.info(`Connexion client : ${DEMO_DIASPORA_BUYER.email} (« Ma valise » vit dans l’app : effacer ses données pour une valise vide).`)
}

interface TerroirCheckoutResult {
  shipmentId: string
  status: string
  total: number
}

async function valiseSupplier(): Promise<void> {
  const items = [
    ...await pickProducts('FARINE TADAGBE', [
      { name: 'FARINE DE SOUCHET NATURE', quantity: 2 },
      { name: 'POUDRE DE BAOBAB', quantity: 1 },
      { name: 'BISCUITS DE SOUCHET À LA CANNELLE (sans sucre)', quantity: 2 },
    ]),
    ...await pickProducts('Naturo', [{ name: 'Farine d\'akassa', quantity: 1 }]),
  ]
  const token = await signIn(DEMO_DIASPORA_BUYER.email)
  const valise = {
    country: 'FR',
    lines: items.map(item => ({ productId: item.productId, variantId: item.variantId ?? null, quantity: item.quantity })),
    reception: 'PICKUP',
    insured: false,
    paymentMethod: 'WALLET',
  }
  // As the app: the preview names the soonest departure, the checkout takes it.
  const preview = await call<{ departureId: string | null }>(token, 'POST', '/api/terroir/checkout/preview', valise)
  if (!preview.departureId) {
    throw new Error('Aucun départ ouvert vers la France : relancer ./reset-demo.sh')
  }
  const result = await call<TerroirCheckoutResult>(token, 'POST', '/api/terroir/checkout', { ...valise, departureId: preview.departureId })
  const client = demoClient()
  await client.connect()
  try {
    const { rows } = await client.query<{ order_number: string, status: string, pickup_mode: string }>(
      `SELECT o.order_number, o.status, o.pickup_mode FROM orders o
       JOIN export_shipments es ON es.checkout_id = o.checkout_id
       JOIN suppliers s ON s.id = o.supplier_id
       WHERE es.id = $1 AND s.shop_name = 'FARINE TADAGBE'`,
      [result.shipmentId],
    )
    const order = rows[0]
    if (!order || order.status !== 'PLACED' || order.pickup_mode !== 'EXPORT') {
      throw new Error(`Commande FARINE TADAGBE inattendue : ${JSON.stringify(order ?? null)}`)
    }
    console.info(`Valise payée par Sika Mensah (${result.total} FCFA, ${result.status}) : la commande ${order.order_number} attend FARINE TADAGBE.`)
  }
  finally {
    await client.end()
  }
  console.info('Connexion boutique : farine-tadagbe@demo.e-bio.org')
}

/**
 * The auth take signs up a phone account and an e-mail account: both must be
 * new. A reset already removes them; this covers a take run without one.
 */
async function authTake(): Promise<void> {
  const client = demoClient()
  await client.connect()
  try {
    const { phone } = AUTH_TAKE_ACCOUNTS.phone
    const { email } = AUTH_TAKE_ACCOUNTS.email
    await client.query('BEGIN')
    const { rows } = await client.query<{ id: string }>(`SELECT id FROM users WHERE phone = $1 OR email = $2`, [phone, email])
    const ids = rows.map(row => row.id)
    for (const table of ['session', 'account', 'notifications', 'device_tokens']) {
      await client.query(`DELETE FROM "${table}" WHERE "userId" = ANY($1::uuid[])`, [ids])
    }
    await client.query(`DELETE FROM wallets WHERE user_id = ANY($1::uuid[])`, [ids])
    await client.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [ids])
    await client.query(`DELETE FROM verification WHERE identifier LIKE ANY($1::text[])`, [[`%:${phone}`, `%:${email}`]])
    await client.query('COMMIT')
    console.info(`Comptes de la prise auth absents (${ids.length} supprimé(s)) : ${phone}, ${email}.`)
  }
  catch (error) {
    await client.query('ROLLBACK')
    throw new Error(`Nettoyage impossible, lancer ./reset-demo.sh : ${error instanceof Error ? error.message : String(error)}`)
  }
  finally {
    await client.end()
  }
  console.info(`Code reçu par SMS ou e-mail, toujours : ${DEMO_OTP_CODE}`)
}

const SCENARIOS: Record<string, () => Promise<void>> = {
  'supplier-order': supplierOrder,
  'courier-run': courierRun,
  'valise-client': valiseClient,
  'valise-supplier': valiseSupplier,
  'auth': authTake,
}

async function main(): Promise<void> {
  const name = process.argv[2] ?? ''
  const scenario = SCENARIOS[name]
  if (!scenario) {
    throw new Error(`Scenario inconnu « ${name} ». Choix : ${Object.keys(SCENARIOS).join(', ')}`)
  }
  await scenario()
  console.info(`Mot de passe de tous les comptes de démo : ${DEMO_PASSWORD}`)
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})

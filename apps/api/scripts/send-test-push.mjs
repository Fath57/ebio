// Dev helper: sends one FCM test notification to every registered device token
// and reports the delivery result per token. Uses the API's Firebase credentials.
//   cd apps/api && ../../node_modules/.bin/dotenvx run -- node scripts/send-test-push.mjs
import process from 'node:process'
import admin from 'firebase-admin'
import pg from 'pg'

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FCM_PROJECT_ID,
    clientEmail: process.env.FCM_CLIENT_EMAIL,
    privateKey: (process.env.FCM_PRIVATE_KEY ?? '').replace(/\\n/g, '\n'),
  }),
})

const client = new pg.Client({
  host: process.env.DATABASE_HOST,
  port: Number(process.env.DATABASE_PORT ?? 5432),
  user: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE_NAME,
})
await client.connect()
const { rows } = await client.query(
  `SELECT dt.token, dt.platform, u.email, dt."createdAt" FROM device_tokens dt JOIN users u ON u.id = dt."userId" ORDER BY dt."createdAt"`,
)
for (const row of rows) {
  try {
    const id = await admin.messaging().send({
      token: row.token,
      notification: { title: 'Test eBio', body: `Notification de test reçue sur ${row.platform} (${new Date().toLocaleTimeString('fr-FR')})` },
      data: { type: 'SYSTEM' },
      android: { priority: 'high', notification: { channelId: 'ebio-default' } },
    })
    console.log(`✓ ${row.email} · ${row.token.slice(0, 12)}… (${new Date(row.createdAt).toLocaleTimeString('fr-FR')}) → ${id}`)
  }
  catch (error) {
    console.log(`✗ ${row.email} · ${row.token.slice(0, 12)}… → ${error.code ?? ''} ${error.message}`)
  }
}
await client.end()
process.exit(0)

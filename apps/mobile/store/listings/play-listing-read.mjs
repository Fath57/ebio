import { readFileSync } from 'node:fs'
import { createSign } from 'node:crypto'
const sa = JSON.parse(readFileSync('google-play-service-account.json', 'utf8'))
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url')
const now = Math.floor(Date.now() / 1000)
const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/androidpublisher', aud: sa.token_uri, iat: now, exp: now + 3600 })}`
const sig = createSign('RSA-SHA256').update(unsigned).sign(sa.private_key, 'base64url')
const tok = await (await fetch(sa.token_uri, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${unsigned}.${sig}` })).json()
const H = { authorization: `Bearer ${tok.access_token}`, 'content-type': 'application/json' }
for (const pkg of ['com.ebio.mobile', 'com.ebio.supplier', 'com.ebio.courier']) {
  const base = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${pkg}/edits`
  const edit = await (await fetch(base, { method: 'POST', headers: H, body: '{}' })).json()
  const listings = await (await fetch(`${base}/${edit.id}/listings`, { headers: H })).json()
  const details = await (await fetch(`${base}/${edit.id}/details`, { headers: H })).json()
  console.log(`\n== ${pkg} == default=${details.defaultLanguage} contact=${details.contactEmail ?? '-'} web=${details.contactWebsite ?? '-'}`)
  for (const l of listings.listings ?? []) {
    console.log(` [${l.language}] title=${JSON.stringify(l.title)} short=${JSON.stringify(l.shortDescription)} full=${(l.fullDescription ?? '').length} chars video=${l.video ?? '-'}`)
    for (const t of ['icon', 'featureGraphic', 'phoneScreenshots']) {
      const im = await (await fetch(`${base}/${edit.id}/listings/${l.language}/${t}`, { headers: H })).json()
      console.log(`   ${t}: ${(im.images ?? []).length}`)
    }
  }
  await fetch(`${base}/${edit.id}`, { method: 'DELETE', headers: H })
}

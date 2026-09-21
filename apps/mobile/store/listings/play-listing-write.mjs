import { readFileSync } from 'node:fs'
import { createSign } from 'node:crypto'
const SP = process.argv[2]
const plan = JSON.parse(readFileSync(`${SP}/listings/plan.json`, 'utf8'))
const sa = JSON.parse(readFileSync('google-play-service-account.json', 'utf8'))
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url')
const now = Math.floor(Date.now() / 1000)
const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/androidpublisher', aud: sa.token_uri, iat: now, exp: now + 3600 })}`
const sig = createSign('RSA-SHA256').update(unsigned).sign(sa.private_key, 'base64url')
const tok = await (await fetch(sa.token_uri, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${unsigned}.${sig}` })).json()
const H = { authorization: `Bearer ${tok.access_token}` }
const J = { ...H, 'content-type': 'application/json' }
const api = async (url, opts = {}) => { const r = await fetch(url, opts); const t = await r.text(); let j; try { j = JSON.parse(t) } catch { j = { raw: t.slice(0, 200) } }; if (!r.ok) throw new Error(`${opts.method ?? 'GET'} ${url.split('/edits/')[1] ?? url} -> ${r.status} ${JSON.stringify(j).slice(0, 300)}`); return j }
for (const [pkg, v] of Object.entries(plan)) {
  if (process.argv[3] && !process.argv[3].split(',').includes(pkg)) continue
  const base = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${pkg}/edits`
  const edit = await api(base, { method: 'POST', headers: J, body: '{}' })
  const E = `${base}/${edit.id}`
  await api(`${E}/listings/fr-FR`, { method: 'PUT', headers: J, body: JSON.stringify({ language: 'fr-FR', title: v.title, shortDescription: v.short, fullDescription: readFileSync(v.full, 'utf8') }) })
  const details = await api(`${E}/details`, { headers: H })
  await api(`${E}/details`, { method: 'PATCH', headers: J, body: JSON.stringify({ defaultLanguage: details.defaultLanguage ?? 'fr-FR', contactEmail: details.contactEmail || 'contact@e-bio.org', contactWebsite: details.contactWebsite || 'https://e-bio.org' }) })
  const upload = async (type, file) => api(`https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/${pkg}/edits/${edit.id}/listings/fr-FR/${type}?uploadType=media`, { method: 'POST', headers: { ...H, 'content-type': 'image/png' }, body: readFileSync(file) })
  for (const [type, file] of [['icon', `${v.assets}/icone-512x512.png`], ['featureGraphic', `${v.assets}/image-presentation-1024x500.png`]]) {
    await api(`${E}/listings/fr-FR/${type}`, { method: 'DELETE', headers: H })
    await upload(type, file)
  }
  await api(`${E}/listings/fr-FR/phoneScreenshots`, { method: 'DELETE', headers: H })
  for (const s of v.shots) await upload('phoneScreenshots', s)
  try { await api(`${E}:commit`, { method: 'POST', headers: J }) }
  catch (e) { if (!String(e).includes('changesNotSentForReview')) throw e; await api(`${E}:commit?changesNotSentForReview=true`, { method: 'POST', headers: J }) }
  console.log(`${pkg}: fiche mise à jour (${v.shots.length} captures)`)
}

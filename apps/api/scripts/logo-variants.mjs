// Generates app-specific logo variants (Fournisseur / Livreur) from the base
// eBio logo with the OpenAI Images API (gpt-image-1, edit mode).
//
// Usage (from apps/api, the key comes from .env):
//   ../../node_modules/.bin/dotenvx run -- node scripts/logo-variants.mjs [supplier|courier|all] [count]
//
// Output: ../../new-logo/variants/<variant>-<n>.png (1024x1024, transparent).
import { Buffer } from 'node:buffer'
import { openAsBlob } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const API_KEY = process.env.OPENAI_API_KEY
if (!API_KEY) {
  console.error('OPENAI_API_KEY manquante dans apps/api/.env')
  process.exit(1)
}

const ROOT = path.resolve(process.cwd(), '../../new-logo/variants')
const BASE_IMAGE = path.join(ROOT, 'base-square.png')

const COMMON = 'Keep the exact eBio logotype and leaf mark, same green tones, same proportions, centered, clean flat vector style, transparent background, no text other than the existing eBio wordmark, suitable as a mobile app icon.'

const VARIANTS = {
  supplier: `${COMMON} This is the "eBio Fournisseur" (supplier / shop owner) edition: add a small, elegant market-stall or basket-with-produce badge integrated at the bottom right of the mark, using a warm terracotta-orange accent that complements the green.`,
  courier: `${COMMON} This is the "eBio Livreur" (delivery courier) edition: add a small, elegant delivery motorbike or courier-bag badge integrated at the bottom right of the mark, using a deep blue accent that complements the green, with a subtle motion feel.`,
}

const which = process.argv[2] ?? 'all'
const count = Number(process.argv[3] ?? 2)
const targets = which === 'all' ? Object.keys(VARIANTS) : [which]

await mkdir(ROOT, { recursive: true })

for (const variant of targets) {
  const prompt = VARIANTS[variant]
  if (!prompt) {
    console.error(`Variante inconnue : ${variant}`)
    process.exit(1)
  }
  const form = new FormData()
  form.append('model', 'gpt-image-1')
  // openAsBlob yields application/octet-stream; the API insists on image/png.
  form.append('image', await openAsBlob(BASE_IMAGE, { type: 'image/png' }), 'base-square.png')
  form.append('prompt', prompt)
  form.append('n', String(count))
  form.append('size', '1024x1024')
  form.append('quality', 'medium')
  form.append('background', 'transparent')
  form.append('output_format', 'png')

  console.warn(`→ ${variant}: ${count} proposition(s)…`)
  const res = await fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST',
    headers: { Authorization: `Bearer ${API_KEY}` },
    body: form,
  })
  if (!res.ok) {
    console.error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 400)}`)
    process.exit(1)
  }
  const json = await res.json()
  for (const [i, item] of (json.data ?? []).entries()) {
    const file = path.join(ROOT, `${variant}-${i + 1}.png`)
    await writeFile(file, Buffer.from(item.b64_json, 'base64'))
    console.warn(`  ✓ ${path.relative(process.cwd(), file)}`)
  }
}

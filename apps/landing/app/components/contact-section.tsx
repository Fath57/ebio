import { useState } from 'react'
import { useFetcher } from 'react-router'

const REASONS = [
  { value: 'ACHETEUR', label: 'J’ai une question sur l’app' },
  { value: 'FOURNISSEUR', label: 'Je veux vendre sur eBio' },
  { value: 'PARTENARIAT', label: 'Partenariat' },
  { value: 'AUTRE', label: 'Autre sujet' },
]

const MESSAGE_MAX = 3000

const FIELD_CLASS
  = 'w-full rounded-lg border border-line bg-white px-4 py-3 text-ink outline-none transition-colors '
    + 'focus:border-green-600 invalid:[&:not(:placeholder-shown)]:border-coral-400'

/**
 * The contact form. Submission goes through the route action, which forwards
 * to the API server-side: the browser never needs to know where the API lives.
 * Three silent shields against bots: a honeypot field, the render timestamp
 * checked server-side, and a per-sender rate limit at the API.
 */
export function ContactSection() {
  const fetcher = useFetcher<{ ok: boolean, error?: string }>()
  // Stamped when the page renders; a submission seconds later is not human.
  const [startedAt] = useState(() => Date.now())
  const [message, setMessage] = useState('')
  const isSending = fetcher.state !== 'idle'
  const result = fetcher.data

  return (
    <section id="contact" className="scroll-mt-20 border-t border-line bg-white">
      <div className="mx-auto grid max-w-6xl gap-12 px-5 py-20 md:grid-cols-2">
        <div>
          <p className="eyebrow text-earth-600">Contact</p>
          <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-ink md:text-4xl">
            Parlons-en
          </h2>
          <p className="mt-5 max-w-md leading-relaxed text-ink-soft">
            Une question sur l’app, un projet de boutique, un partenariat ?
            Écrivez-nous, l’équipe eBio vous répond rapidement.
          </p>
        </div>
        {result?.ok
          ? (
              <div className="flex flex-col items-start justify-center rounded-2xl border border-green-200 bg-green-50 p-8">
                <p className="text-xl font-extrabold tracking-tight text-green-800">Message envoyé</p>
                <p className="mt-2 leading-relaxed text-green-800">
                  Merci, nous revenons vers vous très vite à l’adresse indiquée.
                </p>
              </div>
            )
          : (
              <fetcher.Form method="post" className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-semibold text-ink">Votre nom</span>
                    <input
                      type="text"
                      name="name"
                      required
                      minLength={2}
                      maxLength={120}
                      autoComplete="name"
                      placeholder="Prénom et nom"
                      className={FIELD_CLASS}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-semibold text-ink">Votre email</span>
                    <input
                      type="email"
                      name="email"
                      required
                      maxLength={200}
                      autoComplete="email"
                      placeholder="vous@exemple.com"
                      className={FIELD_CLASS}
                    />
                  </label>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-semibold text-ink">
                      Votre téléphone
                      {' '}
                      <span className="font-normal text-ink-faint">(facultatif)</span>
                    </span>
                    <input
                      type="tel"
                      name="phone"
                      maxLength={25}
                      pattern="[+0-9 ().-]{6,25}"
                      autoComplete="tel"
                      placeholder="+229 01 00 00 00 00"
                      title="Chiffres, espaces et indicatif international"
                      className={FIELD_CLASS}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-semibold text-ink">Vous êtes là pour</span>
                    <select name="reason" required defaultValue="ACHETEUR" className={FIELD_CLASS}>
                      {REASONS.map(reason => (
                        <option key={reason.value} value={reason.value}>{reason.label}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="block">
                  <span className="mb-1.5 flex items-baseline justify-between text-sm font-semibold text-ink">
                    Votre message
                    <span className="font-mono text-xs font-normal text-ink-faint">
                      {message.length}
                      /
                      {MESSAGE_MAX}
                    </span>
                  </span>
                  <textarea
                    name="message"
                    required
                    minLength={10}
                    maxLength={MESSAGE_MAX}
                    rows={5}
                    placeholder="Dites-nous tout…"
                    value={message}
                    onChange={event => setMessage(event.target.value)}
                    className={FIELD_CLASS}
                  />
                </label>
                {/* Honeypot: hidden from people, irresistible to bots. */}
                <input type="text" name="company" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
                <input type="hidden" name="startedAt" value={startedAt} />
                {result?.error && (
                  <p role="alert" className="rounded-lg border border-coral-400/40 bg-[#FFF0EC] px-4 py-3 text-sm font-semibold text-coral-600">
                    {result.error}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={isSending}
                  className="rounded-full bg-green-600 px-7 py-3.5 font-bold text-white transition-colors hover:bg-green-800 disabled:opacity-60"
                >
                  {isSending ? 'Envoi en cours…' : 'Envoyer le message'}
                </button>
              </fetcher.Form>
            )}
      </div>
    </section>
  )
}

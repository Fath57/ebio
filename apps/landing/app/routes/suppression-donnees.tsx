import type { Route } from './+types/suppression-donnees'
import { CONTACT_EMAIL, SITE_URL } from '@/components/constants'
import { LegalLayout } from '@/components/legal-layout'
import { fetchLandingContent } from '@/content/landing-content.server'

export async function loader() {
  return { content: await fetchLandingContent() }
}

export function meta(_args: Route.MetaArgs) {
  return [
    { title: 'Suppression de votre compte et de vos données · eBio' },
    { name: 'description', content: 'Comment demander la suppression de votre compte eBio et des données associées.' },
    { tagName: 'link', rel: 'canonical', href: `${SITE_URL}/suppression-donnees` },
  ]
}

const MAIL_SUBJECT = encodeURIComponent('Suppression de mon compte eBio')
const MAIL_BODY = encodeURIComponent(
  'Bonjour,\n\nJe demande la suppression de mon compte eBio et des données associées.\n\n'
  + 'Adresse email du compte : \n\nMerci.',
)

export default function SuppressionDonnees({ loaderData }: Route.ComponentProps) {
  return (
    <LegalLayout title="Supprimer votre compte et vos données" lastUpdated="20 août 2026" content={loaderData.content}>
      <p>
        Vous pouvez demander à tout moment la suppression de votre compte eBio
        et des données personnelles associées. La demande vaut pour l’application
        mobile comme pour le site.
      </p>

      <h2>Comment faire la demande</h2>
      <p>
        Envoyez un email à
        {' '}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        {' '}
        depuis l’adresse email liée à votre compte, avec pour objet
        « Suppression de mon compte eBio ». Le bouton ci-dessous prépare le
        message pour vous.
      </p>
      <p>
        <a
          href={`mailto:${CONTACT_EMAIL}?subject=${MAIL_SUBJECT}&body=${MAIL_BODY}`}
          className="inline-block rounded-full bg-green-600 px-7 py-3.5 font-bold text-white no-underline transition-colors hover:bg-green-800"
        >
          Demander la suppression
        </a>
      </p>
      <p>
        Nous confirmons la prise en compte de votre demande et procédons à la
        suppression dans un délai maximum de 30 jours.
      </p>

      <h2>Ce qui est supprimé</h2>
      <ul>
        <li>Votre compte et votre profil (nom, email, téléphone).</li>
        <li>Votre fiche boutique et son catalogue si vous êtes fournisseur.</li>
        <li>Vos messages, vos avis et vos favoris.</li>
        <li>Le jeton de notification de votre appareil.</li>
      </ul>

      <h2>Ce qui est conservé temporairement</h2>
      <p>
        Les données liées aux commandes et aux paiements sont conservées le temps
        des obligations comptables et fiscales, puis supprimées ou anonymisées.
        Elles ne sont plus rattachées à un compte actif.
      </p>

      <h2>Une question ?</h2>
      <p>
        Pour toute question sur vos données, écrivez-nous à
        {' '}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        {' '}
        ou consultez la
        {' '}
        <a href="/confidentialite">politique de confidentialité</a>
        .
      </p>
    </LegalLayout>
  )
}

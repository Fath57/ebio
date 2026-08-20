import type { Route } from './+types/confidentialite'
import { CONTACT_EMAIL, SITE_URL } from '@/components/constants'
import { LegalLayout } from '@/components/legal-layout'
import { fetchLandingContent } from '@/content/landing-content.server'

export async function loader() {
  return { content: await fetchLandingContent() }
}

export function meta(_args: Route.MetaArgs) {
  return [
    { title: 'Politique de confidentialité · eBio' },
    { name: 'description', content: 'Quelles données eBio collecte, pourquoi, et quels sont vos droits.' },
    { tagName: 'link', rel: 'canonical', href: `${SITE_URL}/confidentialite` },
  ]
}

export default function Confidentialite({ loaderData }: Route.ComponentProps) {
  return (
    <LegalLayout title="Politique de confidentialité" lastUpdated="20 août 2026" content={loaderData.content}>
      <p>
        Cette politique explique quelles données personnelles eBio collecte
        lorsque vous utilisez l’application et le site e-bio.org, pourquoi nous
        les collectons et quels sont vos droits. Le responsable de traitement est
        eBio, joignable à
        {' '}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        .
      </p>

      <h2>1. Les données que nous collectons</h2>
      <ul>
        <li>
          <strong>Compte</strong>
          {' '}
          : nom, adresse email, numéro de téléphone, mot de passe (chiffré) ou
          identifiant Google si vous vous connectez avec Google.
        </li>
        <li>
          <strong>Fiche boutique (fournisseurs)</strong>
          {' '}
          : nom de la boutique, description, photos, position géographique,
          horaires, pièces justificatives fournies pour la validation.
        </li>
        <li>
          <strong>Position</strong>
          {' '}
          : avec votre autorisation, votre position sert à afficher les boutiques
          proches de vous. Vous pouvez la refuser dans les réglages du téléphone,
          la recherche par ville reste possible.
        </li>
        <li>
          <strong>Activité</strong>
          {' '}
          : commandes, paniers, avis, messages échangés avec les boutiques,
          notifications.
        </li>
        <li>
          <strong>Paiement</strong>
          {' '}
          : les paiements Mobile Money sont traités par notre prestataire de
          paiement. Nous ne stockons pas vos codes ni vos identifiants Mobile
          Money, nous conservons uniquement la référence et le statut de la
          transaction.
        </li>
        <li>
          <strong>Données techniques</strong>
          {' '}
          : modèle d’appareil, version de l’app, journaux techniques et jeton de
          notification push.
        </li>
      </ul>

      <h2>2. Pourquoi nous les utilisons</h2>
      <ul>
        <li>Fournir le service : compte, carte des boutiques, commandes, messagerie.</li>
        <li>Traiter les paiements et prévenir la fraude.</li>
        <li>Vous envoyer les notifications liées à vos commandes, avec votre accord.</li>
        <li>Valider les boutiques et maintenir la confiance sur la plateforme.</li>
        <li>Assurer la sécurité du service et répondre à nos obligations légales.</li>
      </ul>
      <p>
        Ces traitements reposent sur l’exécution du contrat qui nous lie
        (fournir le service que vous demandez), sur votre consentement pour la
        position et les notifications, et sur nos obligations légales pour la
        conservation des données de facturation.
      </p>

      <h2>3. Avec qui elles sont partagées</h2>
      <ul>
        <li>Les fournisseurs voient les informations nécessaires à vos commandes : votre nom, votre commande et l’adresse de livraison si vous choisissez la livraison.</li>
        <li>Nos prestataires techniques : hébergement des serveurs et des images, prestataire de paiement Mobile Money, service d’envoi de notifications. Ils traitent les données pour notre compte et ne peuvent pas les utiliser à d’autres fins.</li>
        <li>Les autorités, uniquement lorsque la loi nous y oblige.</li>
      </ul>
      <p>Nous ne vendons jamais vos données personnelles.</p>

      <h2>4. Où elles sont hébergées</h2>
      <p>
        Nos serveurs et nos prestataires d’hébergement sont situés notamment en
        Europe et aux États-Unis. Nous choisissons des prestataires offrant des
        garanties de sécurité et de confidentialité reconnues.
      </p>

      <h2>5. Combien de temps nous les gardons</h2>
      <ul>
        <li>Données de compte : tant que votre compte est actif.</li>
        <li>Commandes et transactions : le temps des obligations comptables et fiscales.</li>
        <li>Messages : tant que la conversation existe dans votre compte.</li>
        <li>Après suppression du compte, les données sont effacées ou anonymisées, hors durées légales de conservation.</li>
      </ul>

      <h2>6. Vos droits</h2>
      <p>
        Conformément à la loi n° 2017-20 du 20 avril 2018 portant code du
        numérique en République du Bénin, vous disposez d’un droit d’accès, de
        rectification, de suppression et d’opposition sur vos données. Pour
        l’exercer, écrivez-nous à
        {' '}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        {' '}
        ou utilisez la page
        {' '}
        <a href="/suppression-donnees">suppression des données</a>
        . Vous pouvez aussi saisir l’Autorité de Protection des Données
        Personnelles (APDP) du Bénin.
      </p>

      <h2>7. Sécurité</h2>
      <p>
        Les échanges entre l’app et nos serveurs sont chiffrés. L’accès aux
        données est limité aux personnes qui en ont besoin pour faire fonctionner
        le service. Les pièces justificatives des fournisseurs sont stockées dans
        un espace privé, non accessible publiquement.
      </p>

      <h2>8. Cookies</h2>
      <p>
        Le site e-bio.org n’utilise pas de cookies de suivi publicitaire.
        L’application utilise uniquement le stockage nécessaire à son
        fonctionnement, comme votre session de connexion.
      </p>

      <h2>9. Mineurs</h2>
      <p>Le service s’adresse aux personnes majeures.</p>

      <h2>10. Évolution de cette politique</h2>
      <p>
        Si cette politique évolue de façon importante, nous vous en informerons
        dans l’app avant l’entrée en vigueur des changements.
      </p>
    </LegalLayout>
  )
}

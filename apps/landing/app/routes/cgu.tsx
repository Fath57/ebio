import type { Route } from './+types/cgu'
import { CONTACT_EMAIL, SITE_URL } from '@/components/constants'
import { LegalLayout } from '@/components/legal-layout'
import { fetchLandingContent } from '@/content/landing-content.server'

export async function loader() {
  return { content: await fetchLandingContent() }
}

export function meta(_args: Route.MetaArgs) {
  return [
    { title: 'Conditions générales d’utilisation · eBio' },
    { name: 'description', content: 'Les règles d’utilisation de l’application et des services eBio.' },
    { tagName: 'link', rel: 'canonical', href: `${SITE_URL}/cgu` },
  ]
}

export default function Cgu({ loaderData }: Route.ComponentProps) {
  return (
    <LegalLayout title="Conditions générales d’utilisation" lastUpdated="20 août 2026" content={loaderData.content}>
      <h2>1. Objet</h2>
      <p>
        Les présentes conditions encadrent l’utilisation de l’application mobile eBio
        et du site e-bio.org (ensemble, « le service »), édités par eBio
        (« l’éditeur »), joignable à
        {' '}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        . En créant un compte ou en utilisant le service, vous acceptez ces conditions.
      </p>

      <h2>2. Ce qu’est eBio</h2>
      <p>
        eBio est une place de marché qui met en relation des acheteurs avec des
        producteurs, transformateurs et boutiques de produits locaux et bio
        (« les fournisseurs »), géolocalisés autour de vous. Les produits sont
        vendus par les fournisseurs, pas par l’éditeur. Chaque fournisseur reste
        responsable de ses produits, de leurs prix, de leur qualité et de leur
        conformité.
      </p>

      <h2>3. Compte</h2>
      <ul>
        <li>La création d’un compte se fait avec une adresse email ou un compte Google.</li>
        <li>Vous vous engagez à fournir des informations exactes et à les tenir à jour.</li>
        <li>Le service est réservé aux personnes majeures.</li>
        <li>Vous êtes responsable de la confidentialité de vos identifiants.</li>
      </ul>

      <h2>4. Boutiques et badge « Validé eBio »</h2>
      <p>
        Chaque boutique est vérifiée par l’équipe eBio avant d’être visible sur la
        carte. Cette vérification porte sur l’identité du fournisseur et la
        cohérence de sa fiche boutique. Elle ne constitue pas une certification
        des produits ni une garantie de l’éditeur. Une boutique qui ne respecte
        plus les règles du service peut être suspendue et retirée du catalogue.
      </p>

      <h2>5. Commandes, prix et paiement</h2>
      <ul>
        <li>Les prix sont affichés en francs CFA (FCFA), toutes taxes comprises.</li>
        <li>Le total, frais de livraison compris, est affiché avant la confirmation de commande.</li>
        <li>Le paiement se fait par Mobile Money (MTN, Moov) via un prestataire de paiement, ou en espèces à la remise selon la boutique.</li>
        <li>Les frais de livraison sont fixés par chaque boutique et lui sont reversés en intégralité.</li>
      </ul>

      <h2>6. Livraison et retrait</h2>
      <p>
        Selon la boutique, vous choisissez la livraison ou le retrait sur place.
        La remise des produits est convenue entre vous et le fournisseur, qui en
        assure l’exécution. En cas de difficulté, la messagerie de l’app permet
        d’échanger directement avec la boutique, et notre équipe peut être
        contactée à
        {' '}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        .
      </p>

      <h2>7. Avis et contenus</h2>
      <p>
        Les avis doivent refléter une expérience réelle d’achat. Sont interdits
        les contenus trompeurs, injurieux, discriminatoires ou contraires à la
        loi. L’éditeur peut retirer un contenu signalé et suspendre le compte de
        son auteur en cas d’abus.
      </p>

      <h2>8. Règles pour les fournisseurs</h2>
      <ul>
        <li>Ne proposer que des produits que vous êtes en droit de vendre.</li>
        <li>Décrire les produits de façon exacte, photos comprises.</li>
        <li>Honorer les commandes acceptées et respecter les horaires annoncés.</li>
        <li>eBio prélève une commission sur les produits vendus, jamais sur les frais de livraison. Aucun abonnement : l’inscription et l’usage de la plateforme sont gratuits.</li>
      </ul>

      <h2>9. Responsabilité</h2>
      <p>
        L’éditeur met tout en œuvre pour assurer la disponibilité du service,
        sans pouvoir la garantir en permanence. L’éditeur n’est pas partie au
        contrat de vente conclu entre l’acheteur et le fournisseur et ne saurait
        être tenu responsable des produits vendus. Votre recours en cas de litige
        sur un produit s’exerce d’abord auprès du fournisseur concerné.
      </p>

      <h2>10. Propriété intellectuelle</h2>
      <p>
        La marque eBio, le logo, l’application et le site sont protégés. Les
        photos et contenus publiés par les fournisseurs restent leur propriété ;
        en les publiant, ils autorisent leur affichage dans le service.
      </p>

      <h2>11. Données personnelles</h2>
      <p>
        Le traitement de vos données est décrit dans la
        {' '}
        <a href="/confidentialite">politique de confidentialité</a>
        . Vous pouvez demander la suppression de votre compte et de vos données à
        tout moment depuis la page
        {' '}
        <a href="/suppression-donnees">suppression des données</a>
        .
      </p>

      <h2>12. Modification des conditions</h2>
      <p>
        L’éditeur peut faire évoluer ces conditions. En cas de changement
        important, vous en serez informé dans l’app. La poursuite de
        l’utilisation du service vaut acceptation des conditions mises à jour.
      </p>

      <h2>13. Droit applicable</h2>
      <p>
        Les présentes conditions sont régies par le droit béninois, notamment la
        loi n° 2017-20 du 20 avril 2018 portant code du numérique en République
        du Bénin. Tout litige qui ne trouverait pas de solution amiable relève
        des juridictions compétentes de Cotonou.
      </p>
    </LegalLayout>
  )
}

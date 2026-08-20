/**
 * Shape of the editable content, mirrored from the API's landing contracts.
 * `DEFAULT_CONTENT` is the launch copy and the safety net: when the API is
 * unreachable, the landing renders these texts instead of failing.
 */

export interface LandingHero {
  eyebrow: string
  title: string
  highlight: string
  subtitle: string
  footnote: string
}

export interface LandingStores {
  playStoreUrl: string | null
  appStoreUrl: string | null
  comingSoonTitle: string
  comingSoonBody: string
}

export interface LandingTrustPoint {
  title: string
  body: string
}

export interface LandingStep {
  title: string
  body: string
}

export interface LandingSupplier {
  eyebrow: string
  title: string
  body: string
  points: string[]
  ctaLabel: string
}

export interface LandingFooter {
  tagline: string
  contactEmail: string
  bottomLine: string
}

export interface LandingFaqItem {
  question: string
  answer: string
}

export interface LandingContent {
  hero: LandingHero
  stores: LandingStores
  trust: { points: LandingTrustPoint[] }
  steps: { eyebrow: string, title: string, steps: LandingStep[] }
  supplier: LandingSupplier
  footer: LandingFooter
  faq: LandingFaqItem[]
}

export const DEFAULT_CONTENT: LandingContent = {
  hero: {
    eyebrow: 'Produits locaux & bio',
    title: 'Des produits locaux et bio, près de chez vous.',
    highlight: 'locaux et bio',
    subtitle: 'eBio met sur la carte les producteurs, transformateurs et boutiques bio autour de vous. Commandez, payez par Mobile Money, faites-vous livrer ou passez retirer à la boutique.',
    footnote: 'Gratuit · Cotonou d’abord, le Bénin ensuite',
  },
  stores: {
    playStoreUrl: null,
    appStoreUrl: null,
    comingSoonTitle: 'Bientôt disponible',
    comingSoonBody: 'L’application eBio arrive très bientôt sur Google Play et l’App Store. Encore un peu de patience, les boutiques préparent déjà leurs étals.',
  },
  trust: {
    points: [
      {
        title: 'Validé eBio',
        body: 'Chaque boutique est vérifiée par l’équipe eBio avant d’apparaître sur l’app. Vous commandez tranquille, chez des fournisseurs bien identifiés.',
      },
      {
        title: 'Paiement Mobile Money',
        body: 'Vous payez directement dans l’app avec MTN Money ou Moov Money. Si vous préférez, vous pouvez aussi payer en espèces à la remise.',
      },
      {
        title: 'Livraison ou retrait',
        body: 'Vous choisissez ce qui vous arrange : livraison à domicile ou retrait à la boutique. C’est vous qui décidez au moment de commander.',
      },
    ],
  },
  steps: {
    eyebrow: 'Côté acheteur',
    title: 'Du marché à votre table, en trois gestes',
    steps: [
      {
        title: 'Cherchez autour de vous',
        body: 'Ouvrez la carte : les boutiques Validé eBio s’affichent autour de votre position, avec leurs produits, leurs prix et leurs horaires. Chaque boutique est vérifiée avant d’apparaître.',
      },
      {
        title: 'Commandez en quelques gestes',
        body: 'Composez votre panier, choisissez livraison ou retrait à la boutique, puis payez par Mobile Money ou à la remise. Le total est annoncé avant de confirmer, frais de livraison compris.',
      },
      {
        title: 'Récupérez vos produits',
        body: 'Suivez votre commande jusqu’à la remise et échangez avec le fournisseur directement dans l’app si besoin. Notez la boutique une fois servi : c’est ce qui fait vivre la confiance.',
      },
    ],
  },
  supplier: {
    eyebrow: 'Producteurs & transformateurs',
    title: 'Votre étal, visible de toute la ville',
    body: 'Huiles, jus, farines, confitures, légumes : vous produisez ou vous transformez, eBio vous donne des clients au-delà de votre quartier, sans rien installer à part l’app.',
    points: [
      'Votre fiche boutique, votre position sur la carte et vos horaires',
      'Votre catalogue et vos stocks, gérés depuis le téléphone',
      'Les commandes et les discussions acheteurs au même endroit',
      'Vos frais de livraison, fixés par vous, reversés en intégralité',
    ],
    ctaLabel: 'Créer ma boutique',
  },
  footer: {
    tagline: 'Des produits locaux et bio, près de chez vous. La carte des producteurs et transformateurs du Bénin.',
    contactEmail: 'contact@e-bio.org',
    bottomLine: 'eBio · Cotonou, Bénin',
  },
  faq: [
    {
      question: 'Dans quelles villes eBio est-il disponible ?',
      answer: 'eBio démarre à Cotonou et s’étend au Bénin. La carte vous montre ce qui existe réellement autour de vous : plus les producteurs et transformateurs rejoignent la plateforme, plus elle se remplit.',
    },
    {
      question: 'Comment les boutiques sont-elles validées ?',
      answer: 'Chaque fournisseur soumet sa fiche boutique et ses pièces. L’équipe eBio vérifie avant de rendre la boutique visible : c’est le badge « Validé eBio ». Une boutique qui ne respecte plus les règles est suspendue et disparaît du catalogue.',
    },
    {
      question: 'Comment se passe le paiement ?',
      answer: 'Par Mobile Money (MTN, Moov) directement dans l’app, ou en espèces à la remise selon la boutique. Le total des produits et de la livraison est affiché avant que vous confirmiez la commande.',
    },
    {
      question: 'Combien ça coûte pour un fournisseur ?',
      answer: 'L’inscription est gratuite et le plan de départ permet déjà de vendre. Des plans payants existent pour les catalogues plus grands. eBio prélève une commission sur les produits vendus, jamais sur vos frais de livraison.',
    },
  ],
}

/**
 * Overlays what the API returned onto the defaults, section by section. A
 * missing or malformed section falls back whole; the page never renders a
 * half-empty block because one key was absent.
 */
export function mergeContent(remote: unknown): LandingContent {
  if (!remote || typeof remote !== 'object') {
    return DEFAULT_CONTENT
  }
  const data = remote as Record<string, unknown>
  return {
    hero: pick(data.hero, DEFAULT_CONTENT.hero),
    stores: pick(data.stores, DEFAULT_CONTENT.stores),
    trust: pick(data.trust, DEFAULT_CONTENT.trust),
    steps: pick(data.steps, DEFAULT_CONTENT.steps),
    supplier: pick(data.supplier, DEFAULT_CONTENT.supplier),
    footer: pick(data.footer, DEFAULT_CONTENT.footer),
    faq: Array.isArray(data.faq) && data.faq.length > 0
      ? (data.faq as LandingFaqItem[])
      : DEFAULT_CONTENT.faq,
  }
}

function pick<T>(value: unknown, fallback: T): T {
  return value && typeof value === 'object' ? value as T : fallback
}

import type { IllustrationSpec } from './illustration-slot'

/**
 * Manifest of every generated illustration the page expects. To replace one,
 * drop the WebP in public/illustrations/ under the exact name — the matching
 * generation prompt is in ILLUSTRATIONS.md.
 */
export const ILLUSTRATIONS = {
  hero: {
    file: 'etape-chercher.webp',
    alt: 'Une acheteuse consulte son téléphone dans une rue de marché de Cotonou, des boutiques bio épinglées autour d’elle',
    available: true,
  },
  step1: {
    file: 'etape-carte.webp',
    alt: 'Une main tient un téléphone affichant la carte des boutiques bio du quartier, un marché en arrière-plan',
    available: true,
  },
  step2: {
    file: 'etape-commander.webp',
    alt: 'Un panier de produits bio se remplit dans l’app, paiement Mobile Money à l’écran',
    available: true,
  },
  step3: {
    file: 'etape-recuperer.webp',
    alt: 'Une maraîchère remet un panier de légumes bio à son acheteuse devant sa boutique',
    available: true,
  },
  supplier: {
    file: 'transformatrice-atelier.webp',
    alt: 'Dans son atelier, une transformatrice embouteille du jus d’ananas frais ; ses bocaux et huiles remplissent les étagères',
    available: true,
  },
} satisfies Record<string, IllustrationSpec>

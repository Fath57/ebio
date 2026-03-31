import type { LucideIcon } from 'lucide-react-native'
import Apple from 'lucide-react-native/dist/esm/icons/apple'
import Carrot from 'lucide-react-native/dist/esm/icons/carrot'
import CupSoda from 'lucide-react-native/dist/esm/icons/cup-soda'
import Droplets from 'lucide-react-native/dist/esm/icons/droplets'
import Flame from 'lucide-react-native/dist/esm/icons/flame'
import Package from 'lucide-react-native/dist/esm/icons/package'
import Recycle from 'lucide-react-native/dist/esm/icons/recycle'
import Sprout from 'lucide-react-native/dist/esm/icons/sprout'
import Wheat from 'lucide-react-native/dist/esm/icons/wheat'

/** Fallback Lucide icons when category has no imageUrl */
const ICON_MAP: Record<string, LucideIcon> = {
  huiles: Droplets,
  cereales: Wheat,
  legumes: Carrot,
  semences: Sprout,
  compost: Recycle,
  fruits: Apple,
  epices: Flame,
  boissons: CupSoda,
  autres: Package,
}

export function getCategoryFallbackIcon(slug: string): LucideIcon {
  return ICON_MAP[slug] ?? Package
}

export interface CategoryItem {
  id: string
  label: string
  slug: string
  imageUrl: string | null
  fallbackIcon: LucideIcon
}

/** Fallback categories when API is unreachable */
export const FALLBACK_CATEGORIES: CategoryItem[] = [
  { id: 'huiles', label: 'Huiles', slug: 'huiles', imageUrl: null, fallbackIcon: Droplets },
  { id: 'cereales', label: 'Céréales & Farines', slug: 'cereales', imageUrl: null, fallbackIcon: Wheat },
  { id: 'legumes', label: 'Légumes & Fruits', slug: 'legumes', imageUrl: null, fallbackIcon: Carrot },
  { id: 'semences', label: 'Semences', slug: 'semences', imageUrl: null, fallbackIcon: Sprout },
  { id: 'compost', label: 'Compost & Engrais', slug: 'compost', imageUrl: null, fallbackIcon: Recycle },
  { id: 'epices', label: 'Épices & Condiments', slug: 'epices', imageUrl: null, fallbackIcon: Flame },
  { id: 'boissons', label: 'Boissons', slug: 'boissons', imageUrl: null, fallbackIcon: CupSoda },
  { id: 'autres', label: 'Autres', slug: 'autres', imageUrl: null, fallbackIcon: Package },
]

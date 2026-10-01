/** One product card of the "Déjà sur eBio" showcase. */
export interface FeaturedProduct {
  id: string
  name: string
  photo: string
  shopName: string
  price: number
  /** The struck-through price, only when a promotion really lowers it. */
  originalPrice: number | null
  unitLabel: string
}

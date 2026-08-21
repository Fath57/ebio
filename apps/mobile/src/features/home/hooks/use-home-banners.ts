import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../../../utils/api-client'

export interface HomeBanner {
  id: string
  title: string
  subtitle: string | null
  imageUrl: string
  targetType: 'SUPPLIER' | 'PRODUCT' | 'URL' | 'NONE'
  targetId: string | null
  targetUrl: string | null
}

/**
 * Bannières éditoriales de l'accueil, pilotées depuis le back-office. L'API ne
 * renvoie que les bannières actives dont la cible existe encore, déjà triées.
 * En cas d'échec on rend un tableau vide : l'accueil bascule alors sur son
 * repli automatique plutôt que d'afficher une section cassée.
 */
export function useHomeBanners(): { banners: HomeBanner[], loading: boolean } {
  const [banners, setBanners] = useState<HomeBanner[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const res = await apiFetch('/api/banners/active')
      if (res.ok) {
        setBanners((await res.json()) as HomeBanner[])
      }
    }
    catch {
      // Repli silencieux — voir le commentaire ci-dessus.
    }
    finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return { banners, loading }
}

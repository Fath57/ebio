import { useCallback, useEffect, useState } from 'react'
import { OfflineCache, storage } from '../../../utils/offline-storage'

export function useOfflineSearch() {
  const [searchHistory, setSearchHistory] = useState<string[]>([])

  const loadHistory = useCallback(async () => {
    const history = await OfflineCache.getSearchHistory()
    setSearchHistory(history)
  }, [])

  useEffect(() => {
    loadHistory()
  }, [loadHistory])

  const addTerm = useCallback(
    async (term: string) => {
      await OfflineCache.addSearchTerm(term)
      await loadHistory()
    },
    [loadHistory],
  )

  const clearHistory = useCallback(() => {
    storage.delete('search_history')
    setSearchHistory([])
  }, [])

  const removeTerm = useCallback(
    (term: string) => {
      const updated = searchHistory.filter(t => t !== term)
      storage.set('search_history', JSON.stringify(updated))
      setSearchHistory(updated)
    },
    [searchHistory],
  )

  return { searchHistory, addTerm, clearHistory, removeTerm, loadHistory }
}

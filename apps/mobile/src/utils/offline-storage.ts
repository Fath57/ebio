import AsyncStorage from '@react-native-async-storage/async-storage'

// Key-value cache using AsyncStorage (compatible with all RN environments)
// Can be replaced with MMKV for better performance in production builds

export const OfflineCache = {
  async getSearchHistory(): Promise<string[]> {
    const raw = await AsyncStorage.getItem('search_history')
    return raw ? JSON.parse(raw) : []
  },

  async addSearchTerm(term: string): Promise<void> {
    const history = await this.getSearchHistory()
    const updated = [term, ...history.filter(t => t !== term)].slice(0, 20)
    await AsyncStorage.setItem('search_history', JSON.stringify(updated))
  },

  async getCachedResults(key: string): Promise<unknown | null> {
    const raw = await AsyncStorage.getItem(`cache:${key}`)
    if (!raw)
      return null
    const { data, expiresAt } = JSON.parse(raw)
    if (Date.now() > expiresAt) {
      await AsyncStorage.removeItem(`cache:${key}`)
      return null
    }
    return data
  },

  async setCachedResults(key: string, data: unknown, ttlMs = 5 * 60 * 1000): Promise<void> {
    await AsyncStorage.setItem(`cache:${key}`, JSON.stringify({
      data,
      expiresAt: Date.now() + ttlMs,
    }))
  },

  async clearAll(): Promise<void> {
    await AsyncStorage.clear()
  },
}

// Simple sync key-value for non-async contexts (biometric keys, device IDs)
export const storage = {
  getString(key: string): string | null {
    // In RN, we need async — provide a sync wrapper via a cache
    // This is populated at app startup
    return storageCache.get(key) ?? null
  },
  set(key: string, value: string): void {
    storageCache.set(key, value)
    AsyncStorage.setItem(`sync:${key}`, value)
  },
  delete(key: string): void {
    storageCache.delete(key)
    AsyncStorage.removeItem(`sync:${key}`)
  },
}

const storageCache = new Map<string, string>()

// Call at app startup to hydrate sync cache
export async function hydrateStorageCache(): Promise<void> {
  const keys = await AsyncStorage.getAllKeys()
  const syncKeys = keys.filter(k => k.startsWith('sync:'))
  for (const key of syncKeys) {
    const value = await AsyncStorage.getItem(key)
    if (value)
      storageCache.set(key.replace('sync:', ''), value)
  }
}

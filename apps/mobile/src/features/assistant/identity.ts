import type { ImageSourcePropType } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { useCallback, useState } from 'react'
import { apiFetch } from '../../utils/api-client'
import { ASSISTANT_AVATAR } from './avatar'

export interface AssistantIdentity {
  /** The name she answers to, and the one every label says. */
  name: string
  /** Her portrait: the one the back-office set, or the one we ship. */
  avatar: ImageSourcePropType
}

/**
 * What she is called and what she looks like, until the server says otherwise.
 *
 * These are the values the app has always used, so a phone that cannot reach
 * the settings shows exactly what it showed before rather than a blank.
 */
export const DEFAULT_ASSISTANT_IDENTITY: AssistantIdentity = {
  name: 'Assita',
  avatar: ASSISTANT_AVATAR,
}

/**
 * Held between screens so the header, the conversation and the speaking
 * indicator agree with each other without each fetching the same row.
 */
let cached: AssistantIdentity = DEFAULT_ASSISTANT_IDENTITY

interface PublicSettings {
  assistantName?: string
  assistantAvatarUrl?: string | null
}

/**
 * Her name and her face, refreshed whenever a screen comes back into focus.
 *
 * Renaming her in the back-office has to show up without a new build — the
 * whole point of making it a setting. A failed request keeps the last known
 * values: a name that flickers to a placeholder is worse than one slightly out
 * of date.
 */
export function useAssistantIdentity(): AssistantIdentity {
  const [identity, setIdentity] = useState<AssistantIdentity>(cached)

  useFocusEffect(
    useCallback(() => {
      let cancelled = false
      async function load(): Promise<void> {
        try {
          const res = await apiFetch('/api/settings/public')
          if (!res.ok || cancelled) {
            return
          }
          const data = await res.json() as PublicSettings
          const next: AssistantIdentity = {
            name: data.assistantName?.trim() || DEFAULT_ASSISTANT_IDENTITY.name,
            // A null url is not a missing setting: it means the portrait that
            // ships with the app, which is what she has always worn.
            avatar: data.assistantAvatarUrl
              ? { uri: data.assistantAvatarUrl }
              : DEFAULT_ASSISTANT_IDENTITY.avatar,
          }
          cached = next
          setIdentity(next)
        }
        catch {
          // Keep what we knew: a hiccup must not rename her mid-conversation.
        }
      }
      load()
      return () => {
        cancelled = true
      }
    }, []),
  )

  return identity
}

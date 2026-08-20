import type { LandingSectionKey } from './site-queries'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { updateLandingSection } from './site-queries'

/**
 * Local editing state of one landing section: the admin types, then saves the
 * whole document. Each card owns its editor, so saving one section never
 * touches the others.
 */
export function useSectionEditor<T>(key: LandingSectionKey, initial: T) {
  const queryClient = useQueryClient()
  const [value, setValue] = useState<T>(initial)
  const [isSaved, setIsSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { mutate, isPending } = useMutation({
    mutationFn: () => updateLandingSection(key, value),
    onSuccess: () => {
      setIsSaved(true)
      queryClient.invalidateQueries({ queryKey: ['admin', 'landing', 'content'] })
    },
    onError: (mutationError: Error) => setError(mutationError.message),
  })

  function update(patch: Partial<T>): void {
    setIsSaved(false)
    setError(null)
    setValue(current => ({ ...current, ...patch }))
  }

  function save(): void {
    setError(null)
    mutate()
  }

  return { value, update, save, isSaving: isPending, isSaved, error }
}

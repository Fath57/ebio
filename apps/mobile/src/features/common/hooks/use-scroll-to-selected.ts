import type { LayoutChangeEvent, ScrollView } from 'react-native'
import { useCallback, useEffect, useRef } from 'react'

/** Room left before the selected item, so that its neighbour still shows. */
const LEADING_GAP = 24

/**
 * Keeps the selected item of a horizontal row in view.
 *
 * A category picked elsewhere, a suggestion, the filter panel, a home tile,
 * was marked active in a chip scrolled off to the right: selected, and
 * invisible. The row now scrolls to it whenever the selection changes, and on
 * first layout when the screen opens with one already selected.
 */
export function useScrollToSelected(selectedKey: string | undefined) {
  const scrollRef = useRef<ScrollView>(null)
  const positions = useRef(new Map<string, number>())
  const selectedRef = useRef(selectedKey)
  selectedRef.current = selectedKey

  const scrollTo = useCallback((key: string | undefined, animated: boolean) => {
    if (!key) {
      scrollRef.current?.scrollTo({ x: 0, animated })
      return
    }
    const x = positions.current.get(key)
    if (x !== undefined) {
      scrollRef.current?.scrollTo({ x: Math.max(0, x - LEADING_GAP), animated })
    }
  }, [])

  useEffect(() => {
    scrollTo(selectedKey, true)
  }, [selectedKey, scrollTo])

  /** Record where each item sits; scroll once the selected one is laid out. */
  const onItemLayout = useCallback((key: string) => (event: LayoutChangeEvent) => {
    positions.current.set(key, event.nativeEvent.layout.x)
    if (key === selectedRef.current) {
      scrollTo(key, false)
    }
  }, [scrollTo])

  return { scrollRef, onItemLayout }
}

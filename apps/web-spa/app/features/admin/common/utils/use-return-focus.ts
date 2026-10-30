import { useRef } from 'react'

/**
 * A dialog opened from state (no `DialogTrigger`) has nothing for Radix to
 * hand focus back to: closing it drops a keyboard user at the top of the page.
 *
 * Remembers whatever held focus when `open` turned true and returns the
 * `onCloseAutoFocus` handler that puts it back — unless that element left the
 * page meanwhile (its row was resolved), where the default behaviour stays.
 */
export function useReturnFocus(open: boolean): (event: Event) => void {
  const trigger = useRef<HTMLElement | null>(null)
  const wasOpen = useRef(false)

  // Read during render: by the time an effect runs, Radix has already moved focus into the dialog.
  if (open && !wasOpen.current && typeof document !== 'undefined')
    trigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
  wasOpen.current = open

  return (event: Event) => {
    const target = trigger.current
    if (target?.isConnected) {
      event.preventDefault()
      target.focus()
    }
  }
}

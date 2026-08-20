import { useEffect } from 'react'
import { LeafPin } from './leaf-pin'

interface ComingSoonModalProps {
  open: boolean
  onClose: () => void
  title: string
  body: string
}

/**
 * Shown instead of the store pages while the app awaits publication. The
 * download badges stay on the page so the layout is final; only this modal
 * will go when the real links arrive.
 */
export function ComingSoonModal({ open, onClose, title, body }: ComingSoonModalProps) {
  useEffect(() => {
    if (!open) {
      return
    }
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        onClose()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    // The page behind must not scroll while the modal is up.
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) {
    return null
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 px-5"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="coming-soon-title"
        className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-xl"
        onClick={event => event.stopPropagation()}
      >
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-50">
          <LeafPin size={36} />
        </div>
        <h2 id="coming-soon-title" className="mt-5 text-2xl font-extrabold tracking-tight text-ink">
          {title}
        </h2>
        <p className="mt-3 leading-relaxed text-ink-soft">{body}</p>
        <button
          type="button"
          onClick={onClose}
          className="mt-7 w-full rounded-full bg-green-600 px-6 py-3.5 font-bold text-white transition-colors hover:bg-green-800"
        >
          Compris
        </button>
      </div>
    </div>
  )
}

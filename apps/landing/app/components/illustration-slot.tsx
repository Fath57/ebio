import { LeafPin } from './leaf-pin'

export interface IllustrationSpec {
  /** File name expected under /illustrations once generated. */
  file: string
  alt: string
  /** Flip to true after dropping the generated file in public/illustrations. */
  available: boolean
}

/**
 * Where the generated illustrations land. Until a file is delivered the slot
 * shows a designed placeholder rather than a broken image, so the page ships
 * before the artwork does. The generation prompts live in
 * apps/landing/ILLUSTRATIONS.md, one per slot.
 */
export function IllustrationSlot({ spec, className = '' }: { spec: IllustrationSpec, className?: string }) {
  if (spec.available) {
    return (
      <img
        src={`/illustrations/${spec.file}`}
        alt={spec.alt}
        loading="lazy"
        className={`w-full rounded-2xl border border-line object-cover shadow-[0_2px_8px_rgba(0,0,0,0.06)] ${className}`}
      />
    )
  }

  return (
    <div
      role="img"
      aria-label={spec.alt}
      className={`flex aspect-[4/3] w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-line bg-earth-50 ${className}`}
    >
      <LeafPin size={40} color="var(--color-earth-400)" />
      <p className="text-sm font-semibold text-earth-600">Illustration à venir</p>
      <p className="font-mono text-[11px] text-ink-faint">{spec.file}</p>
    </div>
  )
}

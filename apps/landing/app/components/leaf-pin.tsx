interface LeafPinProps {
  /** Height in pixels — the marker keeps its 32:44 ratio. */
  size?: number
  color?: string
  className?: string
}

/**
 * The brand glyph: the map pin with a leaf sprig, lifted from the "o" of the
 * eBio logo. It marks shops on the hero map and titles every section.
 */
export function LeafPin({ size = 44, color = 'var(--color-green-600)', className }: LeafPinProps) {
  return (
    <svg
      width={size * (32 / 44)}
      height={size}
      viewBox="0 0 32 44"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path
        d="M16 0C7.16 0 0 7.16 0 16c0 10.8 16 28 16 28s16-17.2 16-28C32 7.16 24.84 0 16 0Z"
        fill={color}
      />
      <circle cx="16" cy="15.5" r="10" fill="white" />
      <path
        d="M10.5 21c2.5-1 5-3 6.5-6"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M13 15.5c-.2-2.6 1.2-4.8 4.2-5.6.5 2.9-.9 4.9-4.2 5.6Z"
        fill={color}
      />
      <path
        d="M15.5 18.6c1-2 3-3 5.6-2.5-.6 2.5-2.7 3.6-5.6 2.5Z"
        fill={color}
      />
    </svg>
  )
}

import { ImageOff } from 'lucide-react'
import { useState } from 'react'

/**
 * A product's picture, wherever a product is listed.
 *
 * A name on its own does not identify anything: "huile d'arachide" and "huile
 * de palme" read the same in a list scanned at speed, their pictures do not.
 *
 * Two ways to have no picture, and both end the same: none was stored, or the
 * one stored no longer answers. The second is not hypothetical — the seed
 * catalogue is full of links that have since gone — and an `img` left to fail
 * on its own draws a broken icon, which is worse than an empty square.
 */
export function ProductThumb({ url, size = 40 }: { url: string | null, size?: number }) {
  const [failed, setFailed] = useState(false)
  const style = { width: size, height: size }

  if (!url || failed) {
    return (
      <span
        style={style}
        className="bg-muted text-muted-foreground flex shrink-0 items-center justify-center rounded"
      >
        <ImageOff className="h-4 w-4" />
      </span>
    )
  }

  return (
    <img
      src={url}
      alt=""
      style={style}
      className="bg-muted shrink-0 rounded object-cover"
      onError={() => setFailed(true)}
    />
  )
}

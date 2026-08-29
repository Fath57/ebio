/**
 * Thumbnail URL derived from an optimized photo URL.
 *
 * MediaService writes `<key>.opt.webp` and `<key>.thumb.webp` in the same
 * pass, so an `.opt.webp` public URL guarantees its thumbnail exists. When
 * the original was kept (already small) the URL gives no such guarantee and
 * the caller falls back to the full photo — which is small anyway.
 */
export function thumbnailUrlFor(photoUrl: string | null | undefined): string | null {
  if (!photoUrl || !photoUrl.endsWith('.opt.webp')) {
    return null
  }
  return photoUrl.replace(/\.opt\.webp$/, '.thumb.webp')
}

import type { ImageManipulator as ImageManipulatorModule, SaveFormat } from 'expo-image-manipulator'

/**
 * Longest edge kept on the device before an image leaves it. The server
 * rebuilds a 1200 px WebP from whatever it receives, so every pixel above
 * this is bandwidth the buyer pays for twice: once uploading on a mobile
 * network, once waiting for it to finish. A phone photo is 3000 to 4000 px
 * wide, which is five to ten times what we need to send.
 */
const MAX_EDGE = 1600

/**
 * Supporting documents keep more detail: an identity number or a registration
 * number has to stay readable once the shot is reduced.
 */
const MAX_EDGE_DOCUMENT = 2400

const DOCUMENT_CONTEXTS = new Set(['IDENTITY_DOCUMENT', 'BUSINESS_PROOF'])

/** JPEG quality of the reduced copy — the server re-encodes to WebP anyway. */
const QUALITY = 0.85

/**
 * `SaveFormat.JPEG`, spelled out: importing the enum would pull in the
 * package index, and with it the native module, at import time.
 */
const JPEG_FORMAT = 'jpeg' as SaveFormat

export interface SourceImage {
  uri: string
  width?: number
  height?: number
  fileName?: string | null
  mimeType?: string | null
}

export interface DownscaledImage {
  uri: string
  width: number
  height: number
  fileName: string
  mimeType: string
}

export function maxEdgeFor(context: string): number {
  return DOCUMENT_CONTEXTS.has(context) ? MAX_EDGE_DOCUMENT : MAX_EDGE
}

/**
 * `expo-image-manipulator` throws from its own import when the native module
 * is missing, which a dev client built before it was added is. Requiring it
 * here keeps that failure inside the try/catch instead of killing the bundle.
 */
function loadManipulator(): typeof ImageManipulatorModule {
  return (require('expo-image-manipulator') as { ImageManipulator: typeof ImageManipulatorModule }).ImageManipulator
}

/**
 * Reduces an image to `maxEdgeFor(context)` on its longest side. Returns null
 * when nothing was done: the source is already small enough, it is not an
 * image, or the reduction failed — uploading the original still works, it is
 * only slower, and a failed resize must never cost the user their photo.
 *
 * The manipulator bakes the EXIF orientation into the pixels and drops the
 * tag, so the server's own `.rotate()` becomes a no-op rather than a second
 * quarter turn. The crop rectangle is normalised (0 to 1), and reducing
 * preserves the ratio, so a rectangle drawn on the reduced copy still
 * describes the same area of the photo.
 */
export async function downscaleImage(
  source: SourceImage,
  context: string,
): Promise<DownscaledImage | null> {
  const mimeType = source.mimeType ?? 'image/jpeg'
  if (!mimeType.startsWith('image/')) {
    return null
  }

  const maxEdge = maxEdgeFor(context)
  const longest = Math.max(source.width ?? 0, source.height ?? 0)
  if (longest > 0 && longest <= maxEdge) {
    return null
  }

  try {
    const isLandscape = (source.width ?? 0) >= (source.height ?? 0)
    const rendered = await loadManipulator()
      .manipulate(source.uri)
      .resize(isLandscape ? { width: maxEdge } : { height: maxEdge })
      .renderAsync()
    const saved = await rendered.saveAsync({ compress: QUALITY, format: JPEG_FORMAT })
    return {
      uri: saved.uri,
      width: saved.width,
      height: saved.height,
      // The bytes are JPEG now, whatever the source was, and the name carries
      // the extension the storage key is built from — so it has to follow.
      fileName: renameToJpeg(source.fileName),
      mimeType: 'image/jpeg',
    }
  }
  catch {
    // Native module absent from this build (older dev APK), or an image the
    // decoder refuses. The original goes up as before.
    return null
  }
}

function renameToJpeg(fileName: string | null | undefined): string {
  if (!fileName) {
    return 'photo.jpg'
  }
  return `${fileName.replace(/\.[^./]+$/, '')}.jpg`
}

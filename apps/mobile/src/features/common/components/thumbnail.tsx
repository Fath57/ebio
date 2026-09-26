import type { ImageStyle, StyleProp } from 'react-native'
import ImageOff from 'lucide-react-native/dist/esm/icons/image-off'
import { useState } from 'react'
import { Image, StyleSheet, View } from 'react-native'
import { colors } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'

interface ThumbnailProps {
  uri: string | null | undefined
  /** The space it takes, held from the first paint so the page never jumps. */
  style: StyleProp<ImageStyle>
  /** What a screen reader says. Empty for a picture that adds nothing. */
  alt: string
  resizeMode?: 'cover' | 'contain'
}

/**
 * A picture that takes its place before it arrives.
 *
 * Images used to pop in one after another and push the page around as they
 * landed — on a slow connection that is what reads as « ça rame », whatever
 * the real speed. The block holds the space from the first paint, fills when
 * the file lands, and says plainly when there is nothing to show rather than
 * leaving a hole.
 */
export function Thumbnail({ uri, style, alt, resizeMode = 'cover' }: ThumbnailProps) {
  const { semantic } = useTheme()
  const [hasFailed, setHasFailed] = useState(false)
  const [isLoaded, setIsLoaded] = useState(false)

  const missing = !uri || hasFailed

  return (
    <View style={[style, styles.frame, { backgroundColor: semantic.bgSurface }]}>
      {missing
        ? <ImageOff size={20} color={colors.neutral[400]} />
        : (
            <Image
              source={{ uri }}
              accessibilityLabel={alt}
              accessible={alt.length > 0}
              resizeMode={resizeMode}
              onLoad={() => setIsLoaded(true)}
              onError={() => setHasFailed(true)}
              style={[StyleSheet.absoluteFill, { opacity: isLoaded ? 1 : 0 }]}
            />
          )}
    </View>
  )
}

const styles = StyleSheet.create({
  frame: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
})

import { useEffect, useState } from 'react'
import { Dimensions, Keyboard, Platform } from 'react-native'

/**
 * Height of the software keyboard, 0 when hidden.
 *
 * Edge-to-edge (Expo SDK 54, Android 15+) stops the window from resizing for
 * the keyboard and KeyboardAvoidingView cannot measure it either, so screens
 * with a composer pad themselves with this value. iOS keeps using
 * KeyboardAvoidingView; the hook returns 0 there to avoid double padding.
 */
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0)

  useEffect(() => {
    if (Platform.OS !== 'android') {
      return undefined
    }
    const show = Keyboard.addListener('keyboardDidShow', (event) => {
      // Measured on a Pixel (Android 17): endCoordinates.height leaves out the
      // navigation-bar strip under the keyboard (336 vs 360 dp). The distance
      // from the keyboard top to the window bottom is what actually hides content.
      const { height: windowHeight } = Dimensions.get('window')
      setHeight(Math.max(0, Math.round(windowHeight - event.endCoordinates.screenY)))
    })
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      setHeight(0)
    })
    return () => {
      show.remove()
      hide.remove()
    }
  }, [])

  return height
}

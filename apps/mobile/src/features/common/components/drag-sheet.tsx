import type { ReactNode } from 'react'
import { useEffect } from 'react'
import { Dimensions, Modal, StyleSheet, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import { radius, spacing } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'

const SCREEN_HEIGHT = Dimensions.get('window').height

/** Past a quarter of its own height, letting go means letting it go. */
const CLOSE_RATIO = 0.25

/** A quick flick closes it even if it barely moved. */
const CLOSE_VELOCITY = 800

/** Quick, barely bouncy: a sheet that wobbles reads as a toy. */
const SPRING = { damping: 22, stiffness: 240, mass: 0.7 }

interface DragSheetProps {
  visible: boolean
  onClose: () => void
  children: ReactNode
}

/**
 * A sheet one can push back down with a finger.
 *
 * The whole point is that the sheet follows the thumb rather than replaying a
 * canned animation: the gesture and the movement live on the interface thread,
 * so the sheet keeps up even while JavaScript is busy fetching. That is the
 * part `Animated` cannot do — its gesture events go through JavaScript, and a
 * loaded thread turns a drag into a series of jumps.
 *
 * Letting go decides: past a quarter of the height, or with enough speed, it
 * leaves; otherwise it springs back into place.
 */
export function DragSheet({ visible, onClose, children }: DragSheetProps) {
  const { semantic } = useTheme()
  const offset = useSharedValue(SCREEN_HEIGHT)
  const backdrop = useSharedValue(0)

  useEffect(() => {
    if (visible) {
      offset.value = withSpring(0, SPRING)
      backdrop.value = withTiming(1, { duration: 180 })
      return
    }
    offset.value = withTiming(SCREEN_HEIGHT, { duration: 180 })
    backdrop.value = withTiming(0, { duration: 180 })
  }, [backdrop, offset, visible])

  const pan = Gesture.Pan()
    .onChange((event) => {
      // Downwards only: dragging a sheet up past its own top is a rubber-band
      // effect nobody asked for.
      offset.value = Math.max(0, offset.value + event.changeY)
    })
    .onEnd((event) => {
      const far = offset.value > SCREEN_HEIGHT * CLOSE_RATIO
      const fast = event.velocityY > CLOSE_VELOCITY
      if (far || fast) {
        offset.value = withTiming(SCREEN_HEIGHT, { duration: 160 }, () => {
          runOnJS(onClose)()
        })
        backdrop.value = withTiming(0, { duration: 160 })
        return
      }
      offset.value = withSpring(0, SPRING)
    })

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: offset.value }],
  }))

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdrop.value,
  }))

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.root}>
        <Animated.View style={[styles.backdrop, backdropStyle]} />
        <GestureDetector gesture={pan}>
          <Animated.View style={[styles.sheet, { backgroundColor: semantic.bgCard }, sheetStyle]}>
            {/* La poignée dit que ça se tire : sans elle, personne n'essaie. */}
            <View style={[styles.handle, { backgroundColor: semantic.borderNormal }]} />
            {children}
          </Animated.View>
        </GestureDetector>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  sheet: {
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    paddingTop: spacing[2],
    paddingBottom: spacing[6],
    paddingHorizontal: spacing[6],
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    marginBottom: spacing[4],
  },
})

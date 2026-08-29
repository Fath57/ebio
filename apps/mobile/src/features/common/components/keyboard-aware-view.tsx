import type { ReactNode } from 'react'
import type { StyleProp, ViewStyle } from 'react-native'
import { KeyboardAvoidingView, Platform, View } from 'react-native'
import { useKeyboardHeight } from '../hooks/use-keyboard-height'

interface KeyboardAwareViewProps {
  children: ReactNode
  style?: StyleProp<ViewStyle>
  /** iOS only: header height to subtract, as KeyboardAvoidingView expects. */
  iosOffset?: number
}

/**
 * Drop-in replacement for KeyboardAvoidingView that also works on Android in
 * edge-to-edge mode (Expo SDK 54): iOS keeps the native padding behaviour, Android
 * pads the bottom by the measured keyboard height (the window no longer resizes
 * and KeyboardAvoidingView cannot measure the keyboard there).
 */
export function KeyboardAwareView({ children, style, iosOffset = 0 }: KeyboardAwareViewProps) {
  const keyboardHeight = useKeyboardHeight()

  if (Platform.OS === 'ios') {
    return (
      <KeyboardAvoidingView style={style} behavior="padding" keyboardVerticalOffset={iosOffset}>
        {children}
      </KeyboardAvoidingView>
    )
  }

  return (
    <View style={[style, keyboardHeight > 0 && { paddingBottom: keyboardHeight }]}>
      {children}
    </View>
  )
}

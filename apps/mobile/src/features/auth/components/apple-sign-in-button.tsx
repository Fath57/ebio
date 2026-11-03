import * as AppleAuthentication from 'expo-apple-authentication'
import { useEffect, useState } from 'react'
import { ActivityIndicator, StyleSheet, View } from 'react-native'
import { isAppleSignInAvailable, signInWithApple } from '../../../lib/auth-client'
import { radius } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'

interface AppleSignInButtonProps {
  onSuccess: () => void
  onError: (message: string) => void
  /** Sign-up screens say « S'inscrire », sign-in screens « Se connecter ». */
  mode?: 'signIn' | 'signUp'
}

/**
 * Apple's own button, as the App Store asks next to any other social login.
 *
 * Renders nothing off iOS or on a device without Sign in with Apple, so it
 * can sit unconditionally next to the Google button.
 */
export function AppleSignInButton({ onSuccess, onError, mode = 'signIn' }: AppleSignInButtonProps) {
  const { semantic } = useTheme()
  const [available, setAvailable] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    void isAppleSignInAvailable().then(setAvailable)
  }, [])

  if (!available) {
    return null
  }

  async function handlePress() {
    setLoading(true)
    try {
      const result = await signInWithApple()
      if (result.error) {
        onError(result.error)
        return
      }
      // user null + error null = cancelled: nothing to do
      if (result.user) {
        onSuccess()
      }
    }
    finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <View style={[styles.button, styles.loading, { borderColor: semantic.borderNormal }]}>
        <ActivityIndicator color={semantic.textPrimary} />
      </View>
    )
  }

  return (
    <AppleAuthentication.AppleAuthenticationButton
      buttonType={mode === 'signUp'
        ? AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP
        : AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
      buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
      cornerRadius={radius.md}
      style={styles.button}
      onPress={() => {
        void handlePress()
      }}
    />
  )
}

const styles = StyleSheet.create({
  button: {
    width: '100%',
    height: 52,
  },
  loading: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
  },
})

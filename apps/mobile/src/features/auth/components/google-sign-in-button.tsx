import { useState } from 'react'
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import { signInWithGoogle } from '../../../lib/auth-client'
import { fonts, radius, spacing } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'

interface GoogleSignInButtonProps {
  onSuccess: () => void
  onError: (message: string) => void
  label?: string
}

function GoogleLogo() {
  return (
    <Svg width={18} height={18} viewBox="0 0 48 48">
      <Path
        fill="#FFC107"
        d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z"
      />
      <Path
        fill="#FF3D00"
        d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z"
      />
      <Path
        fill="#4CAF50"
        d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z"
      />
      <Path
        fill="#1976D2"
        d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571c0.001-0.001,0.002-0.001,0.003-0.002l6.19,5.238C36.971,39.205,44,34,44,24C44,22.659,43.862,21.35,43.611,20.083z"
      />
    </Svg>
  )
}

export function GoogleSignInButton({ onSuccess, onError, label = 'Continuer avec Google' }: GoogleSignInButtonProps) {
  const { semantic } = useTheme()
  const [loading, setLoading] = useState(false)

  async function handlePress() {
    setLoading(true)
    try {
      const result = await signInWithGoogle()
      if (result.error) {
        onError(result.error)
        return
      }
      // user null + error null = annulé par l'utilisateur → ne rien faire
      if (result.user) {
        onSuccess()
      }
    }
    finally {
      setLoading(false)
    }
  }

  return (
    <TouchableOpacity
      style={[styles.button, { backgroundColor: semantic.bgCard, borderColor: semantic.borderNormal }]}
      onPress={handlePress}
      disabled={loading}
      activeOpacity={0.8}
    >
      {loading
        ? (
            <ActivityIndicator color={semantic.textPrimary} />
          )
        : (
            <>
              <GoogleLogo />
              <Text style={[styles.label, { color: semantic.textPrimary }]}>{label}</Text>
            </>
          )}
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    height: 52,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  label: {
    fontFamily: fonts.sansSb,
    fontSize: 15,
  },
})

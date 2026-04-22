import { useEffect, useRef, useState } from 'react'
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { colors, fonts, radius, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'

interface OtpInputProps {
  length?: number
  onComplete: (code: string) => void
  error?: string | null
  loading?: boolean
}

export function OtpInput({ length = 6, onComplete, error, loading }: OtpInputProps) {
  const { semantic } = useTheme()
  const [code, setCode] = useState('')
  const inputRef = useRef<TextInput>(null)
  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete
  const submittedRef = useRef(false)

  useEffect(() => {
    // Auto-focus the hidden input
    const timeout = setTimeout(() => inputRef.current?.focus(), 100)
    return () => clearTimeout(timeout)
  }, [])

  useEffect(() => {
    if (code.length === length && !submittedRef.current) {
      submittedRef.current = true
      onCompleteRef.current(code)
    }
  }, [code, length])

  function handleChange(text: string) {
    const cleaned = text.replace(/\D/g, '').slice(0, length)
    if (cleaned.length < length) {
      submittedRef.current = false
    }
    setCode(cleaned)
  }

  return (
    <View>
      {/* Hidden input that captures keyboard */}
      <TextInput
        ref={inputRef}
        style={styles.hiddenInput}
        value={code}
        onChangeText={handleChange}
        keyboardType="number-pad"
        maxLength={length}
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        editable={!loading}
      />

      {/* Visual boxes */}
      <Pressable style={styles.boxRow} onPress={() => inputRef.current?.focus()}>
        {Array.from({ length }, (_, i) => {
          const isFocused = i === code.length
          const isFilled = i < code.length

          return (
            <View
              key={i}
              style={[
                styles.box,
                {
                  backgroundColor: semantic.bgSurface,
                  borderColor: error
                    ? colors.coral[400]
                    : isFocused
                      ? colors.green[400]
                      : isFilled
                        ? colors.green[200]
                        : semantic.borderNormal,
                },
              ]}
            >
              <Text style={[styles.boxText, { color: semantic.textPrimary }]}>
                {code[i] ?? ''}
              </Text>
            </View>
          )
        })}
      </Pressable>

      {error && (
        <Text style={styles.errorText}>{error}</Text>
      )}
    </View>
  )
}

// ─── Countdown timer for resend ─────────────────────────────────────────────

interface ResendTimerProps {
  seconds: number
  onResend: () => void
  loading?: boolean
}

export function ResendTimer({ seconds: initialSeconds, onResend, loading }: ResendTimerProps) {
  const { semantic } = useTheme()
  const [seconds, setSeconds] = useState(initialSeconds)

  useEffect(() => {
    setSeconds(initialSeconds)
  }, [initialSeconds])

  useEffect(() => {
    if (seconds <= 0)
      return
    const timer = setInterval(() => setSeconds(s => s - 1), 1000)
    return () => clearInterval(timer)
  }, [seconds])

  if (seconds > 0) {
    return (
      <Text style={[styles.resendText, { color: semantic.textTertiary }]}>
        Renvoyer dans
        {' '}
        {seconds}
        s
      </Text>
    )
  }

  return (
    <Pressable onPress={onResend} disabled={loading} hitSlop={8}>
      <Text style={[styles.resendLink, { color: semantic.textPrimaryColor }]}>
        Renvoyer le code
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  hiddenInput: {
    position: 'absolute',
    opacity: 0,
    height: 0,
    width: 0,
  },
  boxRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing[2],
  },
  box: {
    width: 48,
    height: 56,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxText: {
    fontFamily: fonts.mono,
    fontSize: 24,
    lineHeight: 28,
  },
  errorText: {
    ...typography.bodyS,
    color: colors.coral[600],
    textAlign: 'center',
    marginTop: spacing[3],
  },
  resendText: {
    ...typography.bodyS,
    textAlign: 'center',
    marginTop: spacing[4],
  },
  resendLink: {
    ...typography.bodyS,
    fontFamily: fonts.sansSb,
    textAlign: 'center',
    marginTop: spacing[4],
  },
})

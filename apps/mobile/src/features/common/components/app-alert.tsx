import { useEffect, useState } from 'react'
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { radius, shadows, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'

export interface AppAlertButton {
  text: string
  onPress?: () => void
  style?: 'default' | 'cancel' | 'destructive'
}

interface AppAlertConfig {
  title: string
  message?: string
  buttons: AppAlertButton[]
}

const DEFAULT_BUTTON: AppAlertButton = { text: 'OK', style: 'default' }

let showHandler: ((config: AppAlertConfig) => void) | null = null

/**
 * Alerte applicative impérative, calquée sur `Alert.alert` de React Native.
 * Fonctionne depuis n'importe où (composants, hooks, callbacks async) tant que
 * `<AppAlertHost />` est monté au root.
 */
export function appAlert(
  title: string,
  message?: string,
  buttons?: AppAlertButton[],
): void {
  const resolved = buttons && buttons.length > 0 ? buttons : [DEFAULT_BUTTON]
  showHandler?.({ title, message, buttons: resolved })
}

/** Ordonne les boutons : action(s) principale(s) d'abord, "cancel" en dernier. */
function orderButtons(buttons: AppAlertButton[]): AppAlertButton[] {
  const primary = buttons.filter(b => b.style !== 'cancel')
  const cancel = buttons.filter(b => b.style === 'cancel')
  return [...primary, ...cancel]
}

export function AppAlertHost(): React.JSX.Element {
  const { semantic } = useTheme()
  const [config, setConfig] = useState<AppAlertConfig | null>(null)

  useEffect(() => {
    showHandler = setConfig
    return () => {
      showHandler = null
    }
  }, [])

  function handlePress(button: AppAlertButton): void {
    setConfig(null)
    button.onPress?.()
  }

  function handleBackdrop(): void {
    const cancel = config?.buttons.find(b => b.style === 'cancel')
    setConfig(null)
    cancel?.onPress?.()
  }

  const buttons = config ? orderButtons(config.buttons) : []

  return (
    <Modal
      visible={config !== null}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={handleBackdrop}
    >
      <Pressable style={styles.backdrop} onPress={handleBackdrop}>
        <Pressable
          style={[styles.card, { backgroundColor: semantic.bgCard }, shadows.lg]}
          onPress={() => { /* swallow tap to avoid backdrop dismiss */ }}
        >
          {config && (
            <>
              <Text style={[styles.title, { color: semantic.textPrimary }]}>
                {config.title}
              </Text>
              {config.message != null && config.message !== '' && (
                <Text style={[styles.message, { color: semantic.textSecondary }]}>
                  {config.message}
                </Text>
              )}
              <View style={styles.actions}>
                {buttons.map(button => (
                  <Pressable
                    key={`${button.text}-${button.style ?? 'default'}`}
                    style={({ pressed }) => [
                      styles.button,
                      button.style === 'cancel'
                        ? { backgroundColor: semantic.bgPage, borderColor: semantic.borderNormal, borderWidth: 1 }
                        : button.style === 'destructive'
                          ? { backgroundColor: '#F06040' }
                          : { backgroundColor: semantic.colorPrimary },
                      pressed && styles.buttonPressed,
                    ]}
                    onPress={() => handlePress(button)}
                  >
                    <Text
                      style={[
                        styles.buttonText,
                        { color: button.style === 'cancel' ? semantic.textPrimary : '#FFFFFF' },
                      ]}
                    >
                      {button.text}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(20, 20, 16, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing[6],
  },
  card: {
    width: '100%',
    maxWidth: 360,
    borderRadius: radius.xl,
    padding: spacing[6],
  },
  title: {
    ...typography.h3,
    marginBottom: spacing[2],
  },
  message: {
    ...typography.bodyS,
    marginBottom: spacing[2],
  },
  actions: {
    marginTop: spacing[5],
    gap: spacing[2],
  },
  button: {
    borderRadius: radius.md,
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[4],
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonText: {
    ...typography.h3,
    fontSize: 15,
  },
})

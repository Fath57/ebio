import ExternalLink from 'lucide-react-native/dist/esm/icons/external-link'
import { useCallback, useState } from 'react'
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native'
import { WebView } from 'react-native-webview'
import { colors, fonts, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { ScreenHeader } from '../../common/components/screen-header'

export type LegalDocument = 'cgu' | 'confidentialite' | 'suppression-donnees'

const TITLES: Record<LegalDocument, string> = {
  'cgu': 'Conditions d\'utilisation',
  'confidentialite': 'Confidentialité',
  'suppression-donnees': 'Suppression des données',
}

const SITE_URL = 'https://e-bio.org'

interface LegalScreenProps {
  document: LegalDocument
  onGoBack: () => void
}

/**
 * Legal texts, read inside the app rather than thrown at the browser.
 *
 * They live on the public site, which is the single place they are written
 * and the one a regulator or a store reviewer can check. Embedding that page
 * keeps one source of truth; copying the text into the app would guarantee
 * two versions within a year.
 */
export function LegalScreen({ document, onGoBack }: LegalScreenProps) {
  const { semantic } = useTheme()
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const url = `${SITE_URL}/${document}`

  const openInBrowser = useCallback(() => {
    Linking.openURL(url).catch(() => {
      // No browser available: nothing useful left to try.
    })
  }, [url])

  return (
    <View style={[styles.screen, { backgroundColor: semantic.bgPage }]}>
      <ScreenHeader
        title={TITLES[document]}
        onBack={onGoBack}
        rightSlot={(
          <Pressable
            onPress={openInBrowser}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Ouvrir dans le navigateur"
          >
            <ExternalLink size={20} color={semantic.textSecondary} strokeWidth={2.2} />
          </Pressable>
        )}
      />

      {failed
        ? (
            <View style={styles.center}>
              <Text style={[styles.failedTitle, { color: semantic.textPrimary }]}>
                Page indisponible
              </Text>
              <Text style={[styles.failedBody, { color: semantic.textSecondary }]}>
                Vérifiez votre connexion, ou ouvrez le document dans votre navigateur.
              </Text>
              <Pressable
                style={styles.openButton}
                onPress={openInBrowser}
                accessibilityRole="button"
                accessibilityLabel="Ouvrir dans le navigateur"
              >
                <Text style={styles.openButtonText}>Ouvrir dans le navigateur</Text>
              </Pressable>
            </View>
          )
        : (
            <>
              <WebView
                source={{ uri: url }}
                onLoadEnd={() => setLoading(false)}
                onError={() => {
                  setLoading(false)
                  setFailed(true)
                }}
                style={{ backgroundColor: semantic.bgPage }}
              />
              {loading && (
                <View style={[styles.loadingOverlay, { backgroundColor: semantic.bgPage }]}>
                  <ActivityIndicator size="large" color={colors.green[400]} />
                </View>
              )}
            </>
          )}
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing[6],
    gap: spacing[2],
  },
  failedTitle: {
    ...typography.h3,
  },
  failedBody: {
    ...typography.bodyS,
    textAlign: 'center',
  },
  openButton: {
    marginTop: spacing[4],
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: spacing[6],
    borderRadius: 999,
    backgroundColor: colors.green[400],
  },
  openButtonText: {
    fontFamily: fonts.sansSb,
    fontSize: 15,
    color: colors.neutral[0],
  },
})

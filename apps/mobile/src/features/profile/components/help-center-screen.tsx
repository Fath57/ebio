import ChevronDown from 'lucide-react-native/dist/esm/icons/chevron-down'
import Mail from 'lucide-react-native/dist/esm/icons/mail'
import MessageCircle from 'lucide-react-native/dist/esm/icons/message-circle'
import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors, fonts, radius, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { apiFetch } from '../../../utils/api-client'
import { ScreenHeader } from '../../common/components/screen-header'

interface FaqItem {
  question: string
  answer: string
}

interface HelpCenterScreenProps {
  onGoBack: () => void
  /** Opens the in-app conversation list, the fastest route to a human. */
  onOpenChat?: () => void
}

const SUPPORT_EMAIL = 'contact@e-bio.org'

/**
 * The help centre reads the very FAQ the back-office already manages for the
 * landing site (`GET /api/landing/content`). One place to edit, two places to
 * read — a second hard-coded list in the app would drift within a month.
 */
export function HelpCenterScreen({ onGoBack, onOpenChat }: HelpCenterScreenProps) {
  const { semantic } = useTheme()
  const insets = useSafeAreaInsets()
  const [faq, setFaq] = useState<FaqItem[]>([])
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setFailed(false)
    try {
      const res = await apiFetch('/api/landing/content')
      if (res.ok) {
        const data = await res.json() as { faq?: FaqItem[] }
        setFaq(data.faq ?? [])
      }
      else {
        setFailed(true)
      }
    }
    catch {
      // Offline: the contact routes below still work, so the screen is not
      // useless — it just has no questions to show.
      setFailed(true)
    }
    finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const openMail = useCallback(() => {
    Linking.openURL(`mailto:${SUPPORT_EMAIL}`).catch(() => {
      // No mail client configured: the address stays readable on screen.
    })
  }, [])

  return (
    <View style={[styles.screen, { backgroundColor: semantic.bgPage }]}>
      <ScreenHeader title="Centre d'aide" onBack={onGoBack} />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing[10] }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.intro, { color: semantic.textSecondary }]}>
          Les questions que l'on nous pose le plus souvent. Si la vôtre n'y est
          pas, écrivez-nous : nous répondons sous 24 heures ouvrées.
        </Text>

        {loading
          ? (
              <View style={styles.loading}>
                <ActivityIndicator color={colors.green[400]} />
              </View>
            )
          : failed
            ? (
                <View style={[styles.band, { backgroundColor: semantic.bgCard }]}>
                  <Text style={[styles.failedText, { color: semantic.textSecondary }]}>
                    Les questions n'ont pas pu être chargées.
                  </Text>
                  <Pressable onPress={load} accessibilityRole="button" accessibilityLabel="Réessayer">
                    <Text style={[styles.retry, { color: colors.green[600] }]}>Réessayer</Text>
                  </Pressable>
                </View>
              )
            : (
                <View style={[styles.band, { backgroundColor: semantic.bgCard }]}>
                  {faq.map((item, index) => {
                    const open = openIndex === index
                    return (
                      <View key={item.question}>
                        {index > 0 && <View style={[styles.divider, { backgroundColor: semantic.borderLight }]} />}
                        <Pressable
                          style={styles.questionRow}
                          onPress={() => setOpenIndex(open ? null : index)}
                          accessibilityRole="button"
                          accessibilityState={{ expanded: open }}
                          accessibilityLabel={item.question}
                        >
                          <Text style={[styles.question, { color: semantic.textPrimary }]}>
                            {item.question}
                          </Text>
                          <View style={open ? styles.chevronOpen : undefined}>
                            <ChevronDown size={18} color={semantic.textTertiary} strokeWidth={2.2} />
                          </View>
                        </Pressable>
                        {open && (
                          <Text style={[styles.answer, { color: semantic.textSecondary }]}>
                            {item.answer}
                          </Text>
                        )}
                      </View>
                    )
                  })}
                </View>
              )}

        <Text style={[styles.sectionTitle, { color: semantic.textTertiary }]}>NOUS CONTACTER</Text>

        <View style={[styles.band, { backgroundColor: semantic.bgCard }]}>
          {onOpenChat !== undefined && (
            <>
              <Pressable
                style={styles.contactRow}
                onPress={onOpenChat}
                accessibilityRole="button"
                accessibilityLabel="Ouvrir la messagerie"
              >
                <View style={[styles.contactIcon, { backgroundColor: semantic.bgPrimaryLight }]}>
                  <MessageCircle size={18} color={colors.green[600]} strokeWidth={2.2} />
                </View>
                <View style={styles.contactTexts}>
                  <Text style={[styles.contactLabel, { color: semantic.textPrimary }]}>Messagerie</Text>
                  <Text style={[styles.contactHint, { color: semantic.textTertiary }]}>
                    Pour une commande en cours, c'est le plus rapide
                  </Text>
                </View>
              </Pressable>
              <View style={[styles.divider, { backgroundColor: semantic.borderLight }]} />
            </>
          )}

          <Pressable
            style={styles.contactRow}
            onPress={openMail}
            accessibilityRole="button"
            accessibilityLabel={`Écrire à ${SUPPORT_EMAIL}`}
          >
            <View style={[styles.contactIcon, { backgroundColor: semantic.bgPrimaryLight }]}>
              <Mail size={18} color={colors.green[600]} strokeWidth={2.2} />
            </View>
            <View style={styles.contactTexts}>
              <Text style={[styles.contactLabel, { color: semantic.textPrimary }]}>E-mail</Text>
              <Text style={[styles.contactHint, { color: semantic.textTertiary }]}>{SUPPORT_EMAIL}</Text>
            </View>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    paddingTop: spacing[2],
  },
  intro: {
    ...typography.bodyS,
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[4],
  },
  loading: {
    paddingVertical: spacing[10],
  },
  band: {
    paddingHorizontal: spacing[4],
  },
  divider: {
    height: StyleSheet.hairlineWidth,
  },
  questionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    minHeight: 56,
    paddingVertical: spacing[3],
  },
  question: {
    ...typography.bodyL,
    fontFamily: fonts.sansMd,
    flex: 1,
  },
  chevronOpen: {
    transform: [{ rotate: '180deg' }],
  },
  answer: {
    ...typography.bodyS,
    paddingBottom: spacing[4],
    lineHeight: 13 * 1.7,
  },
  sectionTitle: {
    ...typography.overline,
    paddingHorizontal: spacing[4],
    marginTop: spacing[6],
    marginBottom: spacing[2],
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    minHeight: 64,
    paddingVertical: spacing[3],
  },
  contactIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  contactTexts: {
    flex: 1,
    gap: 2,
  },
  contactLabel: {
    ...typography.bodyL,
    fontFamily: fonts.sansMd,
  },
  contactHint: {
    ...typography.caption,
  },
  failedText: {
    ...typography.bodyS,
    paddingVertical: spacing[4],
  },
  retry: {
    ...typography.bodyS,
    fontFamily: fonts.sansSb,
    paddingBottom: spacing[4],
  },
})

import type { StatementPeriod, StatementPreset } from '../utils/statement-period'
import FileSpreadsheet from 'lucide-react-native/dist/esm/icons/file-spreadsheet'
import Mail from 'lucide-react-native/dist/esm/icons/mail'
import { useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useSession } from '../../../lib/auth-client'
import { colors, fonts, radius, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { apiFetch } from '../../../utils/api-client'
import { appAlert } from '../../common/components/app-alert'
import { KeyboardAwareView } from '../../common/components/keyboard-aware-view'
import { ScreenHeader } from '../../common/components/screen-header'
import { useTabBarClearance } from '../../common/hooks/use-tab-bar-clearance'
import { readApiError } from '../utils/read-api-error'
import { describePeriod, presetPeriod } from '../utils/statement-period'
import { RangeCalendar } from './range-calendar'

const PRESETS: Array<{ key: StatementPreset, label: string }> = [
  { key: 'today', label: 'Aujourd\'hui' },
  { key: 'week', label: 'Cette semaine' },
  { key: 'month', label: 'Ce mois' },
  { key: 'custom', label: 'Période' },
]

const EMAIL_PATTERN = /^[^\s@]+@[^\s@][^\s.@]*\.[^\s@]+$/

interface SalesStatementScreenProps {
  onGoBack: () => void
}

/**
 * The shop's sales over a period, as an Excel file. The app cannot save a file
 * on the phone without a native module, so the download goes through the
 * browser with a short-lived signed link; the e-mail goes out from the API.
 */
export function SalesStatementScreen({ onGoBack }: SalesStatementScreenProps) {
  const { semantic } = useTheme()
  const tabBarClearance = useTabBarClearance()
  const { data: session } = useSession()
  const [preset, setPreset] = useState<StatementPreset>('month')
  const [range, setRange] = useState<{ from: string | null, to: string | null }>({ from: null, to: null })
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState<'download' | 'email' | null>(null)

  const period: StatementPeriod | null = useMemo(() => {
    if (preset !== 'custom')
      return presetPeriod(preset)
    if (!range.from)
      return null
    return { from: range.from, to: range.to ?? range.from }
  }, [preset, range])

  const accountEmail = session?.user?.email ?? ''
  const recipient = email.trim() || accountEmail

  const download = async () => {
    if (!period)
      return
    setBusy('download')
    try {
      const res = await apiFetch('/api/suppliers/me/sales-statement/link', {
        method: 'POST',
        body: JSON.stringify(period),
      })
      if (!res.ok) {
        appAlert('Export impossible', await readApiError(res))
        return
      }
      const { url } = await res.json() as { url: string }
      await Linking.openURL(url)
    }
    catch {
      appAlert('Export impossible', 'Vérifiez votre connexion et réessayez.')
    }
    finally {
      setBusy(null)
    }
  }

  const sendByEmail = async () => {
    if (!period)
      return
    if (email.trim() && !EMAIL_PATTERN.test(email.trim())) {
      appAlert('Adresse invalide', 'Vérifiez l\'adresse e-mail saisie.')
      return
    }
    setBusy('email')
    try {
      const res = await apiFetch('/api/suppliers/me/sales-statement/email', {
        method: 'POST',
        body: JSON.stringify({ ...period, ...(email.trim() ? { email: email.trim() } : {}) }),
      })
      if (!res.ok) {
        appAlert('Envoi impossible', await readApiError(res))
        return
      }
      const { sentTo } = await res.json() as { sentTo: string }
      appAlert('Relevé envoyé', `Le fichier Excel a été envoyé à ${sentTo}.`)
    }
    catch {
      appAlert('Envoi impossible', 'Vérifiez votre connexion et réessayez.')
    }
    finally {
      setBusy(null)
    }
  }

  return (
    <KeyboardAwareView style={{ flex: 1 }}>
      <ScrollView
        style={[styles.container, { backgroundColor: semantic.bgPage }]}
        contentContainerStyle={[styles.content, { paddingBottom: tabBarClearance + spacing[6] }]}
        keyboardShouldPersistTaps="handled"
      >
        <ScreenHeader title="Relevé des ventes" onBack={onGoBack} />

        <Text style={[styles.intro, { color: semantic.textSecondary }]}>
          Toutes vos commandes de la période dans un fichier Excel : résumé, détail par commande et par produit.
        </Text>

        <Text style={[styles.sectionTitle, { color: semantic.textTertiary }]}>PÉRIODE</Text>
        <View style={styles.chips}>
          {PRESETS.map((option) => {
            const isActive = option.key === preset
            return (
              <TouchableOpacity
                key={option.key}
                onPress={() => setPreset(option.key)}
                style={[
                  styles.chip,
                  { borderColor: isActive ? colors.green[400] : semantic.borderNormal },
                  isActive && { backgroundColor: colors.green[50] },
                ]}
                accessibilityRole="radio"
                accessibilityState={{ checked: isActive }}
              >
                <Text style={[styles.chipText, { color: isActive ? colors.green[800] : semantic.textPrimary }]}>
                  {option.label}
                </Text>
              </TouchableOpacity>
            )
          })}
        </View>

        {preset === 'custom' && (
          <View style={styles.calendar}>
            <RangeCalendar value={range} onChange={setRange} />
            <Text style={[styles.hint, { color: semantic.textTertiary }]}>
              {range.from && !range.to
                ? 'Touchez le dernier jour de la période, ou exportez ce seul jour.'
                : 'Touchez le premier jour, puis le dernier.'}
            </Text>
          </View>
        )}

        {period && (
          <View style={[styles.periodCard, { backgroundColor: semantic.bgCard, borderColor: semantic.borderLight }]}>
            <Text style={[styles.periodLabel, { color: semantic.textTertiary }]}>Relevé du</Text>
            <Text style={[styles.periodValue, { color: semantic.textPrimary }]}>{describePeriod(period)}</Text>
          </View>
        )}

        <TouchableOpacity
          onPress={download}
          disabled={!period || busy !== null}
          style={[styles.primaryButton, (!period || busy !== null) && styles.buttonDisabled]}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityState={{ disabled: !period || busy !== null, busy: busy === 'download' }}
        >
          {busy === 'download'
            ? <ActivityIndicator color={colors.neutral[0]} />
            : <FileSpreadsheet size={18} color={colors.neutral[0]} />}
          <Text style={styles.primaryButtonText}>Télécharger en Excel</Text>
        </TouchableOpacity>

        <Text style={[styles.sectionTitle, styles.emailTitle, { color: semantic.textTertiary }]}>ENVOYER PAR E-MAIL</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder={accountEmail || 'adresse@exemple.com'}
          placeholderTextColor={semantic.textTertiary}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="Adresse e-mail du destinataire"
          style={[styles.input, { backgroundColor: semantic.bgCard, borderColor: semantic.borderNormal, color: semantic.textPrimary }]}
        />
        <Text style={[styles.hint, { color: semantic.textTertiary }]}>
          {email.trim()
            ? 'Par exemple votre comptable.'
            : 'Laissez vide pour le recevoir sur l\'adresse de votre compte.'}
        </Text>

        <TouchableOpacity
          onPress={sendByEmail}
          disabled={!period || busy !== null || !recipient}
          style={[styles.secondaryButton, { borderColor: colors.green[400] }, (!period || busy !== null || !recipient) && styles.buttonDisabled]}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityState={{ disabled: !period || busy !== null || !recipient, busy: busy === 'email' }}
        >
          {busy === 'email'
            ? <ActivityIndicator color={colors.green[600]} />
            : <Mail size={18} color={colors.green[600]} />}
          <Text style={[styles.secondaryButtonText, { color: colors.green[600] }]}>Envoyer le relevé</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAwareView>
  )
}

const styles = StyleSheet.create({
  buttonDisabled: {
    opacity: 0.5,
  },
  calendar: {
    gap: spacing[2],
    marginTop: spacing[3],
  },
  chip: {
    borderRadius: radius.pill,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 40,
    paddingHorizontal: spacing[4],
  },
  chipText: {
    fontFamily: fonts.sansMd,
    fontSize: 14,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
  },
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing[4],
  },
  emailTitle: {
    marginTop: spacing[8],
  },
  hint: {
    ...typography.caption,
    marginTop: spacing[1],
  },
  input: {
    ...typography.bodyL,
    borderRadius: radius.md,
    borderWidth: 1,
    minHeight: 48,
    paddingHorizontal: spacing[3],
  },
  intro: {
    ...typography.bodyS,
    marginBottom: spacing[6],
  },
  periodCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: spacing[4],
    marginTop: spacing[4],
    padding: spacing[4],
  },
  periodLabel: {
    ...typography.caption,
  },
  periodValue: {
    ...typography.h3,
    marginTop: 2,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.green[400],
    borderRadius: radius.md,
    flexDirection: 'row',
    gap: spacing[2],
    justifyContent: 'center',
    minHeight: 48,
  },
  primaryButtonText: {
    color: colors.neutral[0],
    fontFamily: fonts.sansSb,
    fontSize: 15,
  },
  secondaryButton: {
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1.5,
    flexDirection: 'row',
    gap: spacing[2],
    justifyContent: 'center',
    marginTop: spacing[4],
    minHeight: 48,
  },
  secondaryButtonText: {
    fontFamily: fonts.sansSb,
    fontSize: 15,
  },
  sectionTitle: {
    ...typography.overline,
    marginBottom: spacing[2],
  },
})

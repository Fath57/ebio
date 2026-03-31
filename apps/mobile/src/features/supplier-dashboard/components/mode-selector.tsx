import type { LucideIcon } from 'lucide-react-native'
import Handshake from 'lucide-react-native/dist/esm/icons/handshake'
import ShoppingCart from 'lucide-react-native/dist/esm/icons/shopping-cart'
import TriangleAlert from 'lucide-react-native/dist/esm/icons/triangle-alert'
import * as React from 'react'
import { useState } from 'react'
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { ConfirmModal } from '../../common/components/confirm-modal'
import { colors, radius, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { apiFetch } from '../../../utils/api-client'

type SupplierMode = 'CONTACT' | 'ORDER'

interface ModeSelectorProps {
  initialMode?: SupplierMode
  onModeChanged?: (mode: SupplierMode) => void
}

const MODE_OPTIONS: Array<{
  value: SupplierMode
  label: string
  description: string
  icon: LucideIcon
}> = [
  {
    value: 'CONTACT',
    label: 'Mise en relation',
    description:
      'Les acheteurs vous contactent directement par téléphone ou message. Idéal pour les négociations personnalisées et les gros volumes.',
    icon: Handshake,
  },
  {
    value: 'ORDER',
    label: 'Commande',
    description:
      'Les acheteurs passent commande directement depuis votre fiche. Paiement intégré via Mobile Money.',
    icon: ShoppingCart,
  },
]

export function ModeSelector({
  initialMode = 'CONTACT',
  onModeChanged,
}: ModeSelectorProps) {
  const { semantic } = useTheme()
  const [selectedMode, setSelectedMode] = useState<SupplierMode>(initialMode)
  const [isSaving, setIsSaving] = useState(false)
  const [modal, setModal] = useState<{ visible: boolean, title: string, message: string, type: 'success' | 'error' | 'confirm', onConfirm?: () => void }>({ visible: false, title: '', message: '', type: 'error' })

  function showError(title: string, message: string): void {
    setModal({ visible: true, title, message, type: 'error' })
  }

  async function handleSelectMode(mode: SupplierMode): Promise<void> {
    setIsSaving(true)
    try {
      const res = await apiFetch('/api/suppliers/me/settings/mode', {
        method: 'PATCH',
        body: JSON.stringify({ mode }),
      })
      if (res.ok) {
        setSelectedMode(mode)
        onModeChanged?.(mode)
      }
    }
    catch {
      showError('Erreur', 'Impossible de changer le mode.')
    }
    finally {
      setIsSaving(false)
    }
  }

  return (
    <View style={[styles.screen, { backgroundColor: semantic.bgPage }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: semantic.textPrimary }]}>Mode de fonctionnement</Text>
        <Text style={[styles.subtitle, { color: semantic.textSecondary }]}>
          Choisissez comment les acheteurs interagissent avec votre boutique.
        </Text>
      </View>

      <View style={styles.optionsContainer}>
        {MODE_OPTIONS.map((option) => {
          const isSelected = selectedMode === option.value

          return (
            <TouchableOpacity
              key={option.value}
              style={[
                styles.optionCard,
                { backgroundColor: semantic.bgCard, borderColor: semantic.borderNormal },
                isSelected && styles.optionCardSelected,
              ]}
              onPress={() => handleSelectMode(option.value)}
              disabled={isSaving}
              accessibilityRole="radio"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={`${option.label}: ${option.description}`}
            >
              <View style={styles.optionHeader}>
                <option.icon size={28} color={isSelected ? colors.green[800] : semantic.textSecondary} />
                <View style={styles.optionTitleRow}>
                  <Text
                    style={[
                      styles.optionLabel,
                      { color: semantic.textPrimary },
                      isSelected && styles.optionLabelSelected,
                    ]}
                  >
                    {option.label}
                  </Text>
                </View>
                <View
                  style={[
                    styles.radioOuter,
                    { borderColor: semantic.borderNormal },
                    isSelected && styles.radioOuterSelected,
                  ]}
                >
                  {isSelected && <View style={styles.radioInner} />}
                </View>
              </View>
              <Text style={[styles.optionDescription, { color: semantic.textSecondary }]}>
                {option.description}
              </Text>
            </TouchableOpacity>
          )
        })}
      </View>

      <ConfirmModal
        visible={modal.visible}
        icon={TriangleAlert}
        iconColor={colors.coral[600]}
        iconBg={colors.coral[50]}
        title={modal.title}
        message={modal.message}
        confirmLabel="OK"
        confirmStyle="primary"
        onConfirm={() => setModal(prev => ({ ...prev, visible: false }))}
        onCancel={() => setModal(prev => ({ ...prev, visible: false }))}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingTop: spacing[4],
  },
  header: {
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[4],
  },
  title: {
    ...typography.h1,
  },
  subtitle: {
    ...typography.bodyL,
    marginTop: spacing[1],
  },
  optionsContainer: {
    paddingHorizontal: spacing[4],
    gap: spacing[3],
  },
  optionCard: {
    borderRadius: radius.lg,
    borderWidth: 2,
    padding: spacing[4],
    gap: spacing[2],
  },
  optionCardSelected: {
    borderColor: colors.green[400],
    backgroundColor: colors.green[50],
  },
  optionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  optionTitleRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  optionLabel: {
    ...typography.h3,
  },
  optionLabelSelected: {
    color: colors.green[800],
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioOuterSelected: {
    borderColor: colors.green[400],
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.green[400],
  },
  optionDescription: {
    ...typography.bodyS,
    marginLeft: 40,
  },
})

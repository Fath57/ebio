import * as React from 'react'
import {
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { colors, fonts, radius, spacing, typography } from '../../../theme/theme'

interface ContactActionSheetProps {
  isVisible: boolean
  onClose: () => void
  onOpenChat: () => void
  phoneNumber: string | null
  whatsappNumber: string | null
}

interface ContactOptionProps {
  icon: string
  label: string
  onPress: () => void
}

function ContactOption({ icon, label, onPress }: ContactOptionProps) {
  return (
    <TouchableOpacity
      style={styles.option}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text style={styles.optionIcon}>{icon}</Text>
      <Text style={styles.optionLabel}>{label}</Text>
    </TouchableOpacity>
  )
}

export function ContactActionSheet({
  isVisible,
  onClose,
  onOpenChat,
  phoneNumber,
  whatsappNumber,
}: ContactActionSheetProps) {
  function handleWhatsApp(): void {
    if (!whatsappNumber)
      return
    const cleaned = whatsappNumber.replace(/\D/g, '')
    Linking.openURL(`https://wa.me/${cleaned}`)
    onClose()
  }

  function handlePhoneCall(): void {
    if (!phoneNumber)
      return
    Linking.openURL(`tel:${phoneNumber}`)
    onClose()
  }

  function handleChat(): void {
    onOpenChat()
    onClose()
  }

  return (
    <Modal
      visible={isVisible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <View style={styles.sheet} onStartShouldSetResponder={() => true}>
          <View style={styles.handle} />
          <Text style={styles.title}>Contacter le fournisseur</Text>

          <ContactOption
            icon={'\uD83D\uDCAC'}
            label="Chat eBio"
            onPress={handleChat}
          />

          {whatsappNumber && (
            <ContactOption
              icon={'\uD83D\uDCF1'}
              label="WhatsApp"
              onPress={handleWhatsApp}
            />
          )}

          {phoneNumber && (
            <ContactOption
              icon={'\uD83D\uDCDE'}
              label="Appel téléphonique"
              onPress={handlePhoneCall}
            />
          )}

          <TouchableOpacity
            style={styles.cancelButton}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Fermer"
          >
            <Text style={styles.cancelText}>Fermer</Text>
          </TouchableOpacity>
        </View>
      </Pressable>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.neutral[0],
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[8],
    paddingTop: spacing[3],
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.neutral[200],
    alignSelf: 'center',
    marginBottom: spacing[4],
  },
  title: {
    ...typography.h2,
    color: colors.neutral[800],
    marginBottom: spacing[4],
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    minHeight: 44,
    paddingVertical: spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral[100],
  },
  optionIcon: {
    fontSize: 22,
    width: 32,
    textAlign: 'center',
  },
  optionLabel: {
    ...typography.bodyL,
    color: colors.neutral[800],
    fontFamily: fonts.sansMd,
  },
  cancelButton: {
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing[4],
  },
  cancelText: {
    fontFamily: fonts.sansMd,
    fontSize: 16,
    color: colors.neutral[400],
  },
})

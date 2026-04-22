import * as React from 'react'
import { useRef, useEffect } from 'react'
import {
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import type { LucideIcon } from 'lucide-react-native'
import { colors, fonts, radius, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'

interface ConfirmModalProps {
  visible: boolean
  icon?: LucideIcon
  iconColor?: string
  iconBg?: string
  title: string
  message: string
  confirmLabel: string
  cancelLabel?: string
  confirmStyle?: 'primary' | 'destructive'
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmModal({
  visible,
  icon: Icon,
  iconColor = colors.green[400],
  iconBg = colors.green[50],
  title,
  message,
  confirmLabel,
  cancelLabel = 'Annuler',
  confirmStyle = 'primary',
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const { semantic } = useTheme()
  const fadeAnim = useRef(new Animated.Value(0)).current
  const scaleAnim = useRef(new Animated.Value(0.9)).current

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.spring(scaleAnim, { toValue: 1, tension: 65, friction: 8, useNativeDriver: true }),
      ]).start()
    }
    else {
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
        Animated.timing(scaleAnim, { toValue: 0.9, duration: 150, useNativeDriver: true }),
      ]).start()
    }
  }, [visible, fadeAnim, scaleAnim])

  const isDestructive = confirmStyle === 'destructive'

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onCancel}
    >
      <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>
        <Pressable style={styles.backdrop} onPress={onCancel} />
        <Animated.View
          style={[
            styles.modal,
            { backgroundColor: semantic.bgCard, transform: [{ scale: scaleAnim }] },
          ]}
        >
        {Icon && (
          <View style={[styles.iconCircle, { backgroundColor: iconBg }]}>
            <Icon size={28} color={iconColor} strokeWidth={2} />
          </View>
        )}
        <Text style={[styles.title, { color: semantic.textPrimary }]}>{title}</Text>
        <Text style={[styles.message, { color: semantic.textSecondary }]}>{message}</Text>
        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={[styles.button, styles.cancelButton, { borderColor: semantic.borderNormal }]}
            onPress={onCancel}
            activeOpacity={0.7}
          >
            <Text style={[styles.cancelButtonText, { color: semantic.textSecondary }]}>
              {cancelLabel}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.button,
              styles.confirmButton,
              { backgroundColor: isDestructive ? colors.coral[400] : colors.green[400] },
            ]}
            onPress={onConfirm}
            activeOpacity={0.8}
          >
            <Text style={styles.confirmButtonText}>{confirmLabel}</Text>
          </TouchableOpacity>
        </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing[6],
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  modal: {
    width: '100%',
    borderRadius: radius.xl,
    paddingTop: spacing[6],
    paddingBottom: spacing[5],
    paddingHorizontal: spacing[5],
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 12,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing[4],
  },
  title: {
    ...typography.h2,
    textAlign: 'center',
    marginBottom: spacing[2],
  },
  message: {
    ...typography.bodyS,
    textAlign: 'center',
    lineHeight: 13 * 1.7,
    marginBottom: spacing[5],
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing[3],
    width: '100%',
  },
  button: {
    flex: 1,
    height: 48,
    borderRadius: radius.lg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelButton: {
    borderWidth: 1,
  },
  cancelButtonText: {
    fontFamily: fonts.sansSb,
    fontSize: 15,
  },
  confirmButton: {},
  confirmButtonText: {
    fontFamily: fonts.sansSb,
    fontSize: 15,
    color: colors.neutral[0],
  },
})

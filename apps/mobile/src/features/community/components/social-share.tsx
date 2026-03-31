import * as React from 'react'
import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { colors, fonts, radius, spacing, typography } from '../../../theme/theme'

interface SocialShareProps {
  title: string
  message: string
  url: string
  onClose?: () => void
}

interface ShareOption {
  key: string
  label: string
  color: string
  buildUrl: (message: string, url: string) => string
}

const SHARE_OPTIONS: ShareOption[] = [
  {
    key: 'whatsapp',
    label: 'WhatsApp',
    color: '#25D366',
    buildUrl: (message, url) =>
      `whatsapp://send?text=${encodeURIComponent(`${message} ${url}`)}`,
  },
  {
    key: 'facebook',
    label: 'Facebook',
    color: '#1877F2',
    buildUrl: (_message, url) =>
      `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
  },
  {
    key: 'tiktok',
    label: 'TikTok',
    color: '#000000',
    buildUrl: (_message, url) =>
      `https://www.tiktok.com/share?url=${encodeURIComponent(url)}`,
  },
]

export function SocialShare({ title, message, url, onClose }: SocialShareProps) {
  async function handleShare(option: ShareOption): Promise<void> {
    const shareUrl = option.buildUrl(message, url)
    const canOpen = await Linking.canOpenURL(shareUrl)

    if (canOpen) {
      await Linking.openURL(shareUrl)
    }
    else {
      // Fallback: open web version
      const webFallback
        = option.key === 'whatsapp'
          ? `https://wa.me/?text=${encodeURIComponent(`${message} ${url}`)}`
          : shareUrl
      await Linking.openURL(webFallback)
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <TouchableOpacity
          style={styles.closeButton}
          onPress={onClose}
          accessibilityLabel="Fermer"
        >
          <Text style={styles.closeButtonText}>X</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.subtitle}>Partager via</Text>

      <View style={styles.optionsRow}>
        {SHARE_OPTIONS.map(option => (
          <TouchableOpacity
            key={option.key}
            style={[styles.shareOption, { borderColor: option.color }]}
            onPress={() => handleShare(option)}
            accessibilityLabel={`Partager sur ${option.label}`}
          >
            <View
              style={[styles.shareIconCircle, { backgroundColor: option.color }]}
            >
              <Text style={styles.shareIconText}>
                {option.label.charAt(0)}
              </Text>
            </View>
            <Text style={styles.shareLabel}>{option.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.neutral[0],
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing[5],
    gap: spacing[4],
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    ...typography.h3,
    color: colors.neutral[800],
  },
  closeButton: {
    minHeight: 44,
    minWidth: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontFamily: fonts.sansBd,
    fontSize: 16,
    color: colors.neutral[400],
  },
  subtitle: {
    ...typography.bodyS,
    color: colors.neutral[600],
  },
  optionsRow: {
    flexDirection: 'row',
    gap: spacing[3],
  },
  shareOption: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    gap: spacing[2],
    paddingVertical: spacing[3],
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  shareIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  shareIconText: {
    fontFamily: fonts.sansBd,
    fontSize: 18,
    color: colors.neutral[0],
  },
  shareLabel: {
    ...typography.caption,
    color: colors.neutral[600],
  },
})

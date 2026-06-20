import * as React from 'react'
import { useState } from 'react'
import {
  ActivityIndicator,
  Image,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { colors, fonts, radius, spacing, typography } from '../../../theme/theme'
import { apiFetch } from '../../../utils/api-client'
import { appAlert } from '../../common/components/app-alert'
import { useMediaUpload } from '../../media/hooks/use-media-upload'

interface PublicationComposerProps {
  groupId: string
  onPublished?: () => void
  onCancel?: () => void
}

type PublicationType = 'TEXT' | 'QUESTION' | 'TIP' | 'OFFER'

const PUBLICATION_TYPES: { value: PublicationType, label: string }[] = [
  { value: 'TEXT', label: 'Publication' },
  { value: 'QUESTION', label: 'Question' },
  { value: 'TIP', label: 'Conseil' },
  { value: 'OFFER', label: 'Offre' },
]

export function PublicationComposer({
  groupId,
  onPublished,
  onCancel,
}: PublicationComposerProps) {
  const [type, setType] = useState<PublicationType>('TEXT')
  const [content, setContent] = useState('')
  const [mediaUri, setMediaUri] = useState<string | null>(null)
  const [mediaId, setMediaId] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { uploading: _uploadingMedia, pickAndUpload } = useMediaUpload({
    context: 'COMMUNITY_MEDIA',
  })

  async function handlePickMedia(): Promise<void> {
    const result = await pickAndUpload()
    if (result) {
      setMediaId(result.mediaId)
      setMediaUri(result.publicUrl)
    }
  }

  async function handlePublish(): Promise<void> {
    if (!content.trim()) {
      appAlert('Erreur', 'Veuillez saisir du contenu')
      return
    }

    setIsSubmitting(true)
    try {
      const body: Record<string, unknown> = {
        type,
        content: content.trim(),
      }

      if (mediaId) {
        body.mediaId = mediaId
      }

      const res = await apiFetch(`/api/groups/${groupId}/publications`, {
        method: 'POST',
        body: JSON.stringify(body),
      })

      if (res.ok) {
        onPublished?.()
      }
      else {
        appAlert('Erreur', 'Impossible de publier. Veuillez reessayer.')
      }
    }
    catch {
      appAlert('Erreur', 'Une erreur est survenue')
    }
    finally {
      setIsSubmitting(false)
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Nouvelle publication</Text>
        <TouchableOpacity
          style={styles.cancelButton}
          onPress={onCancel}
          accessibilityLabel="Annuler"
        >
          <Text style={styles.cancelButtonText}>Annuler</Text>
        </TouchableOpacity>
      </View>

      {/* Type selector chips */}
      <View style={styles.typeRow}>
        {PUBLICATION_TYPES.map((pt) => {
          const isSelected = type === pt.value
          return (
            <TouchableOpacity
              key={pt.value}
              style={[styles.typeChip, isSelected && styles.typeChipActive]}
              onPress={() => setType(pt.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={pt.label}
            >
              <Text
                style={[styles.typeChipText, isSelected && styles.typeChipTextActive]}
              >
                {pt.label}
              </Text>
            </TouchableOpacity>
          )
        })}
      </View>

      {/* Text area */}
      <TextInput
        style={styles.textArea}
        value={content}
        onChangeText={setContent}
        placeholder="Partagez quelque chose avec le groupe..."
        placeholderTextColor={colors.neutral[400]}
        multiline
        numberOfLines={6}
        textAlignVertical="top"
        accessibilityLabel="Contenu de la publication"
      />

      {/* Media attachment */}
      {mediaUri
        ? (
            <View style={styles.mediaPreviewContainer}>
              <Image
                source={{ uri: mediaUri }}
                style={styles.mediaPreview}
                resizeMode="cover"
              />
              <TouchableOpacity
                style={styles.removeMediaButton}
                onPress={() => {
                  setMediaUri(null)
                  setMediaId(null)
                }}
                accessibilityLabel="Supprimer le media"
              >
                <Text style={styles.removeMediaText}>X</Text>
              </TouchableOpacity>
            </View>
          )
        : (
            <TouchableOpacity
              style={styles.addMediaButton}
              onPress={handlePickMedia}
              accessibilityLabel="Ajouter un media"
            >
              <Text style={styles.addMediaText}>+ Ajouter photo/video</Text>
            </TouchableOpacity>
          )}

      {/* Publish button */}
      <TouchableOpacity
        style={[styles.publishButton, (!content.trim() || isSubmitting) && styles.publishButtonDisabled]}
        onPress={handlePublish}
        disabled={!content.trim() || isSubmitting}
        accessibilityLabel="Publier"
      >
        {isSubmitting
          ? (
              <ActivityIndicator size="small" color={colors.neutral[0]} />
            )
          : (
              <Text style={styles.publishButtonText}>Publier</Text>
            )}
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.neutral[0],
    padding: spacing[4],
    gap: spacing[4],
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    ...typography.h2,
    color: colors.neutral[800],
  },
  cancelButton: {
    minHeight: 44,
    minWidth: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelButtonText: {
    fontFamily: fonts.sansMd,
    fontSize: 14,
    color: colors.neutral[600],
  },
  typeRow: {
    flexDirection: 'row',
    gap: spacing[2],
  },
  typeChip: {
    minHeight: 44,
    paddingHorizontal: spacing[4],
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.neutral[200],
    backgroundColor: colors.neutral[50],
  },
  typeChipActive: {
    backgroundColor: colors.green[50],
    borderColor: colors.green[400],
  },
  typeChipText: {
    fontFamily: fonts.sansMd,
    fontSize: 13,
    color: colors.neutral[600],
  },
  typeChipTextActive: {
    color: colors.green[800],
  },
  textArea: {
    minHeight: 120,
    borderWidth: 1,
    borderColor: colors.neutral[200],
    borderRadius: radius.md,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[3],
    fontFamily: fonts.sans,
    fontSize: 15,
    color: colors.neutral[800],
    backgroundColor: colors.neutral[50],
  },
  addMediaButton: {
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.neutral[200],
    borderStyle: 'dashed',
    backgroundColor: colors.neutral[50],
  },
  addMediaText: {
    fontFamily: fonts.sansMd,
    fontSize: 14,
    color: colors.neutral[400],
  },
  mediaPreviewContainer: {
    position: 'relative',
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  mediaPreview: {
    width: '100%',
    height: 160,
  },
  removeMediaButton: {
    position: 'absolute',
    top: spacing[2],
    right: spacing[2],
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeMediaText: {
    color: colors.neutral[0],
    fontFamily: fonts.sansBd,
    fontSize: 14,
  },
  publishButton: {
    minHeight: 44,
    backgroundColor: colors.green[400],
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  publishButtonDisabled: {
    opacity: 0.5,
  },
  publishButtonText: {
    fontFamily: fonts.sansSb,
    fontSize: 16,
    color: colors.neutral[0],
  },
})

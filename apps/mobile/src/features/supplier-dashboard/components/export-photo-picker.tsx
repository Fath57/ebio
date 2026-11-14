import ImagePlus from 'lucide-react-native/dist/esm/icons/image-plus'
import X from 'lucide-react-native/dist/esm/icons/x'
import {
  ActivityIndicator,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { colors, radius, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { appAlert } from '../../common/components/app-alert'
import { useMediaUpload } from '../../media/hooks/use-media-upload'

interface ExportPhotoPickerProps {
  photos: string[]
  onChange: (photos: string[]) => void
  max: number
  /** Spoken name of one photo (« photo d'origine », « photo de l'étiquette »). */
  noun: string
}

/**
 * Row of uploaded photos with an « add » tile, up to `max`. Photos go through
 * the product media context: they are shown to buyers once approved.
 */
export function ExportPhotoPicker({ photos, onChange, max, noun }: ExportPhotoPickerProps) {
  const { semantic } = useTheme()
  const { uploading, pickAndUpload } = useMediaUpload({ context: 'PRODUCT_PHOTO' })

  async function handleAdd(): Promise<void> {
    const result = await pickAndUpload()
    if (result?.publicUrl) {
      onChange([...photos, result.publicUrl].slice(0, max))
    }
    else if (result) {
      appAlert('Photo indisponible', 'La photo a été envoyée mais son adresse est introuvable. Réessayez.')
    }
  }

  function handleRemove(index: number): void {
    onChange(photos.filter((_, i) => i !== index))
  }

  return (
    <View style={styles.row}>
      {photos.map((uri, index) => (
        <View key={uri} style={[styles.tile, { backgroundColor: semantic.bgSurface }]}>
          <Image source={{ uri }} style={styles.image} resizeMode="contain" />
          <TouchableOpacity
            style={styles.remove}
            onPress={() => handleRemove(index)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`Retirer la ${noun} ${index + 1}`}
          >
            <X size={14} color={colors.neutral[0]} strokeWidth={2.5} />
          </TouchableOpacity>
        </View>
      ))}
      {photos.length < max
        ? (
            <TouchableOpacity
              style={[styles.tile, styles.add, { borderColor: semantic.borderNormal, backgroundColor: semantic.bgSurface }, uploading && styles.disabled]}
              onPress={handleAdd}
              disabled={uploading}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={`Ajouter une ${noun}`}
            >
              {uploading
                ? <ActivityIndicator size="small" color={colors.green[400]} />
                : <ImagePlus size={22} color={semantic.textTertiary} strokeWidth={1.75} />}
              <Text style={[styles.addText, { color: semantic.textTertiary }]}>
                {uploading ? 'Envoi…' : 'Ajouter'}
              </Text>
            </TouchableOpacity>
          )
        : null}
    </View>
  )
}

const TILE = 88

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  tile: {
    width: TILE,
    height: TILE,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  image: { width: '100%', height: '100%' },
  remove: {
    position: 'absolute',
    top: spacing[1],
    right: spacing[1],
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    backgroundColor: colors.neutral[900],
    alignItems: 'center',
    justifyContent: 'center',
  },
  add: {
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[1],
  },
  addText: { ...typography.caption },
  disabled: { opacity: 0.5 },
})

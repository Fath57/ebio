import type { TerroirCountry, TerroirOrigin } from '../terroir-api'
import Leaf from 'lucide-react-native/dist/esm/icons/leaf'
import MapPin from 'lucide-react-native/dist/esm/icons/map-pin'
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { colors, fonts, radius, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { Badge } from '../../common/components/badge'
import { Thumbnail } from '../../common/components/thumbnail'
import { TERROIR_COUNTRIES } from '../terroir-api'

/** « Terroir validé eBio »: validated for export with its origin filled in. */
export function TerroirBadge() {
  return <Badge variant="VALIDATED" label="Validé Valise du pays" />
}

interface CountryChipsProps {
  value: TerroirCountry
  onChange: (country: TerroirCountry) => void
  label?: string
}

/** France / Belgique, as a pair of radio chips. */
export function CountryChips({ value, onChange, label = 'Livrer en' }: CountryChipsProps) {
  const { semantic } = useTheme()
  return (
    <View style={styles.chipsBlock}>
      <Text style={[styles.chipsLabel, { color: semantic.textSecondary }]}>{label}</Text>
      <View style={styles.chipsRow} accessibilityRole="radiogroup">
        {TERROIR_COUNTRIES.map((country) => {
          const selected = country.code === value
          return (
            <TouchableOpacity
              key={country.code}
              style={[
                styles.chip,
                selected
                  ? { backgroundColor: semantic.bgPrimaryLight, borderColor: colors.green[600] }
                  : { backgroundColor: semantic.bgCard, borderColor: semantic.borderNormal },
              ]}
              onPress={() => onChange(country.code)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={country.label}
            >
              <Text style={[styles.chipText, { color: selected ? semantic.textPrimaryColor : semantic.textPrimary }, selected && styles.chipTextSelected]}>
                {selected ? `✓ ${country.label}` : country.label}
              </Text>
            </TouchableOpacity>
          )
        })}
      </View>
    </View>
  )
}

/** « Coopérative des femmes de Djougou, Atacora, récolte 2026, fabrication artisanale » */
export function originSentence(origin: TerroirOrigin): string {
  const where = [origin.producer, origin.place].filter(Boolean).join(', ')
  const details = [origin.year ? `récolte ${origin.year}` : null, origin.method].filter(Boolean).join(', ')
  return [where, details].filter(part => part.length > 0).join(', ')
}

interface OriginBlockProps {
  origin: TerroirOrigin
  title?: string
}

/** Producer, place, year, method and photos of the workshop. */
export function OriginBlock({ origin, title = 'Origine' }: OriginBlockProps) {
  const { semantic } = useTheme()
  const rows: Array<[string, string]> = []
  if (origin.producer)
    rows.push(['Producteur', origin.producer])
  if (origin.place)
    rows.push(['Lieu', origin.place])
  if (origin.year)
    rows.push(['Récolte ou fabrication', String(origin.year)])
  if (origin.method)
    rows.push(['Mode de fabrication', origin.method])
  return (
    <View style={[styles.originCard, { backgroundColor: colors.earth[50], borderColor: colors.earth[200] }]}>
      <View style={styles.originHeader}>
        <Leaf size={16} color={colors.earth[600]} strokeWidth={2.2} />
        <Text style={[styles.originTitle, { color: colors.earth[800] }]}>{title}</Text>
      </View>
      {rows.map(([label, value]) => (
        <View key={label} style={styles.originRow}>
          <Text style={[styles.originLabel, { color: colors.earth[600] }]}>{label}</Text>
          <Text style={[styles.originValue, { color: colors.earth[800] }]}>{value}</Text>
        </View>
      ))}
      {origin.photos.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.originPhotos}>
          {origin.photos.map((uri, index) => (
            <Thumbnail key={uri} uri={uri} style={styles.originPhoto} alt={`Photo de l’atelier ${index + 1}`} />
          ))}
        </ScrollView>
      )}
      {rows.length === 0 && origin.photos.length === 0 && (
        <Text style={[styles.originValue, { color: semantic.textSecondary }]}>Origine non renseignée</Text>
      )}
    </View>
  )
}

interface PickupAddressProps {
  address: string
  openingHours: string | null
  city?: string | null
}

export function PickupAddress({ address, openingHours, city }: PickupAddressProps) {
  const { semantic } = useTheme()
  return (
    <View style={styles.pickupRow}>
      <MapPin size={16} color={colors.green[600]} strokeWidth={2.2} />
      <View style={styles.pickupText}>
        <Text style={[styles.pickupAddress, { color: semantic.textPrimary }]}>
          {city ? `${address}, ${city}` : address}
        </Text>
        {openingHours && (
          <Text style={[styles.pickupHours, { color: semantic.textSecondary }]}>{openingHours}</Text>
        )}
      </View>
    </View>
  )
}

export const terroirStyles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    padding: spacing[4],
    gap: spacing[3],
  },
  cardTitle: {
    ...typography.h3,
  },
  price: {
    fontFamily: fonts.mono,
    fontSize: 15,
  },
  priceSecondary: {
    fontFamily: fonts.mono,
    fontSize: 12,
  },
  primaryButton: {
    minHeight: 48,
    borderRadius: radius.md,
    backgroundColor: colors.green[400],
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing[2],
    paddingHorizontal: spacing[4],
  },
  primaryButtonText: {
    fontFamily: fonts.sansBd,
    fontSize: 15,
    color: colors.neutral[0],
  },
  secondaryButton: {
    minHeight: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing[2],
    paddingHorizontal: spacing[4],
  },
  secondaryButtonText: {
    fontFamily: fonts.sansSb,
    fontSize: 14,
  },
  disabled: {
    opacity: 0.5,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing[6],
    gap: spacing[3],
  },
  muted: {
    ...typography.bodyS,
    textAlign: 'center',
  },
})

const styles = StyleSheet.create({
  chipsBlock: {
    gap: spacing[2],
  },
  chipsLabel: {
    ...typography.caption,
  },
  chipsRow: {
    flexDirection: 'row',
    gap: spacing[2],
  },
  chip: {
    minHeight: 44,
    paddingHorizontal: spacing[4],
    borderRadius: radius.pill,
    borderWidth: 1,
    justifyContent: 'center',
  },
  chipText: {
    fontFamily: fonts.sansMd,
    fontSize: 14,
  },
  chipTextSelected: {
    fontFamily: fonts.sansBd,
  },
  originCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing[4],
    gap: spacing[2],
  },
  originHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  originTitle: {
    ...typography.h3,
  },
  originRow: {
    gap: 2,
  },
  originLabel: {
    ...typography.overline,
  },
  originValue: {
    ...typography.bodyS,
  },
  originPhotos: {
    gap: spacing[2],
    paddingTop: spacing[1],
  },
  originPhoto: {
    width: 120,
    height: 90,
    borderRadius: radius.sm,
  },
  pickupRow: {
    flexDirection: 'row',
    gap: spacing[2],
    alignItems: 'flex-start',
  },
  pickupText: {
    flex: 1,
    gap: 2,
  },
  pickupAddress: {
    fontFamily: fonts.sansMd,
    fontSize: 14,
  },
  pickupHours: {
    ...typography.bodyS,
  },
})

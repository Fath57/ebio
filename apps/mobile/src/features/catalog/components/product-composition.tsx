import Leaf from 'lucide-react-native/dist/esm/icons/leaf'
import MapPin from 'lucide-react-native/dist/esm/icons/map-pin'
import TriangleAlert from 'lucide-react-native/dist/esm/icons/triangle-alert'
import * as React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { colors, fonts, radius, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { allergenLabel, labelLabel, nutritionBasisLabel } from '../composition'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface NutritionalValues {
  basis?: string | null
  energyKcal?: number
  fat?: number
  saturatedFat?: number
  carbohydrates?: number
  sugars?: number
  fiber?: number
  protein?: number
  salt?: number
}

export interface ProductCompositionData {
  ingredients: string | null
  allergens: string[]
  labels: string[]
  origin: string | null
  conservation: string | null
  nutritionalValues: NutritionalValues | null
}

// ─── Label chips (near title/price) ──────────────────────────────────────────

/**
 * Small earth-tinted chips for product labels (AB, Écocert…). Rendered as a
 * fragment so the chips flow inside the detail screen's existing tag row.
 */
export function ProductLabelChips({ labels }: { labels: string[] }) {
  return (
    <>
      {labels.map(label => (
        <View key={label} style={styles.labelChip}>
          <Leaf size={10} color={colors.earth[600]} strokeWidth={2.5} />
          <Text style={styles.labelChipText}>{labelLabel(label)}</Text>
        </View>
      ))}
    </>
  )
}

// ─── Nutrition table helpers ─────────────────────────────────────────────────

interface NutritionRow {
  key: string
  label: string
  value: string
  indented?: boolean
}

function formatNutritionValue(value: number, unit: string): string {
  return `${value.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} ${unit}`
}

function buildNutritionRows(nv: NutritionalValues): NutritionRow[] {
  const rows: NutritionRow[] = []
  if (nv.energyKcal !== undefined)
    rows.push({ key: 'energyKcal', label: 'Énergie', value: formatNutritionValue(nv.energyKcal, 'kcal') })
  if (nv.fat !== undefined)
    rows.push({ key: 'fat', label: 'Matières grasses', value: formatNutritionValue(nv.fat, 'g') })
  if (nv.saturatedFat !== undefined)
    rows.push({ key: 'saturatedFat', label: 'dont saturées', value: formatNutritionValue(nv.saturatedFat, 'g'), indented: true })
  if (nv.carbohydrates !== undefined)
    rows.push({ key: 'carbohydrates', label: 'Glucides', value: formatNutritionValue(nv.carbohydrates, 'g') })
  if (nv.sugars !== undefined)
    rows.push({ key: 'sugars', label: 'dont sucres', value: formatNutritionValue(nv.sugars, 'g'), indented: true })
  if (nv.fiber !== undefined)
    rows.push({ key: 'fiber', label: 'Fibres', value: formatNutritionValue(nv.fiber, 'g') })
  if (nv.protein !== undefined)
    rows.push({ key: 'protein', label: 'Protéines', value: formatNutritionValue(nv.protein, 'g') })
  if (nv.salt !== undefined)
    rows.push({ key: 'salt', label: 'Sel', value: formatNutritionValue(nv.salt, 'g') })
  return rows
}

// ─── Composition sections (after description) ────────────────────────────────

/**
 * « Fiche produit » sections: ingrédients, allergènes, origine, conservation
 * and nutrition table. Each section renders only when its data exists.
 */
export function ProductCompositionSections({ composition }: { composition: ProductCompositionData | null }) {
  const { semantic } = useTheme()

  if (!composition)
    return null

  const nutritionRows = composition.nutritionalValues
    ? buildNutritionRows(composition.nutritionalValues)
    : []

  const hasIngredients = Boolean(composition.ingredients)
  const hasAllergens = composition.allergens.length > 0
  const hasOrigin = Boolean(composition.origin)
  const hasConservation = Boolean(composition.conservation)
  const hasNutrition = nutritionRows.length > 0

  if (!hasIngredients && !hasAllergens && !hasOrigin && !hasConservation && !hasNutrition)
    return null

  return (
    <>
      {/* Ingrédients */}
      {hasIngredients && (
        <>
          <View style={[styles.divider, { backgroundColor: semantic.borderLight }]} />
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: semantic.textPrimary }]}>Ingrédients</Text>
            <Text style={[styles.bodyText, { color: semantic.textSecondary }]}>
              {composition.ingredients}
            </Text>
          </View>
        </>
      )}

      {/* Allergènes — prominent warning-tinted chips */}
      {hasAllergens && (
        <>
          <View style={[styles.divider, { backgroundColor: semantic.borderLight }]} />
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: semantic.textPrimary }]}>Allergènes</Text>
            <View style={styles.chipRow}>
              {composition.allergens.map(allergen => (
                <View key={allergen} style={styles.allergenChip}>
                  <TriangleAlert size={12} color={colors.coral[600]} strokeWidth={2.2} />
                  <Text style={styles.allergenChipText}>{allergenLabel(allergen)}</Text>
                </View>
              ))}
            </View>
          </View>
        </>
      )}

      {/* Origine */}
      {hasOrigin && (
        <>
          <View style={[styles.divider, { backgroundColor: semantic.borderLight }]} />
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: semantic.textPrimary }]}>Origine</Text>
            <View style={styles.originRow}>
              <MapPin size={15} color={colors.green[600]} strokeWidth={2.2} />
              <Text style={[styles.originText, { color: semantic.textSecondary }]}>
                {composition.origin}
              </Text>
            </View>
          </View>
        </>
      )}

      {/* Conservation */}
      {hasConservation && (
        <>
          <View style={[styles.divider, { backgroundColor: semantic.borderLight }]} />
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: semantic.textPrimary }]}>Conservation</Text>
            <Text style={[styles.bodyText, { color: semantic.textSecondary }]}>
              {composition.conservation}
            </Text>
          </View>
        </>
      )}

      {/* Valeurs nutritionnelles — 2-column table */}
      {hasNutrition && (
        <>
          <View style={[styles.divider, { backgroundColor: semantic.borderLight }]} />
          <View style={styles.section}>
            <View style={styles.nutritionTitleRow}>
              <Text style={[styles.sectionTitle, { color: semantic.textPrimary }]}>Valeurs nutritionnelles</Text>
              <Text style={[styles.nutritionSubtitle, { color: semantic.textTertiary }]}>
                {nutritionBasisLabel(composition.nutritionalValues?.basis)}
              </Text>
            </View>
            <View style={[styles.nutritionTable, { backgroundColor: semantic.bgSurface, borderColor: semantic.borderLight }]}>
              {nutritionRows.map((row, index) => (
                <View
                  key={row.key}
                  style={[
                    styles.nutritionRow,
                    index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: semantic.borderLight },
                  ]}
                >
                  <Text
                    style={[
                      row.indented ? styles.nutritionLabelIndented : styles.nutritionLabel,
                      { color: row.indented ? semantic.textTertiary : semantic.textSecondary },
                    ]}
                  >
                    {row.label}
                  </Text>
                  <Text style={[styles.nutritionValue, { color: semantic.textPrimary }]}>
                    {row.value}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        </>
      )}
    </>
  )
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Shared section layout — mirrors product-detail-screen sections
  section: {
    paddingHorizontal: spacing[5],
    gap: spacing[3],
  },
  sectionTitle: {
    ...typography.h3,
  },
  divider: {
    height: 1,
    marginHorizontal: spacing[5],
    marginVertical: spacing[5],
  },
  bodyText: {
    ...typography.bodyL,
    lineHeight: 15 * 1.8,
  },

  // Label chips (title/price area)
  labelChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.earth[50],
    paddingHorizontal: spacing[3],
    paddingVertical: 5,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.earth[100],
  },
  labelChipText: {
    fontFamily: fonts.sansSb,
    fontSize: 11,
    color: colors.earth[800],
    letterSpacing: 0.2,
  },

  // Allergen chips — warning tinted
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
  },
  allergenChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.coral[50],
    paddingHorizontal: spacing[3],
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.coral[100],
  },
  allergenChipText: {
    fontFamily: fonts.sansSb,
    fontSize: 12,
    color: colors.coral[600],
    letterSpacing: 0.2,
  },

  // Origin row
  originRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  originText: {
    ...typography.bodyL,
    flex: 1,
  },

  // Nutrition table
  nutritionTitleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing[2],
  },
  nutritionSubtitle: {
    fontFamily: fonts.sansMd,
    fontSize: 12,
  },
  nutritionTable: {
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  nutritionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing[3],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
  nutritionLabel: {
    fontFamily: fonts.sansMd,
    fontSize: 13,
  },
  nutritionLabelIndented: {
    fontFamily: fonts.sans,
    fontSize: 13,
    paddingLeft: spacing[4],
  },
  nutritionValue: {
    fontFamily: fonts.mono,
    fontSize: 13,
  },
})

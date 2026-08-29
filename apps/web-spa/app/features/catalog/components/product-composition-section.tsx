import type { NutritionalValues } from '@boilerstone/openapi-generator/client/types.gen'
import { Badge } from '@boilerstone/ui/components/primitives/badge'
import { Separator } from '@boilerstone/ui/components/primitives/separator'
import { Award, Leaf, MapPin, Snowflake, TriangleAlert } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { allergenName, labelName, nutritionBasisOf, nutritionPerBasis } from '../utils/composition'

interface ProductCompositionSectionProps {
  ingredients?: string | null
  allergens?: string[] | null
  labels?: string[] | null
  origin?: string | null
  conservation?: string | null
  nutritionalValues?: NutritionalValues | null
}

const NUTRITION_ROWS = [
  { key: 'energyKcal', unit: 'kcal', indent: false },
  { key: 'fat', unit: 'g', indent: false },
  { key: 'saturatedFat', unit: 'g', indent: true },
  { key: 'carbohydrates', unit: 'g', indent: false },
  { key: 'sugars', unit: 'g', indent: true },
  { key: 'fiber', unit: 'g', indent: false },
  { key: 'protein', unit: 'g', indent: false },
  { key: 'salt', unit: 'g', indent: false },
] as const

/**
 * Read-only display of the product composition data.
 * Renders nothing when no composition field is set.
 */
export function ProductCompositionSection({
  ingredients,
  allergens,
  labels,
  origin,
  conservation,
  nutritionalValues,
}: ProductCompositionSectionProps) {
  const { t } = useTranslation()

  const nutritionRows = NUTRITION_ROWS.filter(
    row => nutritionalValues?.[row.key] != null,
  )

  const hasContent
    = !!ingredients
      || (allergens?.length ?? 0) > 0
      || (labels?.length ?? 0) > 0
      || !!origin
      || !!conservation
      || nutritionRows.length > 0

  if (!hasContent)
    return null

  return (
    <div className="mt-10">
      <Separator className="mb-8" />
      <h2 className="text-xl font-bold tracking-tight mb-6">{t('catalog.composition.title')}</h2>

      <div className="grid gap-8 lg:grid-cols-2">
        <div className="space-y-6">
          {labels && labels.length > 0 && (
            <div>
              <p className="flex items-center gap-2 text-sm font-semibold mb-2">
                <Award className="h-4 w-4 text-ebio-green-600" />
                {t('catalog.composition.labels')}
              </p>
              <div className="flex flex-wrap gap-2">
                {labels.map(label => (
                  <Badge key={label} className="bg-ebio-green-600">{labelName(t, label)}</Badge>
                ))}
              </div>
            </div>
          )}

          {ingredients && (
            <div>
              <p className="flex items-center gap-2 text-sm font-semibold mb-2">
                <Leaf className="h-4 w-4 text-ebio-green-600" />
                {t('catalog.composition.ingredients')}
              </p>
              <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-line">{ingredients}</p>
            </div>
          )}

          {allergens && allergens.length > 0 && (
            <div>
              <p className="flex items-center gap-2 text-sm font-semibold mb-2">
                <TriangleAlert className="h-4 w-4 text-amber-500" />
                {t('catalog.composition.allergens')}
              </p>
              <div className="flex flex-wrap gap-2">
                {allergens.map(allergen => (
                  <Badge key={allergen} variant="outline">{allergenName(t, allergen)}</Badge>
                ))}
              </div>
            </div>
          )}

          {origin && (
            <div>
              <p className="flex items-center gap-2 text-sm font-semibold mb-2">
                <MapPin className="h-4 w-4 text-ebio-green-600" />
                {t('catalog.composition.origin')}
              </p>
              <p className="text-sm text-muted-foreground">{origin}</p>
            </div>
          )}

          {conservation && (
            <div>
              <p className="flex items-center gap-2 text-sm font-semibold mb-2">
                <Snowflake className="h-4 w-4 text-sky-500" />
                {t('catalog.composition.conservation')}
              </p>
              <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-line">{conservation}</p>
            </div>
          )}
        </div>

        {nutritionRows.length > 0 && (
          <div>
            <div className="rounded-xl border overflow-hidden">
              <div className="flex items-center justify-between bg-muted/50 px-4 py-3">
                <span className="text-sm font-semibold">{t('catalog.composition.nutrition.title')}</span>
                <span className="text-xs text-muted-foreground">{nutritionPerBasis(t, nutritionBasisOf(nutritionalValues))}</span>
              </div>
              <div className="divide-y">
                {nutritionRows.map(row => (
                  <div key={row.key} className="flex items-center justify-between px-4 py-2.5 text-sm">
                    <span className={row.indent ? 'pl-4 text-muted-foreground' : ''}>
                      {t(`catalog.composition.nutrition.${row.key}`)}
                    </span>
                    <span className="font-mono font-medium">
                      {nutritionalValues![row.key]!.toLocaleString('fr-FR')}
                      {' '}
                      <span className="text-xs font-normal text-muted-foreground">{row.unit}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

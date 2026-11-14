import type { TerroirTuningFormData } from '../forms/terroir-export-form'
import {
  adminTerroirExportSettingControllerGet,
  adminTerroirExportSettingControllerUpdate,
} from '@boilerstone/openapi-generator/client/sdk.gen'
import { Label } from '@boilerstone/ui/components/primitives/label'
import { Skeleton } from '@boilerstone/ui/components/primitives/skeleton'
import { Switch } from '@boilerstone/ui/components/primitives/switch'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { TriangleAlert } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchCategoriesQueryOptions } from '../../categories/utils/categories-queries'
import { TerroirExportForm } from '../forms/terroir-export-form'

interface TerroirExportSettingData {
  enabled: boolean
  packagingWeightG: number
  collectionDays: number
  weightTolerancePct: number
  /** Basis points: 200 = 2 %. */
  insuranceRateBps: number
  insuranceMin: number
  bannedCategoryIds: string[]
  pickupReminderDays: number
  /** Export criteria: a product keeping fewer days cannot travel. */
  minShelfLifeDays: number
  /** Export criteria: heaviest packed unit allowed, in grams. */
  maxUnitWeightG: number
}

type TerroirExportUpdate = Partial<TerroirExportSettingData>

const QUERY_KEY = ['admin', 'terroir-export-setting']

function toSetting(raw: TerroirExportSettingData): TerroirExportSettingData {
  return {
    enabled: Boolean(raw.enabled),
    packagingWeightG: Number(raw.packagingWeightG),
    collectionDays: Number(raw.collectionDays),
    weightTolerancePct: Number(raw.weightTolerancePct),
    insuranceRateBps: Number(raw.insuranceRateBps),
    insuranceMin: Number(raw.insuranceMin),
    bannedCategoryIds: raw.bannedCategoryIds ?? [],
    pickupReminderDays: Number(raw.pickupReminderDays),
    minShelfLifeDays: Number(raw.minShelfLifeDays ?? 90),
    maxUnitWeightG: Number(raw.maxUnitWeightG ?? 5000),
  }
}

function terroirExportSettingQueryOptions() {
  return {
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const response = await adminTerroirExportSettingControllerGet()
      if (response.error)
        throw new Error('Failed to fetch terroir export setting')
      return toSetting(response.data as TerroirExportSettingData)
    },
  }
}

/** One-word state for the settings card header; shares the card's query, no extra request. */
export function TerroirExportSummary() {
  const { t } = useTranslation()
  const { data } = useQuery(terroirExportSettingQueryOptions())
  if (!data)
    return null
  return <>{data.enabled ? t('admin.settings.summary.terroirExportOpen') : t('admin.settings.summary.terroirExportClosed')}</>
}

/**
 * The platform switch of the terroir export (011) and its tuning. Off by
 * default: the client routes refuse everything until the agency agreements
 * are signed, while the back office prepares agencies, departures and
 * export watch. The switch saves on the flick; the tuning has its own button.
 */
export function TerroirExportSetting() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [feedback, setFeedback] = useState<'saved' | 'error' | null>(null)

  const { data, isLoading } = useQuery(terroirExportSettingQueryOptions())
  const categories = useQuery(fetchCategoriesQueryOptions())

  const { mutate, isPending } = useMutation({
    mutationFn: async (body: TerroirExportUpdate) => {
      const response = await adminTerroirExportSettingControllerUpdate({ body })
      if (response.error)
        throw new Error('Failed to update terroir export setting')
      return toSetting(response.data as TerroirExportSettingData)
    },
    onMutate: () => {
      setFeedback(null)
    },
    onSuccess: (saved) => {
      setFeedback('saved')
      queryClient.setQueryData(QUERY_KEY, saved)
      // The criteria thresholds may have moved: every export status was re-evaluated.
      queryClient.invalidateQueries({ queryKey: ['admin', 'terroir'] })
    },
    onError: () => {
      setFeedback('error')
    },
  })

  const tuning = useMemo<TerroirTuningFormData | null>(() => data
    ? {
        packagingWeightG: data.packagingWeightG,
        collectionDays: data.collectionDays,
        weightTolerancePct: data.weightTolerancePct,
        insuranceRatePct: data.insuranceRateBps / 100,
        insuranceMin: data.insuranceMin,
        bannedCategoryIds: data.bannedCategoryIds,
        pickupReminderDays: data.pickupReminderDays,
        minShelfLifeDays: data.minShelfLifeDays,
        maxUnitWeightG: data.maxUnitWeightG,
      }
    : null, [data])

  const categoryOptions = useMemo(
    () => (categories.data?.categories ?? []).map(category => ({ id: category.id, name: category.name })),
    [categories.data],
  )

  const saveTuning = (values: TerroirTuningFormData) => {
    const { insuranceRatePct, ...rest } = values
    mutate({ ...rest, insuranceRateBps: Math.round(insuranceRatePct * 100) })
  }

  return (
    <div className="space-y-4">
      <div
        role="note"
        className="border-ebio-earth-200 bg-ebio-earth-50 text-ebio-earth-800 dark:border-ebio-earth-800 dark:bg-ebio-earth-900 dark:text-ebio-earth-100 flex gap-3 rounded-md border p-3 text-sm"
      >
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <p>{t('admin.settings.terroirExport.legalWarning')}</p>
      </div>
      {isLoading || !data || !tuning
        ? <Skeleton className="h-40 w-full" />
        : (
            <>
              <div className="flex items-start justify-between gap-6">
                <div className="space-y-1">
                  <Label htmlFor="terroir-export-enabled" className="text-base">
                    {t('admin.settings.terroirExport.toggleLabel')}
                  </Label>
                  <p className="text-muted-foreground text-sm">
                    {data.enabled
                      ? t('admin.settings.terroirExport.stateOpen')
                      : t('admin.settings.terroirExport.stateClosed')}
                  </p>
                </div>
                <Switch
                  id="terroir-export-enabled"
                  checked={data.enabled}
                  disabled={isPending}
                  onCheckedChange={enabled => mutate({ enabled })}
                />
              </div>
              <TerroirExportForm values={tuning} categories={categoryOptions} onSubmit={saveTuning} isPending={isPending} />
            </>
          )}
      {feedback === 'saved' && (
        <p role="status" className="text-ebio-green-600 dark:text-ebio-green-200 text-sm">{t('admin.settings.terroirExport.saved')}</p>
      )}
      {feedback === 'error' && (
        <p className="border-destructive/50 bg-destructive/10 text-destructive rounded-md border p-3 text-sm" role="alert">
          {t('admin.settings.terroirExport.error')}
        </p>
      )}
    </div>
  )
}

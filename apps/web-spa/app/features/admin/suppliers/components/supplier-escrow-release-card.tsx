import { Button } from '@boilerstone/ui/components/primitives/button'
import { Card, CardContent, CardHeader, CardTitle } from '@boilerstone/ui/components/primitives/card'
import { Input } from '@boilerstone/ui/components/primitives/input'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchPlatformEscrowReleaseQueryOptions, updateSupplierEscrowRelease } from '../utils/suppliers-queries'

const MAX_HOURS = 1440

interface SupplierEscrowReleaseCardProps {
  supplierId: string
  /** The shop's own delay in hours, null when it follows the platform. */
  hours: number | null
}

/**
 * When this shop is paid for its online sales: the platform delay, or one set
 * for it alone — down to zero, paid the moment the order is delivered.
 */
export function SupplierEscrowReleaseCard({ supplierId, hours }: SupplierEscrowReleaseCardProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { data: platform } = useQuery(fetchPlatformEscrowReleaseQueryOptions())
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState('')

  const save = useMutation({
    mutationFn: (value: number | null) => updateSupplierEscrowRelease(supplierId, value),
    onSuccess: () => {
      setIsEditing(false)
      queryClient.invalidateQueries({ queryKey: ['admin', 'suppliers', supplierId] })
    },
  })

  const describe = (value: number) => value === 0
    ? t('admin.suppliers.detail.escrowRelease.instant')
    : t('admin.suppliers.detail.escrowRelease.hours', { count: value })

  const current = hours !== null
    ? describe(hours)
    : t('admin.suppliers.detail.escrowRelease.platform', {
        delay: platform ? describe(platform.heuresMaximum) : '…',
      })

  const draftHours = Number(draft)
  const isDraftValid = draft !== '' && Number.isInteger(draftHours) && draftHours >= 0 && draftHours <= MAX_HOURS

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('admin.suppliers.detail.escrowRelease.title')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {!isEditing
          ? (
              <>
                <div className="flex justify-between gap-4 py-1.5 text-sm">
                  <span className="text-muted-foreground">{t('admin.suppliers.detail.escrowRelease.current')}</span>
                  <span className="text-right font-medium">{current}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setDraft(hours !== null ? String(hours) : '')
                      setIsEditing(true)
                    }}
                  >
                    {t('admin.suppliers.detail.escrowRelease.edit')}
                  </Button>
                  {hours !== 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={save.isPending}
                      onClick={() => save.mutate(0)}
                    >
                      {t('admin.suppliers.detail.escrowRelease.instantAction')}
                    </Button>
                  )}
                  {hours !== null && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={save.isPending}
                      onClick={() => save.mutate(null)}
                    >
                      {t('admin.suppliers.detail.escrowRelease.reset')}
                    </Button>
                  )}
                </div>
              </>
            )
          : (
              <>
                <div className="flex items-center gap-2">
                  <Input
                    id="supplier-escrow-hours"
                    type="number"
                    min={0}
                    max={MAX_HOURS}
                    step={1}
                    className="w-28"
                    value={draft}
                    aria-label={t('admin.suppliers.detail.escrowRelease.label')}
                    aria-invalid={draft !== '' && !isDraftValid}
                    onChange={event => setDraft(event.target.value)}
                  />
                  <span className="text-muted-foreground text-sm">{t('admin.suppliers.detail.escrowRelease.label')}</span>
                </div>
                {draft !== '' && !isDraftValid && (
                  <p className="text-destructive text-sm">{t('admin.suppliers.detail.escrowRelease.invalid')}</p>
                )}
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={save.isPending || !isDraftValid}
                    onClick={() => save.mutate(draftHours)}
                  >
                    {t('common.save')}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setIsEditing(false)}>
                    {t('common.cancel')}
                  </Button>
                </div>
                <p className="text-muted-foreground text-xs">
                  {t('admin.suppliers.detail.escrowRelease.hint')}
                </p>
              </>
            )}
      </CardContent>
    </Card>
  )
}

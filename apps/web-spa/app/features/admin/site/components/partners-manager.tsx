import type { LandingPartner } from '../utils/site-queries'
import { Badge } from '@boilerstone/ui/components/primitives/badge'
import { Button } from '@boilerstone/ui/components/primitives/button'
import { Card } from '@boilerstone/ui/components/primitives/card'
import { Input } from '@boilerstone/ui/components/primitives/input'
import { Switch } from '@boilerstone/ui/components/primitives/switch'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ImageUpload } from '@/features/media/components/image-upload'
import { createLandingPartner, deleteLandingPartner, updateLandingPartner } from '../utils/site-queries'
import { Field } from './section-card'

/**
 * The partners shown on the landing page.
 *
 * A partner is a name and a logo, nothing more: the banner says who eBio works
 * with, and a paragraph under each logo would turn a proof of trust into a
 * directory. The name is not decoration either — it is the alternative text a
 * screen reader announces, and what shows when the image fails to load.
 */
export function PartnersManager({ partners }: { partners: LandingPartner[] }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [isAdding, setIsAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [newLogoUrl, setNewLogoUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  function invalidate(): void {
    queryClient.invalidateQueries({ queryKey: ['admin', 'landing'] })
  }

  const { mutate: create, isPending: isCreating } = useMutation({
    mutationFn: () => createLandingPartner({
      name: newName,
      logoUrl: newLogoUrl ?? '',
      isActive: true,
      sortOrder: partners.length,
    }),
    onSuccess: () => {
      invalidate()
      setIsAdding(false)
      setNewName('')
      setNewLogoUrl(null)
    },
    onError: (mutationError: Error) => setError(mutationError.message),
  })

  return (
    <Card className="p-6">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold">{t('admin.site.partners.title')}</h3>
          <p className="text-muted-foreground text-sm">{t('admin.site.partners.description')}</p>
        </div>
        <Button variant="outline" onClick={() => setIsAdding(current => !current)}>
          <Plus className="mr-2 h-4 w-4" />
          {t('admin.site.partners.add')}
        </Button>
      </div>

      {error && <p className="text-destructive mb-4 text-sm">{error}</p>}

      {isAdding && (
        <div className="mb-6 space-y-3 rounded-lg border border-dashed p-4">
          <Field label={t('admin.site.partners.name')}>
            <Input value={newName} onChange={e => setNewName(e.target.value)} />
          </Field>
          <Field label={t('admin.site.partners.logo')}>
            <ImageUpload
              context="PARTNER_LOGO"
              max={1}
              size="lg"
              onUrlChange={url => setNewLogoUrl(url ?? null)}
            />
          </Field>
          <p className="text-muted-foreground text-xs">{t('admin.site.partners.logoHint')}</p>
          <Button onClick={() => create()} disabled={isCreating || !newName.trim() || !newLogoUrl}>
            {isCreating ? t('common.saving') : t('admin.site.save')}
          </Button>
        </div>
      )}

      <div className="space-y-4">
        {partners.map(partner => (
          <PartnerRow key={partner.id} partner={partner} onChanged={invalidate} onError={setError} />
        ))}
      </div>
    </Card>
  )
}

interface PartnerRowProps {
  partner: LandingPartner
  onChanged: () => void
  onError: (message: string) => void
}

function PartnerRow({ partner, onChanged, onError }: PartnerRowProps) {
  const { t } = useTranslation()
  const [name, setName] = useState(partner.name)
  const [logoUrl, setLogoUrl] = useState(partner.logoUrl)
  const [sortOrder, setSortOrder] = useState(partner.sortOrder)
  const [isDirty, setIsDirty] = useState(false)

  const { mutate: save, isPending: isSaving } = useMutation({
    mutationFn: () => updateLandingPartner(partner.id, { name, logoUrl, sortOrder }),
    onSuccess: () => {
      setIsDirty(false)
      onChanged()
    },
    onError: (mutationError: Error) => onError(mutationError.message),
  })

  const { mutate: toggle } = useMutation({
    mutationFn: (isActive: boolean) => updateLandingPartner(partner.id, { isActive }),
    onSuccess: onChanged,
    onError: (mutationError: Error) => onError(mutationError.message),
  })

  const { mutate: remove, isPending: isDeleting } = useMutation({
    mutationFn: () => deleteLandingPartner(partner.id),
    onSuccess: onChanged,
    onError: (mutationError: Error) => onError(mutationError.message),
  })

  function handleDelete(): void {
    // eslint-disable-next-line no-alert
    if (window.confirm(t('admin.site.partners.deleteConfirm'))) {
      remove()
    }
  }

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="flex items-center justify-between gap-3">
        <Badge variant={partner.isActive ? 'default' : 'outline'}>
          {partner.isActive ? t('admin.site.partners.active') : t('admin.site.partners.inactive')}
        </Badge>
        <div className="flex items-center gap-3">
          <label className="text-muted-foreground flex items-center gap-2 text-sm">
            {t('admin.site.partners.order')}
            <Input
              type="number"
              min={0}
              value={sortOrder}
              className="w-20"
              onChange={(e) => {
                setSortOrder(Number.parseInt(e.target.value, 10) || 0)
                setIsDirty(true)
              }}
            />
          </label>
          <Switch checked={partner.isActive} onCheckedChange={checked => toggle(checked)} />
          <Button size="sm" variant="ghost" onClick={handleDelete} disabled={isDeleting}>
            <Trash2 className="text-destructive h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <ImageUpload
          context="PARTNER_LOGO"
          max={1}
          size="lg"
          initialUrl={logoUrl}
          onUrlChange={(url) => {
            setLogoUrl(url ?? '')
            setIsDirty(true)
          }}
        />
        <Input
          value={name}
          className="min-w-48 flex-1"
          onChange={(e) => {
            setName(e.target.value)
            setIsDirty(true)
          }}
        />
      </div>

      {isDirty && (
        <Button size="sm" onClick={() => save()} disabled={isSaving || !name.trim() || !logoUrl}>
          {isSaving ? t('common.saving') : t('admin.site.save')}
        </Button>
      )}
    </div>
  )
}

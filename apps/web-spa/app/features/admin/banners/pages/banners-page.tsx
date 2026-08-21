import type { Banner } from '../utils/banners-queries'
import { Badge } from '@boilerstone/ui/components/primitives/badge'
import { Button } from '@boilerstone/ui/components/primitives/button'
import {
  Dialog as AlertDialog,
  DialogContent as AlertDialogContent,
} from '@boilerstone/ui/components/primitives/dialog'
import { Skeleton } from '@boilerstone/ui/components/primitives/skeleton'
import { Switch } from '@boilerstone/ui/components/primitives/switch'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link as LinkIcon, Megaphone, Package, Pencil, Plus, Store, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { deleteBanner, fetchBannersQueryOptions, updateBanner } from '../utils/banners-queries'

const TARGET_ICONS = {
  SUPPLIER: Store,
  PRODUCT: Package,
  URL: LinkIcon,
  NONE: Megaphone,
} as const

/**
 * The banners are pictures: the list shows them as the phone will, one card
 * per banner with its scrim and caption, rather than as table rows where the
 * visual is a thumbnail afterthought.
 */
export default function BannersPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const { data, isLoading } = useQuery(fetchBannersQueryOptions())

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin', 'banners'] })

  const toggle = useMutation({
    mutationFn: ({ id, isActive }: { id: string, isActive: boolean }) =>
      updateBanner(id, { isActive }),
    onSuccess: invalidate,
  })

  const remove = useMutation({
    mutationFn: deleteBanner,
    onSuccess: () => {
      invalidate()
      setDeletingId(null)
    },
  })

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
          <Skeleton className="aspect-2/1 w-full rounded-xl" />
          <Skeleton className="aspect-2/1 w-full rounded-xl" />
          <Skeleton className="aspect-2/1 w-full rounded-xl" />
        </div>
      </div>
    )
  }

  const banners = data?.items ?? []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">{t('admin.banners.title')}</h2>
          <p className="text-muted-foreground">{t('admin.banners.description')}</p>
        </div>
        <Button onClick={() => navigate('/admin/bannieres/nouvelle')}>
          <Plus className="mr-2 h-4 w-4" />
          {t('admin.banners.add')}
        </Button>
      </div>

      {banners.length === 0
        ? (
            <p className="text-muted-foreground rounded-xl border border-dashed px-6 py-16 text-center">
              {t('admin.banners.empty')}
            </p>
          )
        : (
            <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
              {banners.map(banner => (
                <BannerCard
                  key={banner.id}
                  banner={banner}
                  isToggling={toggle.isPending}
                  onToggle={isActive => toggle.mutate({ id: banner.id, isActive })}
                  onEdit={() => navigate(`/admin/bannieres/${banner.id}/modifier`)}
                  onDelete={() => setDeletingId(banner.id)}
                />
              ))}
            </div>
          )}

      <AlertDialog open={!!deletingId} onOpenChange={open => !open && setDeletingId(null)}>
        <AlertDialogContent>
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold">{t('admin.banners.deleteConfirm')}</h3>
              <p className="text-muted-foreground text-sm">{t('admin.banners.deleteWarning')}</p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDeletingId(null)}>{t('common.cancel')}</Button>
              <Button
                variant="destructive"
                disabled={remove.isPending}
                onClick={() => deletingId && remove.mutate(deletingId)}
              >
                {t('common.confirm')}
              </Button>
            </div>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

interface BannerCardProps {
  banner: Banner
  isToggling: boolean
  onToggle: (isActive: boolean) => void
  onEdit: () => void
  onDelete: () => void
}

function BannerCard({ banner, isToggling, onToggle, onEdit, onDelete }: BannerCardProps) {
  const { t } = useTranslation()
  const TargetIcon = TARGET_ICONS[banner.targetType]
  const isEntityTarget = banner.targetType === 'SUPPLIER' || banner.targetType === 'PRODUCT'

  const destination = banner.targetType === 'URL'
    ? banner.targetUrl
    : banner.targetType === 'NONE'
      ? t('admin.banners.noTarget')
      : banner.targetLabel

  return (
    <article className="overflow-hidden rounded-xl border shadow-sm">
      {/* The banner as the phone renders it: image, scrim, caption. */}
      <div className={`bg-muted relative aspect-2/1 ${banner.isActive ? '' : 'opacity-50 grayscale'}`}>
        <img src={banner.imageUrl} alt="" className="h-full w-full object-cover" />
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              'linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.45) 55%, rgba(0,0,0,0.88) 100%)',
          }}
        />
        <div className="absolute inset-x-4 bottom-3">
          <p className="truncate text-lg font-bold text-white">{banner.title}</p>
          {banner.subtitle && <p className="truncate text-xs text-white/80">{banner.subtitle}</p>}
        </div>
        <Badge variant="secondary" className="absolute top-2 left-2 font-mono">
          #
          {banner.position}
        </Badge>
        {!banner.isActive && (
          <Badge variant="outline" className="absolute top-2 right-2 bg-white/90">
            {t('admin.banners.inactive')}
          </Badge>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2 text-sm">
          <TargetIcon className="text-muted-foreground h-4 w-4 shrink-0" />
          <span className="text-muted-foreground shrink-0">
            {t(`admin.banners.targetType.${banner.targetType}`)}
          </span>
          {isEntityTarget && !banner.targetLabel
            ? <Badge variant="destructive">{t('admin.banners.brokenTarget')}</Badge>
            : destination && <span className="truncate font-medium">{destination}</span>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Switch
            checked={banner.isActive}
            disabled={isToggling}
            onCheckedChange={onToggle}
            aria-label={banner.isActive ? t('admin.banners.active') : t('admin.banners.inactive')}
          />
          <Button variant="ghost" size="sm" onClick={onEdit} aria-label={t('common.edit')}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={onDelete} aria-label={t('common.delete')}>
            <Trash2 className="text-destructive h-4 w-4" />
          </Button>
        </div>
      </div>
    </article>
  )
}

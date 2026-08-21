import type { BannerInput } from '../utils/banners-queries'
import { Button } from '@boilerstone/ui/components/primitives/button'
import { Card } from '@boilerstone/ui/components/primitives/card'
import { Skeleton } from '@boilerstone/ui/components/primitives/skeleton'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router'
import { BannerForm } from '../forms/banner-form'
import { fetchBannerQueryOptions, updateBanner } from '../utils/banners-queries'

export default function BannerEditPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { bannerId } = useParams()

  const { data: banner, isLoading } = useQuery({
    ...fetchBannerQueryOptions(bannerId ?? ''),
    enabled: Boolean(bannerId),
  })

  const { mutate, isPending } = useMutation({
    mutationFn: (data: BannerInput) => updateBanner(bannerId ?? '', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'banners'] })
      navigate('/admin/bannieres')
    },
  })

  if (isLoading) {
    return <Skeleton className="h-96 w-full max-w-2xl" />
  }

  if (!banner) {
    return <p className="text-muted-foreground">{t('admin.banners.notFound')}</p>
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/admin/bannieres')}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          {t('common.back')}
        </Button>
        <div>
          <h2 className="text-2xl font-bold">{t('admin.banners.edit')}</h2>
          <p className="text-muted-foreground text-sm">{banner.title}</p>
        </div>
      </div>
      <Card className="p-6">
        <BannerForm
          onSubmit={data => mutate({ ...data, targetId: data.targetId || null, targetUrl: data.targetUrl || null })}
          isPending={isPending}
          initialData={{
            title: banner.title,
            subtitle: banner.subtitle ?? '',
            imageUrl: banner.imageUrl,
            targetType: banner.targetType,
            targetId: banner.targetId ?? '',
            targetUrl: banner.targetUrl ?? '',
            isActive: banner.isActive,
            position: banner.position,
          }}
          // Without it the picker would show its placeholder over an existing
          // target, reading as if nothing had been chosen.
          initialTarget={banner.targetId
            ? { id: banner.targetId, label: banner.targetLabel ?? banner.targetId }
            : null}
        />
      </Card>
    </div>
  )
}

import type { BannerFormData } from '../forms/banner-form'
import { Button } from '@boilerstone/ui/components/primitives/button'
import { Card } from '@boilerstone/ui/components/primitives/card'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { BannerForm } from '../forms/banner-form'
import { createBanner } from '../utils/banners-queries'

export default function BannerCreatePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { mutate, isPending } = useMutation({
    mutationFn: createBanner,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'banners'] })
      navigate('/admin/bannieres')
    },
  })

  function handleSubmit(data: BannerFormData) {
    mutate(data)
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/admin/bannieres')}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          {t('common.back')}
        </Button>
        <div>
          <h2 className="text-2xl font-bold">{t('admin.banners.add')}</h2>
          <p className="text-muted-foreground text-sm">{t('admin.banners.addDescription')}</p>
        </div>
      </div>
      <Card className="p-6">
        <BannerForm onSubmit={handleSubmit} isPending={isPending} />
      </Card>
    </div>
  )
}

import { Button } from '@boilerstone/ui/components/primitives/button'
import { Lock } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

export default function UnauthorizedPage() {
  const { t } = useTranslation()

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 p-4 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-red-100 text-red-600">
        <Lock className="h-10 w-10" />
      </div>
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">{t('common.unauthorized.title')}</h1>
        <p className="text-muted-foreground">{t('common.unauthorized.description')}</p>
      </div>
      <Button asChild>
        <Link to="/">{t('common.unauthorized.backHome')}</Link>
      </Button>
    </div>
  )
}

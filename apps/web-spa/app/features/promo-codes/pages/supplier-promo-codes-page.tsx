import { Card, CardContent, CardHeader, CardTitle } from '@boilerstone/ui/components/primitives/card'
import { useTranslation } from 'react-i18next'
import { PromoCodesManager } from '../components/promo-codes-manager'
import { supplierPromoAdapter } from '../utils/promo-queries'

export default function SupplierPromoCodesPage() {
  const { t } = useTranslation()
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">{t('promoCodes.title')}</h2>
        <p className="text-muted-foreground">{t('promoCodes.supplierDescription')}</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{t('promoCodes.listTitle')}</CardTitle>
          <p className="text-muted-foreground text-sm">{t('promoCodes.supplierHint')}</p>
        </CardHeader>
        <CardContent>
          <PromoCodesManager adapter={supplierPromoAdapter} />
        </CardContent>
      </Card>
    </div>
  )
}

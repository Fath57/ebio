import { cn } from '@boilerstone/ui/lib/utils'
import { useTranslation } from 'react-i18next'
import { formatAmount } from '@/features/admin/wallets/utils/format-amount'

interface PackBalanceProps {
  price: number
  linesTotal: number
  className?: string
}

/**
 * The pack price against its products at today's shop prices. The shops are
 * always paid their own prices: below the sum, eBio pays the gap
 * (« compensé par eBio »); above it, the gap is eBio's margin.
 */
export function PackBalance({ price, linesTotal, className }: PackBalanceProps) {
  const { t } = useTranslation()
  const difference = price - linesTotal

  return (
    <dl className={cn('grid grid-cols-2 gap-x-4 gap-y-1 text-sm', className)}>
      <dt className="text-muted-foreground">{t('admin.terroir.packs.linesTotal')}</dt>
      <dd className="text-right font-mono">{formatAmount(linesTotal)}</dd>
      <dt className="text-muted-foreground">{t('admin.terroir.packs.price')}</dt>
      <dd className="text-right font-mono font-medium">{formatAmount(price)}</dd>
      <dt className="text-muted-foreground">
        {difference < 0 ? t('admin.terroir.packs.compensated') : t('admin.terroir.packs.margin')}
      </dt>
      <dd
        className={cn(
          'text-right font-mono font-medium',
          difference < 0 ? 'text-ebio-earth-800 dark:text-ebio-earth-100' : 'text-ebio-green-600 dark:text-ebio-green-200',
        )}
      >
        {formatAmount(Math.abs(difference))}
      </dd>
    </dl>
  )
}

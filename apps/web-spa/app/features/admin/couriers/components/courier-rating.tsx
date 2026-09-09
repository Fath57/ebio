import { Star } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface CourierRatingProps {
  ratingAvg: number | null
  ratingCount: number
  className?: string
}

/** Formats a 1-5 average with one decimal in the UI locale ("4,0" / "4.0"). */
export function formatRating(value: number, locale: string): string {
  return value.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}

/** Inline "★ 4,0 (12)" label; a muted dash while the courier has no rating yet. */
export function CourierRating({ ratingAvg, ratingCount, className = '' }: CourierRatingProps) {
  const { t, i18n } = useTranslation()

  if (ratingCount === 0 || ratingAvg === null)
    return <span className={`text-muted-foreground ${className}`}>—</span>

  return (
    <span
      className={`inline-flex items-center gap-1 tabular-nums ${className}`}
      aria-label={t('admin.couriers.ratingLabel', { value: formatRating(ratingAvg, i18n.language), count: ratingCount })}
    >
      <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-hidden />
      {formatRating(ratingAvg, i18n.language)}
      <span className="text-muted-foreground">{`(${ratingCount})`}</span>
    </span>
  )
}

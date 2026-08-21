import { Button } from '@boilerstone/ui/components/primitives/button'
import { Input } from '@boilerstone/ui/components/primitives/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@boilerstone/ui/components/primitives/table'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

export interface CommissionCategoryRate {
  category: string
  label: string
  /** Fraction (0.04 = 4 %), as stored by the API. */
  rate: number
}

interface CommissionFormProps {
  categories: CommissionCategoryRate[]
  onSubmit: (rates: Array<{ category: string, rate: number }>) => void
  isPending: boolean
}

/**
 * One percent field per product category. The grid is driven by the API so a
 * new category shows up here without a deploy; edits are sent back as
 * fractions, the unit orders store.
 */
export function CommissionForm({ categories, onSubmit, isPending }: CommissionFormProps) {
  const { t } = useTranslation()
  const [percents, setPercents] = useState<Record<string, string>>({})

  useEffect(() => {
    setPercents(Object.fromEntries(
      categories.map(item => [item.category, String(Math.round(item.rate * 10000) / 100)]),
    ))
  }, [categories])

  const isValid = categories.every((item) => {
    const value = Number(percents[item.category])
    return percents[item.category] !== '' && !Number.isNaN(value) && value >= 0 && value <= 100
  })

  const handleSubmit = () => {
    onSubmit(categories.map(item => ({
      category: item.category,
      rate: Number(percents[item.category]) / 100,
    })))
  }

  return (
    <div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('admin.settings.commission.category')}</TableHead>
            <TableHead>{t('admin.settings.commission.rate')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {categories.map(item => (
            <TableRow key={item.category}>
              <TableCell className="font-medium">{item.label}</TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step={0.1}
                    className="w-24"
                    value={percents[item.category] ?? ''}
                    onChange={event => setPercents(previous => ({
                      ...previous,
                      [item.category]: event.target.value,
                    }))}
                  />
                  <span className="text-muted-foreground text-sm">%</span>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <div className="mt-4">
        <Button onClick={handleSubmit} disabled={isPending || !isValid}>
          {t('common.save')}
        </Button>
      </div>
    </div>
  )
}

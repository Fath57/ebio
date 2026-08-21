import type { PromoAdapter, PromoCodeFormData, PromoCodeItem } from '../utils/promo-queries'
import { Badge } from '@boilerstone/ui/components/primitives/badge'
import { Button } from '@boilerstone/ui/components/primitives/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@boilerstone/ui/components/primitives/dialog'
import { Input } from '@boilerstone/ui/components/primitives/input'
import { Label } from '@boilerstone/ui/components/primitives/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@boilerstone/ui/components/primitives/select'
import { Skeleton } from '@boilerstone/ui/components/primitives/skeleton'
import { Switch } from '@boilerstone/ui/components/primitives/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@boilerstone/ui/components/primitives/table'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, PlusCircle, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

const EMPTY_FORM: PromoCodeFormData = {
  code: '',
  type: 'PERCENT',
  value: 10,
  maxDiscount: null,
  minOrderAmount: 0,
  startsAt: null,
  expiresAt: null,
  maxUses: null,
  maxUsesPerUser: 1,
}

function formatAmount(value: number): string {
  return `${value.toLocaleString('fr-FR')} FCFA`
}

/** Datetime-local input value ↔ ISO string. */
function toLocalInput(iso: string | null): string {
  if (!iso)
    return ''
  const date = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function PromoCodesManager({ adapter }: { adapter: PromoAdapter }) {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<PromoCodeItem | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [form, setForm] = useState<PromoCodeFormData>(EMPTY_FORM)
  const [actionError, setActionError] = useState<string | null>(null)

  const { data, isLoading } = useQuery({ queryKey: adapter.queryKey, queryFn: adapter.list })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: adapter.queryKey })
  const closeDialog = () => {
    setIsCreating(false)
    setEditing(null)
    setActionError(null)
  }
  const onError = (error: Error) => setActionError(error.message)

  const save = useMutation({
    mutationFn: (payload: PromoCodeFormData) =>
      editing ? adapter.update(editing.id, payload) : adapter.create(payload),
    onSuccess: () => {
      closeDialog()
      invalidate()
    },
    onError,
  })

  const toggle = useMutation({
    mutationFn: ({ id, isActive }: { id: string, isActive: boolean }) => adapter.update(id, { isActive }),
    onSuccess: invalidate,
    onError,
  })

  const remove = useMutation({
    mutationFn: (id: string) => adapter.remove(id),
    onSuccess: invalidate,
    onError,
  })

  const openCreate = () => {
    setForm(EMPTY_FORM)
    setIsCreating(true)
  }

  const openEdit = (promo: PromoCodeItem) => {
    setForm({
      code: promo.code,
      type: promo.type,
      value: promo.value,
      maxDiscount: promo.maxDiscount,
      minOrderAmount: promo.minOrderAmount,
      startsAt: promo.startsAt,
      expiresAt: promo.expiresAt,
      maxUses: promo.maxUses,
      maxUsesPerUser: promo.maxUsesPerUser,
    })
    setEditing(promo)
  }

  const isFormValid = form.code.trim().length >= 3
    && form.value > 0
    && (form.type !== 'PERCENT' || form.value <= 100)

  if (isLoading) {
    return <Skeleton className="h-48 w-full" />
  }

  const items = data?.items ?? []

  return (
    <div className="space-y-4">
      {actionError && (
        <p className="border-destructive/50 bg-destructive/10 text-destructive rounded-md border p-3 text-sm">
          {actionError}
        </p>
      )}

      <div className="flex justify-end">
        <Button size="sm" onClick={openCreate}>
          <PlusCircle className="mr-2 h-4 w-4" />
          {t('promoCodes.add')}
        </Button>
      </div>

      {items.length === 0
        ? (
            <p className="text-muted-foreground rounded-md border border-dashed p-6 text-center text-sm">
              {t('promoCodes.empty')}
            </p>
          )
        : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('promoCodes.columns.code')}</TableHead>
                  {adapter.showShopColumn && <TableHead>{t('promoCodes.columns.scope')}</TableHead>}
                  <TableHead>{t('promoCodes.columns.discount')}</TableHead>
                  <TableHead>{t('promoCodes.columns.conditions')}</TableHead>
                  <TableHead className="text-right">{t('promoCodes.columns.uses')}</TableHead>
                  <TableHead>{t('promoCodes.columns.active')}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map(promo => (
                  <TableRow key={promo.id}>
                    <TableCell>
                      <span className="font-mono font-bold">{promo.code}</span>
                    </TableCell>
                    {adapter.showShopColumn && (
                      <TableCell>
                        {promo.shopName
                          ? promo.shopName
                          : <Badge variant="secondary">{t('promoCodes.platform')}</Badge>}
                      </TableCell>
                    )}
                    <TableCell className="font-medium">
                      {promo.type === 'PERCENT'
                        ? `−${promo.value} %${promo.maxDiscount ? ` (max ${formatAmount(promo.maxDiscount)})` : ''}`
                        : `−${formatAmount(promo.value)}`}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {[
                        promo.minOrderAmount > 0 ? t('promoCodes.minShort', { amount: promo.minOrderAmount.toLocaleString('fr-FR') }) : null,
                        promo.expiresAt ? t('promoCodes.untilShort', { date: new Date(promo.expiresAt).toLocaleDateString(i18n.language) }) : null,
                      ].filter(Boolean).join(' · ') || '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      {promo.useCount}
                      {promo.maxUses !== null && ` / ${promo.maxUses}`}
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={promo.isActive}
                        disabled={toggle.isPending}
                        onCheckedChange={isActive => toggle.mutate({ id: promo.id, isActive })}
                        aria-label={t('promoCodes.columns.active')}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(promo)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" disabled={remove.isPending} onClick={() => remove.mutate(promo.id)}>
                        <Trash2 className="text-destructive h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

      <Dialog open={isCreating || editing !== null} onOpenChange={open => !open && closeDialog()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editing ? t('promoCodes.editTitle') : t('promoCodes.createTitle')}
            </DialogTitle>
            <DialogDescription>{t('promoCodes.formHint')}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t('promoCodes.fields.code')}</Label>
              <Input
                value={form.code}
                placeholder="BIO10"
                disabled={editing !== null}
                onChange={event => setForm(previous => ({ ...previous, code: event.target.value.toUpperCase() }))}
              />
              <p className="text-muted-foreground text-xs">
                {editing ? t('promoCodes.fields.codeLocked') : t('promoCodes.fields.codeHint')}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>{t('promoCodes.fields.type')}</Label>
              <Select
                value={form.type}
                onValueChange={value => setForm(previous => ({ ...previous, type: value as 'PERCENT' | 'FIXED' }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PERCENT">{t('promoCodes.types.PERCENT')}</SelectItem>
                  <SelectItem value="FIXED">{t('promoCodes.types.FIXED')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{form.type === 'PERCENT' ? t('promoCodes.fields.percent') : t('promoCodes.fields.amount')}</Label>
              <Input
                type="number"
                min={1}
                max={form.type === 'PERCENT' ? 100 : undefined}
                value={form.value}
                onChange={event => setForm(previous => ({ ...previous, value: Number(event.target.value) }))}
              />
            </div>
            {form.type === 'PERCENT' && (
              <div className="space-y-1.5">
                <Label>{t('promoCodes.fields.maxDiscount')}</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.maxDiscount ?? ''}
                  placeholder={t('promoCodes.fields.unlimited')}
                  onChange={event => setForm(previous => ({
                    ...previous,
                    maxDiscount: event.target.value === '' ? null : Number(event.target.value),
                  }))}
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label>{t('promoCodes.fields.minOrder')}</Label>
              <Input
                type="number"
                min={0}
                value={form.minOrderAmount}
                onChange={event => setForm(previous => ({ ...previous, minOrderAmount: Number(event.target.value) }))}
              />
              <p className="text-muted-foreground text-xs">{t('promoCodes.fields.minOrderHint')}</p>
            </div>
            <div className="space-y-1.5">
              <Label>{t('promoCodes.fields.maxUses')}</Label>
              <Input
                type="number"
                min={1}
                value={form.maxUses ?? ''}
                placeholder={t('promoCodes.fields.unlimited')}
                onChange={event => setForm(previous => ({
                  ...previous,
                  maxUses: event.target.value === '' ? null : Number(event.target.value),
                }))}
              />
              <p className="text-muted-foreground text-xs">{t('promoCodes.fields.maxUsesHint')}</p>
            </div>
            <div className="space-y-1.5">
              <Label>{t('promoCodes.fields.maxUsesPerUser')}</Label>
              <Input
                type="number"
                min={1}
                value={form.maxUsesPerUser}
                onChange={event => setForm(previous => ({ ...previous, maxUsesPerUser: Number(event.target.value) || 1 }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t('promoCodes.fields.startsAt')}</Label>
              <Input
                type="datetime-local"
                value={toLocalInput(form.startsAt)}
                onChange={event => setForm(previous => ({
                  ...previous,
                  startsAt: event.target.value ? new Date(event.target.value).toISOString() : null,
                }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t('promoCodes.fields.expiresAt')}</Label>
              <Input
                type="datetime-local"
                value={toLocalInput(form.expiresAt)}
                onChange={event => setForm(previous => ({
                  ...previous,
                  expiresAt: event.target.value ? new Date(event.target.value).toISOString() : null,
                }))}
              />
              <p className="text-muted-foreground text-xs">{t('promoCodes.fields.expiresAtHint')}</p>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={closeDialog}>{t('common.cancel')}</Button>
            <Button disabled={save.isPending || !isFormValid} onClick={() => save.mutate(form)}>
              {t('common.save')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

import type { PaymentMethodFormData, PaymentMethodItem } from '../utils/payment-methods-queries'
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
import {
  createPaymentMethod,
  deletePaymentMethod,
  fetchPaymentMethodsQueryOptions,
  togglePaymentMethod,
  updatePaymentMethod,
} from '../utils/payment-methods-queries'

const EMPTY_FORM: PaymentMethodFormData = {
  name: '',
  code: '',
  type: 'mobile',
  provider: 'fedapay',
  countryCode: 'BJ',
  commission: 0,
  priority: 0,
  active: true,
  useFedapayCheckout: false,
  supportsPayout: false,
  supportsRefund: false,
}

export function PaymentMethodsManager() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<PaymentMethodItem | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [form, setForm] = useState<PaymentMethodFormData>(EMPTY_FORM)
  const [deleting, setDeleting] = useState<PaymentMethodItem | null>(null)

  const { data: methods, isLoading } = useQuery(fetchPaymentMethodsQueryOptions())

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'payment-methods'] })
  }

  const closeDialog = () => {
    setIsCreating(false)
    setEditing(null)
  }

  const save = useMutation({
    mutationFn: (data: PaymentMethodFormData) =>
      editing ? updatePaymentMethod(editing.id, data) : createPaymentMethod(data),
    onSuccess: () => {
      closeDialog()
      invalidate()
    },
  })

  const toggle = useMutation({
    mutationFn: (id: string) => togglePaymentMethod(id),
    onSuccess: invalidate,
  })

  const remove = useMutation({
    mutationFn: (id: string) => deletePaymentMethod(id),
    onSuccess: () => {
      setDeleting(null)
      invalidate()
    },
  })

  const openCreate = () => {
    setForm(EMPTY_FORM)
    setIsCreating(true)
  }

  const openEdit = (method: PaymentMethodItem) => {
    setForm({
      name: method.name,
      code: method.code,
      type: method.type,
      provider: method.provider,
      countryCode: method.countryCode,
      commission: method.commission,
      priority: method.priority,
      active: method.active,
      useFedapayCheckout: method.useFedapayCheckout,
      supportsPayout: method.supportsPayout,
      supportsRefund: method.supportsRefund,
    })
    setEditing(method)
  }

  const isFormValid = form.name.trim().length > 0
    && form.code.trim().length > 0
    && form.countryCode.trim().length >= 2

  if (isLoading) {
    return <Skeleton className="h-40 w-full" />
  }

  const items = methods ?? []

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={openCreate}>
          <PlusCircle className="mr-2 h-4 w-4" />
          {t('admin.settings.paymentMethods.add')}
        </Button>
      </div>

      {items.length === 0
        ? (
            <p className="text-muted-foreground rounded-md border border-dashed p-6 text-center text-sm">
              {t('admin.settings.paymentMethods.empty')}
            </p>
          )
        : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('admin.settings.paymentMethods.columns.name')}</TableHead>
                  <TableHead>{t('admin.settings.paymentMethods.columns.type')}</TableHead>
                  <TableHead>{t('admin.settings.paymentMethods.columns.provider')}</TableHead>
                  <TableHead>{t('admin.settings.paymentMethods.columns.country')}</TableHead>
                  <TableHead className="text-right">{t('admin.settings.paymentMethods.columns.fee')}</TableHead>
                  <TableHead>{t('admin.settings.paymentMethods.columns.active')}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map(method => (
                  <TableRow key={method.id}>
                    <TableCell>
                      <span className="font-medium">{method.name}</span>
                      <span className="text-muted-foreground ml-2 font-mono text-xs">{method.code}</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {t(`admin.settings.paymentMethods.types.${method.type}`)}
                      </Badge>
                    </TableCell>
                    <TableCell>{method.provider}</TableCell>
                    <TableCell>{method.countryCode}</TableCell>
                    <TableCell className="text-right">
                      {method.commission}
                      {' '}
                      %
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={method.active}
                        disabled={toggle.isPending}
                        onCheckedChange={() => toggle.mutate(method.id)}
                        aria-label={t('admin.settings.paymentMethods.columns.active')}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(method)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setDeleting(method)}>
                        <Trash2 className="text-destructive h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

      {/* Create / edit dialog */}
      <Dialog open={isCreating || editing !== null} onOpenChange={open => !open && closeDialog()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editing
                ? t('admin.settings.paymentMethods.editTitle')
                : t('admin.settings.paymentMethods.createTitle')}
            </DialogTitle>
            <DialogDescription>
              {t('admin.settings.paymentMethods.formHint')}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t('admin.settings.paymentMethods.fields.name')}</Label>
              <Input
                value={form.name}
                placeholder="MTN Mobile Money"
                onChange={event => setForm(previous => ({ ...previous, name: event.target.value }))}
              />
              <p className="text-muted-foreground text-xs">{t('admin.settings.paymentMethods.fields.nameHint')}</p>
            </div>
            <div className="space-y-1.5">
              <Label>{t('admin.settings.paymentMethods.fields.code')}</Label>
              <Input
                value={form.code}
                placeholder="mtn_bj"
                onChange={event => setForm(previous => ({ ...previous, code: event.target.value }))}
              />
              <p className="text-muted-foreground text-xs">{t('admin.settings.paymentMethods.fields.codeHint')}</p>
            </div>
            <div className="space-y-1.5">
              <Label>{t('admin.settings.paymentMethods.fields.type')}</Label>
              <Select
                value={form.type}
                onValueChange={value => setForm(previous => ({ ...previous, type: value as 'mobile' | 'card' }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mobile">{t('admin.settings.paymentMethods.types.mobile')}</SelectItem>
                  <SelectItem value="card">{t('admin.settings.paymentMethods.types.card')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t('admin.settings.paymentMethods.fields.provider')}</Label>
              <Select
                value={form.provider}
                onValueChange={value => setForm(previous => ({
                  ...previous,
                  provider: value as PaymentMethodFormData['provider'],
                }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fedapay">FedaPay</SelectItem>
                  <SelectItem value="stripe">Stripe</SelectItem>
                  <SelectItem value="pawerpayer">PawaPay</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t('admin.settings.paymentMethods.fields.country')}</Label>
              <Input
                value={form.countryCode}
                maxLength={3}
                placeholder="BJ"
                onChange={event => setForm(previous => ({ ...previous, countryCode: event.target.value.toUpperCase() }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t('admin.settings.paymentMethods.fields.fee')}</Label>
              <Input
                type="number"
                min={0}
                max={100}
                step={0.1}
                value={form.commission}
                onChange={event => setForm(previous => ({ ...previous, commission: Number(event.target.value) }))}
              />
              <p className="text-muted-foreground text-xs">{t('admin.settings.paymentMethods.fields.feeHint')}</p>
            </div>
            <div className="space-y-1.5">
              <Label>{t('admin.settings.paymentMethods.fields.priority')}</Label>
              <Input
                type="number"
                min={0}
                value={form.priority}
                onChange={event => setForm(previous => ({ ...previous, priority: Number(event.target.value) }))}
              />
              <p className="text-muted-foreground text-xs">{t('admin.settings.paymentMethods.fields.priorityHint')}</p>
            </div>
          </div>

          <div className="space-y-3 pt-2">
            {([
              ['active', 'activeHint'],
              ['useFedapayCheckout', 'useFedapayCheckoutHint'],
              ['supportsPayout', 'supportsPayoutHint'],
              ['supportsRefund', 'supportsRefundHint'],
            ] as const).map(([key, hintKey]) => (
              <div key={key} className="flex items-center justify-between gap-4">
                <div>
                  <Label>{t(`admin.settings.paymentMethods.fields.${key}`)}</Label>
                  <p className="text-muted-foreground text-xs">{t(`admin.settings.paymentMethods.fields.${hintKey}`)}</p>
                </div>
                <Switch
                  checked={form[key]}
                  onCheckedChange={checked => setForm(previous => ({ ...previous, [key]: checked }))}
                />
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={closeDialog}>{t('common.cancel')}</Button>
            <Button disabled={save.isPending || !isFormValid} onClick={() => save.mutate(form)}>
              {t('common.save')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={deleting !== null} onOpenChange={open => !open && setDeleting(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('admin.settings.paymentMethods.deleteTitle')}</DialogTitle>
            <DialogDescription>
              {t('admin.settings.paymentMethods.deleteBody', { name: deleting?.name ?? '' })}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDeleting(null)}>{t('common.cancel')}</Button>
            <Button
              variant="destructive"
              disabled={remove.isPending}
              onClick={() => deleting && remove.mutate(deleting.id)}
            >
              {t('common.confirm')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

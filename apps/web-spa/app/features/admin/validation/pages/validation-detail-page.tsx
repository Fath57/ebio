import { Button } from '@boilerstone/ui/components/primitives/button'
import { Card } from '@boilerstone/ui/components/primitives/card'
import { Skeleton } from '@boilerstone/ui/components/primitives/skeleton'
import { Textarea } from '@boilerstone/ui/components/primitives/textarea'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router'
import { Can } from '@/lib/casl/can'
import { SupplierDossier } from '../components/supplier-dossier'
import {
  fetchSupplierByIdQueryOptions,
  rejectSupplierMutationOptions,
  requestComplementMutationOptions,
  validateSupplierMutationOptions,
} from '../utils/validation-queries'

export default function ValidationDetailPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { supplierId } = useParams()
  const [reason, setReason] = useState('')
  const [showRejectForm, setShowRejectForm] = useState(false)
  const [showComplementForm, setShowComplementForm] = useState(false)

  const { data: supplier, isLoading } = useQuery(fetchSupplierByIdQueryOptions(supplierId!))

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'validation'] })
    // Le statut change aussi la liste générale des fournisseurs.
    queryClient.invalidateQueries({ queryKey: ['admin', 'suppliers'] })
    navigate('/admin/validations')
  }

  const { mutate: validate, isPending: isValidating } = useMutation({
    ...validateSupplierMutationOptions,
    onSuccess: invalidate,
  })

  const { mutate: reject, isPending: isRejecting } = useMutation({
    ...rejectSupplierMutationOptions,
    onSuccess: invalidate,
  })

  const { mutate: requestComplement, isPending: isRequesting } = useMutation({
    ...requestComplementMutationOptions,
    onSuccess: invalidate,
  })

  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  if (!supplier) {
    return null
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/admin/validations')}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          {t('common.back')}
        </Button>
        <div>
          <h2 className="text-2xl font-bold">{t('admin.validation.dossier.title')}</h2>
          <p className="text-sm text-muted-foreground">
            {supplier.fullName as string}
          </p>
        </div>
      </div>

      <SupplierDossier supplier={supplier} />

      {/* Action buttons */}
      <Can action="manage" subject="User">
        <Card className="p-6 space-y-4">
          {!showRejectForm && !showComplementForm && (
            <div className="flex gap-3">
              <Button
                onClick={() => validate(supplierId!)}
                disabled={isValidating}
              >
                {t('admin.validation.actions.validate')}
              </Button>
              <Button
                variant="destructive"
                onClick={() => setShowRejectForm(true)}
              >
                {t('admin.validation.actions.reject')}
              </Button>
              <Button
                variant="secondary"
                onClick={() => setShowComplementForm(true)}
              >
                {t('admin.validation.actions.requestComplement')}
              </Button>
            </div>
          )}

          {showRejectForm && (
            <div className="space-y-3">
              <h3 className="font-semibold">{t('admin.validation.rejectDialog.title')}</h3>
              <Textarea
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder={t('admin.validation.rejectDialog.reasonPlaceholder')}
                rows={4}
              />
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowRejectForm(false)
                    setReason('')
                  }}
                >
                  {t('common.cancel')}
                </Button>
                <Button
                  variant="destructive"
                  disabled={isRejecting || !reason.trim()}
                  onClick={() => reject({ supplierId: supplierId!, reason })}
                >
                  {t('admin.validation.actions.reject')}
                </Button>
              </div>
            </div>
          )}

          {showComplementForm && (
            <div className="space-y-3">
              <h3 className="font-semibold">{t('admin.validation.complementDialog.title')}</h3>
              <Textarea
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder={t('admin.validation.complementDialog.messagePlaceholder')}
                rows={4}
              />
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowComplementForm(false)
                    setReason('')
                  }}
                >
                  {t('common.cancel')}
                </Button>
                <Button
                  disabled={isRequesting || !reason.trim()}
                  onClick={() => requestComplement({ supplierId: supplierId!, message: reason })}
                >
                  {t('admin.validation.actions.requestComplement')}
                </Button>
              </div>
            </div>
          )}
        </Card>
      </Can>
    </div>
  )
}

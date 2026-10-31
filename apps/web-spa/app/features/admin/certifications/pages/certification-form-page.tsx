import type { CertificationFormData } from '../forms/certification-form'
import { Card } from '@boilerstone/ui/components/primitives/card'
import { Skeleton } from '@boilerstone/ui/components/primitives/skeleton'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router'
import { BackLink } from '@/features/admin/common/components/back-link'
import { CertificationForm } from '../forms/certification-form'
import {
  createCertificationMutationOptions,
  fetchCertificationQueryOptions,
  updateCertificationMutationOptions,
} from '../utils/certifications-queries'

const LIST_PATH = '/admin/certifications'

/** Create and edit in one page: the route carries an id only when editing. */
export default function CertificationFormPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { certificationId } = useParams()
  const isEditing = Boolean(certificationId)
  const [error, setError] = useState<string | null>(null)

  const { data: certification, isLoading } = useQuery({
    ...fetchCertificationQueryOptions(certificationId ?? ''),
    enabled: isEditing,
  })

  const onSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'certifications'] })
    queryClient.invalidateQueries({ queryKey: ['certifications', 'active'] })
    navigate(LIST_PATH)
  }
  // A duplicate code is the usual refusal; showing it beats a dead button.
  const onError = (mutationError: Error) => setError(mutationError.message)
  const create = useMutation({ ...createCertificationMutationOptions, onSuccess, onError })
  const update = useMutation({ ...updateCertificationMutationOptions, onSuccess, onError })

  function handleSubmit(data: CertificationFormData) {
    setError(null)
    const input = {
      code: data.code,
      name: data.name,
      description: data.description?.trim() ? data.description.trim() : null,
      logoUrl: data.logoUrl ?? null,
      isActive: data.isActive,
      sortOrder: data.sortOrder,
    }
    if (certificationId)
      update.mutate({ id: certificationId, ...input })
    else
      create.mutate(input)
  }

  if (isEditing && isLoading) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-4">
        <BackLink fallback={LIST_PATH} />
        <div>
          <h2 className="text-2xl font-bold">
            {isEditing ? t('admin.certifications.edit') : t('admin.certifications.add')}
          </h2>
          <p className="text-muted-foreground text-sm">{t('admin.certifications.formDescription')}</p>
        </div>
      </div>
      <Card className="p-6">
        {error && <p className="text-destructive mb-4 text-sm" role="alert">{error}</p>}
        <CertificationForm
          onSubmit={handleSubmit}
          isPending={create.isPending || update.isPending}
          isEditing={isEditing}
          initialData={certification
            ? {
                code: certification.code,
                name: certification.name,
                description: certification.description ?? '',
                logoUrl: certification.logoUrl ?? undefined,
                isActive: certification.isActive,
                sortOrder: certification.sortOrder,
              }
            : undefined}
        />
      </Card>
    </div>
  )
}

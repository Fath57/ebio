import type { SupplierValidationItem } from '../utils/validation-queries'
import { Card, CardContent, CardHeader, CardTitle } from '@boilerstone/ui/components/primitives/card'
import { Separator } from '@boilerstone/ui/components/primitives/separator'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

interface SupplierDossierProps {
  supplier: SupplierValidationItem
}

export const SupplierDossier: React.FC<SupplierDossierProps> = ({ supplier }) => {
  const { t } = useTranslation()

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{t('admin.validation.dossier.identity')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{t('admin.validation.dossier.fullName')}</p>
            <p>{supplier.fullName}</p>
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">{t('admin.validation.dossier.email')}</p>
            <p>{supplier.email}</p>
          </div>
          {supplier.identityDocumentUrl && (
            <div>
              <p className="text-sm font-medium text-muted-foreground">{t('admin.validation.dossier.identityDocument')}</p>
              <a
                href={supplier.identityDocumentUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline text-sm"
              >
                {t('admin.validation.dossier.viewDocument')}
              </a>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('admin.validation.dossier.businessProof')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{t('admin.validation.dossier.businessNumber')}</p>
            <p>{supplier.businessNumber || '-'}</p>
          </div>
          {supplier.businessProofUrl && (
            <div>
              <p className="text-sm font-medium text-muted-foreground">{t('admin.validation.dossier.businessDocument')}</p>
              <a
                href={supplier.businessProofUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline text-sm"
              >
                {t('admin.validation.dossier.viewDocument')}
              </a>
            </div>
          )}
        </CardContent>
      </Card>

      <Separator />

      <Card>
        <CardHeader>
          <CardTitle>{t('admin.validation.dossier.shopInfo')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{t('admin.validation.dossier.shopName')}</p>
            <p>{supplier.shopName || '-'}</p>
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">{t('admin.validation.dossier.address')}</p>
            <p>{supplier.address || '-'}</p>
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">{t('admin.validation.dossier.phone')}</p>
            <p>{supplier.phone || '-'}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

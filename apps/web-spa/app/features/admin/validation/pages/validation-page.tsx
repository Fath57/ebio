import { Badge } from '@boilerstone/ui/components/primitives/badge'
import { Button } from '@boilerstone/ui/components/primitives/button'
import { Skeleton } from '@boilerstone/ui/components/primitives/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@boilerstone/ui/components/primitives/table'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { fetchPendingSuppliersQueryOptions } from '../utils/validation-queries'

const STATUS_VARIANTS: Record<string, 'outline' | 'default' | 'destructive' | 'secondary'> = {
  PENDING: 'outline',
  COMPLEMENT_REQUESTED: 'secondary',
  VALIDATED: 'default',
  REJECTED: 'destructive',
}

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'En attente',
  COMPLEMENT_REQUESTED: 'Complément demandé',
  VALIDATED: 'Validé',
  REJECTED: 'Rejeté',
}

export default function ValidationPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const { data, isLoading } = useQuery(fetchPendingSuppliersQueryOptions())

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  const suppliers = data?.items ?? []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">{t('admin.validation.title')}</h2>
          <p className="text-muted-foreground">{t('admin.validation.description')}</p>
        </div>
        {suppliers.length > 0 && (
          <Badge variant="outline" className="text-sm">
            {suppliers.length}
            {' '}
            en attente
          </Badge>
        )}
      </div>

      {suppliers.length === 0
        ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
              Aucune demande de validation en attente.
            </div>
          )
        : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fournisseur</TableHead>
                  <TableHead>Boutique</TableHead>
                  <TableHead>Téléphone</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {suppliers.map(supplier => (
                  <TableRow
                    key={supplier.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => navigate(`/admin/validations/${supplier.id}`)}
                  >
                    <TableCell>
                      <div>
                        <p className="font-medium">{supplier.fullName}</p>
                        {supplier.email && (
                          <p className="text-xs text-muted-foreground">{supplier.email}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{supplier.shopName}</TableCell>
                    <TableCell>{supplier.phone ?? '-'}</TableCell>
                    <TableCell>{new Date(supplier.submittedAt).toLocaleDateString('fr-FR')}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANTS[supplier.validationStatus] ?? 'outline'}>
                        {STATUS_LABELS[supplier.validationStatus] ?? supplier.validationStatus}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation()
                          navigate(`/admin/validations/${supplier.id}`)
                        }}
                      >
                        Examiner
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
    </div>
  )
}

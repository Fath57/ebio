import { Badge } from '@boilerstone/ui/components/primitives/badge'
import { Button } from '@boilerstone/ui/components/primitives/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@boilerstone/ui/components/primitives/select'
import { Skeleton } from '@boilerstone/ui/components/primitives/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@boilerstone/ui/components/primitives/table'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Can } from '@/lib/casl/can'
import {
  deleteContentMutationOptions,
  fetchReportsQueryOptions,
  ignoreReportMutationOptions,
  warnAuthorMutationOptions,
} from '../utils/moderation-queries'

const REPORT_TYPES = ['ALL', 'PRODUCT', 'REVIEW', 'MESSAGE', 'PROFILE']

export default function ModerationPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [typeFilter, setTypeFilter] = useState<string>('ALL')

  const { data: reports, isLoading } = useQuery(
    fetchReportsQueryOptions(typeFilter === 'ALL' ? undefined : typeFilter),
  )

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'moderation'] })
  }

  const { mutate: deleteContent, isPending: isDeleting } = useMutation({
    ...deleteContentMutationOptions,
    onSuccess: invalidate,
  })

  const { mutate: warnAuthor, isPending: isWarning } = useMutation({
    ...warnAuthorMutationOptions,
    onSuccess: invalidate,
  })

  const { mutate: ignoreReport, isPending: isIgnoring } = useMutation({
    ...ignoreReportMutationOptions,
    onSuccess: invalidate,
  })

  const isPending = isDeleting || isWarning || isIgnoring

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">{t('admin.moderation.title')}</h2>
          <p className="text-muted-foreground">{t('admin.moderation.description')}</p>
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder={t('admin.moderation.filterByType')} />
          </SelectTrigger>
          <SelectContent>
            {REPORT_TYPES.map(type => (
              <SelectItem key={type} value={type}>
                {t(`admin.moderation.types.${type.toLowerCase()}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('admin.moderation.columns.type')}</TableHead>
            <TableHead>{t('admin.moderation.columns.content')}</TableHead>
            <TableHead>{t('admin.moderation.columns.reportedBy')}</TableHead>
            <TableHead>{t('admin.moderation.columns.author')}</TableHead>
            <TableHead>{t('admin.moderation.columns.date')}</TableHead>
            <TableHead>{t('admin.moderation.columns.actions')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {reports?.data?.map(report => (
            <TableRow key={report.id}>
              <TableCell>
                <Badge variant="outline">
                  {t(`admin.moderation.types.${report.type.toLowerCase()}`)}
                </Badge>
              </TableCell>
              <TableCell className="max-w-xs truncate">{report.contentPreview}</TableCell>
              <TableCell>{report.reportedByName}</TableCell>
              <TableCell>{report.authorName}</TableCell>
              <TableCell>{new Date(report.createdAt).toLocaleDateString()}</TableCell>
              <TableCell>
                <Can action="manage" subject="ContentReport">
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => deleteContent(report.id)}
                      disabled={isPending}
                    >
                      {t('admin.moderation.actions.deleteContent')}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => warnAuthor(report.id)}
                      disabled={isPending}
                    >
                      {t('admin.moderation.actions.warnAuthor')}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => ignoreReport(report.id)}
                      disabled={isPending}
                    >
                      {t('admin.moderation.actions.ignore')}
                    </Button>
                  </div>
                </Can>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

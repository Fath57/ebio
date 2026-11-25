import type { ExportFormat } from '../utils/download-export'
import { Button } from '@boilerstone/ui/components/primitives/button'
import { toast } from '@boilerstone/ui/components/primitives/sonner'
import { Download, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { datedFilename, downloadExport } from '../utils/download-export'

interface ExportButtonProps {
  /** API path with the list's filters already in the query string. */
  path: string
  /** File name without extension nor date, e.g. `commandes`. */
  filename: string
  label?: string
  format?: ExportFormat
}

/** Exports what the list shows, filters included; busy while the file is built. */
export function ExportButton({ path, filename, label, format = 'csv' }: ExportButtonProps) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)

  const handleClick = async () => {
    setBusy(true)
    try {
      await downloadExport(path, datedFilename(filename, format))
    }
    catch {
      toast.error(t('dataTable.exportFailed'))
    }
    finally {
      setBusy(false)
    }
  }

  return (
    <Button variant="outline" className="h-10 gap-2" disabled={busy} onClick={handleClick}>
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
      {label ?? t(format === 'xlsx' ? 'dataTable.exportExcel' : 'dataTable.exportCsv')}
    </Button>
  )
}

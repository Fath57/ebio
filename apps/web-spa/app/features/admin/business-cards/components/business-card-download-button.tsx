import { Button } from '@boilerstone/ui/components/primitives/button'
import { toast } from '@boilerstone/ui/components/primitives/sonner'
import { Download, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { downloadBusinessCards, singleCardFilename } from '../utils/business-cards-queries'

interface BusinessCardDownloadButtonProps {
  supplierId: string
  shopName: string
  label?: string
  size?: 'sm' | 'default'
}

/** The sheet of one shop, from its row or its own page. */
export function BusinessCardDownloadButton({ supplierId, shopName, label, size = 'sm' }: BusinessCardDownloadButtonProps) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)

  const handleClick = async () => {
    setBusy(true)
    try {
      await downloadBusinessCards({ supplierIds: [supplierId] }, singleCardFilename(shopName))
    }
    catch {
      toast.error(t('admin.businessCards.failed'))
    }
    finally {
      setBusy(false)
    }
  }

  return (
    <Button
      variant="outline"
      size={size}
      className="gap-2"
      disabled={busy}
      aria-label={t('admin.businessCards.downloadFor', { shop: shopName })}
      onClick={handleClick}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
      {label ?? t('admin.businessCards.download')}
    </Button>
  )
}

import type { WalletOwnerType } from '../utils/withdrawals-queries'
import { Badge } from '@boilerstone/ui/components/primitives/badge'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

interface BeneficiaryCellProps {
  ownerType: WalletOwnerType
  ownerName: string
  supplierId: string | null
  courierId: string | null
  /** A buyer's wallet: links to the account page. */
  userId?: string | null
  /** A family wallet: links to its back-office page. */
  familyWalletId?: string | null
}

/** Route of the owner's back-office page, or null when there is none (buyers). */
function ownerRoute({ ownerType, supplierId, courierId, userId, familyWalletId }: Omit<BeneficiaryCellProps, 'ownerName'>): string | null {
  if (ownerType === 'FAMILY' && familyWalletId)
    return `/admin/portefeuilles-famille/${familyWalletId}`
  if (ownerType === 'USER' && userId)
    return `/admin/utilisateurs/${userId}`
  if (ownerType === 'SUPPLIER' && supplierId)
    return `/admin/fournisseurs/${supplierId}`
  if (ownerType === 'COURIER' && courierId)
    return `/admin/livreurs/${courierId}`
  return null
}

/**
 * Who the money belongs to: the name links to the supplier or courier page,
 * and a small badge tells the two apart at a glance.
 */
export function BeneficiaryCell({ ownerType, ownerName, supplierId, courierId, userId, familyWalletId }: BeneficiaryCellProps) {
  const { t } = useTranslation()
  const route = ownerRoute({ ownerType, supplierId, courierId, userId, familyWalletId })

  return (
    <div className="flex items-center gap-2">
      {route
        ? (
            <Link to={route} className="font-medium hover:underline">
              {ownerName}
            </Link>
          )
        : <span className="font-medium">{ownerName}</span>}
      <Badge variant="outline" className="text-xs font-normal">
        {t(`admin.withdrawals.ownerTypes.${ownerType}`)}
      </Badge>
    </div>
  )
}

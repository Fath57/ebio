import type { PickerOption } from '@/features/admin/common/components/entity-picker'
import { suppliersControllerFindById } from '@boilerstone/openapi-generator/client/sdk.gen'
import { Badge } from '@boilerstone/ui/components/primitives/badge'
import { Button } from '@boilerstone/ui/components/primitives/button'
import { useQuery } from '@tanstack/react-query'
import { Store, X } from 'lucide-react'
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { EntityPicker } from '@/features/admin/common/components/entity-picker'
import { searchSuppliers } from '@/features/admin/common/utils/target-search'
import { useAbility } from '@/lib/casl/ability-context'
import { SHOP_PARAM, useCatalogScope } from '../utils/catalog-scope'

interface ShopIdentity {
  shopName?: string
  profilePhoto?: string | null
  neighborhood?: string | null
  validationStatus?: string
}

/**
 * Says whose catalogue is open, and lets an eBio member switch shops.
 *
 * Permanent rather than a one-off confirmation: the whole risk of editing a
 * catalogue on someone's behalf is forgetting you are doing it. The shop's own
 * staff never see this bar — they only ever have one catalogue.
 */
export function CatalogScopeBar() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { ability } = useAbility()
  const { shopId, onBehalf } = useCatalogScope()

  const canManageAnyShop = ability?.can('manage', 'Product') ?? false

  const { data: shop } = useQuery({
    queryKey: ['supplier', 'identity', shopId],
    queryFn: async () => {
      // Empty coordinates: the contract asks for them, the endpoint skips the
      // distance when they are blank — and a distance means nothing here.
      const response = await suppliersControllerFindById({
        path: { id: shopId! },
        query: { latitude: '', longitude: '' },
      })
      if (response.error)
        throw new Error('Failed to fetch shop')
      return response.data as ShopIdentity
    },
    enabled: canManageAnyShop && shopId !== null,
  })

  const handleSelect = useCallback(
    (option: PickerOption) => {
      // Back to the list: a product id from the previous shop means nothing here.
      navigate(`/catalogue?${SHOP_PARAM}=${encodeURIComponent(option.id)}`)
    },
    [navigate],
  )

  if (!canManageAnyShop) {
    return null
  }

  const selected: PickerOption | null = shopId && shop?.shopName
    ? {
        id: shopId,
        label: shop.shopName,
        context: shop.neighborhood ?? null,
        imageUrl: shop.profilePhoto ?? null,
      }
    : null

  return (
    <div className={`rounded-xl border p-4 ${onBehalf ? 'border-ebio-coral-200 bg-ebio-coral-50' : 'bg-muted/40'}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className={`mt-0.5 shrink-0 ${onBehalf ? 'text-ebio-coral-600' : 'text-muted-foreground'}`}>
            <Store className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className={`text-sm font-semibold ${onBehalf ? 'text-ebio-coral-600' : ''}`}>
              {onBehalf
                ? t('catalog.scope.onBehalf', { shop: shop?.shopName ?? '…' })
                : t('catalog.scope.chooseTitle')}
            </p>
            <p className="text-muted-foreground text-xs">
              {onBehalf ? t('catalog.scope.onBehalfHint') : t('catalog.scope.chooseHint')}
            </p>
            {/* A shop that is not validated shows nothing to buyers — worth
                knowing before spending an afternoon on its catalogue. */}
            {onBehalf && shop?.validationStatus && shop.validationStatus !== 'VALIDATED' && (
              <Badge variant="secondary" className="mt-2">
                {t('catalog.scope.notValidated')}
              </Badge>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <div className="w-full sm:w-72">
            <EntityPicker
              value={shopId ?? ''}
              placeholder={t('catalog.scope.pickerPlaceholder')}
              searchPlaceholder={t('catalog.scope.pickerSearch')}
              emptyLabel={t('catalog.scope.pickerEmpty')}
              onSearch={searchSuppliers}
              onSelect={handleSelect}
              selected={selected}
            />
          </div>
          {onBehalf && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/catalogue')}
              aria-label={t('catalog.scope.leave')}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

/** Shown in place of a catalogue when no shop has been picked yet. */
export function CatalogNoShopSelected() {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16 text-center">
      <Store className="text-muted-foreground/40 h-10 w-10" />
      <h3 className="mt-4 text-lg font-semibold">{t('catalog.scope.emptyTitle')}</h3>
      <p className="text-muted-foreground mt-1 max-w-sm text-sm">{t('catalog.scope.emptyDescription')}</p>
    </div>
  )
}

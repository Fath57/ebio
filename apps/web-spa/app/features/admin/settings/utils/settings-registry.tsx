import type { TFunction, TOptions } from 'i18next'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import type { AdminSettingsState } from './use-admin-settings'
import { Skeleton } from '@boilerstone/ui/components/primitives/skeleton'
import {
  ArrowLeftRight,
  BadgeDollarSign,
  BellRing,
  Bike,
  Bot,
  CircleHelp,
  Clock,
  CreditCard,
  Gift,
  Globe,
  Hourglass,
  Images,
  Landmark,
  LayoutGrid,
  Megaphone,
  MessageSquareText,
  Package,
  PackageCheck,
  Percent,
  Route,
  Smartphone,
  Store,
  Truck,
  Users,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { AnnouncementsManager } from '../../announcements/components/announcements-manager'
import { AppVersionForm } from '../../app-version/components/app-version-form'
import { HomeSectionsManager } from '../../home-sections/components/home-sections-manager'
import { FamilyWalletSetting, FamilyWalletSummary } from '../components/family-wallet-setting-card'
import { PaymentMethodsManager } from '../components/payment-methods-manager'
import { SettingFeedback } from '../components/setting-feedback'
import { TerroirExportSetting, TerroirExportSummary } from '../components/terroir-export-setting-card'
import { AssistantIdentity } from '../forms/assistant-identity'
import { AssistantToggle } from '../forms/assistant-toggle'
import { BannerOffersForm } from '../forms/banner-offers-form'
import { CashLimitForm } from '../forms/cash-limit-form'
import { CommissionForm } from '../forms/commission-form'
import { DeliveryCommissionForm } from '../forms/delivery-commission-form'
import { DeliveryPricingForm } from '../forms/delivery-pricing-form'
import { EscrowReleaseForm } from '../forms/escrow-release-form'
import { ExchangeRatesForm } from '../forms/exchange-rates-form'
import { NewProductSettingsForm } from '../forms/new-product-settings-form'
import { OfferTimeoutForm } from '../forms/offer-timeout-form'
import { PickupPolicyForm } from '../forms/pickup-policy-form'
import { ProductReviewTimingForm } from '../forms/product-review-timing-form'
import { ReferralRewardsForm } from '../forms/referral-rewards-form'
import { DEFAULT_PICKUP_POLICY } from './use-admin-settings'

export const SETTINGS_SECTION_IDS = ['argent', 'paiements', 'livraison', 'catalogue', 'vitrine', 'applications'] as const
export type SettingsSectionId = typeof SETTINGS_SECTION_IDS[number]

export const DEFAULT_SETTINGS_SECTION: SettingsSectionId = 'argent'

export interface SettingsSection {
  id: SettingsSectionId
  icon: LucideIcon
}

/** Order of the side navigation. Titles and descriptions live under `admin.settings.sections.<id>`. */
export const SETTINGS_SECTIONS: readonly SettingsSection[] = [
  { id: 'argent', icon: Landmark },
  { id: 'paiements', icon: CreditCard },
  { id: 'livraison', icon: Truck },
  { id: 'catalogue', icon: Package },
  { id: 'vitrine', icon: Store },
  { id: 'applications', icon: Smartphone },
]

/** The former tabs, so a `?tab=` link written before the split still lands somewhere sensible. */
export const LEGACY_TAB_SECTIONS: Readonly<Record<string, SettingsSectionId>> = {
  commissions: 'argent',
  payments: 'paiements',
  accueil: 'vitrine',
  annonces: 'vitrine',
  apps: 'applications',
  assistant: 'applications',
}

export interface SettingDefinition {
  /** Anchor of the card: `/admin/parametres?section=livraison#tarification-livraison`. */
  id: string
  section: SettingsSectionId
  titleKey: string
  descriptionKey: string
  /** Extra French search terms, what an admin types, not what the title says. */
  keywords: readonly string[]
  icon: LucideIcon
  /** Wrapped in `<Can action="manage" subject="all">`, as the card was before the split. */
  adminOnly: boolean
  /** An explanation rather than a value: shown, searchable, but not counted as a setting. */
  informational?: boolean
  /** Interpolation values shared by the title and the description. */
  i18nValues?: (state: AdminSettingsState) => TOptions
  /** Current value in a few words, from data the page already holds. */
  summary?: (state: AdminSettingsState, t: TFunction) => ReactNode
  render: (state: AdminSettingsState) => ReactNode
}

function formatFcfa(value: number): string {
  return `${value.toLocaleString('fr-FR')} FCFA`
}

/** API fractions (0.04) as the percent the forms show (4 %). */
function formatPercent(fraction: number): string {
  return `${(Math.round(fraction * 10000) / 100).toLocaleString('fr-FR')} %`
}

function amountOrFallback(amount: number, key: 'cashLimit' | 'debtLimit', fallback: 'disabled' | 'noLimit', t: TFunction): string {
  return amount > 0
    ? t(`admin.settings.summary.${key}`, { amount: formatFcfa(amount) })
    : t(`admin.settings.summary.${fallback}`)
}

function CommissionExplanation() {
  const { t } = useTranslation()
  return (
    <ul className="text-muted-foreground list-disc space-y-2 pl-5 text-sm">
      <li>{t('admin.settings.commission.how1')}</li>
      <li>
        {t('admin.settings.commission.how2')}
        {' '}
        <Link to="/admin/fournisseurs" className="text-primary underline-offset-2 hover:underline">
          {t('admin.settings.commission.how2Link')}
        </Link>
      </li>
      <li>{t('admin.settings.commission.how3')}</li>
      <li>
        {t('admin.settings.commission.how4')}
        {' '}
        <Link to="/admin/commissions" className="text-primary underline-offset-2 hover:underline">
          {t('admin.settings.commission.how4Link')}
        </Link>
      </li>
    </ul>
  )
}

function ExchangeRatesFeedback({ feedback }: { feedback: AdminSettingsState['exchangeRates']['feedback'] }) {
  const { t } = useTranslation()
  if (feedback === 'saved' || feedback === 'refreshed') {
    return <p role="status" className="text-ebio-green-600 dark:text-ebio-green-200 text-sm">{t(`admin.settings.exchangeRates.${feedback}`)}</p>
  }
  if (feedback === 'notRefreshed') {
    return (
      <p role="status" className="rounded-md border border-ebio-earth-200 bg-ebio-earth-50 p-3 text-sm text-ebio-earth-800 dark:border-ebio-earth-800 dark:bg-ebio-earth-900 dark:text-ebio-earth-100">
        {t('admin.settings.exchangeRates.notRefreshed')}
      </p>
    )
  }
  if (feedback === 'error' || feedback === 'refreshError') {
    return (
      <p role="alert" className="border-destructive/50 bg-destructive/10 text-destructive rounded-md border p-3 text-sm">
        {t(`admin.settings.exchangeRates.${feedback}`)}
      </p>
    )
  }
  return null
}

function deliveryPricingSummary(state: AdminSettingsState, t: TFunction): string | null {
  const config = state.deliveryPricing.data
  if (!config)
    return null
  let rule: string
  if (config.mode === 'FLAT')
    rule = t('admin.settings.summary.deliveryFlat', { fee: formatFcfa(config.flat.fee) })
  else if (config.mode === 'DISTANCE')
    rule = t('admin.settings.summary.deliveryDistance', { base: formatFcfa(config.distance.baseFee), perKm: formatFcfa(config.distance.perKm) })
  else
    rule = t('admin.settings.summary.deliveryZones', { count: config.zones.length })
  return config.freeFrom
    ? t('admin.settings.summary.deliveryFreeFrom', { rule, amount: formatFcfa(config.freeFrom) })
    : rule
}

function commissionSummary(state: AdminSettingsState, t: TFunction): string | null {
  const rates = (state.settings?.commissions ?? []).map(item => item.rate)
  if (rates.length === 0)
    return null
  const min = Math.min(...rates)
  const max = Math.max(...rates)
  return min === max
    ? t('admin.settings.summary.commissionSingle', { rate: formatPercent(min) })
    : t('admin.settings.summary.commissionRange', { min: formatPercent(min), max: formatPercent(max) })
}

/** Skeleton while GET /api/admin/settings is in flight, the form once it is there. */
function whenSettingsLoaded(state: AdminSettingsState, content: () => ReactNode): ReactNode {
  return state.isSettingsLoading ? <Skeleton className="h-24 w-full" /> : content()
}

/**
 * Every card of the settings page, in display order within its section.
 * Adding a setting = one entry here (plus its i18n keys); the navigation,
 * counts, search and anchors follow.
 */
export const SETTINGS_REGISTRY: readonly SettingDefinition[] = [
  // ── Argent et commissions ──
  {
    id: 'commission-ventes',
    section: 'argent',
    titleKey: 'admin.settings.commission.title',
    descriptionKey: 'admin.settings.commission.description',
    keywords: ['commission', 'taux', 'catégorie', 'pourcentage', 'vente', 'grille', 'prélèvement'],
    icon: Percent,
    adminOnly: true,
    summary: commissionSummary,
    render: state => whenSettingsLoaded(state, () => (
      <CommissionForm
        categories={state.settings?.commissions ?? []}
        onSubmit={state.commissions.save}
        isPending={state.commissions.isPending}
      />
    )),
  },
  {
    id: 'commission-fonctionnement',
    section: 'argent',
    titleKey: 'admin.settings.commission.howTitle',
    descriptionKey: 'admin.settings.commission.howDescription',
    keywords: ['commission', 'taux négocié', 'explication', 'fonctionnement', 'aide'],
    icon: CircleHelp,
    adminOnly: false,
    informational: true,
    render: () => <CommissionExplanation />,
  },
  {
    id: 'commission-livraison',
    section: 'argent',
    titleKey: 'admin.settings.deliveryCommission.title',
    descriptionKey: 'admin.settings.deliveryCommission.description',
    keywords: ['commission', 'livraison', 'livreur', 'course', 'frais', 'part', 'taux'],
    icon: Bike,
    adminOnly: true,
    summary: (state, t) => state.settings
      ? t('admin.settings.summary.deliveryCommission', { rate: formatPercent(state.settings.deliveryCommissionRate) })
      : null,
    render: state => whenSettingsLoaded(state, () => (
      <div className="space-y-4">
        <DeliveryCommissionForm
          rate={state.settings?.deliveryCommissionRate ?? 0.1}
          onSubmit={state.deliveryCommission.save}
          isPending={state.deliveryCommission.isPending}
        />
        <SettingFeedback feedback={state.deliveryCommission.feedback} i18nPrefix="admin.settings.deliveryCommission" />
      </div>
    )),
  },
  {
    id: 'versement-ventes',
    section: 'argent',
    titleKey: 'admin.settings.escrowRelease.title',
    descriptionKey: 'admin.settings.escrowRelease.description',
    keywords: ['versement', 'séquestre', 'escrow', 'délai', 'heures', 'portefeuille', 'boutique', 'réclamation'],
    icon: Hourglass,
    adminOnly: true,
    summary: (state, t) => state.escrowRelease.data
      ? t('admin.settings.summary.escrowRelease', {
          after: state.escrowRelease.data.heuresApresConfirmation,
          max: state.escrowRelease.data.heuresMaximum,
        })
      : null,
    render: ({ escrowRelease }) => (
      <div className="space-y-4">
        {escrowRelease.isLoading || !escrowRelease.data
          ? <Skeleton className="h-24 w-full" />
          : <EscrowReleaseForm delays={escrowRelease.data} onSubmit={escrowRelease.save} isPending={escrowRelease.isPending} />}
        <SettingFeedback feedback={escrowRelease.feedback} i18nPrefix="admin.settings.escrowRelease" />
      </div>
    ),
  },
  {
    id: 'taux-de-change',
    section: 'argent',
    titleKey: 'admin.settings.exchangeRates.title',
    descriptionKey: 'admin.settings.exchangeRates.description',
    keywords: ['taux', 'change', 'devise', 'euro', 'dollar', 'eur', 'usd', 'cad', 'marge', 'étranger', 'diaspora'],
    icon: ArrowLeftRight,
    adminOnly: true,
    summary: (state, t) => state.exchangeRates.data
      ? t('admin.settings.summary.exchangeRates', { margin: formatPercent(state.exchangeRates.data.marginBps / 10000) })
      : null,
    render: ({ exchangeRates }) => (
      <div className="space-y-4">
        {exchangeRates.isLoading || !exchangeRates.data
          ? <Skeleton className="h-40 w-full" />
          : (
              <ExchangeRatesForm
                data={exchangeRates.data}
                onSubmit={exchangeRates.save}
                isPending={exchangeRates.isPending}
                onRefresh={exchangeRates.refresh}
                isRefreshing={exchangeRates.isRefreshing}
              />
            )}
        <ExchangeRatesFeedback feedback={exchangeRates.feedback} />
      </div>
    ),
  },
  {
    id: 'parrainage',
    section: 'argent',
    titleKey: 'admin.settings.referral.title',
    descriptionKey: 'admin.settings.referral.description',
    keywords: ['parrainage', 'parrain', 'filleul', 'récompense', 'bonus', 'invitation', 'code'],
    icon: Gift,
    adminOnly: true,
    summary: (state, t) => {
      const rewards = state.referralRewards.data
      if (!rewards)
        return null
      return rewards.active
        ? t('admin.settings.summary.referral', { sponsor: formatFcfa(rewards.sponsorAmount), referee: formatFcfa(rewards.refereeAmount) })
        : t('admin.settings.summary.disabled')
    },
    render: ({ referralRewards }) => (
      <div className="space-y-4">
        {referralRewards.isLoading || !referralRewards.data
          ? <Skeleton className="h-40 w-full" />
          : <ReferralRewardsForm rewards={referralRewards.data} onSubmit={referralRewards.save} isPending={referralRewards.isPending} />}
        <SettingFeedback feedback={referralRewards.feedback} i18nPrefix="admin.settings.referral" />
      </div>
    ),
  },

  // ── Paiements ──
  {
    id: 'moyens-de-paiement',
    section: 'paiements',
    titleKey: 'admin.settings.paymentMethods.title',
    descriptionKey: 'admin.settings.paymentMethods.description',
    keywords: ['paiement', 'mobile money', 'momo', 'carte', 'moyen', 'pays', 'intram', 'opérateur'],
    icon: CreditCard,
    adminOnly: false,
    render: () => <PaymentMethodsManager />,
  },
  {
    id: 'especes-livraison',
    section: 'paiements',
    titleKey: 'admin.settings.cashLimit.title',
    descriptionKey: 'admin.settings.cashLimit.description',
    keywords: ['espèces', 'cash', 'liquide', 'plafond', 'livraison', 'paiement à la livraison', 'montant'],
    icon: BadgeDollarSign,
    adminOnly: true,
    summary: (state, t) => state.settings
      ? amountOrFallback(state.settings.cashOnDeliveryMaxAmount, 'cashLimit', 'disabled', t)
      : null,
    render: state => whenSettingsLoaded(state, () => (
      <div className="space-y-4">
        <CashLimitForm
          amount={state.settings?.cashOnDeliveryMaxAmount ?? 25000}
          onSubmit={state.cashLimit.save}
          isPending={state.cashLimit.isPending}
        />
        <SettingFeedback feedback={state.cashLimit.feedback} i18nPrefix="admin.settings.cashLimit" />
      </div>
    )),
  },
  {
    id: 'dette-livreur',
    section: 'paiements',
    titleKey: 'admin.settings.debtLimit.title',
    descriptionKey: 'admin.settings.debtLimit.description',
    keywords: ['dette', 'livreur', 'négatif', 'solde', 'plafond', 'suspension', 'espèces', 'cash'],
    icon: Bike,
    adminOnly: true,
    summary: (state, t) => state.settings
      ? amountOrFallback(state.settings.courierMaxDebt, 'debtLimit', 'noLimit', t)
      : null,
    render: state => whenSettingsLoaded(state, () => (
      <div className="space-y-4">
        <CashLimitForm
          amount={state.settings?.courierMaxDebt ?? 5000}
          onSubmit={state.debtLimit.save}
          isPending={state.debtLimit.isPending}
          i18nPrefix="admin.settings.debtLimit"
          fieldId="courier-debt-limit-amount"
        />
        <SettingFeedback feedback={state.debtLimit.feedback} i18nPrefix="admin.settings.debtLimit" />
      </div>
    )),
  },
  {
    id: 'dette-boutique',
    section: 'paiements',
    titleKey: 'admin.settings.supplierDebtLimit.title',
    descriptionKey: 'admin.settings.supplierDebtLimit.description',
    keywords: ['dette', 'boutique', 'fournisseur', 'négatif', 'solde', 'plafond', 'espèces', 'cash'],
    icon: Store,
    adminOnly: true,
    summary: (state, t) => state.settings
      ? amountOrFallback(state.settings.supplierMaxDebt ?? 10000, 'debtLimit', 'noLimit', t)
      : null,
    render: state => whenSettingsLoaded(state, () => (
      <div className="space-y-4">
        <CashLimitForm
          amount={state.settings?.supplierMaxDebt ?? 10000}
          onSubmit={state.supplierDebtLimit.save}
          isPending={state.supplierDebtLimit.isPending}
          i18nPrefix="admin.settings.supplierDebtLimit"
          fieldId="supplier-debt-limit-amount"
        />
        <SettingFeedback feedback={state.supplierDebtLimit.feedback} i18nPrefix="admin.settings.supplierDebtLimit" />
      </div>
    )),
  },
  {
    id: 'portefeuille-famille',
    section: 'paiements',
    titleKey: 'admin.settings.familyWallet.title',
    descriptionKey: 'admin.settings.familyWallet.description',
    keywords: ['famille', 'portefeuille', 'proches', 'wallet', 'partage', 'recharge'],
    icon: Users,
    adminOnly: true,
    summary: () => <FamilyWalletSummary />,
    render: () => <FamilyWalletSetting />,
  },

  // ── Livraison ──
  {
    id: 'tarification-livraison',
    section: 'livraison',
    titleKey: 'admin.settings.deliveryPricing.title',
    descriptionKey: 'admin.settings.deliveryPricing.description',
    keywords: ['livraison', 'tarif', 'prix', 'distance', 'zone', 'forfait', 'km', 'gratuite', 'frais', 'regroupement'],
    icon: Route,
    adminOnly: true,
    summary: deliveryPricingSummary,
    render: ({ deliveryPricing }) => (
      <div className="space-y-4">
        {deliveryPricing.isLoading || !deliveryPricing.data
          ? <Skeleton className="h-40 w-full" />
          : <DeliveryPricingForm config={deliveryPricing.data} onSubmit={deliveryPricing.save} isPending={deliveryPricing.isPending} />}
        <SettingFeedback feedback={deliveryPricing.feedback} i18nPrefix="admin.settings.deliveryPricing" />
      </div>
    ),
  },
  {
    id: 'delai-acceptation',
    section: 'livraison',
    titleKey: 'admin.settings.offerTimeout.title',
    descriptionKey: 'admin.settings.offerTimeout.description',
    keywords: ['livreur', 'course', 'délai', 'acceptation', 'secondes', 'attente', 'diffusion', 'proposition'],
    icon: Clock,
    adminOnly: true,
    summary: (state, t) => state.settings
      ? t('admin.settings.summary.offerTimeout', { seconds: state.settings.courierOfferTimeoutSeconds ?? 90 })
      : null,
    render: state => whenSettingsLoaded(state, () => (
      <div className="space-y-4">
        <OfferTimeoutForm
          seconds={state.settings?.courierOfferTimeoutSeconds ?? 90}
          onSubmit={state.offerTimeout.save}
          isPending={state.offerTimeout.isPending}
        />
        <SettingFeedback feedback={state.offerTimeout.feedback} i18nPrefix="admin.settings.offerTimeout" />
      </div>
    )),
  },
  {
    id: 'politique-retrait',
    section: 'livraison',
    titleKey: 'admin.settings.pickupPolicy.title',
    descriptionKey: 'admin.settings.pickupPolicy.description',
    keywords: ['retrait', 'livreur', 'colis', 'délai', 'minutes', 'rappel', 'enlèvement', 'récupération'],
    icon: PackageCheck,
    adminOnly: true,
    summary: (state, t) => {
      if (!state.settings)
        return null
      const policy = state.settings.courierPickupPolicy ?? DEFAULT_PICKUP_POLICY
      return t('admin.settings.summary.pickupPolicy', { timeout: policy.timeoutMinutes, warning: policy.warningMinutes })
    },
    render: state => whenSettingsLoaded(state, () => (
      <div className="space-y-4">
        <PickupPolicyForm
          policy={state.settings?.courierPickupPolicy ?? DEFAULT_PICKUP_POLICY}
          onSubmit={state.pickupPolicy.save}
          isPending={state.pickupPolicy.isPending}
        />
        <SettingFeedback feedback={state.pickupPolicy.feedback} i18nPrefix="admin.settings.pickupPolicy" />
      </div>
    )),
  },

  {
    id: 'terroir-etranger',
    section: 'livraison',
    titleKey: 'admin.settings.terroirExport.title',
    descriptionKey: 'admin.settings.terroirExport.description',
    keywords: ['terroir', 'étranger', 'export', 'diaspora', 'france', 'belgique', 'colis', 'agence', 'assurance', 'emballage', 'poids', 'catégorie interdite'],
    icon: Globe,
    adminOnly: true,
    summary: () => <TerroirExportSummary />,
    render: () => <TerroirExportSetting />,
  },

  // ── Catalogue et avis ──
  {
    id: 'nouveaux-produits',
    section: 'catalogue',
    titleKey: 'admin.settings.newProducts.title',
    descriptionKey: 'admin.settings.newProducts.description',
    keywords: ['produit', 'validation', 'modération', 'alerte', 'e-mail', 'email', 'vérification', 'publication'],
    icon: BellRing,
    adminOnly: true,
    summary: (state, t) => {
      const settings = state.newProducts.data
      if (!settings)
        return null
      const status = settings.validationRequise
        ? t('admin.settings.summary.newProductsChecked')
        : t('admin.settings.summary.newProductsDirect')
      return settings.emailsAlerte.length > 0
        ? t('admin.settings.summary.newProductsEmails', { state: status, count: settings.emailsAlerte.length })
        : status
    },
    render: ({ newProducts }) => (
      <div className="space-y-4">
        {newProducts.isLoading || !newProducts.data
          ? <Skeleton className="h-40 w-full" />
          : <NewProductSettingsForm settings={newProducts.data} onSubmit={newProducts.save} isPending={newProducts.isPending} />}
        <SettingFeedback feedback={newProducts.feedback} i18nPrefix="admin.settings.newProducts" />
      </div>
    ),
  },
  {
    id: 'avis-produits',
    section: 'catalogue',
    titleKey: 'admin.settings.productReview.title',
    descriptionKey: 'admin.settings.productReview.description',
    keywords: ['avis', 'note', 'relance', 'évaluation', 'commentaire', 'étoiles'],
    icon: MessageSquareText,
    adminOnly: true,
    summary: (state, t) => state.reviewTiming.data
      ? t('admin.settings.summary.productReview', { hours: state.reviewTiming.data.delaiHeures, count: state.reviewTiming.data.relancesMaximum })
      : null,
    render: ({ reviewTiming }) => (
      <div className="space-y-4">
        {reviewTiming.isLoading || !reviewTiming.data
          ? <Skeleton className="h-24 w-full" />
          : <ProductReviewTimingForm timing={reviewTiming.data} onSubmit={reviewTiming.save} isPending={reviewTiming.isPending} />}
        <SettingFeedback feedback={reviewTiming.feedback} i18nPrefix="admin.settings.productReview" />
      </div>
    ),
  },

  // ── Vitrine et marketing ──
  {
    id: 'sections-accueil',
    section: 'vitrine',
    titleKey: 'admin.settings.homeSections.title',
    descriptionKey: 'admin.settings.homeSections.description',
    keywords: ['accueil', 'rail', 'section', 'vitrine', 'ordre', 'mise en avant'],
    icon: LayoutGrid,
    adminOnly: true,
    render: () => <HomeSectionsManager />,
  },
  {
    id: 'annonces',
    section: 'vitrine',
    titleKey: 'admin.settings.announcements.title',
    descriptionKey: 'admin.settings.announcements.description',
    keywords: ['annonce', 'pop-up', 'popup', 'message', 'ouverture', 'publicité'],
    icon: Megaphone,
    adminOnly: true,
    render: () => <AnnouncementsManager />,
  },
  {
    id: 'offres-bannieres',
    section: 'vitrine',
    titleKey: 'admin.settings.bannerOffers.title',
    descriptionKey: 'admin.settings.bannerOffers.description',
    keywords: ['bannière', 'sponsorisé', 'publicité', 'offre', 'prix', 'emplacement', 'durée'],
    icon: Images,
    adminOnly: true,
    summary: (state, t) => state.bannerOffers.data
      ? t('admin.settings.summary.bannerOffers', { count: state.bannerOffers.data.offers.length, slots: state.bannerOffers.data.paidSlots })
      : null,
    render: ({ bannerOffers }) => (
      <div className="space-y-4">
        {bannerOffers.isLoading || !bannerOffers.data
          ? <Skeleton className="h-40 w-full" />
          : <BannerOffersForm offers={bannerOffers.data} onSubmit={bannerOffers.save} isPending={bannerOffers.isPending} />}
        <SettingFeedback feedback={bannerOffers.feedback} i18nPrefix="admin.settings.bannerOffers" />
      </div>
    ),
  },

  // ── Applications ──
  {
    id: 'versions-applications',
    section: 'applications',
    titleKey: 'admin.settings.appVersions.title',
    descriptionKey: 'admin.settings.appVersions.description',
    keywords: ['version', 'mise à jour', 'play store', 'application', 'android', 'ios', 'store', 'forcer'],
    icon: Smartphone,
    adminOnly: true,
    render: () => <AppVersionForm />,
  },
  {
    id: 'assistant',
    section: 'applications',
    titleKey: 'admin.settings.assistant.title',
    descriptionKey: 'admin.settings.assistant.description',
    keywords: ['assistant', 'assistante', 'assita', 'voix', 'ia', 'intelligence artificielle', 'conversation', 'vocal'],
    icon: Bot,
    adminOnly: true,
    i18nValues: state => ({ name: state.assistant.data?.name ?? 'Assita' }),
    summary: (state, t) => state.assistant.data
      ? (state.assistant.data.enabled ? t('admin.settings.summary.assistantOpen') : t('admin.settings.summary.assistantClosed'))
      : null,
    render: ({ assistant }) => (
      <div className="space-y-4">
        {assistant.isLoading || !assistant.data
          ? <Skeleton className="h-12 w-full" />
          : (
              <>
                <AssistantToggle
                  name={assistant.data.name}
                  enabled={assistant.data.enabled}
                  onChange={enabled => assistant.save({ enabled })}
                  isPending={assistant.isPending}
                />
                <AssistantIdentity
                  name={assistant.data.name}
                  avatarUrl={assistant.data.avatarUrl}
                  voiceSpeed={assistant.data.voiceSpeed}
                  onSave={identity => assistant.save({ enabled: assistant.data?.enabled ?? false, ...identity })}
                  isPending={assistant.isPending}
                />
              </>
            )}
        <SettingFeedback feedback={assistant.feedback} i18nPrefix="admin.settings.assistant" />
      </div>
    ),
  },
]

export function isSettingsSectionId(value: string | null): value is SettingsSectionId {
  return value !== null && (SETTINGS_SECTION_IDS as readonly string[]).includes(value)
}

/** Lower case, no accents: « Espèces » and « especes » find the same card. */
export function normalizeSearchText(value: string): string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim()
}

/** Text a search query is matched against: title, description, keywords and section name. */
export function settingSearchText(setting: SettingDefinition, state: AdminSettingsState, t: TFunction): string {
  const values = setting.i18nValues?.(state) ?? {}
  return normalizeSearchText([
    t(setting.titleKey, values),
    t(setting.descriptionKey, values),
    t(`admin.settings.sections.${setting.section}.title`),
    ...setting.keywords,
  ].join(' '))
}

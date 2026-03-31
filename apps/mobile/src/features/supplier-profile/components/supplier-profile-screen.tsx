import * as React from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Dimensions,
  Image,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import ArrowLeft from 'lucide-react-native/dist/esm/icons/arrow-left'
import ChevronDown from 'lucide-react-native/dist/esm/icons/chevron-down'
import ChevronUp from 'lucide-react-native/dist/esm/icons/chevron-up'
import CircleCheck from 'lucide-react-native/dist/esm/icons/circle-check'
import Clock from 'lucide-react-native/dist/esm/icons/clock'
import MapPin from 'lucide-react-native/dist/esm/icons/map-pin'
import MessageCircle from 'lucide-react-native/dist/esm/icons/message-circle'
import Navigation from 'lucide-react-native/dist/esm/icons/navigation'
import Phone from 'lucide-react-native/dist/esm/icons/phone'
import ShareIcon from 'lucide-react-native/dist/esm/icons/share-2'
import ShoppingBag from 'lucide-react-native/dist/esm/icons/shopping-bag'
import Star from 'lucide-react-native/dist/esm/icons/star'
import Store from 'lucide-react-native/dist/esm/icons/store'
import { useNavigation } from '@react-navigation/native'
import { useTheme } from '../../../theme/theme-context'
import { colors, fonts, radius, spacing, typography } from '../../../theme/theme'
import { apiFetch } from '../../../utils/api-client'
import { FadeInView, ScalePressable } from '../../../utils/animations'
import { ProductCard } from '../../catalog/components/product-card'
import { Badge } from '../../common/components/badge'
import { ContactActionSheet } from './contact-action-sheet'
import { NavigateButton } from './navigate-button'

const { width: SCREEN_WIDTH } = Dimensions.get('window')
const COVER_HEIGHT = 220
const PROFILE_SIZE = 80
const PROFILE_BORDER = 3
const MAX_VISIBLE_PRODUCTS = 6

type BadgeType = 'VALIDATED' | 'TOP_SELLER' | 'CERTIFIED_BIO'

interface Product {
  id: string
  name: string
  imageUrl: string | null
  pricePerUnit: number
  promotionalPrice: number | null
  unit: string
  isInStock: boolean
}

interface OpeningHour {
  day: string
  openTime: string
  closeTime: string
  isClosed: boolean
}

interface SupplierProfile {
  id: string
  shopName: string
  coverPhotoUrl: string | null
  profilePhotoUrl: string | null
  address: string
  distance: number
  rating: number | null
  reviewCount: number
  badges: BadgeType[]
  products: Product[]
  openingHours: OpeningHour[]
  isCurrentlyOpen: boolean
  latitude: number
  longitude: number
  phoneNumber: string | null
  whatsappNumber: string | null
  mode: 'CONTACT' | 'ORDER'
}

interface SupplierProfileScreenProps {
  supplierId: string
  onNavigateToChat: (supplierId: string) => void
  onNavigateToProduct: (productId: string, product: Product, supplierInfo: { id: string, shopName: string, rating: number | null, distance: number, mode: 'CONTACT' | 'ORDER', isValidated: boolean }) => void
  onNavigateToOrder: (supplierId: string) => void
  onGoBack?: () => void
}

const BADGE_LABELS: Record<string, { label: string, icon: 'check' | 'star' | 'leaf' }> = {
  VALIDATED: { label: 'Validé eBio', icon: 'check' },
  TOP_SELLER: { label: 'Top Vendeur', icon: 'star' },
  CERTIFIED_BIO: { label: 'Bio Certifié', icon: 'leaf' },
}

const BADGE_MAP: Record<string, BadgeType> = {
  VALIDATED_EBIO: 'VALIDATED',
  TOP_SELLER: 'TOP_SELLER',
  CERTIFIED_BIO: 'CERTIFIED_BIO',
}

const DAY_NAMES: Record<string, string> = {
  MONDAY: 'Lundi',
  TUESDAY: 'Mardi',
  WEDNESDAY: 'Mercredi',
  THURSDAY: 'Jeudi',
  FRIDAY: 'Vendredi',
  SATURDAY: 'Samedi',
  SUNDAY: 'Dimanche',
}

const DAY_ORDER = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']

function getCurrentDayKey(): string {
  const jsDay = new Date().getDay()
  // JS: 0=Sun, 1=Mon ... 6=Sat → our order index
  const idx = jsDay === 0 ? 6 : jsDay - 1
  return DAY_ORDER[idx]
}

function formatDistance(meters: number): string {
  const km = meters / 1000
  if (km < 0.1) return `${Math.round(meters)} m`
  if (km < 10) return `${km.toFixed(1)} km`
  return `${Math.round(km)} km`
}

// ---------------------------------------------------------------------------
// Star Rating Row
// ---------------------------------------------------------------------------
function StarRatingRow({
  rating,
  reviewCount,
  isOpen,
  semantic,
}: {
  rating: number | null
  reviewCount: number
  isOpen: boolean
  semantic: ReturnType<typeof useTheme>['semantic']
}) {
  const displayRating = rating ?? 0
  const filledCount = Math.floor(displayRating)
  const hasHalf = displayRating - filledCount >= 0.25

  return (
    <View style={ratingStyles.container}>
      {/* Star icon + numeric rating */}
      <Star
        size={16}
        color={colors.earth[400]}
        fill={colors.earth[400]}
        strokeWidth={0}
      />
      <Text style={[ratingStyles.ratingValue, { color: semantic.textPrimary }]}>
        {displayRating.toFixed(1)}
      </Text>
      <Text style={[ratingStyles.reviewCount, { color: semantic.textTertiary }]}>
        ({reviewCount} avis)
      </Text>

      {/* Dot separator */}
      <View style={[ratingStyles.dot, { backgroundColor: semantic.textTertiary }]} />

      {/* Open / Closed pill */}
      <View
        style={[
          ratingStyles.statusPill,
          {
            backgroundColor: isOpen ? colors.green[50] : colors.coral[50],
          },
        ]}
      >
        <View
          style={[
            ratingStyles.statusDot,
            { backgroundColor: isOpen ? colors.green[400] : colors.coral[400] },
          ]}
        />
        <Text
          style={[
            ratingStyles.statusLabel,
            { color: isOpen ? colors.green[600] : colors.coral[600] },
          ]}
        >
          {isOpen ? 'Ouvert' : 'Fermé'}
        </Text>
      </View>
    </View>
  )
}

const ratingStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  ratingValue: {
    fontFamily: fonts.sansBd,
    fontSize: 14,
    lineHeight: 18,
  },
  reviewCount: {
    fontFamily: fonts.sansMd,
    fontSize: 12,
    lineHeight: 16,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusLabel: {
    fontFamily: fonts.sansSb,
    fontSize: 11,
    lineHeight: 14,
  },
})

// ---------------------------------------------------------------------------
// Quick Action Button
// ---------------------------------------------------------------------------
function QuickAction({
  icon: Icon,
  label,
  onPress,
  semantic,
}: {
  icon: React.ComponentType<{ size: number, color: string, strokeWidth?: number }>
  label: string
  onPress: () => void
  semantic: ReturnType<typeof useTheme>['semantic']
}) {
  return (
    <ScalePressable
      scaleValue={0.9}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={quickStyles.container}
    >
      <View style={[quickStyles.circle, { backgroundColor: semantic.bgPrimaryLight }]}>
        <Icon size={20} color={semantic.colorPrimary} strokeWidth={2} />
      </View>
      <Text style={[quickStyles.label, { color: semantic.textSecondary }]} numberOfLines={1}>
        {label}
      </Text>
    </ScalePressable>
  )
}

const quickStyles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: 6,
    width: 72,
  },
  circle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  label: {
    fontFamily: fonts.sansMd,
    fontSize: 11,
    lineHeight: 14,
    textAlign: 'center',
  },
})

// ---------------------------------------------------------------------------
// Main Screen
// ---------------------------------------------------------------------------
export function SupplierProfileScreen({
  supplierId,
  onNavigateToChat,
  onNavigateToProduct,
  onNavigateToOrder,
  onGoBack,
}: SupplierProfileScreenProps) {
  const { semantic } = useTheme()
  const insets = useSafeAreaInsets()
  const navigation = useNavigation()

  const [supplier, setSupplier] = useState<SupplierProfile | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isContactSheetVisible, setIsContactSheetVisible] = useState(false)
  const [isHoursExpanded, setIsHoursExpanded] = useState(false)
  const [showAllProducts, setShowAllProducts] = useState(false)

  useEffect(() => {
    async function fetchProfile(): Promise<void> {
      try {
        const [profileRes, productsRes] = await Promise.all([
          apiFetch(`/api/suppliers/${supplierId}`),
          apiFetch(`/api/suppliers/${supplierId}/products`),
        ])

        if (profileRes.ok) {
          const raw = await profileRes.json()

          // Map products
          let products: Product[] = []
          if (productsRes.ok) {
            const productsData = await productsRes.json()
            products = (productsData.data ?? productsData ?? []).map((p: any) => ({
              id: p.id,
              name: p.name,
              imageUrl: p.photo ?? p.imageUrl ?? null,
              pricePerUnit: p.pricePerUnit,
              promotionalPrice: p.promotionalPrice ?? null,
              unit: p.unit,
              isInStock: (p.stock ?? 0) > 0,
            }))
          }

          // Map opening hours from API format {lundi: {open, close}} to array
          const dayMap: Record<string, string> = {
            lundi: 'MONDAY', mardi: 'TUESDAY', mercredi: 'WEDNESDAY',
            jeudi: 'THURSDAY', vendredi: 'FRIDAY', samedi: 'SATURDAY', dimanche: 'SUNDAY',
          }
          const openingHours: OpeningHour[] = Object.entries(raw.openingHours ?? {}).map(
            ([frDay, value]: [string, any]) => ({
              day: dayMap[frDay] ?? frDay.toUpperCase(),
              openTime: value?.open ?? '',
              closeTime: value?.close ?? '',
              isClosed: value === null || value === undefined,
            }),
          )

          // Determine if currently open
          const now = new Date()
          const currentHour = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
          const jsDay = now.getDay()
          const todayIdx = jsDay === 0 ? 6 : jsDay - 1
          const todayKey = DAY_ORDER[todayIdx]
          const todayHours = openingHours.find(h => h.day === todayKey)
          const isCurrentlyOpen = todayHours
            ? !todayHours.isClosed && currentHour >= todayHours.openTime && currentHour <= todayHours.closeTime
            : false

          // Map badges from validationStatus
          const badges: BadgeType[] = []
          if (raw.validationStatus === 'VALIDATED') badges.push('VALIDATED')

          // Map to SupplierProfile
          const mapped: SupplierProfile = {
            id: raw.id,
            shopName: raw.shopName,
            coverPhotoUrl: raw.coverPhoto ?? null,
            profilePhotoUrl: raw.profilePhoto ?? null,
            address: raw.address ?? '',
            distance: raw.distance ?? 0,
            rating: raw.globalRating ?? null,
            reviewCount: raw.totalReviews ?? 0,
            badges,
            products,
            openingHours,
            isCurrentlyOpen,
            latitude: raw.latitude ?? 0,
            longitude: raw.longitude ?? 0,
            phoneNumber: raw.mobileMoneyNumber ?? null,
            whatsappNumber: raw.whatsappNumber ?? null,
            mode: raw.mode ?? 'CONTACT',
          }
          setSupplier(mapped)
        }
      }
      catch {
        // Silently fail
      }
      finally {
        setIsLoading(false)
      }
    }
    fetchProfile()
  }, [supplierId])

  const handleOpenChat = useCallback(() => {
    onNavigateToChat(supplierId)
  }, [onNavigateToChat, supplierId])

  const handleProductPress = useCallback((productId: string) => {
    const product = supplier?.products?.find(p => p.id === productId)
    if (!product || !supplier) return
    const supplierInfo = {
      id: supplier.id,
      shopName: supplier.shopName,
      rating: supplier.rating,
      distance: supplier.distance,
      mode: supplier.mode,
      isValidated: (supplier.badges ?? []).includes('VALIDATED'),
    }
    onNavigateToProduct(productId, product, supplierInfo)
  }, [onNavigateToProduct, supplier])

  const handleCall = useCallback(() => {
    if (supplier?.phoneNumber) {
      Linking.openURL(`tel:${supplier.phoneNumber}`)
    }
  }, [supplier?.phoneNumber])

  const handleNavigate = useCallback(() => {
    if (!supplier) return
    const { latitude, longitude } = supplier
    const url = Platform.select({
      ios: `maps:0,0?q=${latitude},${longitude}`,
      android: `geo:${latitude},${longitude}?q=${latitude},${longitude}`,
    })
    if (url) Linking.openURL(url)
  }, [supplier])

  const handleShare = useCallback(async () => {
    if (!supplier) return
    try {
      await Share.share({
        message: `Découvrez ${supplier.shopName} sur eBio ! 🌿`,
      })
    }
    catch {
      // Share cancelled or failed
    }
  }, [supplier])

  // Current day schedule info
  const currentDayInfo = useMemo(() => {
    if (!supplier || !supplier.openingHours?.length) return null
    const todayKey = getCurrentDayKey()
    const todayHours = supplier.openingHours.find(h => h.day === todayKey)
    if (!todayHours || todayHours.isClosed) {
      // Find next open day
      const todayIdx = DAY_ORDER.indexOf(todayKey)
      for (let offset = 1; offset <= 7; offset++) {
        const nextIdx = (todayIdx + offset) % 7
        const nextDay = supplier.openingHours.find(h => h.day === DAY_ORDER[nextIdx])
        if (nextDay && !nextDay.isClosed) {
          return {
            text: `Fermé · Ouvre ${DAY_NAMES[DAY_ORDER[nextIdx]].toLowerCase()} à ${nextDay.openTime}`,
            isOpen: false,
          }
        }
      }
      return { text: 'Fermé', isOpen: false }
    }
    if (supplier.isCurrentlyOpen) {
      return { text: `Ouvert jusqu'à ${todayHours.closeTime}`, isOpen: true }
    }
    return { text: `Fermé · Ouvre à ${todayHours.openTime}`, isOpen: false }
  }, [supplier])

  const visibleProducts = useMemo(() => {
    if (!supplier?.products) return []
    return showAllProducts
      ? supplier.products
      : supplier.products.slice(0, MAX_VISIBLE_PRODUCTS)
  }, [supplier, showAllProducts])

  const hasMoreProducts = (supplier?.products?.length ?? 0) > MAX_VISIBLE_PRODUCTS

  // ---- Loading ----
  if (isLoading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: semantic.bgPage }]}>
        <ActivityIndicator size="large" color={semantic.colorPrimary} />
      </View>
    )
  }

  // ---- Error ----
  if (!supplier) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: semantic.bgPage }]}>
        <Store size={48} color={semantic.textTertiary} strokeWidth={1.5} />
        <Text style={[styles.errorText, { color: semantic.textSecondary }]}>
          Impossible de charger le profil.
        </Text>
      </View>
    )
  }

  return (
    <View style={[styles.screen, { backgroundColor: semantic.bgPage }]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={{ paddingBottom: spacing[12] + 80 }}
        showsVerticalScrollIndicator={false}
        bounces
      >
        {/* ================================================================= */}
        {/* HERO SECTION                                                       */}
        {/* ================================================================= */}
        <View style={styles.heroContainer}>
          {/* Cover photo */}
          {supplier.coverPhotoUrl ? (
            <Image
              source={{ uri: supplier.coverPhotoUrl }}
              style={styles.coverImage}
              resizeMode="cover"
            />
          ) : (
            <View style={[styles.coverImage, { backgroundColor: colors.green[100] }]}>
              <Store size={48} color={colors.green[200]} strokeWidth={1.5} />
            </View>
          )}

          {/* Gradient overlay */}
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.55)']}
            style={styles.coverGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
          />

          {/* Back button */}
          <Pressable
            style={[styles.backButton, { top: insets.top + 8 }]}
            onPress={() => onGoBack ? onGoBack() : navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel="Retour"
            hitSlop={8}
          >
            <ArrowLeft size={20} color={colors.neutral[0]} strokeWidth={2.5} />
          </Pressable>

          {/* Profile photo — overlapping bottom of cover */}
          <View style={styles.profilePhotoAnchor}>
            <View style={[styles.profilePhotoWrapper, { borderColor: semantic.bgPage }]}>
              {supplier.profilePhotoUrl ? (
                <Image
                  source={{ uri: supplier.profilePhotoUrl }}
                  style={styles.profilePhoto}
                  resizeMode="cover"
                />
              ) : (
                <View style={[styles.profilePhoto, styles.profilePlaceholder]}>
                  <Text style={styles.profileInitial}>
                    {supplier.shopName.charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* ================================================================= */}
        {/* STORE INFO SECTION                                                 */}
        {/* ================================================================= */}
        <View style={styles.infoSection}>
          {/* Shop name */}
          <Text style={[styles.shopName, { color: semantic.textPrimary }]}>
            {supplier.shopName}
          </Text>

          {/* Address + distance */}
          <View style={styles.addressRow}>
            <MapPin size={14} color={semantic.textTertiary} strokeWidth={2} />
            <Text style={[styles.addressText, { color: semantic.textTertiary }]} numberOfLines={1}>
              {supplier.address} · {formatDistance(supplier.distance)}
            </Text>
          </View>

          {/* Rating row */}
          <StarRatingRow
            rating={supplier.rating}
            reviewCount={supplier.reviewCount}
            isOpen={supplier.isCurrentlyOpen}
            semantic={semantic}
          />

          {/* Badge pills — horizontal scroll */}
          {(supplier.badges?.length ?? 0) > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.badgeScroll}
              contentContainerStyle={styles.badgeScrollContent}
            >
              {(supplier.badges ?? []).map((badge) => {
                const variant = BADGE_MAP[badge]
                if (!variant) return null
                return <Badge key={badge} variant={variant} />
              })}
            </ScrollView>
          )}
        </View>

        {/* Divider */}
        <View style={[styles.divider, { backgroundColor: semantic.borderLight }]} />

        {/* ================================================================= */}
        {/* QUICK ACTIONS ROW                                                  */}
        {/* ================================================================= */}
        <FadeInView delay={200}>
        <View style={styles.quickActionsRow}>
          {supplier.phoneNumber && (
            <QuickAction
              icon={Phone}
              label="Appeler"
              onPress={handleCall}
              semantic={semantic}
            />
          )}
          <QuickAction
            icon={MessageCircle}
            label="Message"
            onPress={handleOpenChat}
            semantic={semantic}
          />
          <QuickAction
            icon={Navigation}
            label="Itinéraire"
            onPress={handleNavigate}
            semantic={semantic}
          />
          <QuickAction
            icon={ShareIcon}
            label="Partager"
            onPress={handleShare}
            semantic={semantic}
          />
        </View>
        </FadeInView>

        {/* Divider */}
        <View style={[styles.divider, { backgroundColor: semantic.borderLight }]} />

        {/* ================================================================= */}
        {/* HORAIRES SECTION (collapsible)                                     */}
        {/* ================================================================= */}
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.horaireHeader}
            onPress={() => setIsHoursExpanded(prev => !prev)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={isHoursExpanded ? 'Masquer les horaires' : 'Afficher les horaires'}
          >
            <View style={styles.horaireHeaderLeft}>
              <Clock size={18} color={semantic.textSecondary} strokeWidth={2} />
              <View>
                <Text style={[styles.horaireSummary, { color: semantic.textPrimary }]}>
                  {currentDayInfo?.text ?? 'Horaires'}
                </Text>
              </View>
            </View>
            {isHoursExpanded ? (
              <ChevronUp size={20} color={semantic.textTertiary} strokeWidth={2} />
            ) : (
              <ChevronDown size={20} color={semantic.textTertiary} strokeWidth={2} />
            )}
          </TouchableOpacity>

          {isHoursExpanded && supplier.openingHours?.length > 0 && (
            <View style={[styles.horaireGrid, { backgroundColor: semantic.bgSurface, borderColor: semantic.borderLight }]}>
              {DAY_ORDER.map((dayKey) => {
                const hour = supplier.openingHours.find(h => h.day === dayKey)
                const isToday = dayKey === getCurrentDayKey()
                return (
                  <View
                    key={dayKey}
                    style={[
                      styles.hourRow,
                      isToday && { backgroundColor: semantic.bgPrimaryLight, borderRadius: radius.sm },
                    ]}
                  >
                    <Text
                      style={[
                        styles.hourDay,
                        { color: isToday ? semantic.colorPrimary : semantic.textSecondary },
                        isToday && { fontFamily: fonts.sansSb },
                      ]}
                    >
                      {DAY_NAMES[dayKey]}
                    </Text>
                    <Text
                      style={[
                        styles.hourTime,
                        {
                          color: !hour || hour.isClosed
                            ? colors.coral[400]
                            : isToday
                              ? semantic.colorPrimary
                              : semantic.textPrimary,
                        },
                        isToday && { fontFamily: fonts.sansSb },
                      ]}
                    >
                      {!hour || hour.isClosed
                        ? 'Fermé'
                        : `${hour.openTime} – ${hour.closeTime}`}
                    </Text>
                  </View>
                )
              })}
            </View>
          )}
        </View>

        {/* Divider */}
        <View style={[styles.divider, { backgroundColor: semantic.borderLight }]} />

        {/* ================================================================= */}
        {/* PRODUITS SECTION                                                    */}
        {/* ================================================================= */}
        <View style={styles.section}>
          <View style={styles.productSectionHeader}>
            <Text style={[styles.sectionTitle, { color: semantic.textPrimary }]}>
              Produits ({supplier.products?.length ?? 0})
            </Text>
            {hasMoreProducts && !showAllProducts && (
              <TouchableOpacity
                onPress={() => setShowAllProducts(true)}
                activeOpacity={0.7}
                accessibilityRole="button"
              >
                <Text style={[styles.voirTout, { color: semantic.colorPrimary }]}>
                  Voir tout
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {(supplier.products?.length ?? 0) === 0 ? (
            <View style={[styles.emptyProducts, { backgroundColor: semantic.bgSurface }]}>
              <ShoppingBag size={32} color={semantic.textTertiary} strokeWidth={1.5} />
              <Text style={[styles.emptyProductsText, { color: semantic.textTertiary }]}>
                Aucun produit disponible
              </Text>
            </View>
          ) : (
            <View style={styles.productGrid}>
              {visibleProducts.map(product => (
                <View key={product.id} style={styles.productCell}>
                  <ProductCard
                    id={product.id}
                    name={product.name}
                    imageUrl={product.imageUrl}
                    pricePerUnit={product.pricePerUnit}
                    promotionalPrice={product.promotionalPrice}
                    unit={product.unit}
                    isInStock={product.isInStock}
                    onPress={handleProductPress}
                  />
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      {/* ================================================================= */}
      {/* STICKY BOTTOM BAR                                                    */}
      {/* ================================================================= */}
      <View
        style={[
          styles.bottomBar,
          {
            backgroundColor: semantic.bgPage,
            borderTopColor: semantic.borderLight,
            paddingBottom: Math.max(insets.bottom, spacing[4]),
          },
        ]}
      >
        {supplier.mode === 'ORDER' ? (
          <TouchableOpacity
            style={styles.bottomButtonPrimary}
            onPress={() => onNavigateToOrder(supplierId)}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Commander"
          >
            <ShoppingBag size={20} color={colors.neutral[0]} strokeWidth={2} />
            <Text style={styles.bottomButtonPrimaryText}>Commander</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.bottomButtonSecondary, { borderColor: semantic.colorPrimary }]}
            onPress={() => setIsContactSheetVisible(true)}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Contacter"
          >
            <MessageCircle size={20} color={semantic.colorPrimary} strokeWidth={2} />
            <Text style={[styles.bottomButtonSecondaryText, { color: semantic.colorPrimary }]}>
              Contacter
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Contact Action Sheet */}
      <ContactActionSheet
        isVisible={isContactSheetVisible}
        onClose={() => setIsContactSheetVisible(false)}
        onOpenChat={handleOpenChat}
        phoneNumber={supplier.phoneNumber}
        whatsappNumber={supplier.whatsappNumber}
      />
    </View>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing[3],
  },
  errorText: {
    ...typography.bodyL,
  },

  // -- Hero --
  heroContainer: {
    position: 'relative',
    height: COVER_HEIGHT + PROFILE_SIZE / 2,
  },
  coverImage: {
    width: SCREEN_WIDTH,
    height: COVER_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  coverGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: PROFILE_SIZE / 2,
    height: COVER_HEIGHT * 0.45,
  },
  backButton: {
    position: 'absolute',
    left: spacing[4],
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  profilePhotoAnchor: {
    position: 'absolute',
    bottom: 0,
    left: spacing[4],
  },
  profilePhotoWrapper: {
    borderRadius: (PROFILE_SIZE + PROFILE_BORDER * 2) / 2,
    borderWidth: PROFILE_BORDER,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },
  profilePhoto: {
    width: PROFILE_SIZE,
    height: PROFILE_SIZE,
    borderRadius: PROFILE_SIZE / 2,
  },
  profilePlaceholder: {
    backgroundColor: colors.green[100],
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileInitial: {
    fontFamily: fonts.sansBd,
    fontSize: 30,
    color: colors.green[600],
  },

  // -- Info --
  infoSection: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
    gap: spacing[2],
  },
  shopName: {
    ...typography.h1,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  addressText: {
    ...typography.bodyS,
    flex: 1,
  },
  badgeScroll: {
    marginTop: spacing[1],
    marginHorizontal: -spacing[4],
  },
  badgeScrollContent: {
    paddingHorizontal: spacing[4],
    gap: spacing[2],
    flexDirection: 'row',
  },

  // -- Divider --
  divider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: spacing[4],
    marginVertical: spacing[4],
  },

  // -- Quick actions --
  quickActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    paddingHorizontal: spacing[4],
  },

  // -- Section --
  section: {
    paddingHorizontal: spacing[4],
    gap: spacing[3],
  },
  sectionTitle: {
    ...typography.h2,
  },

  // -- Horaires --
  horaireHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  horaireHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    flex: 1,
  },
  horaireSummary: {
    fontFamily: fonts.sansSb,
    fontSize: 14,
    lineHeight: 20,
  },
  horaireGrid: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    paddingVertical: spacing[1],
    paddingHorizontal: spacing[2],
  },
  hourRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[2],
  },
  hourDay: {
    ...typography.bodyS,
  },
  hourTime: {
    ...typography.bodyS,
    fontFamily: fonts.sansMd,
  },

  // -- Products --
  productSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  voirTout: {
    fontFamily: fonts.sansSb,
    fontSize: 14,
    lineHeight: 18,
  },
  productGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[3],
  },
  productCell: {
    width: (SCREEN_WIDTH - spacing[4] * 2 - spacing[3]) / 2,
  },
  emptyProducts: {
    paddingVertical: spacing[8],
    borderRadius: radius.lg,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing[2],
  },
  emptyProductsText: {
    ...typography.bodyS,
  },

  // -- Bottom bar --
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
    borderTopWidth: StyleSheet.hairlineWidth,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -3 },
        shadowOpacity: 0.08,
        shadowRadius: 6,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  bottomButtonPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    height: 52,
    backgroundColor: colors.green[400],
    borderRadius: radius.lg,
  },
  bottomButtonPrimaryText: {
    fontFamily: fonts.sansBd,
    fontSize: 16,
    color: colors.neutral[0],
  },
  bottomButtonSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    height: 52,
    borderWidth: 1.5,
    borderRadius: radius.lg,
    backgroundColor: 'transparent',
  },
  bottomButtonSecondaryText: {
    fontFamily: fonts.sansBd,
    fontSize: 16,
  },
})

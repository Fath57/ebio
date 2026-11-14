import type { Announcement } from '../features/announcements/hooks/use-announcement'
import type { AssistantCartLine } from '../features/assistant/assistant'
// @ts-nocheck (React Navigation types incompatible with React 19 types, upstream issue)
// The two directives above must stay at the top of the file: an import
// placed before them disables the `@ts-nocheck` and wakes the React
// de types de React Navigation.
import type { ProductDetailProduct, ProductDetailSupplier } from '../features/catalog/components/product-detail-screen'
import type { ApiProductDetail, ApiSupplierDetail } from '../features/catalog/product-detail-mapping'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'

import { getFocusedRouteNameFromRoute, NavigationContainer, StackActions } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import ClipboardList from 'lucide-react-native/dist/esm/icons/clipboard-list'
import Home from 'lucide-react-native/dist/esm/icons/house'
import MessageCircle from 'lucide-react-native/dist/esm/icons/message-circle'
import ShoppingBagIcon from 'lucide-react-native/dist/esm/icons/shopping-bag'
import User from 'lucide-react-native/dist/esm/icons/user'
import * as React from 'react'
import { ActivityIndicator, Linking, Platform, StatusBar, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { AnnouncementModal } from '../features/announcements/components/announcement-modal'
import { useAnnouncement } from '../features/announcements/hooks/use-announcement'
import { AssistantScreen } from '../features/assistant/components/assistant-screen'
import { ChangePasswordScreen } from '../features/auth/components/change-password-screen'
import { ForgotPasswordScreen } from '../features/auth/components/forgot-password-screen'
import { LoginScreen } from '../features/auth/components/login-screen'
import { RegisterScreen } from '../features/auth/components/register-screen'
import { SupplierRegistration } from '../features/auth/components/supplier-registration'
import { useCart } from '../features/cart/cart-context'
import { CartCtaBar } from '../features/cart/components/cart-cta-bar'
import { CartScreen } from '../features/cart/components/cart-screen'
import { CheckoutFlow } from '../features/cart/components/checkout-flow'
import { keepCheckoutAddressOnly } from '../features/cart/utils/checkout-draft'
import { ProductDetailScreen } from '../features/catalog/components/product-detail-screen'
import { toDetailProduct, toDetailSupplier } from '../features/catalog/product-detail-mapping'
import { ChatDetailScreen } from '../features/chat/components/chat-detail-screen'
import { ConversationList } from '../features/chat/components/conversation-list'
import { openDeliveryConversation } from '../features/chat/delivery-chat'
import { useChatUnreadCount } from '../features/chat/hooks/use-chat-unread-count'
import { openSupportConversation } from '../features/chat/support-chat'
import { appAlert } from '../features/common/components/app-alert'
import { ConnectivityBanner } from '../features/common/components/connectivity-banner'
import { ScreenHeader } from '../features/common/components/screen-header'
import { TabBarIcon } from '../features/common/components/tab-bar-icon'
import { TabFocusIndicator } from '../features/common/components/tab-focus-indicator'
import { useLocation } from '../features/common/location-context'
import { AddFamilyMemberScreen } from '../features/family-wallet/components/add-family-member-screen'
import { FamilyHistoryScreen } from '../features/family-wallet/components/family-history-screen'
import { FamilyLimitsScreen } from '../features/family-wallet/components/family-limits-screen'
import { FamilyWalletScreen } from '../features/family-wallet/components/family-wallet-screen'
import { FavoritesScreen } from '../features/favorites/components/favorites-screen'
import { HomeScreen } from '../features/home/components/home-screen'
import { LocationPickerScreen } from '../features/map/components/location-picker-screen'
import { NotificationsScreen } from '../features/notifications/components/notifications-screen'
import { PushConsentSheet } from '../features/notifications/components/push-consent-sheet'
import { useNotifications } from '../features/notifications/hooks/use-notifications'
import { LiveOrderFab } from '../features/orders/components/live-order-fab'
import { OrderConfirmation } from '../features/orders/components/order-confirmation'
import { OrderList } from '../features/orders/components/order-list'
import { OrderTracking } from '../features/orders/components/order-tracking'
import { LiveOrderProvider, useLiveOrder } from '../features/orders/live-order-context'
import { EditProfileScreen } from '../features/profile/components/edit-profile-screen'
import { HelpCenterScreen } from '../features/profile/components/help-center-screen'
import { LegalScreen } from '../features/profile/components/legal-screen'
import { ProfileScreen } from '../features/profile/components/profile-screen'
import { RateOrderFlow } from '../features/ratings/components/rate-order-flow'
import { RateProductsScreen } from '../features/ratings/components/rate-products-screen'
import { ReviewsList } from '../features/ratings/components/reviews-list'
import { ReferralScreen } from '../features/referrals/components/referral-screen'
import { usePendingReferralClaim } from '../features/referrals/hooks/use-pending-referral-claim'
import { RelativeFormScreen } from '../features/relatives/components/relative-form-screen'
import { RelativesScreen } from '../features/relatives/components/relatives-screen'
import { SearchScreen } from '../features/search/components/search-screen'
import { SupplierProfileScreen } from '../features/supplier-profile/components/supplier-profile-screen'
import { ShipmentScreen } from '../features/terroir/components/shipment-screen'
import { ShipmentsList } from '../features/terroir/components/shipments-list'
import { TerroirCartScreen } from '../features/terroir/components/terroir-cart-screen'
import { TerroirCheckoutScreen } from '../features/terroir/components/terroir-checkout-screen'
import { TerroirPackScreen } from '../features/terroir/components/terroir-product-screen'
import { ValiseModeBanner } from '../features/terroir/components/valise-ui'
import { ValiseWaitlistScreen } from '../features/terroir/components/valise-waitlist-screen'
import { useTerroirCart } from '../features/terroir/terroir-cart-context'
import { useValiseMode } from '../features/terroir/valise-mode-context'
import { WalletScreen } from '../features/wallet/components/wallet-screen'
import { useSession } from '../lib/auth-client'
import { colors, fonts } from '../theme/theme'
import { useTheme } from '../theme/theme-context'
import { track } from '../utils/analytics'
import { apiFetch, chatFetch } from '../utils/api-client'
import { navigationRef } from './navigation-ref'

/**
 * The strip every screen sits under, below the status bar.
 *
 * `SafeAreaView` alone trusted the inset the system reports, and some Android
 * devices report less than the status bar they actually draw, the title then
 * sat half under the clock. Taking the larger of the two costs nothing where
 * the inset is right (edge-to-edge makes them equal) and is the only thing
 * that saves the devices where it is not; it is a max, never a sum, so
 * nothing is padded twice.
 */
function SafeScreen({ children }: { children: React.ReactNode }) {
  const { semantic } = useTheme()
  const insets = useSafeAreaInsets()
  const statusBarHeight = Platform.OS === 'android' ? StatusBar.currentHeight ?? 0 : 0

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: semantic.bgPage,
        paddingTop: Math.max(insets.top, statusBarHeight),
      }}
    >
      {children}
    </View>
  )
}

// Stack navigators per tab
const SearchStack = createNativeStackNavigator()
function SearchStackScreen() {
  return (
    <SearchStack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right', freezeOnBlur: true }}>
      <SearchStack.Screen name="SearchHome" component={SearchHomeWrapper} />
      <SearchStack.Screen name="SearchResults" component={SearchResultsWrapper} />
      <SearchStack.Screen name="LocationPicker" component={SearchLocationPickerWrapper} />
      <SearchStack.Screen name="SupplierProfile" component={SupplierProfileWrapper} />
      <SearchStack.Screen name="ProductDetail" component={ProductDetailWrapper} />
      <SearchStack.Screen name="ProductReviews" component={ProductReviewsWrapper} />
      <SearchStack.Screen name="Assistant" component={AssistantWrapper} />
      {/* Ouverts depuis l'en-tête de l'accueil, donc empilés ici.
        *
        * Les envoyer dans l'onglet Profil y laissait la pile posée sur eux :
        * on revenait ensuite sur Profil et on retombait sur les
        * notifications, l'onglet ayant fidèlement gardé ce qu'un autre
        * onglet y avait mis. */}
      <SearchStack.Screen name="Notifications" component={NotificationsWrapper} />
      <SearchStack.Screen name="BuyerWallet" component={BuyerWalletWrapper} />
      <SearchStack.Screen name="FamilyPurchases" component={FamilyPurchasesWrapper} />
      {/* La Valise du pays (011) is a mode of the whole app, not a space of
        * its own: only the wait for a departure and the packs live here. */}
      <SearchStack.Screen name="Terroir" component={TerroirWaitlistWrapper} />
      <SearchStack.Screen name="TerroirPack" component={TerroirPackWrapper} />
      {/* Writing to a shop needs an account: a visitor signs in here and
        * comes straight back to the shop rather than to another tab. */}
      <SearchStack.Screen name="Login" component={LoginWrapper} />
      <SearchStack.Screen name="Register" component={RegisterWrapper} />
      <SearchStack.Screen name="ForgotPassword" component={ForgotPasswordWrapper} />
    </SearchStack.Navigator>
  )
}

function SearchHomeWrapper({ navigation }: any) {
  const { enter } = useValiseMode()
  const { countries } = useTerroirCart()
  // The green header paints the status-bar area itself (no SafeScreen strip).
  return (
    <View style={{ flex: 1 }}>
      <HomeScreen
        onOpenSearch={() => navigation.navigate('SearchResults', { autoFocus: true })}
        onSelectCategory={(slug: string) => navigation.navigate('SearchResults', { category: slug })}
        onOpenMap={() => navigation.navigate('SearchResults', { viewMode: 'map', title: 'Carte' })}
        onPickLocation={() => navigation.navigate('LocationPicker')}
        onNavigateToSupplier={(id: string) => navigation.navigate('SupplierProfile', { supplierId: id })}
        onNavigateToProduct={(id: string) => navigation.navigate('ProductDetail', { productId: id })}
        onOpenNotifications={() => navigation.navigate('Notifications')}
        onOpenWallet={() => navigation.navigate('BuyerWallet')}
        onOpenTerroir={() => {
          // A country to ship to: the mode turns on, right here on the home.
          // None yet (loading, or no departure): the waiting screen decides.
          if (countries && countries.length > 0) {
            enter()
            return
          }
          navigation.navigate('Terroir')
        }}
        onOpenTerroirPack={(packId: string) => navigation.navigate('TerroirPack', { packId })}
        onRequireLogin={() => navigation.navigate('Login')}
        onOpenAssistant={() => {
          track('assistant_ouvert')
          navigation.navigate('Assistant')
        }}
        onSeeAll={(title, criteria, productIds) => {
          // The section's criteria reopen the search as they are: no mapping
          // left to maintain between three frozen names and three sets of
          // filters. A hand-picked section carries its products instead, and
          // they are all the filter it needs.
          navigation.navigate('SearchResults', {
            title,
            productIds: productIds ?? undefined,
            validatedOnly: criteria.validatedOnly === true,
            promoOnly: criteria.promoOnly === true,
            category: criteria.categorySlug,
            supplierId: criteria.supplierId,
            maxPrice: criteria.maxPrice,
            minRating: criteria.minRating,
            newerThanDays: criteria.newerThanDays,
            radius: criteria.maxDistanceKm === undefined ? undefined : criteria.maxDistanceKm * 1000,
            sortBy: criteria.sortBy,
          })
        }}
      />
    </View>
  )
}

function TerroirWaitlistWrapper({ navigation }: any) {
  return (
    <SafeScreen>
      <ValiseWaitlistScreen
        onBack={() => navigation.goBack()}
        onEntered={() => navigation.popToTop()}
        onRequireLogin={() => navigation.navigate('Login')}
      />
    </SafeScreen>
  )
}

function TerroirPackWrapper({ route, navigation }: any) {
  return (
    <SafeScreen>
      <TerroirPackScreen
        packId={route.params.packId}
        onBack={() => navigation.goBack()}
        onOpenCart={() => navigation.navigate('Panier', { screen: 'CartHome' })}
      />
    </SafeScreen>
  )
}

/** « Ma valise »: the cart tab's root while the Valise mode is on. */
function ValiseCartWrapper({ navigation }: any) {
  const { data: session } = useSession()
  return (
    <SafeScreen>
      <TerroirCartScreen
        onCheckout={() => navigation.navigate(session?.user ? 'TerroirCheckout' : 'Login')}
        onOpenProduct={(productId: string) => navigation.navigate('ProductDetail', { productId })}
        onBrowse={() => navigation.navigate('Accueil', { screen: 'SearchHome' })}
      />
    </SafeScreen>
  )
}

/** The cart tab shows the valise in Valise mode, the local cart otherwise; neither touches the other. */
function CartHomeSwitch({ navigation, route }: any) {
  const { active } = useValiseMode()
  return active
    ? <ValiseCartWrapper navigation={navigation} route={route} />
    : <CartHomeWrapper navigation={navigation} route={route} />
}

function TerroirCheckoutWrapper({ navigation }: any) {
  const { data: session } = useSession()
  const customer = {
    name: session?.user?.name ?? '',
    email: session?.user?.email ?? null,
    phone: session?.user?.phone ?? null,
  }
  return (
    <SafeScreen>
      <TerroirCheckoutScreen
        customer={customer}
        onBack={() => navigation.goBack()}
        onComplete={(shipmentId: string) => {
          navigation.popToTop()
          navigation.navigate('Commandes', {
            screen: 'TerroirShipment',
            initial: false,
            params: { shipmentId },
          })
        }}
      />
    </SafeScreen>
  )
}

/**
 * The assistant, and the handover to checkout.
 *
 * The conversation keeps its cart server-side; checkout only knows the app's
 * cart. So the lines are copied across before switching, without touching what
 * was already there: the buyer may have started by hand and carried on by
 * speaking.
 */
function AssistantWrapper({ navigation }: any) {
  const { addItem } = useCart()
  const { exit: exitValise } = useValiseMode()

  return (
    <SafeScreen>
      <AssistantScreen
        onGoBack={() => navigation.goBack()}
        onOrder={(cart: AssistantCartLine[]) => {
          cart.forEach(line => addItem({
            productId: line.productId,
            supplierId: line.supplierId,
            supplierName: line.supplierName,
            name: line.name,
            imageUrl: line.imageUrl,
            pricePerUnit: line.pricePerUnit,
            unit: line.unit,
            quantity: line.quantity,
          }))
          // The assistant fills the local cart: show that one, not the valise.
          exitValise()
          navigation.navigate('Panier', { screen: 'CartHome' })
        }}
      />
    </SafeScreen>
  )
}

function SearchResultsWrapper({ route, navigation }: any) {
  const params = route.params ?? {}
  return (
    <SafeScreen>
      <ValiseModeBanner />
      <SearchScreen
        onGoBack={() => navigation.goBack()}
        onNavigateToSupplier={(id: string) => navigation.navigate('SupplierProfile', { supplierId: id })}
        onNavigateToProduct={(id: string) => navigation.navigate('ProductDetail', { productId: id })}
        onPickLocation={() => navigation.navigate('LocationPicker')}
        initialQuery={params.query}
        initialCategory={params.category}
        initialValidatedOnly={params.validatedOnly}
        initialPromoOnly={params.promoOnly}
        initialSupplierId={params.supplierId}
        initialProductIds={params.productIds}
        initialMaxPrice={params.maxPrice}
        initialMinRating={params.minRating}
        initialNewerThanDays={params.newerThanDays}
        initialRadius={params.radius}
        initialSortBy={params.sortBy}
        initialViewMode={params.viewMode}
        headerTitle={params.title}
        initialAutoFocus={params.autoFocus}
      />
    </SafeScreen>
  )
}

function SearchLocationPickerWrapper({ navigation }: any) {
  const { latitude, longitude, setManualLocation } = useLocation()
  return (
    <SafeScreen>
      <LocationPickerScreen
        initialLatitude={latitude}
        initialLongitude={longitude}
        onConfirm={(coords) => {
          // The picker says "no name yet" with null, the store only knows
          // "absent", they mean the same thing and only one can be stored.
          setManualLocation({
            latitude: coords.latitude,
            longitude: coords.longitude,
            label: coords.label ?? undefined,
          })
          navigation.goBack()
        }}
        onGoBack={() => navigation.goBack()}
      />
    </SafeScreen>
  )
}

async function openChatWithSupplier(navigation: any, supplierId: string, peerName?: string, orderId?: string) {
  try {
    const res = await chatFetch('/api/chat/conversations', {
      method: 'POST',
      body: JSON.stringify({ supplierId, ...(orderId ? { orderId } : {}) }),
    })
    if (!res.ok) {
      // A silent failure read as a dead button: say what happened instead.
      appAlert(
        'Discussion indisponible',
        res.status === 401
          ? 'Votre session a expiré. Reconnectez-vous pour écrire à la boutique.'
          : 'Impossible d’ouvrir la discussion pour le moment. Réessayez.',
      )
      return
    }
    const conv = await res.json()
    navigation.navigate('Chat', {
      screen: 'ChatDetail',
      // Puts the conversation list underneath: without it the Chat stack is
      // created with ChatDetail as its only route, so the back button has
      // nothing to pop and the list becomes unreachable.
      initial: false,
      params: {
        conversationId: conv.id,
        peerName: peerName ?? conv.supplierShopName,
        isSupplier: false,
        orderId: conv.orderId ?? orderId ?? null,
        kind: 'SUPPLIER',
      },
    })
  }
  catch {
    appAlert('Discussion indisponible', 'Vérifiez votre connexion et réessayez.')
  }
}

/** Buyer -> courier thread of a delivery (get-or-create), then the chat tab. */
/** Buyer ↔ eBio support thread (get-or-create), then the chat tab. */
async function openSupportChat(navigation: any) {
  try {
    const conv = await openSupportConversation()
    navigation.navigate('Chat', {
      screen: 'ChatDetail',
      initial: false,
      params: {
        conversationId: conv.id,
        peerName: 'Support eBio',
        isSupplier: false,
        orderId: null,
        kind: 'SUPPORT',
      },
    })
  }
  catch (error) {
    appAlert('Support indisponible', error instanceof Error ? error.message : undefined)
  }
}

async function openChatWithCourier(navigation: any, deliveryId: string, peerName: string, orderId?: string) {
  try {
    const conv = await openDeliveryConversation(deliveryId)
    navigation.navigate('Chat', {
      screen: 'ChatDetail',
      initial: false,
      params: {
        conversationId: conv.conversationId,
        peerName: conv.peerName ?? peerName,
        isSupplier: false,
        orderId: conv.orderId ?? orderId ?? null,
        kind: 'COURIER',
      },
    })
  }
  catch (error) {
    appAlert('Discussion indisponible', error instanceof Error ? error.message : undefined)
  }
}

function SupplierProfileWrapper({ route, navigation }: any) {
  const { supplierId } = route.params
  const { data: session } = useSession()
  // The local cart's bar has no place while the shop fills the valise.
  const { active: valise } = useValiseMode()
  return (
    <View style={{ flex: 1 }}>
      <SupplierProfileScreen
        supplierId={supplierId}
        onNavigateToChat={(id) => {
          // A visitor has no thread to open: sign in first, then back here.
          if (!session?.user) {
            navigation.navigate('Login')
            return
          }
          openChatWithSupplier(navigation, id)
        }}
        onNavigateToProduct={(productId, product, supplierInfo) => {
          navigation.navigate('ProductDetail', { product, supplier: supplierInfo })
        }}
        onGoBack={() => navigation.goBack()}
      />
      {!valise && <CartCtaBar onPress={() => navigation.navigate('Panier')} />}
    </View>
  )
}

/**
 * Every review of one product, paginated. Pushed onto the Accueil stack so
 * the back button returns to the product page it came from.
 */
function HelpCenterWrapper({ navigation }: any) {
  return (
    <SafeScreen>
      <HelpCenterScreen
        onGoBack={() => navigation.goBack()}
        // Straight to the support thread: someone opening the help centre is
        // looking for eBio, not for the last shop they wrote to.
        onOpenChat={() => openSupportChat(navigation)}
      />
    </SafeScreen>
  )
}

function TermsWrapper({ navigation }: any) {
  return (
    <SafeScreen>
      <LegalScreen document="cgu" onGoBack={() => navigation.goBack()} />
    </SafeScreen>
  )
}

function ProductReviewsWrapper({ route, navigation }: any) {
  const { productId, productName } = route.params ?? {}
  return (
    <SafeScreen>
      <ScreenHeader title="Avis" subtitle={productName} onBack={() => navigation.goBack()} />
      <ReviewsList target="product" id={productId} />
    </SafeScreen>
  )
}

interface LoadedProductDetail {
  product: ProductDetailProduct
  supplier: ProductDetailSupplier | null
  /** The raw detail, handed to the screen so it does not fetch it again. */
  detail: Record<string, unknown>
  at: number
}

/** Long enough to cover a back-and-forth, short enough for a price to stay current. */
const PRODUCT_DETAIL_TTL_MS = 2 * 60 * 1000

/**
 * Products opened a moment ago. Going back to a product, or opening it again
 * from the shop, then slides in already filled instead of on a spinner.
 */
const productDetailCache = new Map<string, LoadedProductDetail>()

function freshProductDetail(productId: string | undefined): LoadedProductDetail | null {
  const entry = productId ? productDetailCache.get(productId) : undefined
  return entry && Date.now() - entry.at < PRODUCT_DETAIL_TTL_MS ? entry : null
}

function ProductDetailWrapper({ route, navigation }: any) {
  const { productId } = route.params ?? {}
  const { active: valise, country: valiseCountry } = useValiseMode()
  const [loaded, setLoaded] = React.useState<LoadedProductDetail | null>(() => freshProductDetail(productId))

  // A banner only carries an id: we fill in the product and its
  // supplier ourselves, which the screen expects as objects.
  React.useEffect(() => {
    if (!productId || freshProductDetail(productId))
      return
    let cancelled = false
    async function load() {
      try {
        // In Valise mode the detail also says whether the product travels.
        const productRes = await apiFetch(`/api/products/${productId}${valiseCountry ? `?exportCountry=${valiseCountry}` : ''}`)
        if (!productRes.ok)
          return
        const rawProduct = await productRes.json() as ApiProductDetail
        const supplierRes = await apiFetch(`/api/suppliers/${rawProduct.supplierId}`)
        const rawSupplier = supplierRes.ok ? await supplierRes.json() as ApiSupplierDetail : null
        const entry: LoadedProductDetail = {
          product: toDetailProduct(rawProduct),
          supplier: rawSupplier && toDetailSupplier(rawSupplier),
          detail: rawProduct as unknown as Record<string, unknown>,
          at: Date.now(),
        }
        productDetailCache.set(productId, entry)
        if (!cancelled) {
          setLoaded(entry)
        }
      }
      catch {
        // The screen will show its empty state.
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [productId, valiseCountry])

  const product = route.params?.product ?? loaded?.product
  const supplier = route.params?.supplier ?? loaded?.supplier

  if (!product || !supplier) {
    return (
      <SafeScreen>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={colors.green[400]} />
        </View>
      </SafeScreen>
    )
  }

  return (
    <View style={{ flex: 1 }}>
      <ProductDetailScreen
        product={product}
        supplier={supplier}
        detail={route.params?.product ? null : loaded?.detail}
        onGoBack={() => navigation.goBack()}
        onNavigateToSupplier={id => navigation.navigate('SupplierProfile', { supplierId: id })}
        onOpenProduct={id => navigation.push('ProductDetail', { productId: id })}
        onSeeAllReviews={id => navigation.navigate('ProductReviews', { productId: id, productName: product.name })}
        onOpenValise={() => navigation.navigate('Panier', { screen: 'CartHome' })}
      />
      {!valise && <CartCtaBar onPress={() => navigation.navigate('Panier')} />}
    </View>
  )
}

const ChatStack = createNativeStackNavigator()
function ChatStackScreen() {
  const { data: session } = useSession()
  const currentUserId = session?.user?.id ?? ''
  return (
    <ChatStack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right', freezeOnBlur: true }}>
      <ChatStack.Screen name="ChatHome">
        {({ navigation }) => (
          <SafeScreen>
            <ConversationList
              currentUserId={currentUserId}
              onOpenSupport={() => openSupportChat(navigation)}
              onOpenConversation={(conversationId, peerName, isSupplier, orderId, kind) =>
                navigation.navigate('ChatDetail', { conversationId, peerName, isSupplier, orderId, kind })}
            />
          </SafeScreen>
        )}
      </ChatStack.Screen>
      <ChatStack.Screen name="ChatDetail">
        {({ route, navigation }) => {
          // The stack is created untyped, so its params arrive as a bare
          // object. Named here, once, rather than read blindly five times.
          const params = (route.params ?? {}) as {
            conversationId: string
            peerName: string
            isSupplier?: boolean
            orderId?: string
            kind?: 'SUPPLIER' | 'SUPPORT'
          }
          return (
            <SafeScreen>
              <ChatDetailScreen
                conversationId={params.conversationId}
                currentUserId={currentUserId}
                peerName={params.peerName}
                isSupplier={params.isSupplier}
                orderId={params.orderId}
                kind={params.kind ?? 'SUPPLIER'}
                onGoBack={() => navigation.goBack()}
                onOpenOrder={(oid) => {
                  navigation.navigate('Commandes', { screen: 'OrderTracking', initial: false, params: { orderId: oid } })
                }}
              />
            </SafeScreen>
          )
        }}
      </ChatStack.Screen>
    </ChatStack.Navigator>
  )
}

const CartStack = createNativeStackNavigator()
function CartStackScreen() {
  return (
    <CartStack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right', freezeOnBlur: true }}>
      <CartStack.Screen name="CartHome" component={CartHomeSwitch} />
      <CartStack.Screen name="Login" component={LoginWrapper} />
      <CartStack.Screen name="Register" component={RegisterWrapper} />
      <CartStack.Screen name="ForgotPassword" component={ForgotPasswordWrapper} />
      <CartStack.Screen name="Checkout" component={CheckoutWrapper} />
      <CartStack.Screen name="OrderSuccess" component={OrderSuccessWrapper} />
      {/* Regarder un article de son panier ne doit pas déplacer l'acheteur
        * dans l'onglet Accueil, ni l'y laisser en revenant. */}
      <CartStack.Screen name="ProductDetail" component={ProductDetailWrapper} />
      {/* « Ma valise » lives in this tab in Valise mode: its checkout too. */}
      <CartStack.Screen name="TerroirCheckout" component={TerroirCheckoutWrapper} />
    </CartStack.Navigator>
  )
}

function CartHomeWrapper({ navigation }: any) {
  const { items, groups, deliveryModeFor, updateQuantity, removeItem, setDeliveryMode } = useCart()
  const { data: session } = useSession()
  // The format is chosen on the product page; the cart shows it, it does not change it.
  const mappedItems = items.map(item => ({
    ...item,
    selectedVariant: item.variantId ? { id: item.variantId, label: item.variantLabel ?? '' } : null,
    availableVariants: [],
  }))

  function handleCheckout(supplierId: string) {
    const basket = items.filter(i => i.supplierId === supplierId)
    if (basket.length === 0)
      return

    // One shop, one order. The cart may hold other shops' baskets; they stay
    // where they are and are ordered on their own, which is what makes a
    // promo code usable again, and a refund a single shop's business.
    const shopName = groups.find(g => g.supplierId === supplierId)?.supplierName ?? ''
    const orderSummary = {
      supplierId,
      shopNames: [shopName],
      items: basket.map(i => ({
        productId: i.productId,
        supplierId: i.supplierId,
        supplierName: i.supplierName,
        ...(i.variantId ? { variantId: i.variantId } : {}),
        name: i.variantLabel ? `${i.name}, ${i.variantLabel}` : i.name,
        quantity: i.quantity,
        pricePerUnit: i.pricePerUnit,
        unit: i.unit,
      })),
      deliveryMode: deliveryModeFor(supplierId),
      total: basket.reduce((s, i) => s + i.pricePerUnit * i.quantity, 0),
    }

    if (!session?.user) {
      // Not logged in → redirect to login, then checkout
      navigation.navigate('Login', { redirectTo: 'Checkout', orderSummary })
    }
    else {
      navigation.navigate('Checkout', { orderSummary })
    }
  }

  return (
    <SafeScreen>
      <CartScreen
        items={mappedItems}
        deliveryModeFor={deliveryModeFor}
        onUpdateQuantity={updateQuantity}
        onSelectVariant={() => {}}
        onChangeDeliveryMode={setDeliveryMode}
        onCheckout={handleCheckout}
        onRemoveItem={removeItem}
        onPressItem={productId => navigation.navigate('ProductDetail', { productId })}
      />
    </SafeScreen>
  )
}

function LoginWrapper({ route, navigation }: any) {
  const { redirectTo, orderSummary } = route.params ?? {}
  return (
    <SafeScreen>
      <LoginScreen
        onLoginSuccess={() => {
          if (redirectTo && orderSummary) {
            navigation.replace(redirectTo, { orderSummary })
          }
          else {
            navigation.goBack()
          }
        }}
        onNavigateToRegister={() => navigation.replace('Register', { redirectTo, orderSummary })}
        onNavigateToForgotPassword={() => navigation.navigate('ForgotPassword')}
      />
    </SafeScreen>
  )
}

function RegisterWrapper({ route, navigation }: any) {
  const { redirectTo, orderSummary } = route.params ?? {}
  return (
    <SafeScreen>
      <RegisterScreen
        onRegisterSuccess={() => {
          if (redirectTo && orderSummary) {
            navigation.replace(redirectTo, { orderSummary })
          }
          else {
            navigation.goBack()
          }
        }}
        onNavigateToLogin={() => navigation.replace('Login', { redirectTo, orderSummary })}
      />
    </SafeScreen>
  )
}

function ForgotPasswordWrapper({ navigation }: any) {
  return (
    <SafeScreen>
      <ForgotPasswordScreen
        onGoBack={() => navigation.goBack()}
        onNavigateToLogin={() => navigation.goBack()}
      />
    </SafeScreen>
  )
}

function CheckoutWrapper({ route, navigation }: any) {
  const { clearAll, clearSupplierCart } = useCart()
  const { data: session } = useSession()
  const { orderSummary } = route.params
  const customer = {
    name: session?.user?.name ?? '',
    email: session?.user?.email ?? null,
    phone: session?.user?.phone ?? null,
  }
  return (
    <SafeScreen>
      <CheckoutFlow
        orderSummary={orderSummary}
        customer={customer}
        onComplete={(orderNumber, orderId) => {
          // Only the shop just ordered. The other baskets are separate orders
          // still waiting to be placed, and emptying them here would throw
          // away what the buyer had chosen.
          void keepCheckoutAddressOnly()
          if (orderSummary.supplierId) {
            clearSupplierCart(orderSummary.supplierId)
          }
          else {
            clearAll()
          }
          navigation.replace('OrderSuccess', { orderNumber, orderId })
        }}
        onCancel={() => navigation.goBack()}
      />
    </SafeScreen>
  )
}

function OrderSuccessWrapper({ route, navigation }: any) {
  const { orderNumber, orderId } = route.params
  return (
    <SafeScreen>
      <OrderConfirmation
        orderNumber={orderNumber}
        orderId={orderId}
        onTrackOrder={() => {
          navigation.popToTop()
          navigation.navigate('Commandes', {
            screen: 'OrderTracking',
            initial: false,
            params: { orderId },
          })
        }}
        onContinueShopping={() => navigation.popToTop()}
      />
    </SafeScreen>
  )
}

const OrdersStack = createNativeStackNavigator()
function OrdersStackScreen() {
  return (
    <OrdersStack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right', freezeOnBlur: true }}>
      <OrdersStack.Screen name="MyOrders" component={MyOrdersWrapper} />
      <OrdersStack.Screen name="OrderTracking" component={OrderTrackingWrapper} />
      <OrdersStack.Screen name="RateOrder" component={RateOrderWrapper} />
      <OrdersStack.Screen name="RateProducts" component={RateProductsWrapper} />
      <OrdersStack.Screen name="BuyerWallet" component={BuyerWalletWrapper} />
      <OrdersStack.Screen name="FamilyPurchases" component={FamilyPurchasesWrapper} />
      <OrdersStack.Screen name="TerroirShipments" component={TerroirShipmentsWrapper} />
      <OrdersStack.Screen name="TerroirShipment" component={TerroirShipmentWrapper} />
    </OrdersStack.Navigator>
  )
}

const ProfileStack = createNativeStackNavigator()
function ProfileStackScreen() {
  return (
    <ProfileStack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right', freezeOnBlur: true }}>
      <ProfileStack.Screen name="ProfileHome" component={ProfileHomeWrapper} />
      <ProfileStack.Screen name="EditProfile" component={EditProfileWrapper} />
      <ProfileStack.Screen name="ChangePassword" component={ChangePasswordWrapper} />
      <ProfileStack.Screen name="HelpCenter" component={HelpCenterWrapper} />
      <ProfileStack.Screen name="Terms" component={TermsWrapper} />
      <ProfileStack.Screen name="BuyerWallet" component={BuyerWalletWrapper} />
      <ProfileStack.Screen name="FamilyPurchases" component={FamilyPurchasesWrapper} />
      <ProfileStack.Screen name="Favorites" component={FavoritesWrapper} />
      <ProfileStack.Screen name="Referral" component={ReferralWrapper} />
      <ProfileStack.Screen name="Relatives" component={RelativesWrapper} />
      <ProfileStack.Screen name="RelativeForm" component={RelativeFormWrapper} />
      <ProfileStack.Screen name="FamilyWallet" component={FamilyWalletWrapper} />
      <ProfileStack.Screen name="AddFamilyMember" component={AddFamilyMemberWrapper} />
      <ProfileStack.Screen name="FamilyLimits" component={FamilyLimitsWrapper} />
      <ProfileStack.Screen name="FamilyHistory" component={FamilyHistoryWrapper} />
      {/* Ouvrir un favori doit rester dans l'onglet Profil : sans cet écran
        * ici, la navigation remonte jusqu'à l'onglet Accueil et y dépose
        * l'acheteur, qui l'y retrouve plus tard sans comprendre. */}
      <ProfileStack.Screen name="ProductDetail" component={ProductDetailWrapper} />
      <ProfileStack.Screen name="SupplierRegistration" component={SupplierRegistrationWrapper} />
      <ProfileStack.Screen name="ProfileLogin" component={ProfileLoginWrapper} />
      <ProfileStack.Screen name="ProfileRegister" component={ProfileRegisterWrapper} />
      <ProfileStack.Screen name="ProfileForgotPassword" component={ProfileForgotPasswordWrapper} />
      <ProfileStack.Screen name="Notifications" component={NotificationsWrapper} />
    </ProfileStack.Navigator>
  )
}

function ProfileHomeWrapper({ navigation }: any) {
  const [refreshTrigger, setRefreshTrigger] = React.useState(0)

  React.useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      setRefreshTrigger(k => k + 1)
    })
    return unsubscribe
  }, [navigation])

  return (
    <SafeScreen>
      <ProfileScreen
        onNavigateToOrders={() => navigation.navigate('Commandes', { screen: 'MyOrders' })}
        onNavigateToWallet={() => navigation.navigate('BuyerWallet')}
        onNavigateToFavorites={() => navigation.navigate('Favorites')}
        onNavigateToReferral={() => navigation.navigate('Referral')}
        onNavigateToRelatives={() => navigation.navigate('Relatives')}
        onNavigateToFamilyWallet={() => navigation.navigate('FamilyWallet')}
        onNavigateToNotifications={() => navigation.navigate('Notifications')}
        onNavigateToLogin={() => navigation.navigate('ProfileLogin')}
        onNavigateToEditProfile={() => navigation.navigate('EditProfile')}
        onNavigateToChangePassword={() => navigation.navigate('ChangePassword')}
        onNavigateToHelp={() => navigation.navigate('HelpCenter')}
        onNavigateToTerms={() => navigation.navigate('Terms')}
        onNavigateToSupplierRegistration={() => navigation.navigate('SupplierRegistration')}
        refreshTrigger={refreshTrigger}
      />
    </SafeScreen>
  )
}

function RelativesWrapper({ navigation }: any) {
  return (
    <SafeScreen>
      <RelativesScreen
        onBack={() => navigation.goBack()}
        onEdit={relative => navigation.navigate('RelativeForm', { relative })}
      />
    </SafeScreen>
  )
}

function FamilyWalletWrapper({ navigation }: any) {
  return (
    <SafeScreen>
      <FamilyWalletScreen
        onBack={() => navigation.goBack()}
        onAddMember={() => navigation.navigate('AddFamilyMember')}
        onOpenLimits={() => navigation.navigate('FamilyLimits')}
        onOpenHistory={() => navigation.navigate('FamilyHistory')}
      />
    </SafeScreen>
  )
}

function FamilyHistoryWrapper({ navigation }: any) {
  return (
    <SafeScreen>
      <FamilyHistoryScreen onBack={() => navigation.goBack()} />
    </SafeScreen>
  )
}

function AddFamilyMemberWrapper({ navigation }: any) {
  return (
    <SafeScreen>
      <AddFamilyMemberScreen
        onBack={() => navigation.goBack()}
        onAdded={() => navigation.goBack()}
      />
    </SafeScreen>
  )
}

function FamilyLimitsWrapper({ navigation, route }: any) {
  return (
    <SafeScreen>
      <FamilyLimitsScreen
        onBack={() => navigation.goBack()}
        initialMemberId={route.params?.memberId ?? null}
      />
    </SafeScreen>
  )
}

function RelativeFormWrapper({ navigation, route }: any) {
  return (
    <SafeScreen>
      <RelativeFormScreen
        relative={route.params?.relative ?? null}
        onSaved={() => navigation.goBack()}
        onBack={() => navigation.goBack()}
      />
    </SafeScreen>
  )
}

function ReferralWrapper({ navigation, route }: any) {
  return (
    <SafeScreen>
      <ReferralScreen
        invitedCode={route.params?.code}
        onGoBack={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('ProfileHome'))}
        onSignUp={() => navigation.navigate('ProfileRegister')}
        onLogin={() => navigation.navigate('ProfileLogin')}
      />
    </SafeScreen>
  )
}

function FavoritesWrapper({ navigation }: any) {
  return (
    <SafeScreen>
      <FavoritesScreen
        onGoBack={() => navigation.goBack()}
        onOpenProduct={productId => navigation.navigate('ProductDetail', { productId })}
        onExplore={() => navigation.navigate('Accueil', { screen: 'SearchHome' })}
      />
    </SafeScreen>
  )
}

function SupplierRegistrationWrapper({ navigation }: any) {
  return (
    <SafeScreen>
      <SupplierRegistration
        isPhoneVerified
        onComplete={() => navigation.popToTop()}
        onGoBack={() => navigation.goBack()}
      />
    </SafeScreen>
  )
}

function EditProfileWrapper({ navigation }: any) {
  return (
    <SafeScreen>
      <EditProfileScreen onGoBack={() => navigation.goBack()} />
    </SafeScreen>
  )
}

function ChangePasswordWrapper({ navigation }: any) {
  return (
    <SafeScreen>
      <ScreenHeader title="Modifier mon mot de passe" onBack={() => navigation.goBack()} />
      <ChangePasswordScreen onDone={() => navigation.goBack()} />
    </SafeScreen>
  )
}

function BuyerWalletWrapper({ navigation }: any) {
  return (
    <SafeScreen>
      <WalletScreen
        onGoBack={() => navigation.goBack()}
        onOpenFamilyPurchases={(memberId, payerFirstName) => navigation.navigate('FamilyPurchases', { memberId, payerFirstName })}
      />
    </SafeScreen>
  )
}

function FamilyPurchasesWrapper({ navigation, route }: any) {
  return (
    <SafeScreen>
      <FamilyHistoryScreen
        onBack={() => navigation.goBack()}
        memberScope={{ memberId: route.params.memberId, payerFirstName: route.params.payerFirstName }}
      />
    </SafeScreen>
  )
}

function ProfileLoginWrapper({ navigation }: any) {
  return (
    <SafeScreen>
      <LoginScreen
        onLoginSuccess={() => navigation.goBack()}
        onNavigateToRegister={() => navigation.replace('ProfileRegister')}
        onNavigateToForgotPassword={() => navigation.navigate('ProfileForgotPassword')}
      />
    </SafeScreen>
  )
}

function ProfileRegisterWrapper({ navigation }: any) {
  return (
    <SafeScreen>
      <RegisterScreen
        onRegisterSuccess={() => navigation.popToTop()}
        onNavigateToLogin={() => navigation.replace('ProfileLogin')}
      />
    </SafeScreen>
  )
}

function ProfileForgotPasswordWrapper({ navigation }: any) {
  return (
    <SafeScreen>
      <ForgotPasswordScreen
        onGoBack={() => navigation.goBack()}
        onNavigateToLogin={() => navigation.goBack()}
      />
    </SafeScreen>
  )
}

function NotificationsWrapper({ navigation }: any) {
  return (
    <SafeScreen>
      <NotificationsScreen onGoBack={() => navigation.goBack()} />
    </SafeScreen>
  )
}

function MyOrdersWrapper({ navigation }: any) {
  return (
    <SafeScreen>
      <OrderList
        onOpenOrder={orderId => navigation.navigate('OrderTracking', { orderId })}
        onGoToCart={() => navigation.navigate('Panier', { screen: 'CartHome' })}
        onRateReceivedProducts={orderId => navigation.navigate('RateProducts', { orderId })}
        // A received basket names no shop: the flow starts at the courier.
        onRateReceivedCourier={(orderId, supplierId) => navigation.navigate('RateOrder', { orderId, supplierId: supplierId ?? '', hasReview: supplierId === null })}
        onOpenTerroirShipments={() => navigation.navigate('TerroirShipments')}
      />
    </SafeScreen>
  )
}

function TerroirShipmentsWrapper({ navigation }: any) {
  return (
    <SafeScreen>
      <ShipmentsList
        onBack={() => navigation.goBack()}
        onOpenShipment={(shipmentId: string) => navigation.navigate('TerroirShipment', { shipmentId })}
      />
    </SafeScreen>
  )
}

function TerroirShipmentWrapper({ route, navigation }: any) {
  const { enter } = useValiseMode()
  return (
    <SafeScreen>
      <ShipmentScreen
        shipmentId={route.params.shipmentId}
        onBack={() => navigation.goBack()}
        onReorder={(country: string) => {
          enter(country)
          navigation.navigate('Panier', { screen: 'CartHome' })
        }}
      />
    </SafeScreen>
  )
}

function OrderTrackingWrapper({ route, navigation }: any) {
  const { orderId } = route.params
  return (
    <SafeScreen>
      <OrderTracking
        orderId={orderId}
        onOpenChat={supplierId => openChatWithSupplier(navigation, supplierId, undefined, orderId)}
        onOpenCourierChat={(deliveryId, courierName) => openChatWithCourier(navigation, deliveryId, courierName, orderId)}
        onRate={(supplierId, hasReview) => navigation.navigate('RateOrder', { supplierId, orderId, hasReview })}
        onTipCourier={supplierId => navigation.navigate('RateOrder', { supplierId, orderId, hasReview: true, tipOnly: true })}
        onBack={() => navigation.goBack()}
      />
    </SafeScreen>
  )
}

/**
 * The product-review screen, reached from the deferred notification.
 *
 * Separate from `RateOrder` because it happens at another moment: the shop and
 * the courier are judged when the parcel arrives, the product once eaten.
 */
function RateProductsWrapper({ route, navigation }: any) {
  const { orderId } = route.params ?? {}
  return (
    <SafeScreen>
      <RateProductsScreen
        orderId={orderId}
        onDone={() => navigation.goBack()}
        onBack={() => navigation.goBack()}
      />
    </SafeScreen>
  )
}

function RateOrderWrapper({ route, navigation }: any) {
  const { supplierId, orderId, hasReview, tipOnly } = route.params as {
    supplierId: string
    orderId: string
    hasReview: boolean
    tipOnly?: boolean
  }
  return (
    <SafeScreen>
      <RateOrderFlow
        orderId={orderId}
        supplierId={supplierId}
        hasReview={hasReview}
        tipOnly={tipOnly}
        onDone={() => navigation.goBack()}
        onBack={() => navigation.goBack()}
        onOpenWallet={() => navigation.navigate('BuyerWallet')}
      />
    </SafeScreen>
  )
}

/** L'icône du panier, avec son compteur par-dessus l'icône partagée. */
function CartTabIcon({ size, color, focused }: { size: number, color: string, focused?: boolean }) {
  const { getItemCount } = useCart()
  const { itemCount: valiseCount } = useTerroirCart()
  // In Valise mode the tab is « Ma valise »: it counts the valise.
  const { active: valise } = useValiseMode()
  const count = valise ? valiseCount : getItemCount()

  return (
    <View>
      <TabBarIcon Icon={ShoppingBagIcon} size={size} color={color} focused={focused === true} />
      {count > 0 && (
        <View style={badgeStyles.badge}>
          <Text style={badgeStyles.badgeText}>{count > 99 ? '99+' : count}</Text>
        </View>
      )}
    </View>
  )
}

const badgeStyles = StyleSheet.create({
  badge: {
    position: 'absolute',
    top: -6,
    right: -10,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.coral[400],
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    fontFamily: fonts.sansBd,
    fontSize: 10,
    color: colors.neutral[0],
    lineHeight: 12,
  },
})

const TAB_ICONS: Record<string, typeof Home> = {
  Accueil: Home,
  Chat: MessageCircle,
  Panier: ShoppingBagIcon,
  Commandes: ClipboardList,
  Profil: User,
}

const Tab = createBottomTabNavigator()

/**
 * Brings the Chat tab back to the conversation list.
 *
 * Without this, leaving a conversation through another tab keeps it on top of
 * the stack: you land back in it on return, and since `ChatDetail` hides the
 * tab bar, you end up trapped there.
 *
 * `navigate({ screen: 'ChatHome' })` is not enough. In React Navigation 7 a
 * navigation no longer pops back to a screen already in the stack, and nested
 * params are read only once, the tab bar even puts the old ones back right
 * after our listener. So we target the child stack directly through `target`,
 * the only way for an action to travel down: otherwise it bubbles up.
 */
function popTabStackToTop(navigation: any, tabName: string) {
  // Read on press rather than captured when the listener is created: the route
  // frozen in the closure would carry the state from before the screen was
  // opened.
  const state = navigation.getState().routes.find((r: { name: string }) => r.name === tabName)?.state
  // `key` is missing until the stack has mounted; an `index` of 0 means we are
  // already at its root. Nothing to pop in either case.
  if (!state?.key || !state.index) {
    return
  }
  navigation.dispatch({ ...StackActions.popToTop(), target: state.key })
}

/**
 * Where the buyer is (tab and screen), outside React state.
 *
 * Only the live-order notice needs it; subscribing that one component keeps
 * a navigation from re-rendering everything mounted beside the navigator.
 */
function createPlaceStore() {
  let place = { tab: '', screen: '' }
  const listeners = new Set<() => void>()
  return {
    get: () => place,
    set: (next: { tab: string, screen: string }) => {
      if (next.tab === place.tab && next.screen === place.screen) {
        return
      }
      place = next
      listeners.forEach(listener => listener())
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

const buyerPlace = createPlaceStore()

/** Screens where the basket bar floats in the same spot: it wins while the basket has items. */
const CART_BAR_ROUTES = new Set(['SupplierProfile', 'ProductDetail'])

/**
 * The order-in-progress card, out of the way on the orders tab (it shows the
 * order already), on screens without a tab bar, and under the basket bar.
 */
function LiveOrderFabHost() {
  const place = React.useSyncExternalStore(buyerPlace.subscribe, buyerPlace.get)
  const insets = useSafeAreaInsets()
  const hasBasket = useCart().getItemCount() > 0
  // In Valise mode the product page has its own footer in that spot.
  const { active: valise } = useValiseMode()
  return (
    <LiveOrderFab
      hidden={place.tab === 'Commandes'
        || HIDE_TAB_BAR_ROUTES.has(place.screen)
        || (valise && place.screen === 'ProductDetail')
        || (!valise && hasBasket && CART_BAR_ROUTES.has(place.screen))}
      // Same figure as the tab bar's own height below.
      bottomOffset={64 + insets.bottom}
      onOpen={orderId => navigationRef.navigate('Commandes', { screen: 'OrderTracking', initial: false, params: { orderId } })}
    />
  )
}

const HIDE_TAB_BAR_ROUTES = new Set([
  'Assistant',
  'LocationPicker',
  'Checkout',
  'OrderSuccess',
  'Login',
  'Register',
  'ForgotPassword',
  'SupplierRegistration',
  'EditProfile',
  'ChatDetail',
])

/**
 * The order in progress, held above the navigation so the notice and the
 * tab's dot read the same poll.
 */
export function AppNavigation() {
  return (
    <LiveOrderProvider>
      <BuyerTabs />
    </LiveOrderProvider>
  )
}

function BuyerTabs() {
  const { semantic } = useTheme()
  const { active: valise } = useValiseMode()
  const insets = useSafeAreaInsets()
  useNotifications()
  usePendingReferralClaim()
  // Un panier non vide : la première intention visible, et le moment où la
  // question « on vous prévient ? » veut dire quelque chose.
  const hasBasket = useCart().getItemCount() > 0
  // The acheteur had no sign a message was waiting: the badge existed in the
  // supplier app only. It refreshes on every socket message, so it appears
  // the moment the message does.
  const { count: chatUnread } = useChatUnreadCount()
  // An order that is moving: the notice says it on arrival, the tab's dot
  // reminds afterwards without taking any room.
  const { order: liveOrder } = useLiveOrder()
  // Where the buyer is, read on every state change: the notice is mounted
  // outside the navigator, so it cannot read the route through a hook. Kept in
  // a store rather than in this component's state: a state here re-rendered
  // the whole tab bar and its overlays at the start of every push and pop.
  const handleStateChange = React.useCallback(() => {
    const state = navigationRef.getRootState()
    const tab = state?.routes?.[state.index ?? 0]?.name ?? ''
    const screen = navigationRef.getCurrentRoute()?.name ?? ''
    buyerPlace.set({ tab, screen })
  }, [])

  const baseTabBarStyle = {
    height: 64 + insets.bottom,
    paddingBottom: 10 + insets.bottom,
    paddingTop: 4,
    backgroundColor: semantic.bgCard,
    borderTopWidth: 0,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    position: 'absolute' as const,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 10,
  }

  return (
    <NavigationContainer
      ref={navigationRef}
      // The first reading happens on open: `onStateChange` only fires on a
      // change, so the notice would stay blind until the first tab tap.
      onReady={handleStateChange}
      onStateChange={handleStateChange}
      linking={{
        prefixes: ['ebio-mobile://', 'https://e-bio.org'],
        config: {
          screens: {
            Accueil: {
              screens: {
                // Shared profile links: ebio-mobile://boutique/:supplierId
                // and https://e-bio.org/boutique/:supplierId
                SupplierProfile: 'boutique/:supplierId',
                // Shared product links: the wrapper fills in the product and
                // its shop from the id alone.
                ProductDetail: 'produit/:productId',
              },
            },
            Profil: {
              screens: {
                // Shared referral links: the code is kept until an account
                // exists, then claimed (see usePendingReferralClaim).
                Referral: 'parrainage/:code',
              },
            },
          },
        },
      }}
    >
      <Tab.Navigator
        screenOptions={({ route }) => {
          const focused = getFocusedRouteNameFromRoute(route)
          const shouldHide = focused ? HIDE_TAB_BAR_ROUTES.has(focused) : false
          return {
            headerShown: false,
            // A tab out of sight stops rendering until it comes back.
            freezeOnBlur: true,
            tabBarActiveTintColor: colors.green[400],
            tabBarInactiveTintColor: colors.neutral[400],
            tabBarHideOnKeyboard: true,
            tabBarStyle: shouldHide ? { display: 'none' } : baseTabBarStyle,
            // La marque qui voyage, dessinée derrière la barre : ses coins,
            // son ombre, ses pastilles et ses marges restent intacts.
            tabBarBackground: () => <TabFocusIndicator />,
            tabBarIcon: ({ color, size, focused: isFocused }) => {
              if (route.name === 'Panier') {
                return <CartTabIcon size={size ?? 22} color={color} focused={isFocused} />
              }
              const Icon = TAB_ICONS[route.name]
              return <TabBarIcon Icon={Icon} size={size ?? 22} color={color} focused={isFocused} />
            },
            tabBarLabelStyle: {
              fontFamily: fonts.sansMd,
              fontSize: 11,
            },
          }
        }}
      >
        <Tab.Screen
          name="Accueil"
          component={SearchStackScreen}
          listeners={({ navigation }) => ({
            tabPress: () => popTabStackToTop(navigation, 'Accueil'),
          })}
        />
        <Tab.Screen
          name="Chat"
          component={ChatStackScreen}
          options={chatUnread > 0
            ? {
                tabBarBadge: chatUnread > 99 ? '99+' : chatUnread,
                tabBarBadgeStyle: { backgroundColor: colors.coral[400], fontFamily: fonts.sansMd, fontSize: 10 },
              }
            : {}}
          listeners={({ navigation }) => ({
            tabPress: () => popTabStackToTop(navigation, 'Chat'),
          })}
        />
        <Tab.Screen
          name="Panier"
          component={CartStackScreen}
          options={{ tabBarLabel: valise ? 'Ma valise' : 'Panier' }}
          listeners={({ navigation }) => ({
            tabPress: () => popTabStackToTop(navigation, 'Panier'),
          })}
        />
        <Tab.Screen
          name="Commandes"
          component={OrdersStackScreen}
          // A dot, not a number: it counts nothing, it says something is
          // moving. It is what remains once the notice has gone.
          options={liveOrder
            ? {
                tabBarBadge: '',
                tabBarBadgeStyle: {
                  backgroundColor: colors.green[400],
                  minWidth: 10,
                  maxHeight: 10,
                  borderRadius: 5,
                  transform: [{ translateX: -2 }],
                },
              }
            : {}}
          listeners={({ navigation }) => ({
            tabPress: () => popTabStackToTop(navigation, 'Commandes'),
          })}
        />
        <Tab.Screen
          name="Profil"
          component={ProfileStackScreen}
          listeners={({ navigation }) => ({
            tabPress: () => popTabStackToTop(navigation, 'Profil'),
          })}
        />
      </Tab.Navigator>

      {/* The announcement of the day, mounted above the navigator so it
        * survives a tab change, closing it is a gesture, not a side effect. */}
      {/* Le réseau tombe souvent : l'acheteur doit l'apprendre du bandeau,
        * pas d'une liste qui ne se remplit jamais. Monté au-dessus du
        * navigateur, donc visible quel que soit l'onglet. */}
      <ConnectivityBanner />

      {/* Where the order has got to, kept above the tabs while it moves.
        * Out of the way on the orders tab (the screen says it already) and on
        * the screens without a tab bar: a checkout or a conversation is no
        * place for it. */}
      <LiveOrderFabHost />

      <BuyerAnnouncement />

      {/* On demande à partir du premier panier : la personne a montré son
        * intention, la question a du sens, et elle n'a pas eu besoin de
        * commander, ceux qui ne l'ont jamais fait sont justement ceux qu'on
        * veut pouvoir rappeler. */}
      <PushConsentSheet when={hasBasket} />
    </NavigationContainer>
  )
}

/**
 * The announcement on opening, and what it points at.
 *
 * Whatever it targets opens in the home stack: a shop, a product, or an
 * external link that leaves the app.
 */
function BuyerAnnouncement() {
  const { announcement, dismiss, markSeen } = useAnnouncement(canShowAnnouncement)

  const open = (item: Announcement): void => {
    dismiss()
    if (item.targetId === null) {
      return
    }

    if (item.targetType === 'SUPPLIER') {
      navigationRef.navigate('Accueil', { screen: 'SupplierProfile', initial: false, params: { supplierId: item.targetId } })
    }
    else if (item.targetType === 'PRODUCT') {
      navigationRef.navigate('Accueil', { screen: 'ProductDetail', initial: false, params: { productId: item.targetId } })
    }
    else if (item.targetType === 'URL') {
      void Linking.openURL(item.targetId)
    }
  }

  return <AnnouncementModal announcement={announcement} onDismiss={dismiss} onShown={markSeen} onOpenTarget={open} />
}

/**
 * Screens where someone is in the middle of something. Login and Register are
 * left out on purpose: signing in is one of the moments an announcement is
 * asked for.
 */
const NO_ANNOUNCEMENT_ROUTES = new Set(['Assistant', 'LocationPicker', 'Checkout', 'OrderSuccess', 'ChatDetail'])

function canShowAnnouncement(): boolean {
  return !NO_ANNOUNCEMENT_ROUTES.has(buyerPlace.get().screen)
}

// eslint-disable-next-line ts/ban-ts-comment
// @ts-nocheck — React Navigation types incompatible with React 19 types (upstream issue)
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
import { ActivityIndicator, Animated, Platform, StatusBar, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ChangePasswordScreen } from '../features/auth/components/change-password-screen'
import { ForgotPasswordScreen } from '../features/auth/components/forgot-password-screen'
import { LoginScreen } from '../features/auth/components/login-screen'
import { RegisterScreen } from '../features/auth/components/register-screen'
import { SupplierRegistration } from '../features/auth/components/supplier-registration'
import { useCart } from '../features/cart/cart-context'
import { CartCtaBar } from '../features/cart/components/cart-cta-bar'
import { CartScreen } from '../features/cart/components/cart-screen'
import { CheckoutFlow } from '../features/cart/components/checkout-flow'
import { ProductDetailScreen } from '../features/catalog/components/product-detail-screen'
import { toDetailProduct, toDetailSupplier } from '../features/catalog/product-detail-mapping'
import { ChatDetailScreen } from '../features/chat/components/chat-detail-screen'
import { ConversationList } from '../features/chat/components/conversation-list'
import { openDeliveryConversation } from '../features/chat/delivery-chat'
import { useChatUnreadCount } from '../features/chat/hooks/use-chat-unread-count'
import { openSupportConversation } from '../features/chat/support-chat'
import { appAlert } from '../features/common/components/app-alert'
import { ScreenHeader } from '../features/common/components/screen-header'
import { useLocation } from '../features/common/location-context'
import { HomeScreen } from '../features/home/components/home-screen'
import { LocationPickerScreen } from '../features/map/components/location-picker-screen'
import { NotificationsScreen } from '../features/notifications/components/notifications-screen'
import { useNotifications } from '../features/notifications/hooks/use-notifications'
import { OrderConfirmation } from '../features/orders/components/order-confirmation'
import { OrderList } from '../features/orders/components/order-list'
import { OrderTracking } from '../features/orders/components/order-tracking'
import { EditProfileScreen } from '../features/profile/components/edit-profile-screen'
import { HelpCenterScreen } from '../features/profile/components/help-center-screen'
import { LegalScreen } from '../features/profile/components/legal-screen'
import { ProfileScreen } from '../features/profile/components/profile-screen'
import { RateOrderFlow } from '../features/ratings/components/rate-order-flow'
import { ReviewsList } from '../features/ratings/components/reviews-list'
import { SearchScreen } from '../features/search/components/search-screen'
import { SupplierProfileScreen } from '../features/supplier-profile/components/supplier-profile-screen'
import { WalletScreen } from '../features/wallet/components/wallet-screen'
import { useSession } from '../lib/auth-client'
import { colors, fonts } from '../theme/theme'
import { useTheme } from '../theme/theme-context'
import { apiFetch, chatFetch } from '../utils/api-client'
import { navigationRef } from './navigation-ref'

/**
 * The strip every screen sits under, below the status bar.
 *
 * `SafeAreaView` alone trusted the inset the system reports, and some Android
 * devices report less than the status bar they actually draw — the title then
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
    <SearchStack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <SearchStack.Screen name="SearchHome" component={SearchHomeWrapper} />
      <SearchStack.Screen name="SearchResults" component={SearchResultsWrapper} />
      <SearchStack.Screen name="LocationPicker" component={SearchLocationPickerWrapper} />
      <SearchStack.Screen name="SupplierProfile" component={SupplierProfileWrapper} />
      <SearchStack.Screen name="ProductDetail" component={ProductDetailWrapper} />
      <SearchStack.Screen name="ProductReviews" component={ProductReviewsWrapper} />
    </SearchStack.Navigator>
  )
}

function SearchHomeWrapper({ navigation }: any) {
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
        onOpenNotifications={() => navigation.navigate('Profil', { screen: 'Notifications' })}
        onOpenWallet={() => navigation.navigate('Profil', { screen: 'BuyerWallet' })}
        onSeeAll={(preset) => {
          if (preset === 'validated') {
            navigation.navigate('SearchResults', { validatedOnly: true, title: 'Validé eBio' })
          }
          else if (preset === 'promo') {
            navigation.navigate('SearchResults', { promoOnly: true, title: 'En promotion' })
          }
          else {
            navigation.navigate('SearchResults', { title: 'Près de vous' })
          }
        }}
      />
    </View>
  )
}

function SearchResultsWrapper({ route, navigation }: any) {
  const params = route.params ?? {}
  return (
    <SafeScreen>
      <SearchScreen
        onGoBack={() => navigation.goBack()}
        onNavigateToSupplier={(id: string) => navigation.navigate('SupplierProfile', { supplierId: id })}
        onNavigateToProduct={(id: string) => navigation.navigate('ProductDetail', { productId: id })}
        initialQuery={params.query}
        initialCategory={params.category}
        initialValidatedOnly={params.validatedOnly}
        initialPromoOnly={params.promoOnly}
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
          setManualLocation(coords)
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
    if (res.ok) {
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
  }
  catch {
    // ignore
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
  return (
    <View style={{ flex: 1 }}>
      <SupplierProfileScreen
        supplierId={supplierId}
        onNavigateToChat={id => openChatWithSupplier(navigation, id)}
        onNavigateToProduct={(productId, product, supplierInfo) => {
          navigation.navigate('ProductDetail', { product, supplier: supplierInfo })
        }}
        onGoBack={() => navigation.goBack()}
      />
      <CartCtaBar onPress={() => navigation.navigate('Panier')} />
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

function ProductDetailWrapper({ route, navigation }: any) {
  const { productId } = route.params ?? {}
  const [loaded, setLoaded] = React.useState<{
    product: ProductDetailProduct
    supplier: ProductDetailSupplier | null
  } | null>(null)

  // A banner only carries an id: we fill in the product and its
  // supplier ourselves, which the screen expects as objects.
  React.useEffect(() => {
    if (!productId)
      return
    let cancelled = false
    async function load() {
      try {
        const productRes = await apiFetch(`/api/products/${productId}`)
        if (!productRes.ok)
          return
        const rawProduct = await productRes.json() as ApiProductDetail
        const supplierRes = await apiFetch(`/api/suppliers/${rawProduct.supplierId}`)
        const rawSupplier = supplierRes.ok ? await supplierRes.json() as ApiSupplierDetail : null
        if (!cancelled) {
          setLoaded({
            product: toDetailProduct(rawProduct),
            supplier: rawSupplier && toDetailSupplier(rawSupplier),
          })
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
  }, [productId])

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
        onGoBack={() => navigation.goBack()}
        onNavigateToSupplier={id => navigation.navigate('SupplierProfile', { supplierId: id })}
        onOpenProduct={id => navigation.push('ProductDetail', { productId: id })}
        onSeeAllReviews={id => navigation.navigate('ProductReviews', { productId: id, productName: product.name })}
      />
      <CartCtaBar onPress={() => navigation.navigate('Panier')} />
    </View>
  )
}

const ChatStack = createNativeStackNavigator()
function ChatStackScreen() {
  const { data: session } = useSession()
  const currentUserId = session?.user?.id ?? ''
  return (
    <ChatStack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
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
        {({ route, navigation }) => (
          <SafeScreen>
            <ChatDetailScreen
              conversationId={route.params.conversationId}
              currentUserId={currentUserId}
              peerName={route.params.peerName}
              isSupplier={route.params.isSupplier}
              orderId={route.params.orderId}
              kind={route.params.kind ?? 'SUPPLIER'}
              onGoBack={() => navigation.goBack()}
              onOpenOrder={(oid) => {
                navigation.navigate('Commandes', { screen: 'OrderTracking', params: { orderId: oid } })
              }}
            />
          </SafeScreen>
        )}
      </ChatStack.Screen>
    </ChatStack.Navigator>
  )
}

const CartStack = createNativeStackNavigator()
function CartStackScreen() {
  return (
    <CartStack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <CartStack.Screen name="CartHome" component={CartHomeWrapper} />
      <CartStack.Screen name="Login" component={LoginWrapper} />
      <CartStack.Screen name="Register" component={RegisterWrapper} />
      <CartStack.Screen name="ForgotPassword" component={ForgotPasswordWrapper} />
      <CartStack.Screen name="Checkout" component={CheckoutWrapper} />
      <CartStack.Screen name="OrderSuccess" component={OrderSuccessWrapper} />
    </CartStack.Navigator>
  )
}

function CartHomeWrapper({ navigation }: any) {
  const { items, groups, deliveryMode, updateQuantity, removeItem, setDeliveryMode } = useCart()
  const { data: session } = useSession()
  const mappedItems = items.map(item => ({
    ...item,
    selectedVariant: null,
    availableVariants: [],
  }))

  function handleCheckout() {
    if (items.length === 0)
      return

    // The summary is the cart's, every shop together. Each line
    // carries its shop for display; splitting into orders is the
    // server's business.
    const orderSummary = {
      shopNames: groups.map(g => g.supplierName),
      items: items.map(i => ({
        productId: i.productId,
        supplierId: i.supplierId,
        supplierName: i.supplierName,
        name: i.name,
        quantity: i.quantity,
        pricePerUnit: i.pricePerUnit,
        unit: i.unit,
      })),
      deliveryMode,
      total: items.reduce((s, i) => s + i.pricePerUnit * i.quantity, 0),
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
        deliveryMode={deliveryMode}
        onUpdateQuantity={updateQuantity}
        onSelectVariant={() => {}}
        onChangeDeliveryMode={setDeliveryMode}
        onCheckout={handleCheckout}
        onRemoveItem={removeItem}
        onPressItem={productId => navigation.navigate('Accueil', { screen: 'ProductDetail', params: { productId } })}
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
  const { clearSupplierCart } = useCart()
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
          clearSupplierCart(orderSummary.supplierId)
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
        onTrackOrder={() => {
          navigation.popToTop()
          navigation.navigate('Commandes', {
            screen: 'OrderTracking',
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
    <OrdersStack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <OrdersStack.Screen name="MyOrders" component={MyOrdersWrapper} />
      <OrdersStack.Screen name="OrderTracking" component={OrderTrackingWrapper} />
      <OrdersStack.Screen name="RateOrder" component={RateOrderWrapper} />
    </OrdersStack.Navigator>
  )
}

const ProfileStack = createNativeStackNavigator()
function ProfileStackScreen() {
  return (
    <ProfileStack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <ProfileStack.Screen name="ProfileHome" component={ProfileHomeWrapper} />
      <ProfileStack.Screen name="EditProfile" component={EditProfileWrapper} />
      <ProfileStack.Screen name="ChangePassword" component={ChangePasswordWrapper} />
      <ProfileStack.Screen name="HelpCenter" component={HelpCenterWrapper} />
      <ProfileStack.Screen name="Terms" component={TermsWrapper} />
      <ProfileStack.Screen name="BuyerWallet" component={BuyerWalletWrapper} />
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
      <WalletScreen onGoBack={() => navigation.goBack()} />
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
      <OrderList onOpenOrder={orderId => navigation.navigate('OrderTracking', { orderId })} />
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
        onOpenWallet={() => navigation.navigate('Profil', { screen: 'BuyerWallet' })}
      />
    </SafeScreen>
  )
}

function AnimatedTabIcon({ Icon, size, color, focused }: { Icon: typeof Home, size: number, color: string, focused: boolean }) {
  const scale = React.useRef(new Animated.Value(1)).current

  React.useEffect(() => {
    if (focused) {
      Animated.sequence([
        Animated.spring(scale, { toValue: 1.25, useNativeDriver: true, speed: 50, bounciness: 12 }),
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 30, bounciness: 8 }),
      ]).start()
    }
  }, [focused, scale])

  return (
    <View style={tabIconStyles.wrapper}>
      <Animated.View style={{ transform: [{ scale }] }}>
        <Icon size={size} color={color} strokeWidth={focused ? 2.5 : 1.8} />
      </Animated.View>
      {focused && <View style={tabIconStyles.dot} />}
    </View>
  )
}

function CartTabIcon({ size, color, focused }: { size: number, color: string, focused?: boolean }) {
  const { getItemCount } = useCart()
  const count = getItemCount()
  const scale = React.useRef(new Animated.Value(1)).current

  React.useEffect(() => {
    if (focused) {
      Animated.sequence([
        Animated.spring(scale, { toValue: 1.25, useNativeDriver: true, speed: 50, bounciness: 12 }),
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 30, bounciness: 8 }),
      ]).start()
    }
  }, [focused, scale])

  return (
    <View style={tabIconStyles.wrapper}>
      <Animated.View style={{ transform: [{ scale }] }}>
        <ShoppingBagIcon size={size} color={color} strokeWidth={focused ? 2.5 : 1.8} />
      </Animated.View>
      {count > 0 && (
        <View style={badgeStyles.badge}>
          <Text style={badgeStyles.badgeText}>{count > 99 ? '99+' : count}</Text>
        </View>
      )}
      {focused && <View style={tabIconStyles.dot} />}
    </View>
  )
}

const tabIconStyles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.green[400],
    marginTop: 3,
  },
})

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
 * params are read only once — the tab bar even puts the old ones back right
 * after our listener. So we target the child stack directly through `target`,
 * the only way for an action to travel down: otherwise it bubbles up.
 */
function popChatStackToTop(navigation) {
  // Read on press rather than captured when the listener is created: the route
  // frozen in the closure would carry the state from before the conversation
  // was opened.
  const state = navigation.getState().routes.find(r => r.name === 'Chat')?.state
  // `key` is missing until the stack has mounted; an `index` of 0 means we are
  // already on the list. Nothing to pop in either case.
  if (!state?.key || !state.index) {
    return
  }
  navigation.dispatch({ ...StackActions.popToTop(), target: state.key })
}

const HIDE_TAB_BAR_ROUTES = new Set([
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

export function AppNavigation() {
  const { semantic } = useTheme()
  const insets = useSafeAreaInsets()
  useNotifications()
  // The acheteur had no sign a message was waiting: the badge existed in the
  // supplier app only. It refreshes on every socket message, so it appears
  // the moment the message does.
  const { count: chatUnread } = useChatUnreadCount()

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
            tabBarActiveTintColor: colors.green[400],
            tabBarInactiveTintColor: colors.neutral[400],
            tabBarHideOnKeyboard: true,
            tabBarStyle: shouldHide ? { display: 'none' } : baseTabBarStyle,
            tabBarIcon: ({ color, size, focused: isFocused }) => {
              if (route.name === 'Panier') {
                return <CartTabIcon size={size ?? 22} color={color} focused={isFocused} />
              }
              const Icon = TAB_ICONS[route.name]
              return <AnimatedTabIcon Icon={Icon} size={size ?? 22} color={color} focused={isFocused} />
            },
            tabBarLabelStyle: {
              fontFamily: fonts.sansMd,
              fontSize: 11,
            },
          }
        }}
      >
        <Tab.Screen name="Accueil" component={SearchStackScreen} />
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
            tabPress: () => popChatStackToTop(navigation),
          })}
        />
        <Tab.Screen name="Panier" component={CartStackScreen} />
        <Tab.Screen name="Commandes" component={OrdersStackScreen} />
        <Tab.Screen name="Profil" component={ProfileStackScreen} />
      </Tab.Navigator>
    </NavigationContainer>
  )
}

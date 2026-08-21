// eslint-disable-next-line ts/ban-ts-comment
// @ts-nocheck — React Navigation types incompatible with React 19 types (upstream issue)
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { getFocusedRouteNameFromRoute, NavigationContainer, StackActions } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import ClipboardList from 'lucide-react-native/dist/esm/icons/clipboard-list'
import Home from 'lucide-react-native/dist/esm/icons/house'
import MessageCircle from 'lucide-react-native/dist/esm/icons/message-circle'
import ShoppingBagIcon from 'lucide-react-native/dist/esm/icons/shopping-bag'
import User from 'lucide-react-native/dist/esm/icons/user'
import * as React from 'react'
import { ActivityIndicator, Animated, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ForgotPasswordScreen } from '../features/auth/components/forgot-password-screen'
import { LoginScreen } from '../features/auth/components/login-screen'
import { RegisterScreen } from '../features/auth/components/register-screen'
import { SupplierRegistration } from '../features/auth/components/supplier-registration'
import { useCart } from '../features/cart/cart-context'
import { CartScreen } from '../features/cart/components/cart-screen'
import { CheckoutFlow } from '../features/cart/components/checkout-flow'
import { ProductDetailScreen } from '../features/catalog/components/product-detail-screen'
import { ChatDetailScreen } from '../features/chat/components/chat-detail-screen'
import { ConversationList } from '../features/chat/components/conversation-list'
import { useLocation } from '../features/common/location-context'
import { HomeScreen } from '../features/home/components/home-screen'
import { LocationPickerScreen } from '../features/map/components/location-picker-screen'
import { NotificationsScreen } from '../features/notifications/components/notifications-screen'
import { useNotifications } from '../features/notifications/hooks/use-notifications'
import { OrderConfirmation } from '../features/orders/components/order-confirmation'
import { OrderList } from '../features/orders/components/order-list'
import { OrderTracking } from '../features/orders/components/order-tracking'
import { EditProfileScreen } from '../features/profile/components/edit-profile-screen'
import { ProfileScreen } from '../features/profile/components/profile-screen'
import { SearchScreen } from '../features/search/components/search-screen'
import { DashboardScreen } from '../features/supplier-dashboard/components/dashboard-screen'
import { DeliveryZoneEditor } from '../features/supplier-dashboard/components/delivery-zone-editor'
import { ModeSelector } from '../features/supplier-dashboard/components/mode-selector'
import { OpeningHoursEditor } from '../features/supplier-dashboard/components/opening-hours-editor'
import { OrderDetailScreen } from '../features/supplier-dashboard/components/order-detail-screen'
import { OrderManagement } from '../features/supplier-dashboard/components/order-management'
import { ProductDetailScreen as SupplierProductDetail } from '../features/supplier-dashboard/components/product-detail-screen'
import { ProductForm } from '../features/supplier-dashboard/components/product-form'
import { ProductList } from '../features/supplier-dashboard/components/product-list'
import { SalesPointsScreen } from '../features/supplier-dashboard/components/sales-points-screen'
import { ShopProfileEditor } from '../features/supplier-dashboard/components/shop-profile-editor'
import { SupplierReviewsScreen } from '../features/supplier-dashboard/components/supplier-reviews-screen'
import { SupplierSettingsScreen } from '../features/supplier-dashboard/components/supplier-settings-screen'
import { SupplierWalletScreen } from '../features/supplier-dashboard/components/supplier-wallet-screen'
import { SupplierProfileScreen } from '../features/supplier-profile/components/supplier-profile-screen'
import { WalletScreen } from '../features/wallet/components/wallet-screen'
import { useSession } from '../lib/auth-client'
import { colors, fonts } from '../theme/theme'
import { useTheme } from '../theme/theme-context'
import { apiFetch, chatFetch } from '../utils/api-client'
import { navigationRef } from './navigation-ref'

function SafeScreen({ children }: { children: React.ReactNode }) {
  const { semantic } = useTheme()
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.bgPage }} edges={['top']}>
      {children}
    </SafeAreaView>
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
    </SearchStack.Navigator>
  )
}

function SearchHomeWrapper({ navigation }: any) {
  return (
    <SafeScreen>
      <HomeScreen
        onOpenSearch={() => navigation.navigate('SearchResults', { autoFocus: true })}
        onSelectCategory={(slug: string) => navigation.navigate('SearchResults', { category: slug })}
        onOpenMap={() => navigation.navigate('SearchResults', { viewMode: 'map', title: 'Carte' })}
        onPickLocation={() => navigation.navigate('LocationPicker')}
        onNavigateToSupplier={(id: string) => navigation.navigate('SupplierProfile', { supplierId: id })}
        onNavigateToProduct={(id: string) => navigation.navigate('ProductDetail', { productId: id })}
        onOpenNotifications={() => navigation.navigate('Profil', { screen: 'Notifications' })}
        onOpenProfile={() => navigation.navigate('Profil', { screen: 'ProfileHome' })}
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
    </SafeScreen>
  )
}

function SearchResultsWrapper({ route, navigation }: any) {
  const params = route.params ?? {}
  return (
    <SafeScreen>
      <SearchScreen
        onGoBack={() => navigation.goBack()}
        onNavigateToSupplier={(id: string) => navigation.navigate('SupplierProfile', { supplierId: id })}
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
        params: {
          conversationId: conv.id,
          peerName: peerName ?? conv.supplierShopName,
          isSupplier: false,
          orderId: conv.orderId ?? orderId ?? null,
        },
      })
    }
  }
  catch {
    // ignore
  }
}

function SupplierProfileWrapper({ route, navigation }: any) {
  const { supplierId } = route.params
  return (
    <SupplierProfileScreen
      supplierId={supplierId}
      onNavigateToChat={id => openChatWithSupplier(navigation, id)}
      onNavigateToProduct={(productId, product, supplierInfo) => {
        navigation.navigate('ProductDetail', { product, supplier: supplierInfo })
      }}
      onGoBack={() => navigation.goBack()}
    />
  )
}

function ProductDetailWrapper({ route, navigation }: any) {
  const { productId } = route.params ?? {}
  const [loaded, setLoaded] = React.useState<{ product: any, supplier: any } | null>(null)
  const { addItem } = useCart()

  // Une bannière ne transporte qu'un identifiant : on complète nous-mêmes le
  // produit et son fournisseur, que l'écran attend en objets.
  React.useEffect(() => {
    if (!productId)
      return
    let cancelled = false
    async function load() {
      try {
        const productRes = await apiFetch(`/api/products/${productId}`)
        if (!productRes.ok)
          return
        const p = await productRes.json()
        const supplierRes = await apiFetch(`/api/suppliers/${p.supplierId}`)
        const s = supplierRes.ok ? await supplierRes.json() : null
        if (!cancelled) {
          setLoaded({
            product: { ...p, imageUrl: p.photos?.[0] ?? null },
            supplier: s,
          })
        }
      }
      catch {
        // L'écran affichera son état vide.
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
    <ProductDetailScreen
      product={product}
      supplier={supplier}
      onGoBack={() => navigation.goBack()}
      onAddToCart={(productId, quantity) => {
        addItem({
          productId,
          supplierId: supplier.id,
          supplierName: supplier.shopName,
          name: product.name,
          imageUrl: product.imageUrl,
          pricePerUnit: product.promotionalPrice ?? product.pricePerUnit,
          unit: product.unit,
          quantity,
        })
        navigation.goBack()
      }}
      onNavigateToSupplier={id => navigation.navigate('SupplierProfile', { supplierId: id })}
    />
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
              onOpenConversation={(conversationId, peerName, isSupplier, orderId) =>
                navigation.navigate('ChatDetail', { conversationId, peerName, isSupplier, orderId })}
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
              onGoBack={() => navigation.goBack()}
              onOpenOrder={(oid) => {
                if (route.params.isSupplier) {
                  navigation.navigate('Profil', { screen: 'SupplierOrderDetail', params: { orderId: oid } })
                }
                else {
                  navigation.navigate('Commandes', { screen: 'OrderTracking', params: { orderId: oid } })
                }
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
  const { groups, updateQuantity, removeItem, changeDeliveryMode } = useCart()
  const { data: session } = useSession()
  const mappedGroups = groups.map(g => ({
    ...g,
    items: g.items.map(item => ({
      ...item,
      selectedVariant: null,
      availableVariants: [],
    })),
  }))

  function handleCheckout(supplierId: string) {
    const group = groups.find(g => g.supplierId === supplierId)
    if (!group)
      return

    const orderSummary = {
      supplierId: group.supplierId,
      supplierName: group.supplierName,
      items: group.items.map(i => ({
        productId: i.productId,
        name: i.name,
        quantity: i.quantity,
        pricePerUnit: i.pricePerUnit,
        unit: i.unit,
      })),
      deliveryMode: group.deliveryMode,
      total: group.items.reduce((s, i) => s + i.pricePerUnit * i.quantity, 0),
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
        groups={mappedGroups}
        onUpdateQuantity={updateQuantity}
        onSelectVariant={() => {}}
        onChangeDeliveryMode={changeDeliveryMode}
        onCheckout={handleCheckout}
        onRemoveItem={removeItem}
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
    </OrdersStack.Navigator>
  )
}

const ProfileStack = createNativeStackNavigator()
function ProfileStackScreen() {
  return (
    <ProfileStack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <ProfileStack.Screen name="ProfileHome" component={ProfileHomeWrapper} />
      <ProfileStack.Screen name="EditProfile" component={EditProfileWrapper} />
      <ProfileStack.Screen name="SupplierDashboard" component={SupplierDashboardWrapper} />
      <ProfileStack.Screen name="SupplierProducts" component={SupplierProductsWrapper} />
      <ProfileStack.Screen name="SupplierProductDetail" component={SupplierProductDetailWrapper} />
      <ProfileStack.Screen name="SupplierProductForm" component={SupplierProductFormWrapper} />
      <ProfileStack.Screen name="SupplierOrders" component={SupplierOrdersWrapper} />
      <ProfileStack.Screen name="SupplierOrderDetail" component={SupplierOrderDetailWrapper} />
      <ProfileStack.Screen name="SupplierSettings" component={SupplierSettingsWrapper} />
      <ProfileStack.Screen name="SupplierShopProfile" component={SupplierShopProfileWrapper} />
      <ProfileStack.Screen name="SupplierReviews" component={SupplierReviewsWrapper} />
      <ProfileStack.Screen name="SupplierOpeningHours" component={SupplierOpeningHoursWrapper} />
      <ProfileStack.Screen name="SupplierSalesPoints" component={SupplierSalesPointsWrapper} />
      <ProfileStack.Screen name="SupplierWallet" component={SupplierWalletWrapper} />
      <ProfileStack.Screen name="BuyerWallet" component={BuyerWalletWrapper} />
      <ProfileStack.Screen name="SupplierDeliveryZones" component={SupplierDeliveryZonesWrapper} />
      <ProfileStack.Screen name="SupplierMode" component={SupplierModeWrapper} />
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
        onNavigateToSupplierRegistration={() => navigation.navigate('SupplierRegistration')}
        onNavigateToDashboard={() => navigation.navigate('SupplierDashboard')}
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

function SupplierDashboardWrapper({ navigation }: any) {
  return (
    <SafeScreen>
      <DashboardScreen
        onGoBack={() => navigation.goBack()}
        onNavigateToProducts={() => navigation.navigate('SupplierProducts')}
        onNavigateToOrders={() => navigation.navigate('SupplierOrders')}
        onNavigateToSettings={() => navigation.navigate('SupplierSettings')}
        onNavigateToReviews={() => navigation.navigate('SupplierReviews')}
        onNavigateToWallet={() => navigation.navigate('SupplierWallet')}
        onSwitchToBuyer={() => navigation.popToTop()}
      />
    </SafeScreen>
  )
}

function SupplierReviewsWrapper({ navigation }: any) {
  return (
    <SafeScreen>
      <SupplierReviewsScreen onGoBack={() => navigation.goBack()} />
    </SafeScreen>
  )
}

function SupplierProductsWrapper({ navigation }: any) {
  const [refreshKey, setRefreshKey] = React.useState(0)

  React.useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      setRefreshKey(k => k + 1)
    })
    return unsubscribe
  }, [navigation])

  return (
    <SafeScreen>
      <ProductList
        key={refreshKey}
        onAddProduct={() => navigation.navigate('SupplierProductForm')}
        onEditProduct={productId => navigation.navigate('SupplierProductDetail', { productId })}
        onGoBack={() => navigation.goBack()}
      />
    </SafeScreen>
  )
}

function SupplierProductDetailWrapper({ route, navigation }: any) {
  const { productId } = route.params
  return (
    <SafeScreen>
      <SupplierProductDetail
        productId={productId}
        onGoBack={() => navigation.goBack()}
        onEdit={id => navigation.navigate('SupplierProductForm', { productId: id })}
        onDeleted={() => navigation.navigate('SupplierProducts')}
      />
    </SafeScreen>
  )
}

function SupplierProductFormWrapper({ route, navigation }: any) {
  const { productId } = route.params ?? {}
  const [initialData, setInitialData] = React.useState(undefined)
  const [loading, setLoading] = React.useState(Boolean(productId))

  React.useEffect(() => {
    if (!productId)
      return
    let cancelled = false
    apiFetch(`/api/products/${productId}`)
      .then(res => res.json())
      .then((p) => {
        if (cancelled || !p)
          return
        setInitialData({
          id: p.id,
          name: p.name ?? '',
          description: p.description ?? '',
          category: p.categoryId ?? '',
          price: p.pricePerUnit != null ? String(p.pricePerUnit) : '',
          unit: p.unit ?? 'KG',
          stock: p.stock != null ? String(p.stock) : '',
          alertThreshold: p.stockAlertThreshold != null ? String(p.stockAlertThreshold) : '',
          photos: p.photos ?? [],
          variants: (p.variants ?? []).map((v: any) => ({
            id: v.id,
            label: v.label,
            price: String(v.pricePerUnit),
            stock: String(v.stock),
          })),
          isActive: p.status !== 'HIDDEN',
          voiceDescriptionUri: p.voiceDescriptionUrl ?? null,
          promotionalPrice: p.promotionalPrice ?? null,
        })
        setLoading(false)
      })
      .catch(() => setLoading(false))
    return () => {
      cancelled = true
    }
  }, [productId])

  if (loading) {
    return (
      <SafeScreen>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={colors.green[400]} />
        </View>
      </SafeScreen>
    )
  }

  return (
    <SafeScreen>
      <ProductForm
        initialData={initialData}
        onSave={() => {
          if (productId) {
            navigation.navigate('SupplierProductDetail', { productId })
          }
          else {
            navigation.goBack()
          }
        }}
        onCancel={() => navigation.goBack()}
      />
    </SafeScreen>
  )
}

function SupplierOrdersWrapper({ navigation }: any) {
  return (
    <SafeScreen>
      <OrderManagement
        supplierId="me"
        onOpenOrder={id => navigation.navigate('SupplierOrderDetail', { orderId: id })}
        onGoBack={() => navigation.goBack()}
      />
    </SafeScreen>
  )
}

function SupplierOrderDetailWrapper({ route, navigation }: any) {
  return (
    <SafeScreen>
      <OrderDetailScreen
        orderId={route.params.orderId}
        onGoBack={() => navigation.goBack()}
      />
    </SafeScreen>
  )
}

function SupplierSettingsWrapper({ navigation }: any) {
  return (
    <SafeScreen>
      <SupplierSettingsScreen
        onGoBack={() => navigation.goBack()}
        onNavigateToShopProfile={() => navigation.navigate('SupplierShopProfile')}
        onNavigateToOpeningHours={() => navigation.navigate('SupplierOpeningHours')}
        onNavigateToSalesPoints={() => navigation.navigate('SupplierSalesPoints')}
        onNavigateToDeliveryZones={() => navigation.navigate('SupplierDeliveryZones')}
        onNavigateToMode={() => navigation.navigate('SupplierMode')}
      />
    </SafeScreen>
  )
}

function SupplierShopProfileWrapper({ navigation }: any) {
  return (
    <SafeScreen>
      <ShopProfileEditor
        onGoBack={() => navigation.goBack()}
        onSaved={() => navigation.goBack()}
      />
    </SafeScreen>
  )
}

function SupplierSalesPointsWrapper({ navigation }: any) {
  return (
    <SafeScreen>
      <SalesPointsScreen onGoBack={() => navigation.goBack()} />
    </SafeScreen>
  )
}

function SupplierWalletWrapper({ navigation }: any) {
  return (
    <SafeScreen>
      <SupplierWalletScreen onGoBack={() => navigation.goBack()} />
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

function SupplierOpeningHoursWrapper({ navigation }: any) {
  return (
    <SafeScreen>
      <OpeningHoursEditor onSave={() => navigation.goBack()} onGoBack={() => navigation.goBack()} />
    </SafeScreen>
  )
}

function SupplierDeliveryZonesWrapper({ navigation }: any) {
  return (
    <SafeScreen>
      <DeliveryZoneEditor onSave={() => navigation.goBack()} onGoBack={() => navigation.goBack()} />
    </SafeScreen>
  )
}

function SupplierModeWrapper({ navigation }: any) {
  return (
    <SafeScreen>
      <ModeSelector onModeChanged={() => navigation.goBack()} onGoBack={() => navigation.goBack()} />
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
        onBack={() => navigation.goBack()}
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
  useNotifications()

  const baseTabBarStyle = {
    height: 64,
    paddingBottom: 10,
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

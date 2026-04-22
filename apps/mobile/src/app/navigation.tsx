// eslint-disable-next-line ts/ban-ts-comment
// @ts-nocheck — React Navigation types incompatible with React 19 types (upstream issue)
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { getFocusedRouteNameFromRoute, NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import MessageCircle from 'lucide-react-native/dist/esm/icons/message-circle'
import Home from 'lucide-react-native/dist/esm/icons/house'
import ShoppingBagIcon from 'lucide-react-native/dist/esm/icons/shopping-bag'
import User from 'lucide-react-native/dist/esm/icons/user'
import * as React from 'react'
import { Animated, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ConversationList } from '../features/chat/components/conversation-list'
import { SupplierRegistration } from '../features/auth/components/supplier-registration'
import { EditProfileScreen } from '../features/profile/components/edit-profile-screen'
import { ProfileScreen } from '../features/profile/components/profile-screen'
import { SearchScreen } from '../features/search/components/search-screen'
import { SupplierProfileScreen } from '../features/supplier-profile/components/supplier-profile-screen'
import { ProductDetailScreen } from '../features/catalog/components/product-detail-screen'
import { CartScreen } from '../features/cart/components/cart-screen'
import { CheckoutFlow } from '../features/cart/components/checkout-flow'
import { OrderConfirmation } from '../features/orders/components/order-confirmation'
import { useCart } from '../features/cart/cart-context'
import { OrderList } from '../features/orders/components/order-list'
import { OrderTracking } from '../features/orders/components/order-tracking'
import { DashboardScreen } from '../features/supplier-dashboard/components/dashboard-screen'
import { DeliveryZoneEditor } from '../features/supplier-dashboard/components/delivery-zone-editor'
import { ModeSelector } from '../features/supplier-dashboard/components/mode-selector'
import { OpeningHoursEditor } from '../features/supplier-dashboard/components/opening-hours-editor'
import { OrderManagement } from '../features/supplier-dashboard/components/order-management'
import { ProductForm } from '../features/supplier-dashboard/components/product-form'
import { ProductDetailScreen as SupplierProductDetail } from '../features/supplier-dashboard/components/product-detail-screen'
import { ProductList } from '../features/supplier-dashboard/components/product-list'
import { SupplierSettingsScreen } from '../features/supplier-dashboard/components/supplier-settings-screen'
import { NotificationsScreen } from '../features/notifications/components/notifications-screen'
import { ForgotPasswordScreen } from '../features/auth/components/forgot-password-screen'
import { LoginScreen } from '../features/auth/components/login-screen'
import { RegisterScreen } from '../features/auth/components/register-screen'
import { useSession } from '../lib/auth-client'
import { useNotifications } from '../features/notifications/hooks/use-notifications'
import { navigationRef } from './navigation-ref'
import { colors, fonts } from '../theme/theme'
import { useTheme } from '../theme/theme-context'

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
      <SearchStack.Screen name="SupplierProfile" component={SupplierProfileWrapper} />
      <SearchStack.Screen name="ProductDetail" component={ProductDetailWrapper} />
    </SearchStack.Navigator>
  )
}

function SearchHomeWrapper({ navigation }: any) {
  return (
    <SafeScreen>
      <SearchScreen onNavigateToSupplier={(id: string) => navigation.navigate('SupplierProfile', { supplierId: id })} />
    </SafeScreen>
  )
}

function SupplierProfileWrapper({ route, navigation }: any) {
  const { supplierId } = route.params
  return (
    <SupplierProfileScreen
      supplierId={supplierId}
      onNavigateToChat={(id) => console.log('chat', id)}
      onNavigateToProduct={(productId, product, supplierInfo) => {
        navigation.navigate('ProductDetail', { product, supplier: supplierInfo })
      }}
      onGoBack={() => navigation.goBack()}
    />
  )
}

function ProductDetailWrapper({ route, navigation }: any) {
  const { product, supplier } = route.params
  const { addItem } = useCart()
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
      onNavigateToSupplier={(id) => navigation.navigate('SupplierProfile', { supplierId: id })}
    />
  )
}

const ChatStack = createNativeStackNavigator()
function ChatStackScreen() {
  return (
    <ChatStack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <ChatStack.Screen name="ChatHome">
        {() => <SafeScreen><ConversationList onOpenConversation={(id) => console.log('open chat', id)} /></SafeScreen>}
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
    if (!group) return

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
          navigation.navigate('Profil', {
            screen: 'OrderTracking',
            params: { orderId },
          })
        }}
        onContinueShopping={() => navigation.popToTop()}
      />
    </SafeScreen>
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
      <ProfileStack.Screen name="SupplierSettings" component={SupplierSettingsWrapper} />
      <ProfileStack.Screen name="SupplierOpeningHours" component={SupplierOpeningHoursWrapper} />
      <ProfileStack.Screen name="SupplierDeliveryZones" component={SupplierDeliveryZonesWrapper} />
      <ProfileStack.Screen name="SupplierMode" component={SupplierModeWrapper} />
      <ProfileStack.Screen name="SupplierRegistration" component={SupplierRegistrationWrapper} />
      <ProfileStack.Screen name="ProfileLogin" component={ProfileLoginWrapper} />
      <ProfileStack.Screen name="ProfileRegister" component={ProfileRegisterWrapper} />
      <ProfileStack.Screen name="ProfileForgotPassword" component={ProfileForgotPasswordWrapper} />
      <ProfileStack.Screen name="Notifications" component={NotificationsWrapper} />
      <ProfileStack.Screen name="MyOrders" component={MyOrdersWrapper} />
      <ProfileStack.Screen name="OrderTracking" component={OrderTrackingWrapper} />
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
        onNavigateToOrders={() => navigation.navigate('MyOrders')}
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
      />
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
        onEditProduct={(productId) => navigation.navigate('SupplierProductDetail', { productId })}
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
        onEdit={(id) => navigation.navigate('SupplierProductForm', { productId: id })}
      />
    </SafeScreen>
  )
}

function SupplierProductFormWrapper({ route, navigation }: any) {
  const { productId } = route.params ?? {}
  return (
    <SafeScreen>
      <ProductForm
        initialData={productId ? { id: productId } as any : undefined}
        onSave={() => {
          if (productId) {
            navigation.navigate('SupplierProductDetail', { productId })
          } else {
            navigation.goBack()
          }
        }}
        onCancel={() => navigation.goBack()}
      />
    </SafeScreen>
  )
}

function SupplierOrdersWrapper() {
  return (
    <SafeScreen>
      <OrderManagement supplierId="me" />
    </SafeScreen>
  )
}

function SupplierSettingsWrapper({ navigation }: any) {
  return (
    <SafeScreen>
      <SupplierSettingsScreen
        onGoBack={() => navigation.goBack()}
        onNavigateToOpeningHours={() => navigation.navigate('SupplierOpeningHours')}
        onNavigateToDeliveryZones={() => navigation.navigate('SupplierDeliveryZones')}
        onNavigateToMode={() => navigation.navigate('SupplierMode')}
      />
    </SafeScreen>
  )
}

function SupplierOpeningHoursWrapper({ navigation }: any) {
  return (
    <SafeScreen>
      <OpeningHoursEditor onSave={() => navigation.goBack()} />
    </SafeScreen>
  )
}

function SupplierDeliveryZonesWrapper({ navigation }: any) {
  return (
    <SafeScreen>
      <DeliveryZoneEditor onSave={() => navigation.goBack()} />
    </SafeScreen>
  )
}

function SupplierModeWrapper({ navigation }: any) {
  return (
    <SafeScreen>
      <ModeSelector onModeChanged={() => navigation.goBack()} />
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
      <OrderList onOpenOrder={(orderId) => navigation.navigate('OrderTracking', { orderId })} />
    </SafeScreen>
  )
}

function OrderTrackingWrapper({ route, navigation }: any) {
  const { orderId } = route.params
  return (
    <SafeScreen>
      <OrderTracking
        orderId={orderId}
        onOpenChat={(supplierId) => console.log('chat', supplierId)}
        onConfirmReception={() => navigation.goBack()}
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

const TAB_ICONS: Record<string, typeof Search> = {
  Accueil: Home,
  Chat: MessageCircle,
  Panier: ShoppingBagIcon,
  Profil: User,
}

const Tab = createBottomTabNavigator()

const HIDE_TAB_BAR_ROUTES = new Set([
  'Checkout',
  'OrderSuccess',
  'Login',
  'Register',
  'ForgotPassword',
  'SupplierRegistration',
  'EditProfile',
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
    <NavigationContainer ref={navigationRef}>
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
        <Tab.Screen name="Chat" component={ChatStackScreen} />
        <Tab.Screen name="Panier" component={CartStackScreen} />
        <Tab.Screen name="Profil" component={ProfileStackScreen} />
      </Tab.Navigator>
    </NavigationContainer>
  )
}

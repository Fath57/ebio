// eslint-disable-next-line ts/ban-ts-comment
// @ts-nocheck — React Navigation types incompatible with React 19 types (upstream issue)
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { getFocusedRouteNameFromRoute, NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import Bell from 'lucide-react-native/dist/esm/icons/bell'
import ClipboardList from 'lucide-react-native/dist/esm/icons/clipboard-list'
import Home from 'lucide-react-native/dist/esm/icons/house'
import KeyRound from 'lucide-react-native/dist/esm/icons/key-round'
import LogOut from 'lucide-react-native/dist/esm/icons/log-out'
import MessageCircle from 'lucide-react-native/dist/esm/icons/message-circle'
import UserIcon from 'lucide-react-native/dist/esm/icons/user'
import UserPen from 'lucide-react-native/dist/esm/icons/user-pen'
import * as React from 'react'
import { ActivityIndicator, AppState, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ChangePasswordScreen } from '../features/auth/components/change-password-screen'
import { ForgotPasswordScreen } from '../features/auth/components/forgot-password-screen'
import { LoginScreen } from '../features/auth/components/login-screen'
import { RegisterScreen } from '../features/auth/components/register-screen'
import { SupplierRegistration } from '../features/auth/components/supplier-registration'
import { ChatDetailScreen } from '../features/chat/components/chat-detail-screen'
import { ConversationList } from '../features/chat/components/conversation-list'
import { useChatUnreadCount } from '../features/chat/hooks/use-chat-unread-count'
import { appAlert } from '../features/common/components/app-alert'
import { ScreenHeader } from '../features/common/components/screen-header'
import { NotificationsScreen } from '../features/notifications/components/notifications-screen'
import { useNotifications } from '../features/notifications/hooks/use-notifications'
import { EditProfileScreen } from '../features/profile/components/edit-profile-screen'
import { DashboardScreen } from '../features/supplier-dashboard/components/dashboard-screen'
import { DeliveryZoneEditor } from '../features/supplier-dashboard/components/delivery-zone-editor'
import { ModeSelector } from '../features/supplier-dashboard/components/mode-selector'
import { OpeningHoursEditor } from '../features/supplier-dashboard/components/opening-hours-editor'
import { OrderDetailScreen } from '../features/supplier-dashboard/components/order-detail-screen'
import { OrderManagement } from '../features/supplier-dashboard/components/order-management'
import { ProductDetailScreen as SupplierProductDetail } from '../features/supplier-dashboard/components/product-detail-screen'
import { ProductForm } from '../features/supplier-dashboard/components/product-form'
import { ProductList } from '../features/supplier-dashboard/components/product-list'
import { PromoCodesScreen } from '../features/supplier-dashboard/components/promo-codes-screen'
import { SalesPointsScreen } from '../features/supplier-dashboard/components/sales-points-screen'
import { ShopProfileEditor } from '../features/supplier-dashboard/components/shop-profile-editor'
import { SupplierGateScreen } from '../features/supplier-dashboard/components/supplier-gate-screen'
import { SupplierReviewsScreen } from '../features/supplier-dashboard/components/supplier-reviews-screen'
import { SupplierSettingsScreen } from '../features/supplier-dashboard/components/supplier-settings-screen'
import { SupplierWalletScreen } from '../features/supplier-dashboard/components/supplier-wallet-screen'
import { usePendingOrdersCount } from '../features/supplier-dashboard/hooks/use-pending-orders-count'
import { signOut, useSession } from '../lib/auth-client'
import { colors, fonts, radius, spacing, typography } from '../theme/theme'
import { useTheme } from '../theme/theme-context'
import { apiFetch } from '../utils/api-client'
import { navigationRef } from './navigation-ref'

function SafeScreen({ children }: { children: React.ReactNode }) {
  const { semantic } = useTheme()
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.bgPage }} edges={['top']}>
      {children}
    </SafeAreaView>
  )
}

function Loading() {
  const { semantic } = useTheme()
  return (
    <View style={[styles.loading, { backgroundColor: semantic.bgPage }]}>
      <ActivityIndicator size="large" color={colors.green[400]} />
    </View>
  )
}

// ===== Auth flow =====

const AuthStack = createNativeStackNavigator()

function AuthLoginWrapper({ navigation }: any) {
  return (
    <SafeScreen>
      <LoginScreen
        onLoginSuccess={() => { /* useSession re-renders the root switch */ }}
        onNavigateToRegister={() => navigation.replace('SupplierAuthRegister')}
        onNavigateToForgotPassword={() => navigation.navigate('SupplierAuthForgot')}
      />
    </SafeScreen>
  )
}

function AuthRegisterWrapper({ navigation }: any) {
  return (
    <SafeScreen>
      <RegisterScreen
        onRegisterSuccess={() => { /* useSession re-renders the root switch */ }}
        onNavigateToLogin={() => navigation.replace('SupplierAuthLogin')}
      />
    </SafeScreen>
  )
}

function AuthForgotWrapper({ navigation }: any) {
  return (
    <SafeScreen>
      <ForgotPasswordScreen
        onGoBack={() => navigation.goBack()}
        onNavigateToLogin={() => navigation.goBack()}
      />
    </SafeScreen>
  )
}

function SupplierAuthFlow() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="SupplierAuthLogin" component={AuthLoginWrapper} />
      <AuthStack.Screen name="SupplierAuthRegister" component={AuthRegisterWrapper} />
      <AuthStack.Screen name="SupplierAuthForgot" component={AuthForgotWrapper} />
    </AuthStack.Navigator>
  )
}

// ===== Gate: only validated suppliers reach the tabs =====

interface SupplierStatus {
  isSupplier: boolean
  validationStatus?: string
}

const GateStack = createNativeStackNavigator()

function SupplierGate() {
  const { data: session } = useSession()
  const [status, setStatus] = React.useState<SupplierStatus | null>(null)
  const [loading, setLoading] = React.useState(true)

  // Signed in with the wrong account (a buyer, a courier…) is the usual
  // reason to land here: offer the way out instead of a dead end.
  function confirmSwitchAccount() {
    appAlert('Changer de compte', 'Vous allez être déconnecté pour vous connecter avec un autre compte.', [
      {
        text: 'Se déconnecter',
        style: 'destructive',
        onPress: () => {
          signOut()
        },
      },
      { text: 'Annuler', style: 'cancel' },
    ])
  }

  const refresh = React.useCallback(async () => {
    try {
      const res = await apiFetch('/api/suppliers/me/status')
      if (res.ok) {
        setStatus(await res.json())
      }
      else {
        setStatus({ isSupplier: false })
      }
    }
    catch {
      setStatus({ isSupplier: false })
    }
    finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    refresh()
  }, [refresh])

  // The validation happens in the back-office: refreshing when the app comes
  // back to the foreground is what lets « votre boutique est validée » land
  // without reinstalling.
  React.useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        refresh()
      }
    })
    return () => {
      sub.remove()
    }
  }, [refresh])

  if (loading) {
    return <Loading />
  }

  if (status?.isSupplier && status.validationStatus === 'VALIDATED') {
    return <SupplierTabs />
  }

  return (
    <GateStack.Navigator screenOptions={{ headerShown: false }}>
      <GateStack.Screen name="SupplierGateHome">
        {({ navigation }: any) => (
          <SafeScreen>
            <SupplierGateScreen
              validationStatus={status?.isSupplier ? status.validationStatus ?? 'PENDING' : null}
              onCreateShop={() => navigation.navigate('SupplierGateRegistration')}
              onRefresh={refresh}
              accountLabel={session?.user?.email ?? session?.user?.name ?? null}
              onSignOut={confirmSwitchAccount}
            />
          </SafeScreen>
        )}
      </GateStack.Screen>
      <GateStack.Screen name="SupplierGateRegistration">
        {({ navigation }: any) => (
          <SafeScreen>
            <SupplierRegistration
              isPhoneVerified
              onComplete={() => {
                refresh()
                navigation.goBack()
              }}
              onGoBack={() => navigation.goBack()}
            />
          </SafeScreen>
        )}
      </GateStack.Screen>
    </GateStack.Navigator>
  )
}

// ===== Accueil tab: dashboard + shop management stack =====

const HomeStack = createNativeStackNavigator()

function DashboardWrapper({ navigation }: any) {
  return (
    <SafeScreen>
      <DashboardScreen
        onNavigateToProducts={() => navigation.navigate('SupplierProducts')}
        onNavigateToOrders={() => navigation.navigate('Commandes')}
        onNavigateToSettings={() => navigation.navigate('SupplierSettings')}
        onNavigateToReviews={() => navigation.navigate('SupplierReviews')}
        onNavigateToWallet={() => navigation.navigate('SupplierWallet')}
        onNavigateToMessages={() => navigation.navigate('Chat')}
        onNavigateToNotifications={() => navigation.navigate('Profil', { screen: 'SupplierNotifications' })}
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
        <Loading />
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

function SupplierSettingsWrapper({ navigation }: any) {
  return (
    <SafeScreen>
      <SupplierSettingsScreen
        onGoBack={() => navigation.goBack()}
        onNavigateToShopProfile={() => navigation.navigate('SupplierShopProfile')}
        onNavigateToOpeningHours={() => navigation.navigate('SupplierOpeningHours')}
        onNavigateToSalesPoints={() => navigation.navigate('SupplierSalesPoints')}
        onNavigateToPromoCodes={() => navigation.navigate('SupplierPromoCodes')}
        onNavigateToDeliveryZones={() => navigation.navigate('SupplierDeliveryZones')}
        onNavigateToMode={() => navigation.navigate('SupplierMode')}
      />
    </SafeScreen>
  )
}

function SupplierShopProfileWrapper({ navigation }: any) {
  return (
    <SafeScreen>
      <ShopProfileEditor onGoBack={() => navigation.goBack()} onSaved={() => navigation.goBack()} />
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

function SupplierOpeningHoursWrapper({ navigation }: any) {
  return (
    <SafeScreen>
      <OpeningHoursEditor onSave={() => navigation.goBack()} onGoBack={() => navigation.goBack()} />
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

function SupplierPromoCodesWrapper({ navigation }: any) {
  return (
    <SafeScreen>
      <PromoCodesScreen onGoBack={() => navigation.goBack()} />
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

function HomeStackScreen() {
  return (
    <HomeStack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <HomeStack.Screen name="SupplierDashboard" component={DashboardWrapper} />
      <HomeStack.Screen name="SupplierProducts" component={SupplierProductsWrapper} />
      <HomeStack.Screen name="SupplierProductDetail" component={SupplierProductDetailWrapper} />
      <HomeStack.Screen name="SupplierProductForm" component={SupplierProductFormWrapper} />
      <HomeStack.Screen name="SupplierSettings" component={SupplierSettingsWrapper} />
      <HomeStack.Screen name="SupplierShopProfile" component={SupplierShopProfileWrapper} />
      <HomeStack.Screen name="SupplierReviews" component={SupplierReviewsWrapper} />
      <HomeStack.Screen name="SupplierOpeningHours" component={SupplierOpeningHoursWrapper} />
      <HomeStack.Screen name="SupplierSalesPoints" component={SupplierSalesPointsWrapper} />
      <HomeStack.Screen name="SupplierWallet" component={SupplierWalletWrapper} />
      <HomeStack.Screen name="SupplierPromoCodes" component={SupplierPromoCodesWrapper} />
      <HomeStack.Screen name="SupplierDeliveryZones" component={SupplierDeliveryZonesWrapper} />
      <HomeStack.Screen name="SupplierMode" component={SupplierModeWrapper} />
    </HomeStack.Navigator>
  )
}

// ===== Commandes tab =====

const OrdersStack = createNativeStackNavigator()

function SupplierOrdersWrapper({ navigation }: any) {
  return (
    <SafeScreen>
      <OrderManagement
        supplierId="me"
        onOpenOrder={id => navigation.navigate('SupplierOrderDetail', { orderId: id })}
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

function OrdersStackScreen() {
  return (
    <OrdersStack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <OrdersStack.Screen name="SupplierOrders" component={SupplierOrdersWrapper} />
      <OrdersStack.Screen name="SupplierOrderDetail" component={SupplierOrderDetailWrapper} />
    </OrdersStack.Navigator>
  )
}

// ===== Chat tab =====

const ChatStack = createNativeStackNavigator()

function ChatStackScreen() {
  const { data: session } = useSession()
  const currentUserId = session?.user?.id ?? ''
  return (
    <ChatStack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <ChatStack.Screen name="ChatHome">
        {({ navigation }: any) => (
          <SafeScreen>
            <ConversationList
              currentUserId={currentUserId}
              onOpenConversation={(conversationId, peerName, isSupplier, orderId, kind) =>
                navigation.navigate('ChatDetail', { conversationId, peerName, isSupplier, orderId, kind })}
            />
          </SafeScreen>
        )}
      </ChatStack.Screen>
      <ChatStack.Screen name="ChatDetail">
        {({ route, navigation }: any) => (
          <SafeScreen>
            <ChatDetailScreen
              conversationId={route.params.conversationId}
              currentUserId={currentUserId}
              peerName={route.params.peerName}
              isSupplier
              orderId={route.params.orderId}
              kind={route.params.kind ?? 'SUPPLIER'}
              onGoBack={() => navigation.goBack()}
              onOpenOrder={(oid) => {
                navigation.navigate('Commandes', { screen: 'SupplierOrderDetail', params: { orderId: oid } })
              }}
            />
          </SafeScreen>
        )}
      </ChatStack.Screen>
    </ChatStack.Navigator>
  )
}

// ===== Profil tab =====

const ProfileStack = createNativeStackNavigator()

function SupplierAccountHome({ navigation }: any) {
  const { semantic } = useTheme()
  const { data: session } = useSession()

  function confirmSignOut() {
    appAlert('Se déconnecter', 'Vous devrez vous reconnecter pour gérer votre boutique.', [
      {
        text: 'Se déconnecter',
        style: 'destructive',
        onPress: () => {
          signOut()
        },
      },
      { text: 'Annuler', style: 'cancel' },
    ])
  }

  return (
    <SafeScreen>
      <ScreenHeader title="Profil" subtitle={session?.user?.name ?? undefined} />
      <ScrollView contentContainerStyle={styles.accountContainer}>
        <Pressable
          style={[styles.accountRow, { backgroundColor: semantic.bgCard }]}
          onPress={() => navigation.navigate('SupplierEditProfile')}
          accessibilityRole="button"
          accessibilityLabel="Modifier mon profil"
        >
          <UserPen size={20} color={semantic.textSecondary} strokeWidth={2} />
          <Text style={[styles.accountRowText, { color: semantic.textPrimary }]}>Modifier mon profil</Text>
        </Pressable>
        <Pressable
          style={[styles.accountRow, { backgroundColor: semantic.bgCard }]}
          onPress={() => navigation.navigate('SupplierNotifications')}
          accessibilityRole="button"
          accessibilityLabel="Notifications"
        >
          <Bell size={20} color={semantic.textSecondary} strokeWidth={2} />
          <Text style={[styles.accountRowText, { color: semantic.textPrimary }]}>Notifications</Text>
        </Pressable>
        <Pressable
          style={[styles.accountRow, { backgroundColor: semantic.bgCard }]}
          onPress={() => navigation.navigate('SupplierChangePassword')}
          accessibilityRole="button"
          accessibilityLabel="Modifier mon mot de passe"
        >
          <KeyRound size={20} color={semantic.textSecondary} strokeWidth={2} />
          <Text style={[styles.accountRowText, { color: semantic.textPrimary }]}>Modifier mon mot de passe</Text>
        </Pressable>
        <Pressable
          style={[styles.accountRow, styles.accountSignOut, { borderColor: colors.coral[400] }]}
          onPress={confirmSignOut}
          accessibilityRole="button"
          accessibilityLabel="Se déconnecter"
        >
          <LogOut size={20} color={colors.coral[400]} strokeWidth={2} />
          <Text style={[styles.accountRowText, { color: colors.coral[400] }]}>Se déconnecter</Text>
        </Pressable>
      </ScrollView>
    </SafeScreen>
  )
}

function SupplierEditProfileWrapper({ navigation }: any) {
  return (
    <SafeScreen>
      <EditProfileScreen onGoBack={() => navigation.goBack()} />
    </SafeScreen>
  )
}

function SupplierChangePasswordWrapper({ navigation }: any) {
  return (
    <SafeScreen>
      <ScreenHeader title="Modifier mon mot de passe" onBack={() => navigation.goBack()} />
      <ChangePasswordScreen onDone={() => navigation.goBack()} />
    </SafeScreen>
  )
}

function SupplierNotificationsWrapper({ navigation }: any) {
  return (
    <SafeScreen>
      <NotificationsScreen onGoBack={() => navigation.goBack()} />
    </SafeScreen>
  )
}

function ProfileStackScreen() {
  return (
    <ProfileStack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <ProfileStack.Screen name="SupplierAccountHome" component={SupplierAccountHome} />
      <ProfileStack.Screen name="SupplierEditProfile" component={SupplierEditProfileWrapper} />
      <ProfileStack.Screen name="SupplierNotifications" component={SupplierNotificationsWrapper} />
      <ProfileStack.Screen name="SupplierChangePassword" component={SupplierChangePasswordWrapper} />
    </ProfileStack.Navigator>
  )
}

// ===== Tabs =====

const Tab = createBottomTabNavigator()

const TAB_ICONS: Record<string, typeof Home> = {
  Accueil: Home,
  Commandes: ClipboardList,
  Chat: MessageCircle,
  Profil: UserIcon,
}

const HIDE_TAB_BAR_ROUTES = new Set(['ChatDetail', 'SupplierProductForm'])

function SupplierTabs() {
  const { semantic } = useTheme()
  const { count: chatUnread } = useChatUnreadCount()
  const { count: pendingOrders } = usePendingOrdersCount()

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
            const Icon = TAB_ICONS[route.name]
            return <Icon size={size ?? 22} color={color} strokeWidth={isFocused ? 2.5 : 1.8} />
          },
          tabBarLabelStyle: {
            fontFamily: fonts.sansMd,
            fontSize: 11,
          },
        }
      }}
    >
      <Tab.Screen name="Accueil" component={HomeStackScreen} />
      <Tab.Screen
        name="Commandes"
        component={OrdersStackScreen}
        options={pendingOrders > 0
          ? {
              tabBarBadge: pendingOrders > 99 ? '99+' : pendingOrders,
              tabBarBadgeStyle: { backgroundColor: colors.coral[400], fontFamily: fonts.sansMd, fontSize: 10 },
            }
          : {}}
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
      />
      <Tab.Screen name="Profil" component={ProfileStackScreen} />
    </Tab.Navigator>
  )
}

// ===== Root =====

function RootSwitch() {
  const { data: session, isPending } = useSession()
  if (isPending) {
    return <Loading />
  }
  if (!session) {
    return <SupplierAuthFlow />
  }
  return <SupplierGate />
}

/** eBio Fournisseur variant entry. */
export function SupplierNavigation() {
  useNotifications()
  return (
    <NavigationContainer ref={navigationRef}>
      <RootSwitch />
    </NavigationContainer>
  )
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accountContainer: {
    padding: spacing[4],
    gap: spacing[2],
  },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    minHeight: 56,
    borderRadius: radius.lg,
    paddingHorizontal: spacing[4],
  },
  accountSignOut: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    marginTop: spacing[4],
  },
  accountRowText: {
    ...typography.bodyL,
  },
})

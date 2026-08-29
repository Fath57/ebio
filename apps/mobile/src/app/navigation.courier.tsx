import type { Delivery } from '../features/courier/types'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { getFocusedRouteNameFromRoute, NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import * as Notifications from 'expo-notifications'
import Bike from 'lucide-react-native/dist/esm/icons/bike'
import ClipboardList from 'lucide-react-native/dist/esm/icons/clipboard-list'
import User from 'lucide-react-native/dist/esm/icons/user'
import Wallet from 'lucide-react-native/dist/esm/icons/wallet'
import { useEffect } from 'react'
import { ActivityIndicator, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ChangePasswordScreen } from '../features/auth/components/change-password-screen'
import { ForgotPasswordScreen } from '../features/auth/components/forgot-password-screen'
import { LoginScreen } from '../features/auth/components/login-screen'
import { RegisterScreen } from '../features/auth/components/register-screen'
import { ChatDetailScreen } from '../features/chat/components/chat-detail-screen'
import { appAlert } from '../features/common/components/app-alert'
import { ConnectivityBanner } from '../features/common/components/connectivity-banner'
import { ScreenHeader } from '../features/common/components/screen-header'
import { ActiveDeliveryScreen } from '../features/courier/components/active-delivery-screen'
import { AvailabilityToggle } from '../features/courier/components/availability-toggle'
import { CourierProfileScreen } from '../features/courier/components/courier-profile-screen'
import { CourierRegistrationForm } from '../features/courier/components/courier-registration-form'
import { CourierWalletScreen } from '../features/courier/components/courier-wallet-screen'
import { DeliveryDetail } from '../features/courier/components/delivery-detail'
import { HistoryScreen } from '../features/courier/components/history-screen'
import { OffersScreen } from '../features/courier/components/offers-screen'
import { CourierOnboardingScreen } from '../features/courier/components/onboarding-screen'
import { CourierPendingScreen } from '../features/courier/components/pending-screen'
import { ProofScreen } from '../features/courier/components/proof-screen'
import { useActiveDelivery } from '../features/courier/hooks/use-active-delivery'
import { useCourierProfile } from '../features/courier/hooks/use-courier-profile'
import { useOffers } from '../features/courier/hooks/use-offers'
import { useOfflineQueue } from '../features/courier/hooks/use-offline-queue'
import { useOutOfZone } from '../features/courier/hooks/use-out-of-zone'
import { NotificationsScreen } from '../features/notifications/components/notifications-screen'
import { useNotifications } from '../features/notifications/hooks/use-notifications'
import { signOut, useSession } from '../lib/auth-client'
import { colors, fonts } from '../theme/theme'
import { useTheme } from '../theme/theme-context'
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

// ===== Auth flow (reuses the shared auth feature) =====

const AuthStack = createNativeStackNavigator()

function AuthLoginWrapper({ navigation }: any) {
  return (
    <SafeScreen>
      <LoginScreen
        onLoginSuccess={() => { /* useSession re-renders the root switch */ }}
        onNavigateToRegister={() => navigation.replace('CourierRegister')}
        onNavigateToForgotPassword={() => navigation.navigate('CourierForgotPassword')}
      />
    </SafeScreen>
  )
}

function AuthRegisterWrapper({ navigation }: any) {
  return (
    <SafeScreen>
      <RegisterScreen
        onRegisterSuccess={() => { /* useSession re-renders the root switch */ }}
        onNavigateToLogin={() => navigation.replace('CourierLogin')}
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

function CourierAuthFlow() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="CourierLogin" component={AuthLoginWrapper} />
      <AuthStack.Screen name="CourierRegister" component={AuthRegisterWrapper} />
      <AuthStack.Screen name="CourierForgotPassword" component={AuthForgotWrapper} />
    </AuthStack.Navigator>
  )
}

// ===== Application flow (no profile yet, or pending validation) =====

const GateStack = createNativeStackNavigator()

function CourierGate() {
  const { state, profile, refresh } = useCourierProfile()
  const { data: session } = useSession()
  const accountLabel = session?.user?.email ?? session?.user?.name ?? null

  // Wrong account (a buyer, a supplier…) is the usual reason to be stuck on
  // the gate: offer the way out instead of a dead end.
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

  if (state === 'loading') {
    return <Loading />
  }

  if (state === 'validated' && profile) {
    return <CourierTabs />
  }

  return (
    <GateStack.Navigator screenOptions={{ headerShown: false }}>
      {state === 'none'
        ? (
            <>
              <GateStack.Screen name="CourierOnboarding">
                {({ navigation }: any) => (
                  <SafeScreen>
                    <CourierOnboardingScreen
                      onStart={() => navigation.navigate('CourierApplication')}
                      accountLabel={accountLabel}
                      onSwitchAccount={confirmSwitchAccount}
                    />
                  </SafeScreen>
                )}
              </GateStack.Screen>
              <GateStack.Screen name="CourierApplication">
                {({ navigation }: any) => (
                  <SafeScreen>
                    <ScreenHeader title="Candidature livreur" onBack={() => navigation.goBack()} />
                    <CourierRegistrationForm onSubmitted={refresh} onBack={() => navigation.goBack()} />
                  </SafeScreen>
                )}
              </GateStack.Screen>
            </>
          )
        : (
            <>
              <GateStack.Screen name="CourierPending">
                {({ navigation }: any) => (
                  <SafeScreen>
                    {profile
                      ? (
                          <CourierPendingScreen
                            profile={profile}
                            onRefresh={refresh}
                            onEdit={() => navigation.navigate('CourierApplicationEdit')}
                            accountLabel={accountLabel}
                            onSwitchAccount={confirmSwitchAccount}
                          />
                        )
                      : <Loading />}
                  </SafeScreen>
                )}
              </GateStack.Screen>
              {/* Distinct route name: when the gate flips from the no-profile
                  branch after a submission, the stale CourierApplication route
                  is dropped and the navigator lands on CourierPending. */}
              <GateStack.Screen name="CourierApplicationEdit">
                {({ navigation }: any) => (
                  <SafeScreen>
                    <ScreenHeader title="Corriger ma candidature" onBack={() => navigation.goBack()} />
                    <CourierRegistrationForm
                      existing={profile}
                      onSubmitted={() => {
                        refresh()
                        navigation.goBack()
                      }}
                      onBack={() => navigation.goBack()}
                    />
                  </SafeScreen>
                )}
              </GateStack.Screen>
            </>
          )}
    </GateStack.Navigator>
  )
}

// ===== Validated courier: Courses / Historique / Portefeuille / Profil =====

const CoursesStack = createNativeStackNavigator()

function CoursesHomeWrapper({ navigation }: any) {
  const { delivery, loading, refresh } = useActiveDelivery()
  const offers = useOffers()
  const refreshOffers = offers.refresh
  const { profile, refresh: refreshProfile } = useCourierProfile()
  const outOfZoneKm = useOutOfZone(profile)
  const queue = useOfflineQueue(refresh)

  // A DELIVERY_OFFER push received in foreground refreshes the feed at once.
  useEffect(() => {
    const sub = Notifications.addNotificationReceivedListener((notification) => {
      const type = notification.request.content.data?.type
      if (type === 'DELIVERY_OFFER') {
        refreshOffers()
      }
    })
    return () => {
      sub.remove()
    }
  }, [refreshOffers])

  if (loading) {
    return (
      <SafeScreen>
        <Loading />
      </SafeScreen>
    )
  }

  if (delivery && delivery.status !== 'DELIVERED' && delivery.status !== 'FAILED') {
    return (
      <SafeScreen>
        <ScreenHeader title="Course en cours" subtitle={delivery.orderNumber} />
        <ConnectivityBanner />
        <ActiveDeliveryScreen
          delivery={delivery}
          pendingCount={queue.pendingCount}
          onTransition={(action, body) => queue.sendTransition(delivery.id, action, body)}
          onProof={() => navigation.navigate('CourierProof', { deliveryId: delivery.id })}
          onOpenChat={(conversationId, peerName) =>
            navigation.navigate('CourierChat', { conversationId, peerName, orderNumber: delivery.orderNumber, kind: 'COURIER' })}
          onChanged={() => {
            refresh()
            offers.refresh()
          }}
        />
      </SafeScreen>
    )
  }

  return (
    <SafeScreen>
      <ScreenHeader
        title="Courses"
        rightSlot={profile
          ? (
              <AvailabilityToggle
                isAvailable={profile.isAvailable}
                onChanged={() => {
                  refreshProfile()
                  offers.refresh()
                }}
              />
            )
          : null}
      />
      <ConnectivityBanner />
      <OffersScreen
        offers={offers.offers}
        refreshing={offers.refreshing}
        unavailable={offers.unavailable}
        outOfZoneKm={outOfZoneKm}
        onRefresh={offers.refresh}
        onAccept={offers.accept}
        onAccepted={refresh}
      />
    </SafeScreen>
  )
}

function CourierProofWrapper({ route, navigation }: any) {
  const { deliveryId } = route.params
  const queue = useOfflineQueue()
  return (
    <SafeScreen>
      <ScreenHeader title="Preuve de livraison" onBack={() => navigation.goBack()} />
      <ProofScreen
        onComplete={body => queue.sendTransition(deliveryId, 'complete', body)}
        onDone={() => navigation.popToTop()}
      />
    </SafeScreen>
  )
}

/** Courier <-> buyer thread of a delivery; the socket is handled by ChatScreen itself. */
function CourierChatWrapper({ route, navigation }: any) {
  const { data: session } = useSession()
  const currentUserId = session?.user?.id ?? ''
  const { conversationId, peerName, orderNumber } = route.params
  return (
    <SafeScreen>
      <ChatDetailScreen
        conversationId={conversationId}
        currentUserId={currentUserId}
        peerName={peerName ?? 'Client'}
        kind="COURIER"
        orderNumber={orderNumber ?? null}
        onGoBack={() => navigation.goBack()}
      />
    </SafeScreen>
  )
}

function CoursesStackScreen() {
  return (
    <CoursesStack.Navigator screenOptions={{ headerShown: false }}>
      <CoursesStack.Screen name="CoursesHome" component={CoursesHomeWrapper} />
      <CoursesStack.Screen name="CourierProof" component={CourierProofWrapper} />
      <CoursesStack.Screen name="CourierChat" component={CourierChatWrapper} />
    </CoursesStack.Navigator>
  )
}

const HistoryStack = createNativeStackNavigator()

function HistoryHomeWrapper({ navigation }: any) {
  return (
    <SafeScreen>
      <ScreenHeader title="Historique" />
      <HistoryScreen onOpenDetail={delivery => navigation.navigate('HistoryDetail', { delivery })} />
    </SafeScreen>
  )
}

function HistoryDetailWrapper({ route, navigation }: any) {
  const delivery = route.params.delivery as Delivery
  return (
    <SafeScreen>
      <ScreenHeader title={delivery.orderNumber} onBack={() => navigation.goBack()} />
      <DeliveryDetail
        delivery={delivery}
        onOpenChat={(conversationId, peerName) =>
          navigation.navigate('CourierHistoryChat', { conversationId, peerName, orderNumber: delivery.orderNumber, kind: 'COURIER' })}
      />
    </SafeScreen>
  )
}

function HistoryStackScreen() {
  return (
    <HistoryStack.Navigator screenOptions={{ headerShown: false }}>
      <HistoryStack.Screen name="HistoryHome" component={HistoryHomeWrapper} />
      <HistoryStack.Screen name="HistoryDetail" component={HistoryDetailWrapper} />
      {/* Distinct route name: CourierChat already lives in the Courses branch. */}
      <HistoryStack.Screen name="CourierHistoryChat" component={CourierChatWrapper} />
    </HistoryStack.Navigator>
  )
}

const WalletStack = createNativeStackNavigator()

function CourierWalletWrapper() {
  return (
    <SafeScreen>
      <CourierWalletScreen />
    </SafeScreen>
  )
}

function WalletStackScreen() {
  return (
    <WalletStack.Navigator screenOptions={{ headerShown: false }}>
      <WalletStack.Screen name="CourierWalletHome" component={CourierWalletWrapper} />
    </WalletStack.Navigator>
  )
}

const ProfileStack = createNativeStackNavigator()

function CourierProfileWrapper({ navigation }: any) {
  const { profile, refresh } = useCourierProfile()
  if (!profile) {
    return (
      <SafeScreen>
        <Loading />
      </SafeScreen>
    )
  }
  return (
    <SafeScreen>
      <ScreenHeader title="Profil" />
      <CourierProfileScreen
        profile={profile}
        onAvailabilityChanged={refresh}
        onEdit={() => navigation.navigate('CourierEditProfile')}
        onOpenNotifications={() => navigation.navigate('CourierNotifications')}
        onChangePassword={() => navigation.navigate('CourierChangePassword')}
        onSignedOut={refresh}
      />
    </SafeScreen>
  )
}

function CourierEditProfileWrapper({ navigation }: any) {
  const { profile, refresh } = useCourierProfile()
  return (
    <SafeScreen>
      <ScreenHeader title="Modifier mon profil" onBack={() => navigation.goBack()} />
      {profile
        ? (
            <CourierRegistrationForm
              existing={profile}
              onSubmitted={() => {
                refresh()
                navigation.goBack()
              }}
              onBack={() => navigation.goBack()}
            />
          )
        : <Loading />}
    </SafeScreen>
  )
}

function CourierChangePasswordWrapper({ navigation }: any) {
  return (
    <SafeScreen>
      <ScreenHeader title="Modifier mon mot de passe" onBack={() => navigation.goBack()} />
      <ChangePasswordScreen onDone={() => navigation.goBack()} />
    </SafeScreen>
  )
}

function CourierNotificationsWrapper({ navigation }: any) {
  return (
    <SafeScreen>
      <NotificationsScreen onGoBack={() => navigation.goBack()} />
    </SafeScreen>
  )
}

function ProfileStackScreen() {
  return (
    <ProfileStack.Navigator screenOptions={{ headerShown: false }}>
      <ProfileStack.Screen name="CourierProfileHome" component={CourierProfileWrapper} />
      <ProfileStack.Screen name="CourierEditProfile" component={CourierEditProfileWrapper} />
      <ProfileStack.Screen name="CourierNotifications" component={CourierNotificationsWrapper} />
      <ProfileStack.Screen name="CourierChangePassword" component={CourierChangePasswordWrapper} />
    </ProfileStack.Navigator>
  )
}

const Tab = createBottomTabNavigator()

const TAB_ICONS: Record<string, typeof Bike> = {
  Courses: Bike,
  Historique: ClipboardList,
  Portefeuille: Wallet,
  Profil: User,
}

const HIDE_TAB_BAR_ROUTES = new Set(['CourierChat', 'CourierHistoryChat', 'CourierProof'])

function CourierTabs() {
  const { semantic } = useTheme()
  return (
    <Tab.Navigator
      screenOptions={({ route }) => {
        // The absolute tab bar would cover the chat composer: hide it there.
        const focused = getFocusedRouteNameFromRoute(route)
        const shouldHide = focused ? HIDE_TAB_BAR_ROUTES.has(focused) : false
        return {
          headerShown: false,
          tabBarActiveTintColor: colors.green[400],
          tabBarInactiveTintColor: colors.neutral[400],
          tabBarHideOnKeyboard: true,
          tabBarStyle: shouldHide
            ? { display: 'none' as const }
            : {
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
              },
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
      <Tab.Screen name="Courses" component={CoursesStackScreen} />
      <Tab.Screen name="Historique" component={HistoryStackScreen} />
      <Tab.Screen name="Portefeuille" component={WalletStackScreen} />
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
    return <CourierAuthFlow />
  }
  return <CourierGate />
}

/** eBio Livreur variant entry. */
export function CourierNavigation() {
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
})

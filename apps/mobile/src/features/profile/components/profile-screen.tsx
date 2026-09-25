import type { TrustedDeviceRow } from '../../auth/hooks/use-biometric-auth'
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs'
import Bell from 'lucide-react-native/dist/esm/icons/bell'
import ChevronRight from 'lucide-react-native/dist/esm/icons/chevron-right'
import CircleQuestionMark from 'lucide-react-native/dist/esm/icons/circle-question-mark'
import ClipboardList from 'lucide-react-native/dist/esm/icons/clipboard-list'
import FileText from 'lucide-react-native/dist/esm/icons/file-text'
import Hourglass from 'lucide-react-native/dist/esm/icons/hourglass'
import KeyRound from 'lucide-react-native/dist/esm/icons/key-round'
import LogOutIcon from 'lucide-react-native/dist/esm/icons/log-out'
import Monitor from 'lucide-react-native/dist/esm/icons/monitor'
import Moon from 'lucide-react-native/dist/esm/icons/moon'
import Pen from 'lucide-react-native/dist/esm/icons/pen'
import ScanFace from 'lucide-react-native/dist/esm/icons/scan-face'
import ShieldCheck from 'lucide-react-native/dist/esm/icons/shield-check'
import Store from 'lucide-react-native/dist/esm/icons/store'
import Sun from 'lucide-react-native/dist/esm/icons/sun'
import UserIcon from 'lucide-react-native/dist/esm/icons/user'
import WalletIcon from 'lucide-react-native/dist/esm/icons/wallet'
import * as React from 'react'
import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { notifyAuthChange, signOut, useSession } from '../../../lib/auth-client'
import { colors, fonts, radius, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { apiFetch } from '../../../utils/api-client'
import { BRAND_LOGO } from '../../../utils/app-variant'
import { useBiometricAuth } from '../../auth/hooks/use-biometric-auth'
import { ConfirmModal } from '../../common/components/confirm-modal'
import { ScreenHeader } from '../../common/components/screen-header'

interface UserProfile {
  id: string
  name: string
  email: string | null
  phone: string | null
  role: 'BUYER' | 'SUPPLIER' | 'ADMIN'
  image: string | null
}

type ThemeMode = 'light' | 'dark' | 'system'

const THEME_OPTIONS: { value: ThemeMode, label: string, Icon: typeof Sun }[] = [
  { value: 'light', label: 'Clair', Icon: Sun },
  { value: 'dark', label: 'Sombre', Icon: Moon },
  { value: 'system', label: 'Système', Icon: Monitor },
]

const ROLE_LABELS: Record<string, string> = {
  BUYER: 'Acheteur',
  SUPPLIER: 'Fournisseur',
  COURIER: 'Livreur',
  ADMIN: 'Administrateur',
}

interface ProfileScreenProps {
  onNavigateToOrders?: () => void
  onNavigateToWallet?: () => void
  onNavigateToNotifications?: () => void
  onNavigateToLogin?: () => void
  onNavigateToEditProfile?: () => void
  onNavigateToChangePassword?: () => void
  onNavigateToSupplierRegistration?: () => void
  onNavigateToHelp?: () => void
  onNavigateToTerms?: () => void
  refreshTrigger?: number
}

export function ProfileScreen({ onNavigateToOrders, onNavigateToWallet, onNavigateToNotifications, onNavigateToLogin, onNavigateToEditProfile, onNavigateToChangePassword, onNavigateToSupplierRegistration, onNavigateToHelp, onNavigateToTerms, refreshTrigger }: ProfileScreenProps = {}) {
  const { mode, setMode, semantic } = useTheme()
  const { data: session } = useSession()
  const tabBarHeight = useBottomTabBarHeight()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [supplierStatus, setSupplierStatus] = useState<{ isSupplier: boolean, supplierId: string | null, validationStatus: string | null, shopName: string | null }>({ isSupplier: false, supplierId: null, validationStatus: null, shopName: null })
  const [loading, setLoading] = useState(true)
  const {
    isAvailable: biometricAvailable,
    isEnabled: biometricEnabled,
    devices: trustedDevices,
    busy: biometricBusy,
    enable: enableBiometrics,
    revoke: revokeDevice,
  } = useBiometricAuth()
  const [revoking, setRevoking] = useState<TrustedDeviceRow | null>(null)
  const [showLogoutModal, setShowLogoutModal] = useState(false)

  const sessionUserId = session?.user?.id ?? null

  useEffect(() => {
    if (!sessionUserId) {
      setProfile(null)
      setSupplierStatus({ isSupplier: false, supplierId: null, validationStatus: null, shopName: null })
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    async function load() {
      try {
        const [profileRes, statusRes] = await Promise.all([
          apiFetch('/api/users/me'),
          apiFetch('/api/suppliers/me/status'),
        ])
        if (cancelled)
          return
        if (profileRes.ok) {
          const data = await profileRes.json()
          setProfile(data)
        }
        else {
          setProfile(null)
        }
        if (statusRes.ok) {
          const data = await statusRes.json()
          setSupplierStatus(data)
        }
      }
      catch {
        if (!cancelled)
          setProfile(null)
      }
      finally {
        if (!cancelled)
          setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [sessionUserId, refreshTrigger])

  /**
   * Turning it on trusts this phone; turning it off takes the trust away.
   *
   * It used to PATCH a route that does not exist. `apiFetch` does not throw on
   * a 404, so the switch stayed on and nothing had happened — it read as saved
   * until the next time the screen loaded.
   */
  async function handleToggleBiometric(value: boolean) {
    if (value) {
      await enableBiometrics()
      return
    }
    const current = trustedDevices.find(device => device.current)
    if (current) {
      await revokeDevice(current.id, true)
    }
  }

  function handleRoleSwitch() {
    onNavigateToSupplierRegistration?.()
  }

  async function handleLogout() {
    await signOut()
    notifyAuthChange()
    setProfile(null)
    setShowLogoutModal(false)
  }

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: semantic.bgPage }]}>
        <ActivityIndicator size="large" color={colors.green[400]} />
      </View>
    )
  }

  // Not logged in
  if (!profile) {
    return (
      <View style={[styles.center, { backgroundColor: semantic.bgPage }]}>
        <Image
          source={BRAND_LOGO}
          style={styles.guestLogo}
          resizeMode="contain"
        />
        <Text style={[styles.guestTitle, { color: semantic.textPrimary }]}>
          Bienvenue
        </Text>
        <Text style={[styles.guestSubtitle, { color: semantic.textTertiary }]}>
          Connectez-vous pour accéder à vos commandes,
          {'\n'}
          votre panier et vos favoris.
        </Text>
        <TouchableOpacity
          style={styles.guestLoginButton}
          onPress={() => onNavigateToLogin?.()}
          activeOpacity={0.8}
        >
          <UserIcon size={18} color={colors.neutral[0]} strokeWidth={2.5} />
          <Text style={styles.guestLoginText}>Se connecter</Text>
        </TouchableOpacity>

        {/* Theme selector — available even when not logged in */}
        <View style={[styles.themeSelector, styles.guestThemeSelector, { backgroundColor: semantic.bgCard }]}>
          {THEME_OPTIONS.map((opt) => {
            const isActive = mode === opt.value
            return (
              <TouchableOpacity
                key={opt.value}
                style={[styles.themeOption, isActive && styles.themeOptionActive]}
                onPress={() => setMode(opt.value)}
              >
                <opt.Icon size={18} color={isActive ? colors.green[600] : semantic.textTertiary} />
                <Text style={[
                  styles.themeOptionText,
                  { color: isActive ? colors.green[600] : semantic.textSecondary },
                  isActive && styles.themeOptionTextActive,
                ]}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            )
          })}
        </View>
      </View>
    )
  }

  const initials = profile?.name
    ? profile.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
    : '?'

  return (
    <View style={[styles.container, { backgroundColor: semantic.bgPage }]}>
      <ScreenHeader title="Profil" />
      <ScrollView
        style={[styles.container, { backgroundColor: semantic.bgPage }]}
        contentContainerStyle={[styles.content, { paddingBottom: tabBarHeight + spacing[6] }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile header */}
        <View>
          <View style={[styles.header, { backgroundColor: semantic.bgCard }]}>
            <View style={styles.avatarContainer}>
              {profile?.image
                ? (
                    <Image source={{ uri: profile.image }} style={styles.avatar} />
                  )
                : (
                    <View style={styles.avatarFallback}>
                      <Text style={styles.avatarText}>{initials}</Text>
                    </View>
                  )}
              <TouchableOpacity
                style={styles.editAvatarButton}
                accessibilityLabel="Modifier le profil"
                onPress={() => onNavigateToEditProfile?.()}
              >
                <Pen size={12} color={colors.neutral[0]} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.name, { color: semantic.textPrimary }]}>
              {profile?.name ?? 'Utilisateur'}
            </Text>

            {profile?.email && !profile.email.endsWith('@phone.ebio.app') && (
              <Text style={[styles.email, { color: semantic.textSecondary }]}>
                {profile.email}
              </Text>
            )}

            {profile?.phone && (
              <Text style={[styles.phone, { color: semantic.textTertiary }]}>
                {profile.phone}
              </Text>
            )}

            <View style={styles.roleBadge}>
              <ShieldCheck size={12} color={colors.green[800]} />
              <Text style={styles.roleText}>
                {ROLE_LABELS[profile?.role ?? 'BUYER']}
              </Text>
            </View>
          </View>
        </View>

        {/* Edit profile */}
        <View>
          <View style={[styles.section, styles.stackedGroup]}>
            <MenuItem
              icon={Pen}
              iconBg={colors.blue[50]}
              iconColor={colors.blue[600]}
              label="Modifier le profil"
              sublabel="Nom, e-mail, téléphone"
              onPress={() => onNavigateToEditProfile?.()}
              semantic={semantic}
            />
            <MenuItem
              icon={KeyRound}
              label="Modifier mon mot de passe"
              sublabel="Sécurité du compte"
              onPress={() => onNavigateToChangePassword?.()}
              semantic={semantic}
            />
          </View>
        </View>

        {/* Quick actions */}
        {/* Become supplier (only for buyers who haven't applied) */}
        {profile?.role === 'BUYER' && !supplierStatus.isSupplier && (
          <View>
            <View style={styles.section}>
              <MenuItem
                icon={Store}
                label="Devenir fournisseur"
                sublabel="Vendez vos produits sur eBio"
                onPress={handleRoleSwitch}
                semantic={semantic}
              />
            </View>
          </View>
        )}

        {/* Pending validation banner */}
        {supplierStatus.isSupplier && supplierStatus.validationStatus === 'PENDING' && (
          <View>
            <View style={styles.section}>
              <View style={[styles.pendingBanner, { backgroundColor: semantic.bgCard }]}>
                <Hourglass size={24} color={colors.earth[400]} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.pendingTitle, { color: semantic.textPrimary }]}>
                    En attente de validation
                  </Text>
                  <Text style={[styles.pendingSubtitle, { color: semantic.textSecondary }]}>
                    Votre demande pour «
                    {' '}
                    {supplierStatus.shopName}
                    {' '}
                    » est en cours d'examen. Vous serez notifié dès que votre compte sera activé.
                  </Text>
                </View>
              </View>
            </View>
          </View>
        )}

        {/* Complement requested banner */}
        {supplierStatus.isSupplier && supplierStatus.validationStatus === 'COMPLEMENT_REQUESTED' && (
          <View>
            <View style={styles.section}>
              <View style={[styles.pendingBanner, { backgroundColor: colors.coral[50], borderColor: colors.coral[200], borderWidth: 1 }]}>
                <Store size={24} color={colors.coral[400]} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.pendingTitle, { color: colors.coral[600] }]}>
                    Complément demandé
                  </Text>
                  <Text style={[styles.pendingSubtitle, { color: colors.coral[600] }]}>
                    Des informations supplémentaires sont nécessaires pour valider votre boutique.
                  </Text>
                </View>
              </View>
            </View>
          </View>
        )}

        {/* Theme */}
        <View>
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: semantic.textTertiary }]}>
              APPARENCE
            </Text>
            <View style={[styles.themeSelector, { backgroundColor: semantic.bgCard }]}>
              {THEME_OPTIONS.map((opt) => {
                const isActive = mode === opt.value
                return (
                  <TouchableOpacity
                    key={opt.value}
                    style={[
                      styles.themeOption,
                      isActive && styles.themeOptionActive,
                    ]}
                    onPress={() => setMode(opt.value)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: isActive }}
                    accessibilityLabel={opt.label}
                  >
                    <opt.Icon
                      size={18}
                      color={isActive ? colors.green[600] : semantic.textTertiary}
                    />
                    <Text style={[
                      styles.themeOptionText,
                      { color: isActive ? colors.green[600] : semantic.textSecondary },
                      isActive && styles.themeOptionTextActive,
                    ]}
                    >
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </View>
          </View>
        </View>

        {/* Orders */}
        <View>
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: semantic.textTertiary }]}>
              COMMANDES
            </Text>
            <View style={[styles.menuGroup, { backgroundColor: semantic.bgCard }]}>
              <MenuItem
                icon={ClipboardList}
                iconBg={colors.earth[50]}
                iconColor={colors.earth[600]}
                label="Mes commandes"
                sublabel="Historique et suivi"
                onPress={() => onNavigateToOrders?.()}
                semantic={semantic}
                grouped
              />

              <View style={styles.menuDivider} />

              <MenuItem
                icon={WalletIcon}
                iconBg={colors.green[50]}
                iconColor={colors.green[600]}
                label="Mon portefeuille"
                sublabel="Recharger et payer sans frais"
                onPress={() => onNavigateToWallet?.()}
                semantic={semantic}
                grouped
              />
            </View>
          </View>
        </View>

        {/* Settings */}
        <View>
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: semantic.textTertiary }]}>
              PARAMÈTRES
            </Text>
            <View style={[styles.menuGroup, { backgroundColor: semantic.bgCard }]}>
              {biometricAvailable && (
                <>
                  <View style={styles.menuItemRow}>
                    <View style={styles.menuItemLeft}>
                      <View style={[styles.menuIconContainer, { backgroundColor: colors.green[50] }]}>
                        <ScanFace size={18} color={colors.green[600]} />
                      </View>
                      <View style={styles.biometricLabel}>
                        <Text style={[styles.menuLabel, { color: semantic.textPrimary }]}>
                          Connexion par empreinte
                        </Text>
                        <Text style={[styles.biometricHint, { color: semantic.textTertiary }]}>
                          Sur ce téléphone, sans retaper votre mot de passe
                        </Text>
                      </View>
                    </View>
                    <Switch
                      value={biometricEnabled}
                      disabled={biometricBusy}
                      onValueChange={handleToggleBiometric}
                      trackColor={{ true: colors.green[400], false: colors.neutral[200] }}
                      thumbColor={colors.neutral[0]}
                    />
                  </View>

                  {/* Other phones are listed so they can be taken away from
                      here — that is the whole point of trusting them one by
                      one rather than keeping a single key per account. */}
                  {trustedDevices.filter(device => !device.current).map(device => (
                    <View key={device.id} style={styles.trustedRow}>
                      <View style={styles.biometricLabel}>
                        <Text style={[styles.trustedName, { color: semantic.textSecondary }]}>
                          {device.label}
                        </Text>
                        <Text style={[styles.biometricHint, { color: semantic.textTertiary }]}>
                          {device.lastUsedAt === null
                            ? 'Jamais utilisé'
                            : `Utilisé le ${new Date(device.lastUsedAt).toLocaleDateString('fr-FR')}`}
                        </Text>
                      </View>
                      <TouchableOpacity
                        hitSlop={10}
                        disabled={biometricBusy}
                        onPress={() => setRevoking(device)}
                        accessibilityRole="button"
                        accessibilityLabel={`Retirer ${device.label}`}
                      >
                        <Text style={styles.trustedRevoke}>Retirer</Text>
                      </TouchableOpacity>
                    </View>
                  ))}

                  <View style={styles.menuDivider} />
                </>
              )}

              <View style={styles.menuDivider} />

              <MenuItem
                icon={Bell}
                iconBg={colors.blue[50]}
                iconColor={colors.blue[600]}
                label="Notifications"
                onPress={() => onNavigateToNotifications?.()}
                semantic={semantic}
                grouped
              />

            </View>
          </View>
        </View>

        {/* Support */}
        <View>
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: semantic.textTertiary }]}>
              SUPPORT
            </Text>
            <View style={[styles.menuGroup, { backgroundColor: semantic.bgCard }]}>
              <MenuItem
                icon={CircleQuestionMark}
                iconBg={colors.green[50]}
                iconColor={colors.green[600]}
                label="Centre d'aide"
                sublabel="Questions fréquentes et contact"
                onPress={() => onNavigateToHelp?.()}
                semantic={semantic}
                grouped
              />

              <View style={styles.menuDivider} />

              <MenuItem
                icon={FileText}
                iconBg={colors.neutral[100]}
                iconColor={colors.neutral[600]}
                label="Conditions d'utilisation"
                onPress={() => onNavigateToTerms?.()}
                semantic={semantic}
                grouped
              />
            </View>
          </View>
        </View>

        {/* Logout */}
        <View>
          <TouchableOpacity style={styles.logoutButton} onPress={() => setShowLogoutModal(true)}>
            <LogOutIcon size={18} color={colors.coral[600]} />
            <Text style={styles.logoutText}>Se déconnecter</Text>
          </TouchableOpacity>

          <Text style={[styles.version, { color: semantic.textTertiary }]}>
            eBio v1.0.0
          </Text>
        </View>

        <ConfirmModal
          visible={showLogoutModal}
          icon={LogOutIcon}
          iconColor={colors.coral[400]}
          iconBg={colors.coral[50]}
          title="Se déconnecter ?"
          message="Vous devrez vous reconnecter pour accéder à vos commandes et votre panier."
          confirmLabel="Se déconnecter"
          confirmStyle="destructive"
          onConfirm={handleLogout}
          onCancel={() => setShowLogoutModal(false)}
        />

        <ConfirmModal
          visible={revoking !== null}
          icon={ScanFace}
          iconColor={colors.coral[400]}
          iconBg={colors.coral[50]}
          title={revoking === null ? '' : `Retirer ${revoking.label} ?`}
          message="Ce téléphone ne pourra plus ouvrir votre compte avec une empreinte. Le mot de passe fonctionnera toujours."
          confirmLabel="Retirer"
          confirmStyle="destructive"
          onConfirm={() => {
            const device = revoking
            setRevoking(null)
            if (device) {
              void revokeDevice(device.id, device.current)
            }
          }}
          onCancel={() => setRevoking(null)}
        />
      </ScrollView>
    </View>
  )
}

function MenuItem({
  icon: Icon,
  iconBg = colors.green[50],
  iconColor = colors.green[600],
  label,
  sublabel,
  onPress,
  semantic,
  grouped = false,
}: {
  icon: typeof Sun
  iconBg?: string
  iconColor?: string
  label: string
  sublabel?: string
  onPress: () => void
  semantic: ReturnType<typeof useTheme>['semantic']
  grouped?: boolean
}) {
  return (
    <TouchableOpacity
      style={[
        styles.menuItemRow,
        !grouped && [styles.menuGroup, { backgroundColor: semantic.bgCard }],
      ]}
      onPress={onPress}
      activeOpacity={0.6}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View style={styles.menuItemLeft}>
        <View style={[styles.menuIconContainer, { backgroundColor: iconBg }]}>
          <Icon size={18} color={iconColor} />
        </View>
        <View>
          <Text style={[styles.menuLabel, { color: semantic.textPrimary }]}>
            {label}
          </Text>
          {sublabel && (
            <Text style={[styles.menuSublabel, { color: semantic.textTertiary }]}>
              {sublabel}
            </Text>
          )}
        </View>
      </View>
      <ChevronRight size={18} color={semantic.textTertiary} />
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingBottom: 80,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing[6],
  },
  guestLogo: {
    width: 160,
    height: 100,
    marginBottom: spacing[4],
  },
  guestTitle: {
    ...typography.h1,
    textAlign: 'center',
    marginBottom: spacing[2],
  },
  guestSubtitle: {
    ...typography.bodyL,
    textAlign: 'center',
    lineHeight: 15 * 1.7,
  },
  guestLoginButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    marginTop: spacing[6],
    height: 52,
    paddingHorizontal: spacing[8],
    backgroundColor: colors.green[400],
    borderRadius: radius.pill,
  },
  guestLoginText: {
    fontFamily: fonts.sansBd,
    fontSize: 16,
    color: colors.neutral[0],
  },
  header: {
    alignItems: 'center',
    paddingTop: spacing[6],
    paddingBottom: spacing[5],
    paddingHorizontal: spacing[4],
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: spacing[3],
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
  },
  avatarFallback: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.green[400],
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontFamily: fonts.sansBd,
    fontSize: 28,
    color: colors.neutral[0],
  },
  editAvatarButton: {
    position: 'absolute',
    bottom: 0,
    right: -2,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.neutral[800],
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.neutral[0],
  },
  name: {
    ...typography.h1,
  },
  email: {
    ...typography.bodyS,
    marginTop: spacing[1],
  },
  phone: {
    ...typography.caption,
    marginTop: 2,
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    marginTop: spacing[3],
    backgroundColor: colors.green[50],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.green[200],
  },
  roleText: {
    fontFamily: fonts.sansSb,
    fontSize: 11,
    color: colors.green[800],
  },
  section: {
    marginTop: spacing[5],
  },
  // Two standalone bands in a row need the page to show between them.
  stackedGroup: {
    gap: spacing[2],
  },
  pendingBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[3],
    padding: spacing[4],
  },
  pendingTitle: {
    ...typography.h3,
    marginBottom: spacing[1],
  },
  pendingSubtitle: {
    ...typography.bodyS,
    lineHeight: 13 * 1.7,
  },
  sectionTitle: {
    ...typography.overline,
    paddingHorizontal: spacing[4],
    marginBottom: spacing[2],
  },
  themeSelector: {
    flexDirection: 'row',
    // Aligned with the section titles and the row labels above it.
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[1],
    gap: spacing[1],
  },
  /**
   * The same selector, alone on the signed-out screen.
   *
   * Everywhere else it is a full-width band between other bands, so square
   * corners read as a section. Centred on an empty page it is a card and
   * nothing else, and a bare rectangle hugging its own text looked like a
   * layout that had failed.
   */
  guestThemeSelector: {
    alignSelf: 'stretch',
    marginTop: spacing[8],
    borderRadius: radius.lg,
  },
  themeOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[1],
    paddingVertical: spacing[3],
    borderRadius: radius.md,
  },
  themeOptionActive: {
    backgroundColor: colors.green[50],
  },
  themeOptionText: {
    fontFamily: fonts.sansMd,
    fontSize: 13,
  },
  themeOptionTextActive: {
    fontFamily: fonts.sansSb,
  },
  menuGroup: {
    overflow: 'hidden',
  },
  biometricLabel: {
    flex: 1,
    gap: 2,
  },
  biometricHint: {
    fontFamily: fonts.sans,
    fontSize: 12,
  },
  trustedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[3],
    paddingLeft: spacing[4] + 36 + spacing[3],
  },
  trustedName: {
    fontFamily: fonts.sansMd,
    fontSize: 14,
  },
  trustedRevoke: {
    fontFamily: fonts.sansSb,
    fontSize: 14,
    color: colors.coral[600],
  },
  menuItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    minHeight: 52,
  },
  menuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    flex: 1,
  },
  menuIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuLabel: {
    ...typography.bodyL,
    fontFamily: fonts.sansMd,
  },
  menuSublabel: {
    ...typography.caption,
    marginTop: 1,
  },
  menuDivider: {
    height: 1,
    backgroundColor: colors.neutral[100],
    marginLeft: spacing[4] + 36 + spacing[3],
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    marginTop: spacing[8],
    paddingVertical: spacing[4],
    backgroundColor: colors.coral[50],
    minHeight: 48,
  },
  logoutText: {
    fontFamily: fonts.sansSb,
    fontSize: 15,
    color: colors.coral[600],
  },
  version: {
    ...typography.caption,
    textAlign: 'center',
    marginTop: spacing[6],
    marginBottom: spacing[4],
  },
})

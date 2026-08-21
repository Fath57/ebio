import type { DeliveryZoneItem } from '../components/delivery-zones'
import type { SupplierMode } from '../components/mode-selector'
import type { OpeningHoursFormData } from '../forms/opening-hours-form'
import type { ProfileFormData } from '../forms/profile-form'
import type { ShopInfoFormData } from '../forms/shop-info-form'
import type { ShopLocationFormData } from '../forms/shop-location-form'
import { client } from '@boilerstone/openapi-generator'
import {
  suppliersControllerCreateDeliveryZone,
  suppliersControllerUpdateMe,
  usersControllerGetMe,
  usersControllerUpdateMe,
} from '@boilerstone/openapi-generator/client/sdk.gen'
import { Badge } from '@boilerstone/ui/components/primitives/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@boilerstone/ui/components/primitives/card'
import { Separator } from '@boilerstone/ui/components/primitives/separator'
import { Skeleton } from '@boilerstone/ui/components/primitives/skeleton'
import { toast } from '@boilerstone/ui/components/primitives/sonner'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@boilerstone/ui/components/primitives/tabs'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Camera, ImagePlus, Loader2, Store, User } from 'lucide-react'
import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useMediaUpload } from '@/features/media/hooks/use-media-upload'
import { Can } from '@/lib/casl/can'
import { DeliveryZones } from '../components/delivery-zones'
import { ModeSelector } from '../components/mode-selector'
import { SalesPointsManager } from '../components/sales-points-manager'
import { OpeningHoursForm } from '../forms/opening-hours-form'
import { ProfileForm } from '../forms/profile-form'
import { ShopInfoForm } from '../forms/shop-info-form'
import { ShopLocationForm } from '../forms/shop-location-form'

// ─── Types ───────────────────────────────────────────────

interface UserProfile {
  id: string
  name: string
  email: string | null
  phone: string | null
  role: string
  image: string | null
  createdAt: string
}

interface SupplierSettingsData {
  shopName: string
  address: string | null
  neighborhood: string | null
  mobileMoneyNumber: string | null
  coverPhoto: string | null
  profilePhoto: string | null
  latitude: number | null
  longitude: number | null
  deliveryFee: number
  freeDeliveryFrom: number | null
  openingHours: Record<string, { open: string, close: string, closed?: boolean }> | null
  mode: SupplierMode
  deliveryZones: DeliveryZoneItem[]
}

// ─── Helpers ─────────────────────────────────────────────

function isPlaceholderEmail(email: string | null): boolean {
  return !!email?.endsWith('@phone.ebio.app')
}

// ─── Page ────────────────────────────────────────────────

export default function SettingsPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  // Profile query
  const { data: profile, isLoading: isLoadingProfile } = useQuery({
    queryKey: ['profile'],
    queryFn: async () => {
      const res = await usersControllerGetMe()
      if (res.error)
        throw new Error('Failed to fetch profile')
      return res.data as UserProfile
    },
  })

  // Settings query
  const { data: settings, isLoading: isLoadingSettings } = useQuery({
    queryKey: ['supplier-settings'],
    queryFn: async () => {
      const result = await client.get({ url: '/api/suppliers/me/settings' })
      return result.data as SupplierSettingsData
    },
  })

  const isLoading = isLoadingProfile || isLoadingSettings

  // ─── Profile mutations ────────────────────────────────

  const avatarInputRef = useRef<HTMLInputElement>(null)
  const coverInputRef = useRef<HTMLInputElement>(null)
  const { uploading: uploadingAvatar, uploadFile: uploadAvatar } = useMediaUpload({ context: 'SUPPLIER_PROFILE' })
  const { uploading: uploadingCover, uploadFile: uploadCover } = useMediaUpload({ context: 'SUPPLIER_PROFILE' })

  const { mutate: updateProfile, isPending: isUpdatingProfile } = useMutation({
    mutationFn: async (data: ProfileFormData) => {
      const res = await usersControllerUpdateMe({
        body: {
          name: data.name || undefined,
          ...(data.email ? { email: data.email } : {}),
          ...(data.phone ? { phone: data.phone } : {}),
        },
      })
      if (res.error)
        throw new Error('Failed to update profile')
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] })
      toast.success(t('profile.toast.updated'))
    },
    onError: () => {
      toast.error(t('profile.toast.error'))
    },
  })

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file)
      return
    const result = await uploadAvatar(file)
    if (result?.publicUrl) {
      await usersControllerUpdateMe({ body: { image: result.publicUrl } })
      queryClient.invalidateQueries({ queryKey: ['profile'] })
      toast.success(t('profile.toast.photoUpdated'))
    }
    else {
      toast.error(t('profile.toast.photoError'))
    }
    e.target.value = ''
  }

  async function handleCoverChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file)
      return
    const result = await uploadCover(file)
    if (result?.publicUrl) {
      await client.put({ url: '/api/suppliers/me', body: { coverPhoto: result.publicUrl } })
      queryClient.invalidateQueries({ queryKey: ['supplier-settings'] })
      toast.success(t('profile.toast.coverUpdated'))
    }
    else {
      toast.error(t('profile.toast.photoError'))
    }
    e.target.value = ''
  }

  // ─── Settings mutations ───────────────────────────────

  const invalidateSettings = () => {
    queryClient.invalidateQueries({ queryKey: ['supplier-settings'] })
  }

  const { mutate: updateShopInfo, isPending: isUpdatingShopInfo } = useMutation({
    mutationFn: async (data: ShopInfoFormData) => {
      const response = await suppliersControllerUpdateMe({ body: data })
      if (response.error)
        throw new Error('Failed to update shop info')
      return response.data
    },
    onSuccess: () => {
      invalidateSettings()
      toast.success(t('settings.toast.shopInfoUpdated'))
    },
    onError: () => {
      toast.error(t('settings.toast.shopInfoError'))
    },
  })

  const { mutate: updateShopLocation, isPending: isUpdatingLocation } = useMutation({
    mutationFn: async (data: ShopLocationFormData) => {
      const response = await suppliersControllerUpdateMe({ body: data })
      if (response.error)
        throw new Error('Failed to update shop location')
      return response.data
    },
    onSuccess: () => {
      invalidateSettings()
      toast.success(t('settings.toast.locationUpdated'))
    },
    onError: () => {
      toast.error(t('settings.toast.locationError'))
    },
  })

  const { mutate: updateOpeningHours, isPending: isUpdatingHours } = useMutation({
    mutationFn: async (data: OpeningHoursFormData) => {
      const result = await client.patch({
        url: '/api/suppliers/me/settings/opening-hours',
        body: data,
      })
      return result.data
    },
    onSuccess: () => {
      invalidateSettings()
      toast.success(t('settings.toast.openingHoursUpdated'))
    },
    onError: () => {
      toast.error(t('settings.toast.openingHoursError'))
    },
  })

  const { mutate: addZone, isPending: isAddingZone } = useMutation({
    mutationFn: async (data: { deliveryFee: number, estimatedMinutes: number, polygon: Array<{ latitude: number, longitude: number }> }) => {
      const response = await suppliersControllerCreateDeliveryZone({ body: data })
      if (response.error)
        throw new Error('Failed to add delivery zone')
      return response.data
    },
    onSuccess: () => {
      invalidateSettings()
      toast.success(t('settings.toast.zoneAdded'))
    },
    onError: () => {
      toast.error(t('settings.toast.zoneError'))
    },
  })

  const { mutate: deleteZone, isPending: isDeletingZone } = useMutation({
    mutationFn: async (zoneId: string) => {
      const result = await client.delete({ url: `/api/suppliers/me/delivery-zones/${zoneId}` })
      return result.data
    },
    onSuccess: () => {
      invalidateSettings()
      toast.success(t('settings.toast.zoneDeleted'))
    },
    onError: () => {
      toast.error(t('settings.toast.zoneError'))
    },
  })

  const { mutate: updateMode, isPending: isUpdatingMode } = useMutation({
    mutationFn: async (mode: SupplierMode) => {
      const result = await client.patch({
        url: '/api/suppliers/me/settings/mode',
        body: { mode },
      })
      return result.data
    },
    onSuccess: () => {
      invalidateSettings()
      toast.success(t('settings.toast.modeUpdated'))
    },
    onError: () => {
      toast.error(t('settings.toast.modeError'))
    },
  })

  // ─── Loading state ────────────────────────────────────

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-64 rounded-lg" />
        <Skeleton className="h-48 w-full rounded-lg" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    )
  }

  const initials = profile?.name
    ? profile.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
    : '?'

  const displayEmail = isPlaceholderEmail(profile?.email ?? null) ? null : profile?.email

  // ─── Render ───────────────────────────────────────────

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold">{t('settings.title')}</h2>
        <p className="text-muted-foreground">{t('settings.description')}</p>
      </div>

      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile">
            <User className="h-4 w-4" />
            {t('settings.tabs.profile')}
          </TabsTrigger>
          <TabsTrigger value="shop">
            <Store className="h-4 w-4" />
            {t('settings.tabs.shop')}
          </TabsTrigger>
        </TabsList>

        {/* ─── Profile Tab ─────────────────────────────── */}
        <TabsContent value="profile" className="space-y-6">
          {/* Cover + Avatar header */}
          <Card className="overflow-hidden">
            <div className="relative h-36 bg-muted">
              {settings?.coverPhoto
                ? (
                    <img
                      src={settings.coverPhoto}
                      alt={t('profile.coverPhoto')}
                      className="h-full w-full object-cover"
                    />
                  )
                : (
                    <div className="flex h-full w-full items-center justify-center bg-gradient-to-r from-primary/10 to-primary/5" />
                  )}
              <button
                type="button"
                className="absolute right-3 top-3 flex h-9 items-center gap-1.5 rounded-md bg-background/80 px-3 text-sm font-medium shadow-sm backdrop-blur-sm hover:bg-background disabled:opacity-50"
                onClick={() => coverInputRef.current?.click()}
                disabled={uploadingCover}
              >
                {uploadingCover
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <ImagePlus className="h-4 w-4" />}
                {t('profile.changeCover')}
              </button>
              <input
                ref={coverInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleCoverChange}
              />
            </div>
            <CardContent className="relative pt-0">
              <div className="-mt-10 flex items-end gap-4">
                <div className="relative">
                  {profile?.image
                    ? (
                        <img
                          src={profile.image}
                          alt={profile.name}
                          className="h-20 w-20 rounded-full border-4 border-background object-cover"
                        />
                      )
                    : (
                        <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full border-4 border-background bg-primary text-xl font-bold text-primary-foreground">
                          {initials}
                        </div>
                      )}
                  <button
                    type="button"
                    className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80 disabled:opacity-50"
                    onClick={() => avatarInputRef.current?.click()}
                    disabled={uploadingAvatar}
                  >
                    {uploadingAvatar
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <Camera className="h-4 w-4" />}
                  </button>
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleAvatarChange}
                  />
                </div>
                <div className="pb-1">
                  <p className="text-lg font-semibold">{profile?.name}</p>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    {displayEmail && <span>{displayEmail}</span>}
                    {displayEmail && profile?.phone && <span>&middot;</span>}
                    {profile?.phone && <span>{profile.phone}</span>}
                  </div>
                  {profile?.role && (
                    <Badge variant="secondary" className="mt-1">
                      {t(`profile.roles.${profile.role}`)}
                    </Badge>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Personal info form */}
          <Card>
            <CardHeader>
              <CardTitle>{t('profile.personalInfo')}</CardTitle>
            </CardHeader>
            <CardContent>
              <ProfileForm
                onSubmit={updateProfile}
                isPending={isUpdatingProfile}
                initialData={{
                  name: profile?.name ?? '',
                  email: displayEmail ?? '',
                  phone: profile?.phone ?? '',
                }}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Shop Tab ────────────────────────────────── */}
        <TabsContent value="shop" className="space-y-6">
          <Can action="update" subject="Supplier">
            <Card>
              <CardHeader>
                <CardTitle>{t('settings.shopInfo.title')}</CardTitle>
                <CardDescription>{t('settings.shopInfo.description')}</CardDescription>
              </CardHeader>
              <CardContent>
                <ShopInfoForm
                  onSubmit={updateShopInfo}
                  isPending={isUpdatingShopInfo}
                  initialData={{
                    shopName: settings?.shopName ?? '',
                    address: settings?.address ?? '',
                    neighborhood: settings?.neighborhood ?? '',
                    mobileMoneyNumber: settings?.mobileMoneyNumber ?? '',
                    deliveryFee: settings?.deliveryFee ?? 0,
                    freeDeliveryFrom: settings?.freeDeliveryFrom ?? null,
                  }}
                />
              </CardContent>
            </Card>

            <Separator />

            <Card>
              <CardHeader>
                <CardTitle>{t('settings.location.title')}</CardTitle>
                <CardDescription>{t('settings.location.description')}</CardDescription>
              </CardHeader>
              <CardContent>
                <ShopLocationForm
                  onSubmit={updateShopLocation}
                  isPending={isUpdatingLocation}
                  initialData={{
                    latitude: settings?.latitude ?? null,
                    longitude: settings?.longitude ?? null,
                  }}
                />
              </CardContent>
            </Card>

            <Separator />

            <Card>
              <CardHeader>
                <CardTitle>{t('settings.salesPoints.title')}</CardTitle>
                <CardDescription>{t('settings.salesPoints.description')}</CardDescription>
              </CardHeader>
              <CardContent>
                <SalesPointsManager />
              </CardContent>
            </Card>

            <Separator />

            <Card>
              <CardHeader>
                <CardTitle>{t('settings.openingHours.title')}</CardTitle>
                <CardDescription>{t('settings.openingHours.description')}</CardDescription>
              </CardHeader>
              <CardContent>
                <OpeningHoursForm
                  onSubmit={updateOpeningHours}
                  isPending={isUpdatingHours}
                  initialData={settings?.openingHours ?? undefined}
                />
              </CardContent>
            </Card>

            <Separator />

            <Card>
              <CardHeader>
                <CardTitle>{t('settings.deliveryZones.title')}</CardTitle>
                <CardDescription>{t('settings.deliveryZones.description')}</CardDescription>
              </CardHeader>
              <CardContent>
                <DeliveryZones
                  zones={settings?.deliveryZones ?? []}
                  onAdd={addZone}
                  onDelete={deleteZone}
                  isPending={isAddingZone || isDeletingZone}
                />
              </CardContent>
            </Card>

            <Separator />

            <Card>
              <CardHeader>
                <CardTitle>{t('settings.mode.title')}</CardTitle>
                <CardDescription>{t('settings.mode.description')}</CardDescription>
              </CardHeader>
              <CardContent>
                <ModeSelector
                  currentMode={settings?.mode ?? 'CONTACT'}
                  onModeChange={updateMode}
                  isPending={isUpdatingMode}
                />
              </CardContent>
            </Card>
          </Can>
        </TabsContent>
      </Tabs>
    </div>
  )
}

import ChevronRight from 'lucide-react-native/dist/esm/icons/chevron-right'
import Clock from 'lucide-react-native/dist/esm/icons/clock'
import MapPin from 'lucide-react-native/dist/esm/icons/map-pin'
import Pencil from 'lucide-react-native/dist/esm/icons/pencil'
import Store from 'lucide-react-native/dist/esm/icons/store'
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { colors, fonts, radius, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { ScreenHeader } from '../../common/components/screen-header'

interface SupplierSettingsScreenProps {
  onGoBack: () => void
  onNavigateToShopProfile: () => void
  onNavigateToOpeningHours: () => void
  onNavigateToDeliveryZones: () => void
  onNavigateToMode: () => void
}

export function SupplierSettingsScreen({
  onGoBack,
  onNavigateToShopProfile,
  onNavigateToOpeningHours,
  onNavigateToDeliveryZones,
  onNavigateToMode,
}: SupplierSettingsScreenProps) {
  const { semantic } = useTheme()

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: semantic.bgPage }]}
      contentContainerStyle={styles.content}
    >
      <ScreenHeader title="Paramètres boutique" onBack={onGoBack} />

      <View style={[styles.menuGroup, { backgroundColor: semantic.bgCard }]}>
        <TouchableOpacity style={styles.menuItem} onPress={onNavigateToShopProfile} activeOpacity={0.6}>
          <View style={[styles.menuIcon, { backgroundColor: colors.coral[50] }]}>
            <Pencil size={18} color={colors.coral[600]} />
          </View>
          <View style={styles.menuTextContainer}>
            <Text style={[styles.menuLabel, { color: semantic.textPrimary }]}>Profil de la boutique</Text>
            <Text style={[styles.menuSublabel, { color: semantic.textTertiary }]}>Nom, photos, adresse, contact</Text>
          </View>
          <ChevronRight size={18} color={semantic.textTertiary} />
        </TouchableOpacity>

        <View style={styles.menuDivider} />

        <TouchableOpacity style={styles.menuItem} onPress={onNavigateToOpeningHours} activeOpacity={0.6}>
          <View style={[styles.menuIcon, { backgroundColor: colors.green[50] }]}>
            <Clock size={18} color={colors.green[600]} />
          </View>
          <View style={styles.menuTextContainer}>
            <Text style={[styles.menuLabel, { color: semantic.textPrimary }]}>Horaires d'ouverture</Text>
            <Text style={[styles.menuSublabel, { color: semantic.textTertiary }]}>Définir vos jours et heures</Text>
          </View>
          <ChevronRight size={18} color={semantic.textTertiary} />
        </TouchableOpacity>

        <View style={styles.menuDivider} />

        <TouchableOpacity style={styles.menuItem} onPress={onNavigateToDeliveryZones} activeOpacity={0.6}>
          <View style={[styles.menuIcon, { backgroundColor: colors.blue[50] }]}>
            <MapPin size={18} color={colors.blue[600]} />
          </View>
          <View style={styles.menuTextContainer}>
            <Text style={[styles.menuLabel, { color: semantic.textPrimary }]}>Zones de livraison</Text>
            <Text style={[styles.menuSublabel, { color: semantic.textTertiary }]}>Gérer vos zones et frais</Text>
          </View>
          <ChevronRight size={18} color={semantic.textTertiary} />
        </TouchableOpacity>

        <View style={styles.menuDivider} />

        <TouchableOpacity style={styles.menuItem} onPress={onNavigateToMode} activeOpacity={0.6}>
          <View style={[styles.menuIcon, { backgroundColor: colors.earth[50] }]}>
            <Store size={18} color={colors.earth[600]} />
          </View>
          <View style={styles.menuTextContainer}>
            <Text style={[styles.menuLabel, { color: semantic.textPrimary }]}>Mode de fonctionnement</Text>
            <Text style={[styles.menuSublabel, { color: semantic.textTertiary }]}>Contact direct ou commande</Text>
          </View>
          <ChevronRight size={18} color={semantic.textTertiary} />
        </TouchableOpacity>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingBottom: spacing[10] },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[4],
  },
  headerTitle: { ...typography.h2 },
  menuGroup: {
    marginHorizontal: spacing[4],
    borderRadius: radius.lg,
    overflow: 'hidden',
    marginTop: spacing[4],
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[4],
    gap: spacing[3],
  },
  menuIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuTextContainer: { flex: 1 },
  menuLabel: { ...typography.bodyL, fontFamily: fonts.sansMd },
  menuSublabel: { ...typography.caption, marginTop: 2 },
  menuDivider: {
    height: 1,
    backgroundColor: colors.neutral[100],
    marginLeft: spacing[4] + 40 + spacing[3],
  },
})

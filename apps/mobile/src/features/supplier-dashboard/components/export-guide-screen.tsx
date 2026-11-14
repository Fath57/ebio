import type { ReactNode } from 'react'
import type { ExportCriteriaGuide } from '../utils/terroir-export'
import { BottomTabBarHeightContext } from '@react-navigation/bottom-tabs'
import Camera from 'lucide-react-native/dist/esm/icons/camera'
import Check from 'lucide-react-native/dist/esm/icons/check'
import CircleCheck from 'lucide-react-native/dist/esm/icons/circle-check'
import CircleX from 'lucide-react-native/dist/esm/icons/circle-x'
import PackageCheck from 'lucide-react-native/dist/esm/icons/package-check'
import Plane from 'lucide-react-native/dist/esm/icons/plane'
import Tag from 'lucide-react-native/dist/esm/icons/tag'
import Wallet from 'lucide-react-native/dist/esm/icons/wallet'
import X from 'lucide-react-native/dist/esm/icons/x'
import { use, useEffect, useState } from 'react'
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native'
import { colors, fonts, radius, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { ScreenHeader } from '../../common/components/screen-header'
import { formatWeight, loadExportCriteriaGuide } from '../utils/terroir-export'

/** Thresholds shown when the API cannot be reached: the wording stays general. */
const UNKNOWN = '…'

interface SectionProps {
  icon: ReactNode
  iconBackground: string
  title: string
  children: ReactNode
}

function Section({ icon, iconBackground, title, children }: SectionProps) {
  const { semantic } = useTheme()
  return (
    <View style={[styles.section, { backgroundColor: semantic.bgCard }]}>
      <View style={styles.sectionHead}>
        <View style={[styles.sectionIcon, { backgroundColor: iconBackground }]}>{icon}</View>
        <Text style={[styles.sectionTitle, { color: semantic.textPrimary }]} accessibilityRole="header">{title}</Text>
      </View>
      {children}
    </View>
  )
}

interface PointProps {
  ok?: boolean
  children: string
}

/** One short rule, with a tick (allowed, to do) or a cross (not allowed). */
function Point({ ok = true, children }: PointProps) {
  const { semantic } = useTheme()
  return (
    <View style={styles.point}>
      {ok
        ? <CircleCheck size={18} color={colors.green[600]} />
        : <CircleX size={18} color={colors.coral[600]} />}
      <Text style={[styles.pointText, { color: semantic.textPrimary }]}>{children}</Text>
    </View>
  )
}

interface LabelSketchProps {
  good: boolean
}

/** A drawn label: a good photo is straight and sharp, a bad one tilted, faded and shaded. */
function LabelSketch({ good }: LabelSketchProps) {
  const { semantic } = useTheme()
  const ink = good ? colors.neutral[800] : colors.neutral[400]
  return (
    <View style={[styles.sketchFrame, { borderColor: good ? colors.green[400] : colors.coral[400], backgroundColor: semantic.bgPage }]}>
      <View style={[styles.sketchLabel, !good && styles.sketchTilted, { opacity: good ? 1 : 0.55 }]}>
        <View style={[styles.sketchTitle, { backgroundColor: ink }]} />
        <View style={[styles.sketchLine, { backgroundColor: ink, width: '90%' }]} />
        <View style={[styles.sketchLine, { backgroundColor: ink, width: '75%' }]} />
        <View style={[styles.sketchLine, { backgroundColor: ink, width: '82%' }]} />
        <View style={styles.sketchDates}>
          <View style={[styles.sketchDate, { borderColor: good ? colors.green[600] : ink }]} />
          <View style={[styles.sketchDate, { borderColor: good ? colors.green[600] : ink }]} />
        </View>
      </View>
      {!good ? <View style={styles.sketchShadow} /> : null}
      <View style={[styles.sketchBadge, { backgroundColor: good ? colors.green[600] : colors.coral[600] }]}>
        {good
          ? <Check size={14} color={colors.neutral[0]} strokeWidth={3} />
          : <X size={14} color={colors.neutral[0]} strokeWidth={3} />}
      </View>
    </View>
  )
}

interface ExportGuideScreenProps {
  onGoBack: () => void
}

/**
 * « Vendre à l’étranger : le guide », for shop owners: what can travel, how
 * to pack and label, how to photograph the label, how they are paid. The
 * thresholds and banned categories come from the API, as the criteria do.
 */
export function ExportGuideScreen({ onGoBack }: ExportGuideScreenProps) {
  const { semantic } = useTheme()
  const tabBarHeight = use(BottomTabBarHeightContext) ?? 0
  const [guide, setGuide] = useState<ExportCriteriaGuide | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    loadExportCriteriaGuide()
      .then((loaded) => {
        if (!cancelled)
          setGuide(loaded)
      })
      .finally(() => {
        if (!cancelled)
          setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const days = guide ? String(guide.minShelfLifeDays) : UNKNOWN
  const maxWeight = guide ? formatWeight(guide.maxUnitWeightG) : UNKNOWN
  const body = [styles.body, { color: semantic.textSecondary }]

  return (
    <View style={[styles.container, { backgroundColor: semantic.bgPage }]}>
      <ScreenHeader title="Vendre à l’étranger" subtitle="Le guide" onBack={onGoBack} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: tabBarHeight + spacing[10] }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.lead, { color: semantic.textPrimary }]}>
          Vos produits peuvent partir dans la Valise du pays, chez les clients qui vivent à l’étranger.
        </Text>
        <Text style={body}>
          Il n’y a pas de validation à attendre : dès que votre produit remplit tous les points de sa fiche export, il apparaît tout seul dans la Valise. eBio surveille le catalogue et peut retirer un produit en vous donnant la raison.
        </Text>
        {isLoading ? <ActivityIndicator style={styles.loader} color={colors.green[400]} /> : null}

        <Section icon={<Plane size={20} color={colors.green[600]} />} iconBackground={colors.green[50]} title="Ce qui peut voyager">
          <Point>Les produits secs ou transformés : farines, épices, gari, beurre de karité, savons, confitures…</Point>
          <Point>{`Les produits qui se gardent au moins ${days} jours.`}</Point>
          <Point>Les produits qui se conservent à température ambiante, sans frigo.</Point>
        </Section>

        <Section icon={<CircleX size={20} color={colors.coral[600]} />} iconBackground={colors.coral[50]} title="Ce qui ne peut pas voyager">
          <Point ok={false}>Les produits frais : fruits, légumes, viande, poisson, lait.</Point>
          <Point ok={false}>Les produits à garder au frais ou congelés.</Point>
          {guide && guide.bannedCategories.length > 0
            ? (
                <>
                  <Text style={[styles.subTitle, { color: semantic.textPrimary }]}>Catégories exclues :</Text>
                  <View style={styles.chips}>
                    {guide.bannedCategories.map(category => (
                      <View key={category.slug || category.name} style={[styles.chip, { backgroundColor: semantic.bgPage, borderColor: semantic.borderNormal }]}>
                        <Text style={[styles.chipText, { color: semantic.textPrimary }]}>{category.name}</Text>
                      </View>
                    ))}
                  </View>
                </>
              )
            : null}
        </Section>

        <Section icon={<PackageCheck size={20} color={colors.earth[600]} />} iconBackground={colors.earth[50]} title="Comment emballer">
          <Point>Chaque unité est fermée et scellée : un pot, un sachet ou une bouteille qui ne peut pas s’ouvrir en route.</Point>
          <Point>Un emballage solide, qui supporte les chocs et la pression dans la valise.</Point>
          <Point>{`Une unité emballée pèse ${maxWeight} au plus. Pesez-la avec son emballage.`}</Point>
        </Section>

        <Section icon={<Tag size={20} color={colors.blue[600]} />} iconBackground={colors.blue[50]} title="Comment étiqueter">
          <Point>L’étiquette est écrite en français.</Point>
          <Point>Elle donne la liste des ingrédients.</Point>
          <Point>Elle signale les allergènes (arachide, sésame, lait…), ou vous déclarez qu’il n’y en a aucun.</Point>
          <Point>La date de fabrication et la date limite sont imprimées sur chaque unité.</Point>
          <Point>Le nom du producteur et le lieu de fabrication sont indiqués.</Point>
          <Text style={body}>
            Les ingrédients se saisissent dans la fiche du produit (Composition et conservation), le reste dans « Vendre à l’étranger ».
          </Text>
        </Section>

        <Section icon={<Camera size={20} color={colors.blue[600]} />} iconBackground={colors.blue[50]} title="La photo de l’étiquette">
          <Point>Prenez l’étiquette de face, bien droite.</Point>
          <Point>Les dates doivent être lisibles sur la photo.</Point>
          <Point>Photographiez à la lumière du jour, sans ombre ni reflet.</Point>
          <View style={styles.sketchRow}>
            <View style={styles.sketchColumn}>
              <LabelSketch good />
              <Text style={[styles.sketchCaption, { color: colors.green[800] }]}>Bonne photo</Text>
              <Text style={[styles.sketchHint, { color: semantic.textSecondary }]}>De face, nette, dates lisibles</Text>
            </View>
            <View style={styles.sketchColumn}>
              <LabelSketch good={false} />
              <Text style={[styles.sketchCaption, { color: colors.coral[600] }]}>Photo à refaire</Text>
              <Text style={[styles.sketchHint, { color: semantic.textSecondary }]}>De travers, floue ou dans l’ombre</Text>
            </View>
          </View>
        </Section>

        <Section icon={<Wallet size={20} color={colors.green[600]} />} iconBackground={colors.green[50]} title="Comment vous êtes payé">
          <Point>Vous préparez la commande, puis eBio vient la collecter dans votre boutique.</Point>
          <Point>Votre part est versée au moment de la collecte, comme pour une commande habituelle.</Point>
          <Point>Vous recevez seulement votre part : le prix de vos produits. Le transport, l’assurance et la livraison à l’étranger sont payés par le client à eBio. Vous n’avancez rien.</Point>
        </Section>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: spacing[4], paddingTop: spacing[2], gap: spacing[3] },
  lead: { ...typography.h3 },
  body: { ...typography.bodyS },
  loader: { marginTop: spacing[2] },

  section: { borderRadius: radius.lg, padding: spacing[4], gap: spacing[3] },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  sectionIcon: { width: 40, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { ...typography.h3, flex: 1 },
  subTitle: { ...typography.bodyS, fontFamily: fonts.sansSb },

  point: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing[2] },
  pointText: { ...typography.bodyS, flex: 1 },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  chip: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: spacing[3], paddingVertical: spacing[1] },
  chipText: { ...typography.caption },

  sketchRow: { flexDirection: 'row', gap: spacing[3], marginTop: spacing[1] },
  sketchColumn: { flex: 1, alignItems: 'center', gap: spacing[1] },
  sketchFrame: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderWidth: 2,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  sketchLabel: {
    width: '62%',
    aspectRatio: 1.3,
    borderRadius: radius.sm,
    backgroundColor: colors.neutral[0],
    borderWidth: 1,
    borderColor: colors.neutral[200],
    padding: spacing[2],
    gap: spacing[1],
  },
  sketchTilted: { transform: [{ rotate: '-14deg' }, { translateX: 8 }] },
  sketchTitle: { height: 6, width: '55%', borderRadius: 3, marginBottom: 2 },
  sketchLine: { height: 3, borderRadius: 2 },
  sketchDates: { flexDirection: 'row', gap: spacing[1], marginTop: 'auto' },
  sketchDate: { flex: 1, height: 8, borderWidth: 1.5, borderRadius: 2 },
  sketchShadow: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: '60%',
    height: '65%',
    borderTopLeftRadius: 999,
    backgroundColor: 'rgba(20, 20, 16, 0.28)',
  },
  sketchBadge: {
    position: 'absolute',
    top: spacing[2],
    right: spacing[2],
    width: 24,
    height: 24,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sketchCaption: { ...typography.bodyS, fontFamily: fonts.sansSb },
  sketchHint: { ...typography.caption, textAlign: 'center' },
})

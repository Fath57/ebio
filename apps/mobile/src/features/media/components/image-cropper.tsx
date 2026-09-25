import { useEffect, useRef, useState } from 'react'
import {
  Animated,
  Image,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { radius, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'

/** Zone conservée, en fractions de l'image (0 à 1). Découpée par l'API. */
export interface CropRect {
  x: number
  y: number
  width: number
  height: number
}

export interface CropRequest {
  uri: string
  /** Dimensions connues du fichier ; sinon elles sont lues sur l'image. */
  width?: number
  height?: number
  /** Ratio imposé. Sans lui, l'utilisateur choisit parmi les formats proposés. */
  aspect?: readonly [number, number]
}

export interface CropResult {
  cancelled: boolean
  /** `null` quand l'image est gardée entière : rien à découper côté serveur. */
  crop: CropRect | null
}

interface PendingRequest {
  request: CropRequest
  resolve: (result: CropResult) => void
}

const RATIO_CHOICES = [
  { label: 'Image entière', value: null },
  { label: 'Carré', value: 1 },
  { label: '4:3', value: 4 / 3 },
  { label: '16:9', value: 16 / 9 },
] as const

const MIN_SCALE = 1
const MAX_SCALE = 5
/** Un appui sur − ou + : assez pour sentir l'effet, assez fin pour viser. */
const ZOOM_STEP = 0.25
/** En deçà, le rectangle couvre l'image : inutile de faire travailler sharp. */
const WHOLE_IMAGE_EPSILON = 0.005

let showHandler: ((pending: PendingRequest) => void) | null = null

/**
 * Ouvre l'écran de recadrage et attend la décision de l'utilisateur.
 *
 * L'éditeur natif d'Android cachait ses poignées de redimensionnement et
 * changeait d'un téléphone à l'autre ; celui-ci est le même partout. Le
 * découpage réel des pixels se fait côté API, avec sharp : le téléphone
 * n'envoie qu'un rectangle, et l'application n'a besoin d'aucun module natif
 * supplémentaire.
 *
 * Fonctionne depuis n'importe où tant que `<ImageCropperHost />` est monté au
 * root, comme `appAlert`.
 */
export function requestImageCrop(request: CropRequest): Promise<CropResult> {
  return new Promise((resolve) => {
    if (!showHandler) {
      // Hôte absent : on n'empêche pas l'envoi de la photo pour autant.
      resolve({ cancelled: false, crop: null })
      return
    }
    showHandler({ request, resolve })
  })
}

export function ImageCropperHost(): React.JSX.Element {
  const { semantic } = useTheme()
  const [pending, setPending] = useState<PendingRequest | null>(null)
  const [source, setSource] = useState<{ width: number, height: number } | null>(null)
  const [ratio, setRatio] = useState<number | null>(null)

  useEffect(() => {
    showHandler = setPending
    return () => {
      showHandler = null
    }
  }, [])

  // Dimensions du fichier : fournies par le sélecteur, sinon lues ici.
  useEffect(() => {
    if (!pending) {
      setSource(null)
      return
    }
    const { uri, width, height, aspect } = pending.request
    setRatio(aspect ? aspect[0] / aspect[1] : null)
    if (width && height) {
      setSource({ width, height })
      return
    }
    let cancelled = false
    Image.getSize(
      uri,
      (measuredWidth, measuredHeight) => {
        if (!cancelled) {
          setSource({ width: measuredWidth, height: measuredHeight })
        }
      },
      () => {
        if (!cancelled) {
          // Sans dimensions, le rectangle n'a aucun sens : on garde l'image.
          pending.resolve({ cancelled: false, crop: null })
          setPending(null)
        }
      },
    )
    return () => {
      cancelled = true
    }
  }, [pending])

  function finish(result: CropResult): void {
    pending?.resolve(result)
    setPending(null)
  }

  const isLocked = pending?.request.aspect != null

  return (
    <Modal
      visible={pending !== null}
      transparent={false}
      animationType="slide"
      statusBarTranslucent
      onRequestClose={() => finish({ cancelled: true, crop: null })}
    >
      <View style={[styles.screen, { backgroundColor: '#101010' }]}>
        <View style={styles.header}>
          <Pressable
            onPress={() => finish({ cancelled: true, crop: null })}
            style={styles.headerButton}
            accessibilityRole="button"
            accessibilityLabel="Annuler le recadrage"
          >
            <Text style={styles.headerCancel}>Annuler</Text>
          </Pressable>
          <Text style={styles.headerTitle}>Recadrer</Text>
          <View style={styles.headerButton} />
        </View>

        {pending && source && (
          <CropStage
            uri={pending.request.uri}
            imageWidth={source.width}
            imageHeight={source.height}
            ratio={ratio ?? source.width / source.height}
            isWholeImage={ratio === null}
            onConfirm={crop => finish({ cancelled: false, crop })}
          />
        )}

        <View style={styles.footer}>
          {!isLocked && (
            <View style={styles.ratioRow}>
              {RATIO_CHOICES.map(choice => (
                <Pressable
                  key={choice.label}
                  onPress={() => setRatio(choice.value)}
                  style={[
                    styles.ratioChip,
                    ratio === choice.value && { backgroundColor: semantic.colorPrimary, borderColor: semantic.colorPrimary },
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: ratio === choice.value }}
                >
                  <Text style={[styles.ratioLabel, ratio === choice.value && styles.ratioLabelActive]}>
                    {choice.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
          <Text style={styles.hint}>
            Faites glisser pour déplacer, pincez ou utilisez − et + pour zoomer.
          </Text>
        </View>
      </View>
    </Modal>
  )
}

interface CropStageProps {
  uri: string
  imageWidth: number
  imageHeight: number
  ratio: number
  isWholeImage: boolean
  onConfirm: (crop: CropRect | null) => void
}

/**
 * Le cadre reste fixe et l'image bouge dessous, à la manière des éditeurs
 * connus : ce qui sera coupé reste visible, assombri, au lieu de disparaître.
 */
function CropStage({ uri, imageWidth, imageHeight, ratio, isWholeImage, onConfirm }: CropStageProps) {
  const { semantic } = useTheme()
  // La scène est mesurée, jamais devinée : calculer le cadre depuis
  // `Dimensions` donnait une hauteur différente de celle réellement occupée
  // (barre système, modale plein écran), et le cadre dessiné ne tombait alors
  // plus au même endroit que le rectangle envoyé à l'API — on recadrait autre
  // chose que ce qu'on voyait.
  const [stage, setStage] = useState<{ width: number, height: number } | null>(null)

  const translate = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current
  const scale = useRef(new Animated.Value(1)).current
  // Niveau affiché par la jauge. Mis à jour au relâchement seulement : le
  // suivre pendant le pincement re-rendrait à chaque déplacement de doigt.
  const [zoom, setZoom] = useState(1)
  // Les gestes lisent et écrivent ces valeurs : un état React re-rendrait à
  // chaque doigt qui bouge.
  const transform = useRef({ x: 0, y: 0, scale: 1 })
  const gestureStart = useRef({ x: 0, y: 0, scale: 1, distance: 0 })

  const frame = stage ? computeFrame(ratio, stage) : null
  const base = frame ? coverSize(frame, imageWidth / imageHeight) : null
  // Le PanResponder n'est créé qu'une fois : sans cette référence il bornerait
  // encore sur le cadre du premier rendu après un changement de format.
  const geometry = useRef<{ frame: Frame, base: { width: number, height: number } } | null>(null)
  if (frame && base) {
    geometry.current = { frame, base }
  }

  // Changer de format repart d'une image centrée, sinon le cadrage précédent
  // se retrouve appliqué à un cadre qui n'a plus la même forme.
  useEffect(() => {
    transform.current = { x: 0, y: 0, scale: 1 }
    translate.setValue({ x: 0, y: 0 })
    scale.setValue(1)
    setZoom(1)
  }, [ratio, scale, translate])

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (event) => {
        const touches = event.nativeEvent.touches
        gestureStart.current = {
          x: transform.current.x,
          y: transform.current.y,
          scale: transform.current.scale,
          distance: touches.length >= 2 ? touchDistance(touches) : 0,
        }
      },
      onPanResponderMove: (event, gesture) => {
        const touches = event.nativeEvent.touches
        if (touches.length >= 2) {
          const distance = touchDistance(touches)
          if (gestureStart.current.distance === 0) {
            gestureStart.current.distance = distance
            gestureStart.current.scale = transform.current.scale
            return
          }
          const next = clamp(
            gestureStart.current.scale * (distance / gestureStart.current.distance),
            MIN_SCALE,
            MAX_SCALE,
          )
          transform.current.scale = next
          scale.setValue(next)
          return
        }
        transform.current.x = gestureStart.current.x + gesture.dx
        transform.current.y = gestureStart.current.y + gesture.dy
        translate.setValue({ x: transform.current.x, y: transform.current.y })
      },
      onPanResponderRelease: () => {
        // Un doigt relâché après un pincement laisse une distance périmée.
        gestureStart.current.distance = 0
        const current = geometry.current
        if (!current) {
          return
        }
        const bounded = clampToFrame(transform.current, current.base, current.frame)
        transform.current = bounded
        setZoom(bounded.scale)
        Animated.parallel([
          Animated.spring(translate, {
            toValue: { x: bounded.x, y: bounded.y },
            useNativeDriver: true,
            friction: 8,
          }),
          Animated.spring(scale, {
            toValue: bounded.scale,
            useNativeDriver: true,
            friction: 8,
          }),
        ]).start()
      },
    }),
  ).current

  /** Pas de zoom des boutons. Le cadrage suit, sinon un dézoom laisse un trou. */
  function zoomBy(delta: number): void {
    const current = geometry.current
    if (!current) {
      return
    }
    const next = clampToFrame(
      { ...transform.current, scale: transform.current.scale + delta },
      current.base,
      current.frame,
    )
    transform.current = next
    setZoom(next.scale)
    Animated.parallel([
      Animated.spring(scale, { toValue: next.scale, useNativeDriver: true, friction: 8 }),
      Animated.spring(translate, { toValue: { x: next.x, y: next.y }, useNativeDriver: true, friction: 8 }),
    ]).start()
  }

  function handleConfirm(): void {
    const current = geometry.current
    if (!current) {
      onConfirm(null)
      return
    }
    const crop = toCropRect(transform.current, current.base, current.frame)
    onConfirm(isWholeImage && isWholeImageCrop(crop) ? null : crop)
  }

  return (
    <>
      <View
        style={styles.stage}
        onLayout={(event) => {
          const { width, height } = event.nativeEvent.layout
          setStage(previous => (previous?.width === width && previous?.height === height ? previous : { width, height }))
        }}
        {...panResponder.panHandlers}
      >
        {frame && base && (
          <>
            <Animated.Image
              source={{ uri }}
              resizeMode="cover"
              style={{
                width: base.width,
                height: base.height,
                transform: [
                  { translateX: translate.x },
                  { translateY: translate.y },
                  { scale },
                ],
              }}
            />
            {/* Masque : quatre bandes sombres qui laissent le cadre en clair.
                Dimensionnées en pixels mesurés, pour coller exactement au
                rectangle que l'API va découper. */}
            <View pointerEvents="none" style={StyleSheet.absoluteFill}>
              <View style={[styles.shade, { height: (stageHeightOf(stage) - frame.height) / 2 }]} />
              <View style={{ flexDirection: 'row', height: frame.height }}>
                <View style={[styles.shade, { width: (stageWidthOf(stage) - frame.width) / 2 }]} />
                <View style={[styles.frame, { width: frame.width }]} />
                <View style={[styles.shade, { width: (stageWidthOf(stage) - frame.width) / 2 }]} />
              </View>
              <View style={[styles.shade, { height: (stageHeightOf(stage) - frame.height) / 2 }]} />
            </View>
          </>
        )}
      </View>
      <View style={styles.zoomRow}>
        <Pressable
          onPress={() => zoomBy(-ZOOM_STEP)}
          disabled={zoom <= MIN_SCALE}
          style={[styles.zoomButton, zoom <= MIN_SCALE && styles.zoomButtonDisabled]}
          accessibilityRole="button"
          accessibilityLabel="Dézoomer"
        >
          <Text style={styles.zoomSign}>−</Text>
        </Pressable>
        <View style={styles.zoomTrack}>
          <View
            style={[
              styles.zoomFill,
              {
                backgroundColor: semantic.colorPrimary,
                width: `${((zoom - MIN_SCALE) / (MAX_SCALE - MIN_SCALE)) * 100}%`,
              },
            ]}
          />
        </View>
        <Pressable
          onPress={() => zoomBy(ZOOM_STEP)}
          disabled={zoom >= MAX_SCALE}
          style={[styles.zoomButton, zoom >= MAX_SCALE && styles.zoomButtonDisabled]}
          accessibilityRole="button"
          accessibilityLabel="Zoomer"
        >
          <Text style={styles.zoomSign}>+</Text>
        </Pressable>
        <Text style={styles.zoomValue}>
          {zoom.toFixed(1)}
          ×
        </Text>
      </View>
      <Pressable
        onPress={handleConfirm}
        style={[styles.confirm, { backgroundColor: semantic.colorPrimary }]}
        accessibilityRole="button"
        accessibilityLabel="Valider le recadrage"
      >
        <Text style={styles.confirmText}>Valider</Text>
      </Pressable>
    </>
  )
}

function stageWidthOf(stage: { width: number, height: number } | null): number {
  return stage?.width ?? 0
}

function stageHeightOf(stage: { width: number, height: number } | null): number {
  return stage?.height ?? 0
}

interface Frame {
  width: number
  height: number
}

interface Transform {
  x: number
  y: number
  scale: number
}

const STAGE_PADDING = spacing[5]

/** Le plus grand cadre au bon format qui tienne dans la scène mesurée. */
function computeFrame(ratio: number, stage: { width: number, height: number }): Frame {
  const availableWidth = stage.width - STAGE_PADDING * 2
  const availableHeight = stage.height - STAGE_PADDING * 2
  let width = availableWidth
  let height = width / ratio
  if (height > availableHeight) {
    height = availableHeight
    width = height * ratio
  }
  return { width, height }
}

/** Taille de l'image à l'échelle 1 : elle couvre le cadre, sans bande vide. */
function coverSize(frame: Frame, imageRatio: number): { width: number, height: number } {
  const byWidth = { width: frame.width, height: frame.width / imageRatio }
  return byWidth.height >= frame.height
    ? byWidth
    : { width: frame.height * imageRatio, height: frame.height }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max))
}

function touchDistance(touches: { pageX: number, pageY: number }[]): number {
  const [first, second] = touches
  return Math.hypot(second.pageX - first.pageX, second.pageY - first.pageY)
}

/** Ramène l'image pour qu'elle couvre toujours le cadre, sans trou. */
function clampToFrame(current: Transform, base: { width: number, height: number }, frame: Frame): Transform {
  const scale = clamp(current.scale, MIN_SCALE, MAX_SCALE)
  const maxX = Math.max(0, (base.width * scale - frame.width) / 2)
  const maxY = Math.max(0, (base.height * scale - frame.height) / 2)
  return {
    scale,
    x: clamp(current.x, -maxX, maxX),
    y: clamp(current.y, -maxY, maxY),
  }
}

/** Traduit la position à l'écran en fractions de l'image d'origine. */
function toCropRect(current: Transform, base: { width: number, height: number }, frame: Frame): CropRect {
  const bounded = clampToFrame(current, base, frame)
  const renderedWidth = base.width * bounded.scale
  const renderedHeight = base.height * bounded.scale
  // Le cadre est centré : son coin haut-gauche, vu depuis l'image, dépend du
  // décalage appliqué par l'utilisateur.
  const offsetX = (renderedWidth - frame.width) / 2 - bounded.x
  const offsetY = (renderedHeight - frame.height) / 2 - bounded.y
  return {
    x: clamp(offsetX / renderedWidth, 0, 1),
    y: clamp(offsetY / renderedHeight, 0, 1),
    width: clamp(frame.width / renderedWidth, 0, 1),
    height: clamp(frame.height / renderedHeight, 0, 1),
  }
}

function isWholeImageCrop(crop: CropRect): boolean {
  return crop.x <= WHOLE_IMAGE_EPSILON
    && crop.y <= WHOLE_IMAGE_EPSILON
    && crop.width >= 1 - WHOLE_IMAGE_EPSILON
    && crop.height >= 1 - WHOLE_IMAGE_EPSILON
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing[10],
    paddingBottom: spacing[3],
    paddingHorizontal: spacing[4],
  },
  headerButton: {
    minWidth: 80,
    minHeight: 44,
    justifyContent: 'center',
  },
  headerCancel: {
    ...typography.bodyL,
    color: '#FFFFFF',
  },
  headerTitle: {
    ...typography.h3,
    color: '#FFFFFF',
  },
  stage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  shade: {
    flex: 1,
    backgroundColor: 'rgba(16, 16, 16, 0.72)',
  },
  frame: {
    height: '100%',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    borderRadius: radius.xs,
  },
  zoomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    marginHorizontal: spacing[5],
    marginTop: spacing[4],
  },
  zoomButton: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomButtonDisabled: {
    opacity: 0.3,
  },
  zoomSign: {
    ...typography.h2,
    color: '#FFFFFF',
    lineHeight: 26,
  },
  zoomTrack: {
    flex: 1,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    overflow: 'hidden',
  },
  zoomFill: {
    height: '100%',
    borderRadius: radius.pill,
  },
  zoomValue: {
    ...typography.caption,
    color: 'rgba(255, 255, 255, 0.7)',
    minWidth: 34,
    textAlign: 'right',
  },
  confirm: {
    marginHorizontal: spacing[5],
    marginTop: spacing[5],
    height: 52,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmText: {
    ...typography.h3,
    color: '#FFFFFF',
  },
  footer: {
    paddingHorizontal: spacing[5],
    paddingTop: spacing[4],
  },
  ratioRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
    justifyContent: 'center',
  },
  ratioChip: {
    paddingHorizontal: spacing[4],
    minHeight: 44,
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.35)',
  },
  ratioLabel: {
    ...typography.caption,
    color: '#FFFFFF',
  },
  ratioLabelActive: {
    color: '#FFFFFF',
  },
  hint: {
    ...typography.caption,
    color: 'rgba(255, 255, 255, 0.7)',
    textAlign: 'center',
    marginTop: spacing[3],
  },
})

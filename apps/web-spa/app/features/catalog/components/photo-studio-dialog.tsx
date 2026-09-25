import type { PhotoAdjustments, PhotoReview, RestagedPhoto } from '../utils/photo-studio-queries'
import { Badge } from '@boilerstone/ui/components/primitives/badge'
import { Button } from '@boilerstone/ui/components/primitives/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@boilerstone/ui/components/primitives/dialog'
import { Input } from '@boilerstone/ui/components/primitives/input'
import { Skeleton } from '@boilerstone/ui/components/primitives/skeleton'
import { toast } from '@boilerstone/ui/components/primitives/sonner'
import { Switch } from '@boilerstone/ui/components/primitives/switch'
import { AlertTriangle, Eye, Loader2, Sparkles, Wand2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  DEFAULT_ADJUSTMENTS,
  enhancePhoto,
  previewPhoto,
  restagePhoto,
  reviewPhoto,
} from '../utils/photo-studio-queries'

/** Leaves time to finish moving a slider before re-rendering the image. */
const DEBOUNCE_MS = 350

interface PhotoStudioDialogProps {
  /** The photo being worked on; `null` closes the dialog. */
  url: string | null
  /** Helps the review judge framing, and spot a photo that is off-subject. */
  productName?: string
  onClose: () => void
  /**
   * The retouched photo, once kept — id included, because a photo that has not
   * been attached to the product yet is tracked by its media id.
   */
  onReplace: (next: { mediaId: string, url: string }) => void
}

type ToggleKey = 'trim' | 'light' | 'square' | 'sharpen'

const TOGGLES: ToggleKey[] = ['trim', 'light', 'square', 'sharpen']

function NoteBadge({ note }: { note: number }) {
  const { t } = useTranslation()
  const tone = note >= 4
    ? 'bg-ebio-green-600'
    : note === 3 ? 'bg-ebio-earth-400' : 'bg-ebio-coral-400'

  return (
    <Badge className={tone}>
      {t('catalog.photoStudio.note', { note })}
    </Badge>
  )
}

/**
 * Retouching a product photo, and asking what is wrong with it.
 *
 * The adjustments only rearrange the light and the framing of the photo that
 * was taken — nothing is invented, because a listing has to show the product
 * that will be delivered. The review is the other half: it reads the photo and
 * says, in words, what to redo with the phone.
 */
export function PhotoStudioDialog({ url, productName, onClose, onReplace }: PhotoStudioDialogProps) {
  const { t } = useTranslation()
  const [adjustments, setAdjustments] = useState<PhotoAdjustments>(DEFAULT_ADJUSTMENTS)
  const [preview, setPreview] = useState<string | null>(null)
  const [rendering, setRendering] = useState(false)
  const [saving, setSaving] = useState(false)
  const [review, setReview] = useState<PhotoReview | null>(null)
  const [reviewing, setReviewing] = useState(false)
  const [restaged, setRestaged] = useState<RestagedPhoto | null>(null)
  const [restaging, setRestaging] = useState(false)
  const [consigne, setConsigne] = useState('')
  const [acceptGaps, setAcceptGaps] = useState(false)

  // A fresh photo starts from the defaults, and forgets the previous verdict.
  useEffect(() => {
    if (url) {
      setAdjustments(DEFAULT_ADJUSTMENTS)
      setReview(null)
      setPreview(null)
      setRestaged(null)
      setConsigne('')
      setAcceptGaps(false)
    }
  }, [url])

  useEffect(() => {
    if (!url) {
      return
    }

    let objectUrl: string | null = null
    const controller = new AbortController()
    setRendering(true)

    const timer = setTimeout(() => {
      previewPhoto(url, adjustments, controller.signal)
        .then((rendered) => {
          objectUrl = rendered
          setPreview(rendered)
        })
        .catch(() => {
          // An aborted render is the normal case when a toggle is flipped
          // twice in a row; only a real failure deserves the toast.
          if (!controller.signal.aborted) {
            toast.error(t('catalog.photoStudio.previewError'))
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setRendering(false)
          }
        })
    }, DEBOUNCE_MS)

    return () => {
      clearTimeout(timer)
      controller.abort()
      // The blob only lives in this tab's memory; releasing it keeps a long
      // editing session from holding every intermediate render.
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl)
      }
    }
  }, [url, adjustments, t])

  const toggle = useCallback((key: ToggleKey, value: boolean) => {
    setAdjustments(current => ({ ...current, [key]: value }))
  }, [])

  async function handleReview() {
    if (!url) {
      return
    }
    setReviewing(true)
    try {
      setReview(await reviewPhoto(url, productName))
    }
    catch {
      toast.error(t('catalog.photoStudio.reviewError'))
    }
    finally {
      setReviewing(false)
    }
  }

  async function handleRestage() {
    if (!url) {
      return
    }
    setRestaging(true)
    setAcceptGaps(false)
    try {
      setRestaged(await restagePhoto(url, productName, consigne))
    }
    catch {
      toast.error(t('catalog.photoStudio.restageError'))
    }
    finally {
      setRestaging(false)
    }
  }

  async function handleKeep() {
    if (!url) {
      return
    }
    setSaving(true)
    try {
      // A restaged photo is already stored, verdict and all: keeping it is
      // choosing it, not producing it a second time.
      if (restaged) {
        onReplace({ mediaId: restaged.mediaId, url: restaged.url })
      }
      else {
        const enhanced = await enhancePhoto(url, adjustments)
        onReplace({ mediaId: enhanced.mediaId, url: enhanced.url })
      }
      toast.success(t('catalog.photoStudio.replaced'))
      onClose()
    }
    catch {
      toast.error(t('catalog.photoStudio.saveError'))
    }
    finally {
      setSaving(false)
    }
  }

  // Nothing published until the divergences are acknowledged: the whole point
  // of the check is that it can stop a hand halfway to the button.
  const blockedByFidelity = restaged !== null && !restaged.fidelity.fidele && !acceptGaps

  return (
    <Dialog open={url !== null} onOpenChange={open => !open && onClose()}>
      <DialogContent className="flex max-h-[90vh] max-w-3xl flex-col gap-4 overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle>{t('catalog.photoStudio.title')}</DialogTitle>
          <DialogDescription>{t('catalog.photoStudio.description')}</DialogDescription>
        </DialogHeader>

        <div className="-mr-2 min-h-0 flex-1 space-y-6 overflow-y-auto pr-2">
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="space-y-2">
              <p className="text-muted-foreground text-xs font-medium uppercase">
                {t('catalog.photoStudio.before')}
              </p>
              {url && (
                <img src={url} alt="" className="bg-muted aspect-square w-full rounded-xl border object-contain" />
              )}
            </div>

            <div className="space-y-2">
              <p className="text-muted-foreground text-xs font-medium uppercase">
                {restaged ? t('catalog.photoStudio.restaged') : t('catalog.photoStudio.after')}
              </p>
              {restaging
                ? <Skeleton className="aspect-square w-full rounded-xl" />
                : restaged
                  ? <img src={restaged.url} alt="" className="bg-muted aspect-square w-full rounded-xl border object-contain" />
                  : preview && !rendering
                    ? <img src={preview} alt="" className="bg-muted aspect-square w-full rounded-xl border object-contain" />
                    : <Skeleton className="aspect-square w-full rounded-xl" />}
              {restaged && (
                <Button type="button" variant="ghost" size="sm" onClick={() => setRestaged(null)}>
                  {t('catalog.photoStudio.restageDiscard')}
                </Button>
              )}
            </div>
          </div>

          <div className="space-y-3">
            {TOGGLES.map(key => (
              <label key={key} className="flex items-start justify-between gap-4">
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{t(`catalog.photoStudio.toggles.${key}.label`)}</span>
                  <span className="text-muted-foreground block text-xs">
                    {t(`catalog.photoStudio.toggles.${key}.hint`)}
                  </span>
                </span>
                <Switch
                  checked={adjustments[key]}
                  onCheckedChange={value => toggle(key, value)}
                />
              </label>
            ))}

            <label className="flex items-center justify-between gap-4">
              <span className="min-w-0">
                <span className="block text-sm font-medium">{t('catalog.photoStudio.toggles.warmth.label')}</span>
                <span className="text-muted-foreground block text-xs">
                  {t('catalog.photoStudio.toggles.warmth.hint')}
                </span>
              </span>
              <input
                type="range"
                min={-30}
                max={30}
                step={5}
                value={adjustments.warmth}
                aria-label={t('catalog.photoStudio.toggles.warmth.label')}
                className="accent-primary w-40"
                onChange={event => setAdjustments(current => ({ ...current, warmth: Number(event.target.value) }))}
              />
            </label>
          </div>

          <div className="space-y-3 rounded-xl border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Wand2 className="text-muted-foreground h-4 w-4" />
                <span className="text-sm font-medium">{t('catalog.photoStudio.restageTitle')}</span>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleRestage}
                disabled={restaging}
              >
                {restaging
                  ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  : <Sparkles className="mr-2 h-4 w-4" />}
                {t('catalog.photoStudio.restageAction')}
              </Button>
            </div>

            <p className="text-muted-foreground text-xs">{t('catalog.photoStudio.restageHint')}</p>

            <Input
              value={consigne}
              maxLength={300}
              placeholder={t('catalog.photoStudio.restagePlaceholder')}
              aria-label={t('catalog.photoStudio.restagePlaceholder')}
              onChange={event => setConsigne(event.target.value)}
            />

            {restaging && (
              <p className="text-muted-foreground flex items-center gap-2 text-sm">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {t('catalog.photoStudio.restagePending')}
              </p>
            )}

            {restaged && (
              restaged.fidelity.fidele
                ? (
                    <p className="text-ebio-green-600 text-sm">{t('catalog.photoStudio.fidelityOk')}</p>
                  )
                : (
                    <div className="border-ebio-coral-200 bg-ebio-coral-50 space-y-2 rounded-lg border p-3">
                      <p className="text-ebio-coral-600 flex items-center gap-2 text-sm font-semibold">
                        <AlertTriangle className="h-4 w-4 shrink-0" />
                        {t('catalog.photoStudio.fidelityWarning')}
                      </p>
                      <ul className="space-y-1">
                        {restaged.fidelity.ecarts.map(gap => (
                          <li key={gap.code + gap.detail} className="flex gap-2 text-sm">
                            <Badge variant="outline" className="shrink-0">
                              {t(`catalog.photoStudio.gaps.${gap.code}`, {
                                defaultValue: t('catalog.photoStudio.gaps.AUTRE'),
                              })}
                            </Badge>
                            <span className="text-muted-foreground">{gap.detail}</span>
                          </li>
                        ))}
                      </ul>
                      <label className="flex items-start gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="accent-primary mt-0.5 h-4 w-4"
                          checked={acceptGaps}
                          onChange={event => setAcceptGaps(event.target.checked)}
                        />
                        {t('catalog.photoStudio.fidelityAccept')}
                      </label>
                    </div>
                  )
            )}
          </div>

          <div className="space-y-3 rounded-xl border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Eye className="text-muted-foreground h-4 w-4" />
                <span className="text-sm font-medium">{t('catalog.photoStudio.reviewTitle')}</span>
                {review && <NoteBadge note={review.note} />}
              </div>
              <Button type="button" variant="outline" size="sm" onClick={handleReview} disabled={reviewing}>
                {reviewing
                  ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  : <Sparkles className="mr-2 h-4 w-4" />}
                {t('catalog.photoStudio.reviewAction')}
              </Button>
            </div>

            {reviewing && !review && (
              <p className="text-muted-foreground flex items-center gap-2 text-sm">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {t('catalog.photoStudio.reviewPending')}
              </p>
            )}

            {review
              ? (
                  <div className="space-y-2">
                    <p className="text-sm">{review.resume}</p>
                    {review.problemes.length > 0
                      ? (
                          <ul className="space-y-1">
                            {review.problemes.map(issue => (
                              <li key={issue.code + issue.conseil} className="flex gap-2 text-sm">
                                <Badge variant="outline" className="shrink-0">
                                  {t(`catalog.photoStudio.issues.${issue.code}`, {
                                    defaultValue: t('catalog.photoStudio.issues.AUTRE'),
                                  })}
                                </Badge>
                                <span className="text-muted-foreground">{issue.conseil}</span>
                              </li>
                            ))}
                          </ul>
                        )
                      : <p className="text-muted-foreground text-sm">{t('catalog.photoStudio.noIssue')}</p>}
                  </div>
                )
              : !reviewing && (
                  <p className="text-muted-foreground text-xs">{t('catalog.photoStudio.reviewHint')}</p>
                )}
          </div>

        </div>

        <DialogFooter className="shrink-0">
          <Button type="button" variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="button" onClick={handleKeep} disabled={saving || rendering || restaging || blockedByFidelity}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('catalog.photoStudio.keep')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

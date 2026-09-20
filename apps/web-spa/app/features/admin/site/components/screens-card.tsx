import type { LandingScreen, LandingScreens } from '../utils/site-queries'
import { Button } from '@boilerstone/ui/components/primitives/button'
import { Input } from '@boilerstone/ui/components/primitives/input'
import { Textarea } from '@boilerstone/ui/components/primitives/textarea'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { ImageUpload } from '@/features/media/components/image-upload'
import { useSectionEditor } from '../utils/use-section-editor'
import { Field, SectionCard } from './section-card'

/**
 * The captures carousel of the landing. The number of screens is free: the
 * site scrolls them, so the admin adds, removes and orders them at will.
 */
export function ScreensCard({ initial }: { initial: LandingScreens }) {
  const { t } = useTranslation()
  const editor = useSectionEditor('screens', initial)
  const screens = editor.value.screens

  function updateScreen(index: number, patch: Partial<LandingScreen>): void {
    editor.update({ screens: screens.map((screen, i) => (i === index ? { ...screen, ...patch } : screen)) })
  }

  function addScreen(): void {
    editor.update({ screens: [...screens, { imageUrl: '', caption: '', alt: '' }] })
  }

  function removeScreen(index: number): void {
    editor.update({ screens: screens.filter((_, i) => i !== index) })
  }

  function moveScreen(index: number, direction: -1 | 1): void {
    const target = index + direction
    if (target < 0 || target >= screens.length) {
      return
    }
    const next = [...screens]
    next[index] = screens[target]
    next[target] = screens[index]
    editor.update({ screens: next })
  }

  return (
    <SectionCard
      title={t('admin.site.screens.title')}
      description={t('admin.site.screens.description')}
      onSave={editor.save}
      isSaving={editor.isSaving}
      isSaved={editor.isSaved}
      error={editor.error}
    >
      <Field label={t('admin.site.screens.eyebrow')}>
        <Input value={editor.value.eyebrow} onChange={e => editor.update({ eyebrow: e.target.value })} />
      </Field>
      <Field label={t('admin.site.screens.sectionTitle')}>
        <Input value={editor.value.title} onChange={e => editor.update({ title: e.target.value })} />
      </Field>
      <Field label={t('admin.site.screens.body')}>
        <Textarea value={editor.value.body} rows={3} onChange={e => editor.update({ body: e.target.value })} />
      </Field>

      {screens.map((screen, index) => (
        // Keyed on the position and the image: moving a row remounts its
        // uploader, which otherwise would keep the preview of its old slot.
        <ScreenRow
          key={`${index}-${screen.imageUrl}`}
          screen={screen}
          index={index}
          isFirst={index === 0}
          isLast={index === screens.length - 1}
          onChange={patch => updateScreen(index, patch)}
          onMove={direction => moveScreen(index, direction)}
          onRemove={() => removeScreen(index)}
        />
      ))}

      <Button type="button" variant="outline" onClick={addScreen}>
        <Plus className="mr-2 h-4 w-4" />
        {t('admin.site.screens.add')}
      </Button>
    </SectionCard>
  )
}

interface ScreenRowProps {
  screen: LandingScreen
  index: number
  isFirst: boolean
  isLast: boolean
  onChange: (patch: Partial<LandingScreen>) => void
  onMove: (direction: -1 | 1) => void
  onRemove: () => void
}

function ScreenRow({ screen, index, isFirst, isLast, onChange, onMove, onRemove }: ScreenRowProps) {
  const { t } = useTranslation()

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium">
          {t('admin.site.screens.screenNumber')}
          {' '}
          {index + 1}
        </span>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            aria-label={t('admin.site.screens.moveUp')}
            disabled={isFirst}
            onClick={() => onMove(-1)}
          >
            <ArrowUp className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            aria-label={t('admin.site.screens.moveDown')}
            disabled={isLast}
            onClick={() => onMove(1)}
          >
            <ArrowDown className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            aria-label={t('admin.site.screens.remove')}
            onClick={onRemove}
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </div>
      <Field label={t('admin.site.screens.image')} hint={t('admin.site.screens.imageHint')}>
        {/*
          BANNER_IMAGE rather than a dedicated context: the media table checks
          its contexts with a CHECK constraint applied by hand in production,
          and a landing capture is a promotional image like any banner.
        */}
        <ImageUpload
          context="BANNER_IMAGE"
          size="lg"
          initialUrl={screen.imageUrl || undefined}
          onUrlChange={url => onChange({ imageUrl: url ?? '' })}
        />
      </Field>
      <Field label={t('admin.site.screens.caption')}>
        <Input value={screen.caption} onChange={e => onChange({ caption: e.target.value })} />
      </Field>
      <Field label={t('admin.site.screens.alt')} hint={t('admin.site.screens.altHint')}>
        <Textarea value={screen.alt} rows={2} onChange={e => onChange({ alt: e.target.value })} />
      </Field>
    </div>
  )
}

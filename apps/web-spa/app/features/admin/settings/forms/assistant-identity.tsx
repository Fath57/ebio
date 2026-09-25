import { Button } from '@boilerstone/ui/components/primitives/button'
import { Input } from '@boilerstone/ui/components/primitives/input'
import { Label } from '@boilerstone/ui/components/primitives/label'
import { RotateCcw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ImageUpload } from '@/features/media/components/image-upload'

/** Matches the API: letters, spaces, apostrophes and hyphens. */
const NAME_PATTERN = /^[A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u00FF][A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u00FF '’-]*$/
const NAME_MIN = 2
const NAME_MAX = 30

interface AssistantIdentityProps {
  name: string
  avatarUrl: string | null
  /** How fast she speaks, as a multiplier. */
  voiceSpeed: number
  onSave: (identity: { name: string, avatarUrl: string | null, voiceSpeed: number }) => void
  isPending: boolean
}

/**
 * Her name and her face.
 *
 * Behind a Save button, unlike the on/off switch beside it: the switch is
 * reached for in a hurry when she misbehaves, whereas a name is typed one
 * letter at a time and saving each keystroke would rename her six times.
 *
 * An empty portrait is not a missing setting — it is the portrait shipped with
 * the app, which is what she has always worn.
 */
export function AssistantIdentity({ name, avatarUrl, voiceSpeed, onSave, isPending }: AssistantIdentityProps) {
  const { t } = useTranslation()
  const [draftName, setDraftName] = useState(name)
  const [draftAvatar, setDraftAvatar] = useState<string | null>(avatarUrl)
  const [draftSpeed, setDraftSpeed] = useState(voiceSpeed)

  // The server is the source of truth: a save elsewhere, or a reload, must
  // land in the fields rather than be overwritten by a stale draft.
  useEffect(() => {
    setDraftName(name)
  }, [name])
  useEffect(() => {
    setDraftAvatar(avatarUrl)
  }, [avatarUrl])
  useEffect(() => {
    setDraftSpeed(voiceSpeed)
  }, [voiceSpeed])

  const trimmed = draftName.trim()
  const nameValid = trimmed.length >= NAME_MIN && trimmed.length <= NAME_MAX && NAME_PATTERN.test(trimmed)
  const changed = trimmed !== name || draftAvatar !== avatarUrl || draftSpeed !== voiceSpeed

  return (
    <div className="space-y-5 border-t pt-5">
      <div className="space-y-2">
        <Label htmlFor="assistant-name">{t('admin.settings.assistant.nameLabel')}</Label>
        <Input
          id="assistant-name"
          value={draftName}
          maxLength={NAME_MAX}
          placeholder={t('admin.settings.assistant.namePlaceholder')}
          aria-invalid={draftName.length > 0 && !nameValid}
          onChange={event => setDraftName(event.target.value)}
        />
        <p className="text-muted-foreground text-xs">
          {draftName.length > 0 && !nameValid
            ? t('admin.settings.assistant.nameInvalid')
            : t('admin.settings.assistant.nameHint')}
        </p>
      </div>

      <div className="space-y-2">
        <Label>{t('admin.settings.assistant.avatarLabel')}</Label>
        <div className="flex flex-wrap items-center gap-4">
          <ImageUpload
            context="ASSISTANT_AVATAR"
            max={1}
            size="lg"
            initialUrl={draftAvatar ?? undefined}
            onUrlChange={url => setDraftAvatar(url ?? null)}
          />
          {draftAvatar && (
            <Button type="button" variant="ghost" size="sm" onClick={() => setDraftAvatar(null)}>
              <RotateCcw className="mr-2 h-4 w-4" />
              {t('admin.settings.assistant.avatarReset')}
            </Button>
          )}
        </div>
        <p className="text-muted-foreground text-xs">
          {draftAvatar
            ? t('admin.settings.assistant.avatarHint')
            : t('admin.settings.assistant.avatarDefault')}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="assistant-speed">{t('admin.settings.assistant.speedLabel')}</Label>
        <div className="flex items-center gap-4">
          <input
            id="assistant-speed"
            type="range"
            min={0.8}
            max={1.4}
            step={0.05}
            value={draftSpeed}
            className="accent-primary w-64"
            onChange={event => setDraftSpeed(Number(event.target.value))}
          />
          <span className="font-mono text-sm tabular-nums">
            ×
            {draftSpeed.toFixed(2)}
          </span>
        </div>
        <p className="text-muted-foreground text-xs">{t('admin.settings.assistant.speedHint')}</p>
      </div>

      <Button
        type="button"
        disabled={isPending || !nameValid || !changed}
        onClick={() => onSave({ name: trimmed, avatarUrl: draftAvatar, voiceSpeed: draftSpeed })}
      >
        {t('common.save')}
      </Button>
    </div>
  )
}

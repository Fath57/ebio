import { Label } from '@boilerstone/ui/components/primitives/label'
import { Switch } from '@boilerstone/ui/components/primitives/switch'
import { useTranslation } from 'react-i18next'

interface AssistantToggleProps {
  /** Her configured name, which the label says out loud. */
  name: string
  enabled: boolean
  onChange: (enabled: boolean) => void
  isPending: boolean
}

/**
 * The assistant's on/off switch.
 *
 * It saves on the flick rather than behind a Save button: this is the control
 * someone reaches for when the assistant is misbehaving in production, and a
 * second click to confirm is a second click too many.
 */
export function AssistantToggle({ name, enabled, onChange, isPending }: AssistantToggleProps) {
  const { t } = useTranslation()

  return (
    <div className="flex items-start justify-between gap-6">
      <div className="space-y-1">
        <Label htmlFor="assistant-enabled" className="text-base">
          {t('admin.settings.assistant.toggleLabel', { name })}
        </Label>
        <p className="text-muted-foreground text-sm">
          {enabled
            ? t('admin.settings.assistant.stateOpen')
            : t('admin.settings.assistant.stateClosed')}
        </p>
      </div>
      <Switch
        id="assistant-enabled"
        checked={enabled}
        disabled={isPending}
        onCheckedChange={onChange}
        aria-label={t('admin.settings.assistant.toggleLabel', { name })}
      />
    </div>
  )
}

import type { SaveFeedback } from '../utils/use-admin-settings'
import { useTranslation } from 'react-i18next'

interface SettingFeedbackProps {
  feedback: SaveFeedback
  /** Translation group holding the `saved` and `error` messages, e.g. `admin.settings.cashLimit`. */
  i18nPrefix: string
}

/** The line under a form once a save comes back: confirmation or error. */
export function SettingFeedback({ feedback, i18nPrefix }: SettingFeedbackProps) {
  const { t } = useTranslation()

  if (feedback === 'saved') {
    return (
      <p role="status" className="text-ebio-green-600 dark:text-ebio-green-200 text-sm">
        {t(`${i18nPrefix}.saved`)}
      </p>
    )
  }

  if (feedback === 'error') {
    return (
      <p role="alert" className="border-destructive/50 bg-destructive/10 text-destructive rounded-md border p-3 text-sm">
        {t(`${i18nPrefix}.error`)}
      </p>
    )
  }

  return null
}

import { Button } from '@boilerstone/ui/components/primitives/button'
import { Card } from '@boilerstone/ui/components/primitives/card'
import { useTranslation } from 'react-i18next'

interface SectionCardProps {
  title: string
  description: string
  onSave: () => void
  isSaving: boolean
  /** Success flash after a save; the parent resets it on the next edit. */
  isSaved: boolean
  error: string | null
  children: React.ReactNode
}

/** Common frame of every editable section: header, fields, its own save. */
export function SectionCard({ title, description, onSave, isSaving, isSaved, error, children }: SectionCardProps) {
  const { t } = useTranslation()

  return (
    <Card className="p-6">
      <div className="mb-5">
        <h3 className="text-lg font-semibold">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="space-y-4">
        {children}
      </div>
      <div className="mt-5 flex items-center gap-3">
        <Button onClick={onSave} disabled={isSaving}>
          {isSaving ? t('common.saving') : t('admin.site.save')}
        </Button>
        {isSaved && <span className="text-sm font-medium text-green-600">{t('admin.site.saved')}</span>}
        {error && <span className="text-sm text-destructive">{error}</span>}
      </div>
    </Card>
  )
}

export function Field({ label, hint, children }: { label: string, hint?: string, children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <span className="block text-sm font-medium">{label}</span>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

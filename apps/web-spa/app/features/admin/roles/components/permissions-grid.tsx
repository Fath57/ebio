import type { CatalogSection } from '../utils/roles-queries'
import { Button } from '@boilerstone/ui/components/primitives/button'
import { Card, CardContent, CardHeader, CardTitle } from '@boilerstone/ui/components/primitives/card'
import { Checkbox } from '@boilerstone/ui/components/primitives/checkbox'
import { Label } from '@boilerstone/ui/components/primitives/label'
import { useTranslation } from 'react-i18next'

interface PermissionsGridProps {
  sections: CatalogSection[]
  selectedIds: string[]
  onChange: (ids: string[]) => void
  /** System role: every box checked and locked. */
  readOnly?: boolean
}

export function PermissionsGrid({ sections, selectedIds, onChange, readOnly = false }: PermissionsGridProps) {
  const { t } = useTranslation()

  const toggle = (id: string) => {
    if (selectedIds.includes(id))
      onChange(selectedIds.filter(selected => selected !== id))
    else
      onChange([...selectedIds, id])
  }

  const toggleSection = (section: CatalogSection) => {
    const ids = section.permissions.map(p => p.id)
    const allSelected = ids.every(id => selectedIds.includes(id))
    if (allSelected) {
      onChange(selectedIds.filter(id => !ids.includes(id)))
      return
    }
    onChange([...selectedIds, ...ids.filter(id => !selectedIds.includes(id))])
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {sections.map((section) => {
        const allSelected = section.permissions.every(p => readOnly || selectedIds.includes(p.id))
        return (
          <Card key={section.key} className="gap-4 py-4">
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-base">
                {t(`admin.team.sections.${section.key}`, { defaultValue: section.key })}
              </CardTitle>
              {!readOnly && (
                <Button type="button" variant="ghost" size="sm" onClick={() => toggleSection(section)}>
                  {allSelected ? t('admin.roles.uncheckAll') : t('admin.roles.checkAll')}
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              {section.permissions.map((permission) => {
                const inputId = `permission-${permission.id}`
                return (
                  <div key={permission.id} className="flex items-start gap-3">
                    <Checkbox
                      id={inputId}
                      checked={readOnly || selectedIds.includes(permission.id)}
                      disabled={readOnly}
                      onCheckedChange={() => toggle(permission.id)}
                    />
                    <Label htmlFor={inputId} className="font-normal leading-snug">
                      {t(`admin.team.permissions.${section.key}.${permission.key}`, {
                        defaultValue: permission.description ?? permission.key,
                      })}
                    </Label>
                  </div>
                )
              })}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

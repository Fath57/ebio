import type { SettingDefinition, SettingsSectionId } from '../utils/settings-registry'
import { Button } from '@boilerstone/ui/components/primitives/button'
import { SearchX } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useSearchParams } from 'react-router'
import { useAbility } from '@/lib/casl/ability-context'
import { SettingCard } from '../components/setting-card'
import { SettingsNav } from '../components/settings-nav'
import { SettingsSearch } from '../components/settings-search'
import {
  DEFAULT_SETTINGS_SECTION,
  isSettingsSectionId,
  LEGACY_TAB_SECTIONS,
  normalizeSearchText,
  SETTINGS_REGISTRY,
  SETTINGS_SECTIONS,
  settingSearchText,
} from '../utils/settings-registry'
import { useAdminSettings } from '../utils/use-admin-settings'

/**
 * Section to show, from the most specific hint to the least: the section of
 * the anchored setting (`#tarification-livraison`), `?section=`, a former
 * `?tab=` link, then the default, as long as the viewer can see it.
 */
function resolveSection(
  hashSetting: SettingDefinition | undefined,
  sectionParam: string | null,
  tabParam: string | null,
  available: readonly SettingsSectionId[],
): SettingsSectionId {
  const candidates = [
    hashSetting?.section,
    isSettingsSectionId(sectionParam) ? sectionParam : undefined,
    tabParam ? LEGACY_TAB_SECTIONS[tabParam] : undefined,
    DEFAULT_SETTINGS_SECTION,
  ]
  return candidates.find(id => id !== undefined && available.includes(id)) ?? available[0] ?? DEFAULT_SETTINGS_SECTION
}

/**
 * Platform settings, grouped by what they act on. The registry
 * (`utils/settings-registry.tsx`) holds every card; this page only picks
 * which ones to show, a section, or the matches of a search.
 */
export default function AdminSettingsPage() {
  const { t } = useTranslation()
  const state = useAdminSettings()
  const { ability } = useAbility()
  const [params] = useSearchParams()
  const { hash } = useLocation()
  const [query, setQuery] = useState('')

  const canManage = ability?.can('manage', 'all') ?? false
  const visibleSettings = useMemo(
    () => SETTINGS_REGISTRY.filter(setting => !setting.adminOnly || canManage),
    [canManage],
  )
  const visibleSections = SETTINGS_SECTIONS.filter(section => visibleSettings.some(setting => setting.section === section.id))
  const counts = Object.fromEntries(SETTINGS_SECTIONS.map(section => [
    section.id,
    visibleSettings.filter(setting => setting.section === section.id && !setting.informational).length,
  ])) as Record<SettingsSectionId, number>

  const anchorId = decodeURIComponent(hash.replace(/^#/, ''))
  const anchoredSetting = visibleSettings.find(setting => setting.id === anchorId)
  const activeSection = resolveSection(
    anchoredSetting,
    params.get('section'),
    params.get('tab'),
    visibleSections.map(section => section.id),
  )

  const terms = normalizeSearchText(query).split(/\s+/).filter(Boolean)
  const isSearching = terms.length > 0
  const results = isSearching
    ? visibleSettings.filter((setting) => {
        const text = settingSearchText(setting, state, t)
        return terms.every(term => text.includes(term))
      })
    : []
  const sectionSettings = visibleSettings.filter(setting => setting.section === activeSection)

  // Bring the anchored card into view once the cards above it have their
  // final height, and again whenever back/forward lands on another anchor.
  useEffect(() => {
    if (!anchorId || isSearching || state.isAnyLoading)
      return
    document.getElementById(anchorId)?.scrollIntoView({ block: 'start' })
  }, [anchorId, activeSection, isSearching, state.isAnyLoading])

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">{t('admin.settings.title')}</h2>
        <p className="text-muted-foreground">{t('admin.settings.description')}</p>
      </div>

      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-4 lg:gap-x-8 lg:gap-y-6">
        <div className="lg:col-span-3 lg:col-start-2 lg:row-start-1">
          <SettingsSearch value={query} onChange={setQuery} />
        </div>

        <div className="lg:sticky lg:top-20 lg:col-start-1 lg:row-span-2 lg:row-start-1 lg:self-start">
          <SettingsNav
            sections={visibleSections}
            counts={counts}
            activeSection={isSearching ? null : activeSection}
            onNavigate={() => setQuery('')}
          />
        </div>

        <div className="min-w-0 space-y-6 lg:col-span-3 lg:col-start-2 lg:row-start-2">
          {isSearching
            ? (
                <>
                  <p role="status" className="text-muted-foreground text-sm">
                    {t('admin.settings.search.results', { count: results.length })}
                  </p>
                  {results.length === 0
                    ? (
                        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-12 text-center">
                          <SearchX aria-hidden="true" className="text-muted-foreground size-8" />
                          <p className="font-semibold">{t('admin.settings.search.emptyTitle', { query: query.trim() })}</p>
                          <p className="text-muted-foreground text-sm">{t('admin.settings.search.emptyHint')}</p>
                          <Button variant="outline" onClick={() => setQuery('')}>
                            {t('admin.settings.search.clear')}
                          </Button>
                        </div>
                      )
                    : results.map(setting => (
                        <SettingCard key={setting.id} setting={setting} state={state} showSection />
                      ))}
                </>
              )
            : (
                <>
                  <header className="space-y-1">
                    <h3 className="text-xl font-semibold">{t(`admin.settings.sections.${activeSection}.title`)}</h3>
                    <p className="text-muted-foreground text-sm">{t(`admin.settings.sections.${activeSection}.description`)}</p>
                  </header>
                  {sectionSettings.map(setting => (
                    <SettingCard key={setting.id} setting={setting} state={state} />
                  ))}
                </>
              )}
        </div>
      </div>
    </div>
  )
}

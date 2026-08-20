import type { LandingContact, LandingFooter, LandingHero, LandingSteps, LandingStores, LandingSupplier, LandingTrust } from '../utils/site-queries'
import { Input } from '@boilerstone/ui/components/primitives/input'
import { Textarea } from '@boilerstone/ui/components/primitives/textarea'
import { useTranslation } from 'react-i18next'
import { useSectionEditor } from '../utils/use-section-editor'
import { Field, SectionCard } from './section-card'

export function StoresCard({ initial }: { initial: LandingStores }) {
  const { t } = useTranslation()
  const editor = useSectionEditor('stores', initial)

  return (
    <SectionCard
      title={t('admin.site.stores.title')}
      description={t('admin.site.stores.description')}
      onSave={editor.save}
      isSaving={editor.isSaving}
      isSaved={editor.isSaved}
      error={editor.error}
    >
      <Field label={t('admin.site.stores.playUrl')}>
        <Input
          value={editor.value.playStoreUrl ?? ''}
          placeholder="https://play.google.com/store/apps/details?id=…"
          onChange={e => editor.update({ playStoreUrl: e.target.value.trim() || null })}
        />
      </Field>
      <Field label={t('admin.site.stores.appUrl')}>
        <Input
          value={editor.value.appStoreUrl ?? ''}
          placeholder="https://apps.apple.com/app/…"
          onChange={e => editor.update({ appStoreUrl: e.target.value.trim() || null })}
        />
      </Field>
      <Field label={t('admin.site.stores.modalTitle')}>
        <Input
          value={editor.value.comingSoonTitle}
          onChange={e => editor.update({ comingSoonTitle: e.target.value })}
        />
      </Field>
      <Field label={t('admin.site.stores.modalBody')}>
        <Textarea
          value={editor.value.comingSoonBody}
          rows={3}
          onChange={e => editor.update({ comingSoonBody: e.target.value })}
        />
      </Field>
    </SectionCard>
  )
}

export function HeroCard({ initial }: { initial: LandingHero }) {
  const { t } = useTranslation()
  const editor = useSectionEditor('hero', initial)

  return (
    <SectionCard
      title={t('admin.site.hero.title')}
      description={t('admin.site.hero.description')}
      onSave={editor.save}
      isSaving={editor.isSaving}
      isSaved={editor.isSaved}
      error={editor.error}
    >
      <Field label={t('admin.site.hero.eyebrow')}>
        <Input value={editor.value.eyebrow} onChange={e => editor.update({ eyebrow: e.target.value })} />
      </Field>
      <Field label={t('admin.site.hero.mainTitle')}>
        <Input value={editor.value.title} onChange={e => editor.update({ title: e.target.value })} />
      </Field>
      <Field label={t('admin.site.hero.highlight')} hint={t('admin.site.hero.highlightHint')}>
        <Input value={editor.value.highlight} onChange={e => editor.update({ highlight: e.target.value })} />
      </Field>
      <Field label={t('admin.site.hero.subtitle')}>
        <Textarea value={editor.value.subtitle} rows={3} onChange={e => editor.update({ subtitle: e.target.value })} />
      </Field>
      <Field label={t('admin.site.hero.footnote')}>
        <Input value={editor.value.footnote} onChange={e => editor.update({ footnote: e.target.value })} />
      </Field>
    </SectionCard>
  )
}

export function TrustCard({ initial }: { initial: LandingTrust }) {
  const { t } = useTranslation()
  const editor = useSectionEditor('trust', initial)

  function updatePoint(index: number, patch: Partial<{ title: string, body: string }>): void {
    const points = editor.value.points.map((point, i) => (i === index ? { ...point, ...patch } : point))
    editor.update({ points })
  }

  return (
    <SectionCard
      title={t('admin.site.trust.title')}
      description={t('admin.site.trust.description')}
      onSave={editor.save}
      isSaving={editor.isSaving}
      isSaved={editor.isSaved}
      error={editor.error}
    >
      {editor.value.points.map((point, index) => (
        <div key={`trust-${String(index)}`} className="rounded-lg border p-4 space-y-3">
          <Field label={`${t('admin.site.trust.pointTitle')} ${index + 1}`}>
            <Input value={point.title} onChange={e => updatePoint(index, { title: e.target.value })} />
          </Field>
          <Field label={t('admin.site.trust.pointBody')}>
            <Textarea value={point.body} rows={2} onChange={e => updatePoint(index, { body: e.target.value })} />
          </Field>
        </div>
      ))}
    </SectionCard>
  )
}

export function StepsCard({ initial }: { initial: LandingSteps }) {
  const { t } = useTranslation()
  const editor = useSectionEditor('steps', initial)

  function updateStep(index: number, patch: Partial<{ title: string, body: string }>): void {
    const steps = editor.value.steps.map((step, i) => (i === index ? { ...step, ...patch } : step))
    editor.update({ steps })
  }

  return (
    <SectionCard
      title={t('admin.site.steps.title')}
      description={t('admin.site.steps.description')}
      onSave={editor.save}
      isSaving={editor.isSaving}
      isSaved={editor.isSaved}
      error={editor.error}
    >
      <Field label={t('admin.site.steps.eyebrow')}>
        <Input value={editor.value.eyebrow} onChange={e => editor.update({ eyebrow: e.target.value })} />
      </Field>
      <Field label={t('admin.site.steps.sectionTitle')}>
        <Input value={editor.value.title} onChange={e => editor.update({ title: e.target.value })} />
      </Field>
      {editor.value.steps.map((step, index) => (
        <div key={`step-${String(index)}`} className="rounded-lg border p-4 space-y-3">
          <Field label={`${t('admin.site.steps.stepTitle')} ${index + 1}`}>
            <Input value={step.title} onChange={e => updateStep(index, { title: e.target.value })} />
          </Field>
          <Field label={t('admin.site.steps.stepBody')}>
            <Textarea value={step.body} rows={3} onChange={e => updateStep(index, { body: e.target.value })} />
          </Field>
        </div>
      ))}
    </SectionCard>
  )
}

export function SupplierCard({ initial }: { initial: LandingSupplier }) {
  const { t } = useTranslation()
  const editor = useSectionEditor('supplier', initial)

  return (
    <SectionCard
      title={t('admin.site.supplier.title')}
      description={t('admin.site.supplier.description')}
      onSave={editor.save}
      isSaving={editor.isSaving}
      isSaved={editor.isSaved}
      error={editor.error}
    >
      <Field label={t('admin.site.supplier.eyebrow')}>
        <Input value={editor.value.eyebrow} onChange={e => editor.update({ eyebrow: e.target.value })} />
      </Field>
      <Field label={t('admin.site.supplier.sectionTitle')}>
        <Input value={editor.value.title} onChange={e => editor.update({ title: e.target.value })} />
      </Field>
      <Field label={t('admin.site.supplier.body')}>
        <Textarea value={editor.value.body} rows={3} onChange={e => editor.update({ body: e.target.value })} />
      </Field>
      <Field label={t('admin.site.supplier.points')}>
        <Textarea
          value={editor.value.points.join('\n')}
          rows={4}
          onChange={e => editor.update({ points: e.target.value.split('\n').filter(line => line.trim() !== '') })}
        />
      </Field>
      <Field label={t('admin.site.supplier.ctaLabel')}>
        <Input value={editor.value.ctaLabel} onChange={e => editor.update({ ctaLabel: e.target.value })} />
      </Field>
    </SectionCard>
  )
}

export function FooterCard({ initial }: { initial: LandingFooter }) {
  const { t } = useTranslation()
  const editor = useSectionEditor('footer', initial)

  return (
    <SectionCard
      title={t('admin.site.footer.title')}
      description={t('admin.site.footer.description')}
      onSave={editor.save}
      isSaving={editor.isSaving}
      isSaved={editor.isSaved}
      error={editor.error}
    >
      <Field label={t('admin.site.footer.tagline')}>
        <Textarea value={editor.value.tagline} rows={2} onChange={e => editor.update({ tagline: e.target.value })} />
      </Field>
      <Field label={t('admin.site.footer.contactEmail')}>
        <Input value={editor.value.contactEmail} onChange={e => editor.update({ contactEmail: e.target.value })} />
      </Field>
      <Field label={t('admin.site.footer.bottomLine')}>
        <Input value={editor.value.bottomLine} onChange={e => editor.update({ bottomLine: e.target.value })} />
      </Field>
    </SectionCard>
  )
}

export function ContactCard({ initial }: { initial: LandingContact }) {
  const { t } = useTranslation()
  const editor = useSectionEditor('contact', initial)

  return (
    <SectionCard
      title={t('admin.site.contact.title')}
      description={t('admin.site.contact.description')}
      onSave={editor.save}
      isSaving={editor.isSaving}
      isSaved={editor.isSaved}
      error={editor.error}
    >
      <Field label={t('admin.site.contact.recipients')}>
        <Textarea
          value={editor.value.recipients.join('\n')}
          rows={3}
          onChange={e => editor.update({ recipients: e.target.value.split('\n').map(line => line.trim()).filter(line => line !== '') })}
        />
      </Field>
    </SectionCard>
  )
}

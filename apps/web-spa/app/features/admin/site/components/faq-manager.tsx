import type { LandingFaq } from '../utils/site-queries'
import { Badge } from '@boilerstone/ui/components/primitives/badge'
import { Button } from '@boilerstone/ui/components/primitives/button'
import { Card } from '@boilerstone/ui/components/primitives/card'
import { Input } from '@boilerstone/ui/components/primitives/input'
import { Switch } from '@boilerstone/ui/components/primitives/switch'
import { Textarea } from '@boilerstone/ui/components/primitives/textarea'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { createLandingFaq, deleteLandingFaq, updateLandingFaq } from '../utils/site-queries'
import { Field } from './section-card'

export function FaqManager({ faqs }: { faqs: LandingFaq[] }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [isAdding, setIsAdding] = useState(false)
  const [newQuestion, setNewQuestion] = useState('')
  const [newAnswer, setNewAnswer] = useState('')
  const [error, setError] = useState<string | null>(null)

  function invalidate(): void {
    queryClient.invalidateQueries({ queryKey: ['admin', 'landing'] })
  }

  const { mutate: create, isPending: isCreating } = useMutation({
    mutationFn: () => createLandingFaq({
      question: newQuestion,
      answer: newAnswer,
      isActive: true,
      sortOrder: faqs.length,
    }),
    onSuccess: () => {
      invalidate()
      setIsAdding(false)
      setNewQuestion('')
      setNewAnswer('')
    },
    onError: (mutationError: Error) => setError(mutationError.message),
  })

  return (
    <Card className="p-6">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold">{t('admin.site.faq.title')}</h3>
          <p className="text-sm text-muted-foreground">{t('admin.site.faq.description')}</p>
        </div>
        <Button variant="outline" onClick={() => setIsAdding(current => !current)}>
          <Plus className="mr-2 h-4 w-4" />
          {t('admin.site.faq.add')}
        </Button>
      </div>

      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}

      {isAdding && (
        <div className="mb-6 rounded-lg border border-dashed p-4 space-y-3">
          <Field label={t('admin.site.faq.question')}>
            <Input value={newQuestion} onChange={e => setNewQuestion(e.target.value)} />
          </Field>
          <Field label={t('admin.site.faq.answer')}>
            <Textarea value={newAnswer} rows={3} onChange={e => setNewAnswer(e.target.value)} />
          </Field>
          <Button onClick={() => create()} disabled={isCreating || !newQuestion.trim() || !newAnswer.trim()}>
            {isCreating ? t('common.saving') : t('admin.site.save')}
          </Button>
        </div>
      )}

      <div className="space-y-4">
        {faqs.map(faq => (
          <FaqRow key={faq.id} faq={faq} onChanged={invalidate} onError={setError} />
        ))}
      </div>
    </Card>
  )
}

interface FaqRowProps {
  faq: LandingFaq
  onChanged: () => void
  onError: (message: string) => void
}

function FaqRow({ faq, onChanged, onError }: FaqRowProps) {
  const { t } = useTranslation()
  const [question, setQuestion] = useState(faq.question)
  const [answer, setAnswer] = useState(faq.answer)
  const [sortOrder, setSortOrder] = useState(faq.sortOrder)
  const [isDirty, setIsDirty] = useState(false)

  const { mutate: save, isPending: isSaving } = useMutation({
    mutationFn: () => updateLandingFaq(faq.id, { question, answer, sortOrder }),
    onSuccess: () => {
      setIsDirty(false)
      onChanged()
    },
    onError: (mutationError: Error) => onError(mutationError.message),
  })

  const { mutate: toggle } = useMutation({
    mutationFn: (isActive: boolean) => updateLandingFaq(faq.id, { isActive }),
    onSuccess: onChanged,
    onError: (mutationError: Error) => onError(mutationError.message),
  })

  const { mutate: remove, isPending: isDeleting } = useMutation({
    mutationFn: () => deleteLandingFaq(faq.id),
    onSuccess: onChanged,
    onError: (mutationError: Error) => onError(mutationError.message),
  })

  function handleDelete(): void {
    // A confirm suffices here: the row disappears immediately and the action
    // is rare enough not to deserve a dedicated dialog.
    // eslint-disable-next-line no-alert
    if (window.confirm(t('admin.site.faq.deleteConfirm'))) {
      remove()
    }
  }

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <Badge variant={faq.isActive ? 'default' : 'outline'}>
          {faq.isActive ? t('admin.site.faq.active') : t('admin.site.faq.inactive')}
        </Badge>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            {t('admin.site.faq.order')}
            <Input
              type="number"
              min={0}
              value={sortOrder}
              className="w-20"
              onChange={(e) => {
                setSortOrder(Number.parseInt(e.target.value, 10) || 0)
                setIsDirty(true)
              }}
            />
          </label>
          <Switch checked={faq.isActive} onCheckedChange={checked => toggle(checked)} />
          <Button size="sm" variant="ghost" onClick={handleDelete} disabled={isDeleting}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </div>
      <Input
        value={question}
        onChange={(e) => {
          setQuestion(e.target.value)
          setIsDirty(true)
        }}
      />
      <Textarea
        value={answer}
        rows={3}
        onChange={(e) => {
          setAnswer(e.target.value)
          setIsDirty(true)
        }}
      />
      {isDirty && (
        <Button size="sm" onClick={() => save()} disabled={isSaving}>
          {isSaving ? t('common.saving') : t('admin.site.save')}
        </Button>
      )}
    </div>
  )
}

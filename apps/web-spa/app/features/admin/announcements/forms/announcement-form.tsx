import type { Resolver } from 'react-hook-form'
import type { PickerOption } from '../../common/components/entity-picker'
import { Button } from '@boilerstone/ui/components/primitives/button'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@boilerstone/ui/components/primitives/form'
import { Input } from '@boilerstone/ui/components/primitives/input'
import { Switch } from '@boilerstone/ui/components/primitives/switch'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link as LinkIcon, Megaphone, Package, Store } from 'lucide-react'
import * as React from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { EntityPicker } from '../../common/components/entity-picker'
import { searchProducts, searchSuppliers } from '../../common/utils/target-search'
import { AnnouncementImageField } from '../components/announcement-image-field'

/** A week: long enough to be seen, short enough that nobody forgets it is running. */
const DEFAULT_RUN_DAYS = 7

const announcementSchema = z.object({
  title: z.string().trim().max(120),
  subtitle: z.string().trim().max(500),
  imageUrl: z.string(),
  targetType: z.enum(['SUPPLIER', 'PRODUCT', 'URL', 'NONE']),
  targetId: z.string(),
  targetUrl: z.string(),
  priority: z.coerce.number().int().min(0).max(100),
  active: z.boolean(),
  // `datetime-local` values, both required: an announcement that never ends
  // keeps coming back and nobody remembers switching it off.
  startsAt: z.string().min(1),
  endsAt: z.string().min(1),
}).superRefine((data, ctx) => {
  // A poster carries its own words, so a title is only required without one.
  if (!data.title && !data.imageUrl) {
    ctx.addIssue({ code: 'custom', path: ['title'], message: 'Un titre, un visuel, ou les deux' })
  }
  if ((data.targetType === 'SUPPLIER' || data.targetType === 'PRODUCT') && !data.targetId) {
    ctx.addIssue({ code: 'custom', path: ['targetId'], message: 'Choisissez une destination' })
  }
  if (data.targetType === 'URL' && !/^https?:\/\/.+/.test(data.targetUrl)) {
    ctx.addIssue({ code: 'custom', path: ['targetUrl'], message: 'Entrez un lien complet, en https://' })
  }
  if (new Date(data.endsAt).getTime() <= new Date(data.startsAt).getTime()) {
    ctx.addIssue({ code: 'custom', path: ['endsAt'], message: 'La fin doit être après le début' })
  }
})

export type AnnouncementFormData = z.infer<typeof announcementSchema>

interface AnnouncementFormProps {
  onSubmit: (data: AnnouncementFormData) => void
  onCancel: () => void
  isPending: boolean
}

const TARGET_TYPES = [
  { value: 'SUPPLIER', icon: Store, label: 'Une boutique' },
  { value: 'PRODUCT', icon: Package, label: 'Un produit' },
  { value: 'URL', icon: LinkIcon, label: 'Un lien' },
  { value: 'NONE', icon: Megaphone, label: 'Rien à ouvrir' },
] as const

/** `datetime-local` value for now, plus an offset in days. */
function localInputValue(daysFromNow: number): string {
  const date = new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000)
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/**
 * An announcement published by eBio itself.
 *
 * Same object as a shop's, minus the money: no offer, no wallet, no approval —
 * it goes live on its start date. The dates are prefilled because an
 * announcement without an end is the one that keeps reappearing in July for a
 * March campaign.
 */
export function AnnouncementForm({ onSubmit, onCancel, isPending }: AnnouncementFormProps) {
  const [target, setTarget] = React.useState<PickerOption | null>(null)

  const form = useForm<AnnouncementFormData>({
    resolver: zodResolver(announcementSchema) as Resolver<AnnouncementFormData>,
    defaultValues: {
      title: '',
      subtitle: '',
      imageUrl: '',
      targetType: 'NONE',
      targetId: '',
      targetUrl: '',
      priority: 0,
      active: true,
      startsAt: localInputValue(0),
      endsAt: localInputValue(DEFAULT_RUN_DAYS),
    },
  })

  const targetType = form.watch('targetType')
  const targetId = form.watch('targetId')
  const imageUrl = form.watch('imageUrl')
  const title = form.watch('title')
  const subtitle = form.watch('subtitle')

  // Bound per type so switching the type re-runs the right search.
  const handleSearch = React.useCallback(
    (query: string) => (targetType === 'SUPPLIER' ? searchSuppliers(query) : searchProducts(query)),
    [targetType],
  )

  function handleSelectTarget(option: PickerOption): void {
    setTarget(option)
    form.setValue('targetId', option.id, { shouldValidate: true })
    // Offering the name of what it points at saves retyping, without
    // overwriting a title already written.
    if (!form.getValues('title')) {
      form.setValue('title', option.label)
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-8 lg:grid-cols-[1fr_auto]">
        <div className="space-y-6">
          <FormField
            control={form.control}
            name="imageUrl"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Visuel</FormLabel>
                <FormControl>
                  <AnnouncementImageField
                    value={field.value}
                    onChange={url => form.setValue('imageUrl', url, { shouldValidate: true })}
                  />
                </FormControl>
                <FormDescription>
                  Un visuel seul suffit : le modal s'adapte à sa forme, sans rien couper.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="title"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Titre</FormLabel>
                <FormControl>
                  <Input {...field} maxLength={120} placeholder="Facultatif si le visuel parle déjà" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="subtitle"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Message</FormLabel>
                <FormControl>
                  <Input {...field} maxLength={500} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="targetType"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Au clic</FormLabel>
                <FormControl>
                  <div className="grid grid-cols-2 gap-3">
                    {TARGET_TYPES.map(({ value, icon: Icon, label }) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => {
                          field.onChange(value)
                          // The previous destination belongs to the other type.
                          form.setValue('targetId', '')
                          form.setValue('targetUrl', '')
                          setTarget(null)
                        }}
                        className={`flex items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
                          field.value === value
                            ? 'border-primary bg-primary/5'
                            : 'hover:bg-accent/40'
                        }`}
                      >
                        <Icon className={field.value === value ? 'text-primary h-5 w-5' : 'text-muted-foreground h-5 w-5'} />
                        <span className="text-sm font-medium">{label}</span>
                      </button>
                    ))}
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {(targetType === 'SUPPLIER' || targetType === 'PRODUCT') && (
            <FormField
              control={form.control}
              name="targetId"
              render={() => (
                <FormItem>
                  <FormLabel>Destination</FormLabel>
                  <FormControl>
                    <EntityPicker
                      value={targetId}
                      selected={target}
                      placeholder={targetType === 'SUPPLIER' ? 'Choisir une boutique' : 'Choisir un produit'}
                      searchPlaceholder="Rechercher…"
                      emptyLabel="Aucun résultat"
                      onSearch={handleSearch}
                      onSelect={handleSelectTarget}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          {targetType === 'URL' && (
            <FormField
              control={form.control}
              name="targetUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Lien</FormLabel>
                  <FormControl>
                    <Input {...field} type="url" placeholder="https://…" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          <div className="grid gap-6 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="startsAt"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Début</FormLabel>
                  <FormControl>
                    <Input type="datetime-local" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="endsAt"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Fin</FormLabel>
                  <FormControl>
                    <Input type="datetime-local" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="priority"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Priorité</FormLabel>
                  <FormControl>
                    <Input type="number" min={0} max={100} {...field} />
                  </FormControl>
                  <FormDescription>
                    La plus haute passe devant les annonces des boutiques.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="active"
              render={({ field }) => (
                <FormItem className="flex flex-col justify-center gap-2">
                  <FormLabel>Allumée</FormLabel>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                  <FormDescription>Éteinte, elle attend sans s'afficher.</FormDescription>
                </FormItem>
              )}
            />
          </div>

          <div className="flex gap-2">
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Publication…' : 'Publier'}
            </Button>
            <Button type="button" variant="outline" onClick={onCancel}>
              Annuler
            </Button>
          </div>
        </div>

        <div className="lg:sticky lg:top-6 lg:h-fit lg:w-72">
          <p className="text-muted-foreground mb-2 text-sm">À l'ouverture de l'application</p>
          <div className="bg-muted/40 rounded-2xl border p-4">
            <div className="bg-background overflow-hidden rounded-xl border shadow-sm">
              {imageUrl && <img src={imageUrl} alt="" className="max-h-64 w-full object-contain" />}
              {(title || subtitle) && (
                <div className="space-y-1 p-4">
                  {title && <p className="font-medium">{title}</p>}
                  {subtitle && <p className="text-muted-foreground text-sm">{subtitle}</p>}
                </div>
              )}
              {!imageUrl && !title && !subtitle && (
                <p className="text-muted-foreground p-6 text-center text-sm">
                  Rien à montrer pour l'instant.
                </p>
              )}
            </div>
          </div>
        </div>
      </form>
    </Form>
  )
}

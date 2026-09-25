import type { HomeSectionPayload } from '../forms/home-section-form'
import {
  adminHomeSectionsControllerCreate,
  adminHomeSectionsControllerList,
  adminHomeSectionsControllerRemove,
  adminHomeSectionsControllerReorder,
  adminHomeSectionsControllerUpdate,
} from '@boilerstone/openapi-generator/client/sdk.gen'
import { Badge } from '@boilerstone/ui/components/primitives/badge'
import { Button } from '@boilerstone/ui/components/primitives/button'
import {
  Dialog,
  DialogContent,
} from '@boilerstone/ui/components/primitives/dialog'
import { Skeleton } from '@boilerstone/ui/components/primitives/skeleton'
import { Switch } from '@boilerstone/ui/components/primitives/switch'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { HomeSectionForm } from '../forms/home-section-form'

interface HomeSectionRow extends HomeSectionPayload {
  id: string
  position: number
  active: boolean
}

const QUERY_KEY = ['admin', 'home-sections']

/**
 * The home sections, arranged as the buyer will see them.
 *
 * They used to be hard-coded in the app: renaming "Validé eBio" meant a build
 * and a Play Store submission. The list here is in display order, and moves a
 * notch at a time — that is the gesture people make, and it avoids the states
 * where two sections fight over a place.
 */
export function HomeSectionsManager() {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<HomeSectionRow | null>(null)
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState<HomeSectionRow | null>(null)

  const { data: sections = [], isLoading } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const response = await adminHomeSectionsControllerList()
      if (response.error)
        throw new Error('Failed to load home sections')
      return (response.data as { sections: HomeSectionRow[] }).sections
    },
  })

  const refresh = (): void => {
    void queryClient.invalidateQueries({ queryKey: QUERY_KEY })
  }

  const { mutate: create, isPending: isCreating } = useMutation({
    mutationFn: async (payload: HomeSectionPayload) => {
      const response = await adminHomeSectionsControllerCreate({ body: payload as never })
      if (response.error)
        throw new Error('Failed to create section')
      return response.data
    },
    onSuccess: () => {
      setCreating(false)
      refresh()
    },
  })

  const { mutate: update, isPending: isUpdating } = useMutation({
    mutationFn: async ({ id, payload }: { id: string, payload: HomeSectionPayload }) => {
      const response = await adminHomeSectionsControllerUpdate({ path: { id }, body: payload as never })
      if (response.error)
        throw new Error('Failed to update section')
      return response.data
    },
    onSuccess: () => {
      setEditing(null)
      refresh()
    },
  })

  const { mutate: remove } = useMutation({
    mutationFn: async (id: string) => {
      const response = await adminHomeSectionsControllerRemove({ path: { id } })
      if (response.error)
        throw new Error('Failed to delete section')
      return response.data
    },
    onSuccess: () => {
      setDeleting(null)
      refresh()
    },
  })

  const { mutate: reorder } = useMutation({
    mutationFn: async (ids: string[]) => {
      const response = await adminHomeSectionsControllerReorder({ body: { ids } as never })
      if (response.error)
        throw new Error('Failed to reorder sections')
      return response.data
    },
    onSuccess: refresh,
  })

  /** One notch at a time: that is the gesture people make at a list. */
  const move = (index: number, direction: -1 | 1): void => {
    const next = [...sections]
    const target = index + direction
    if (target < 0 || target >= next.length)
      return
    const [moved] = next.splice(index, 1)
    next.splice(target, 0, moved)
    reorder(next.map(section => section.id))
  }

  if (isLoading) {
    return <Skeleton className="h-64 w-full" />
  }

  if (creating || editing) {
    return (
      <HomeSectionForm
        initial={editing ?? undefined}
        isPending={isCreating || isUpdating}
        onCancel={() => {
          setCreating(false)
          setEditing(null)
        }}
        onSubmit={(payload) => {
          if (editing) {
            update({ id: editing.id, payload })
          }
          else {
            create(payload)
          }
        }}
      />
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-sm">
          Dans cet ordre sur l'accueil. Une section sans produit disponible n'est pas affichée.
        </p>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Nouvelle section
        </Button>
      </div>

      <ul className="divide-y rounded-md border">
        {sections.map((section, index) => (
          <li key={section.id} className="flex items-center gap-3 p-3">
            <div className="flex flex-col">
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6"
                disabled={index === 0}
                aria-label={`Monter ${section.title}`}
                onClick={() => move(index, -1)}
              >
                <ArrowUp className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6"
                disabled={index === sections.length - 1}
                aria-label={`Descendre ${section.title}`}
                onClick={() => move(index, 1)}
              >
                <ArrowDown className="h-3.5 w-3.5" />
              </Button>
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium">{section.title}</span>
                <Badge variant="outline">
                  {section.mode === 'MANUAL' ? 'Produits choisis' : 'Par critères'}
                </Badge>
              </div>
              {section.subtitle && (
                <p className="text-muted-foreground truncate text-sm">{section.subtitle}</p>
              )}
            </div>

            <Switch
              checked={section.active}
              aria-label={section.active ? `Éteindre ${section.title}` : `Allumer ${section.title}`}
              onCheckedChange={active => update({ id: section.id, payload: { ...section, active } as never })}
            />

            <Button
              size="icon"
              variant="ghost"
              aria-label={`Modifier ${section.title}`}
              onClick={() => setEditing(section)}
            >
              <Pencil className="h-4 w-4" />
            </Button>

            <Button
              size="icon"
              variant="ghost"
              aria-label={`Supprimer ${section.title}`}
              // Switching off is enough in almost every case; deleting loses
              // the criteria, and that is what gets confirmed.
              onClick={() => setDeleting(section)}
            >
              <Trash2 className="text-destructive h-4 w-4" />
            </Button>
          </li>
        ))}
      </ul>

      <Dialog open={deleting !== null} onOpenChange={open => !open && setDeleting(null)}>
        <DialogContent>
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold">
                {`Supprimer « ${deleting?.title ?? ''} » ?`}
              </h3>
              <p className="text-muted-foreground text-sm">
                Ses critères seront perdus. L'éteindre la retire de l'accueil sans rien effacer.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDeleting(null)}>Annuler</Button>
              <Button
                variant="destructive"
                onClick={() => deleting && remove(deleting.id)}
              >
                Supprimer
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

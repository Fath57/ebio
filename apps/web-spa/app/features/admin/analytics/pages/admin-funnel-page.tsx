import { analyticsControllerFunnelReport } from '@boilerstone/openapi-generator/client/sdk.gen'
import { Button } from '@boilerstone/ui/components/primitives/button'
import { Card, CardContent, CardHeader, CardTitle } from '@boilerstone/ui/components/primitives/card'
import { Skeleton } from '@boilerstone/ui/components/primitives/skeleton'
import { useQuery } from '@tanstack/react-query'
import { TriangleAlert } from 'lucide-react'
import { useState } from 'react'

interface Stage {
  key: string
  label: string
  people: number
  rate: number | null
}

interface FunnelReport {
  days: number
  measuringSince: string | null
  windowComplete: boolean
  stages: Stage[]
  refusals: Array<{ reason: string, people: number }>
  worstStep: { from: string, to: string, lost: number } | null
}

const WINDOWS = [7, 30, 90]

/**
 * Where people stop, between filling a basket and receiving it.
 *
 * The bars are drawn against the first stage and not against the widest, so
 * the shape of the loss is visible at a glance rather than normalised away.
 */
export default function AdminFunnelPage() {
  const [days, setDays] = useState(7)

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'analytics', 'funnel', days],
    queryFn: async () => {
      const response = await analyticsControllerFunnelReport({ query: { days: String(days) } as never })
      if (response.error)
        throw new Error('Failed to load funnel')
      return response.data as unknown as FunnelReport
    },
  })

  const top = data?.stages[0]?.people ?? 0
  // Said by the server, which knows both dates: a longer window than the
  // measurement shows orders without the baskets that led to them, which is
  // an artefact and not a finding.
  const incomplete = data !== undefined && !data.windowComplete && data.measuringSince !== null

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Entonnoir</h1>
          <p className="text-muted-foreground">
            Où les acheteurs s'arrêtent, entre le panier et la livraison.
          </p>
        </div>
        <div className="flex gap-1">
          {WINDOWS.map(window => (
            <Button
              key={window}
              size="sm"
              variant={days === window ? 'default' : 'outline'}
              onClick={() => setDays(window)}
            >
              {`${window} j`}
            </Button>
          ))}
        </div>
      </div>

      {isLoading || !data
        ? <Skeleton className="h-80 w-full" />
        : (
            <>
              {incomplete && (
                <div className="flex items-start gap-3 rounded-md border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-800 dark:bg-amber-950">
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                  <p>
                    La mesure des paniers et des devis a commencé le
                    {' '}
                    {new Date(data.measuringSince!).toLocaleDateString('fr-FR')}
                    . Sur une fenêtre plus ancienne, les commandes apparaissent sans les
                    paniers qui les ont précédées — les taux du haut ne veulent alors rien dire.
                  </p>
                </div>
              )}

              <Card>
                <CardHeader>
                  <CardTitle>{`Les ${data.days} derniers jours`}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {data.stages.map(stage => (
                    <div key={stage.key} className="space-y-1">
                      <div className="flex items-baseline justify-between text-sm">
                        <span className="font-medium">{stage.label}</span>
                        <span>
                          <strong>{stage.people}</strong>
                          {stage.people > 1 ? ' personnes' : ' personne'}
                          {stage.rate !== null && (
                            <span className="text-muted-foreground">{` · ${stage.rate} %`}</span>
                          )}
                        </span>
                      </div>
                      <div className="bg-muted h-3 w-full overflow-hidden rounded">
                        <div
                          className="bg-primary h-full rounded"
                          style={{ width: top > 0 ? `${Math.min(100, (stage.people / top) * 100)}%` : '0%' }}
                        />
                      </div>
                    </div>
                  ))}

                  {data.worstStep && (
                    <p className="text-muted-foreground pt-2 text-sm">
                      {`Plus grosse perte : ${data.worstStep.lost} personne${data.worstStep.lost > 1 ? 's' : ''} entre « ${data.worstStep.from} » et « ${data.worstStep.to} ».`}
                    </p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Pourquoi ça a été refusé</CardTitle>
                  <p className="text-muted-foreground text-sm">
                    Les motifs que le serveur a renvoyés, dans les mots que l'acheteur a lus.
                  </p>
                </CardHeader>
                <CardContent>
                  {data.refusals.length === 0
                    ? <p className="text-muted-foreground text-sm">Aucun refus sur la période.</p>
                    : (
                        <ul className="divide-y">
                          {data.refusals.map(refusal => (
                            <li key={refusal.reason} className="flex items-center justify-between gap-4 py-2 text-sm">
                              <span className="min-w-0">{refusal.reason}</span>
                              <span className="shrink-0 font-medium">
                                {refusal.people}
                                {refusal.people > 1 ? ' personnes' : ' personne'}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                </CardContent>
              </Card>
            </>
          )}
    </div>
  )
}

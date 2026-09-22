import type { ReportedReview } from '../utils/moderation-queries'
import { Button } from '@boilerstone/ui/components/primitives/button'
import { Card, CardContent, CardHeader, CardTitle } from '@boilerstone/ui/components/primitives/card'
import { useCallback, useEffect, useState } from 'react'
import { fetchPendingReports, setReviewVisibility } from '../utils/moderation-queries'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * The moderation queue for reported product reviews.
 *
 * Hiding a review pulls it out of the public lists and out of the product's
 * average; dismissing leaves it in place. Either decision settles the report,
 * so an item always leaves the queue.
 */
export default function ReviewModerationPage() {
  const [reports, setReports] = useState<ReportedReview[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setReports(await fetchPendingReports())
    }
    catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Erreur inconnue')
    }
    finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const decide = useCallback(async (reviewId: string, hidden: boolean) => {
    setPendingId(reviewId)
    try {
      await setReviewVisibility(reviewId, hidden)
      await load()
    }
    catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Erreur inconnue')
    }
    finally {
      setPendingId(null)
    }
  }, [load])

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Avis signalés</h2>
        <p className="text-muted-foreground">
          Les avis sur les produits qu'un acheteur a signalés. Masquer un avis le
          retire des fiches et du calcul de la note.
        </p>
      </div>

      {error !== null && (
        <p className="text-destructive text-sm">{error}</p>
      )}

      {loading
        ? <p className="text-muted-foreground text-sm">Chargement…</p>
        : reports.length === 0
          ? <p className="text-muted-foreground text-sm">Aucun signalement en attente.</p>
          : (
              <div className="space-y-4">
                {reports.map(report => (
                  <Card key={report.reportId}>
                    <CardHeader>
                      <CardTitle className="text-base">
                        {report.review !== null
                          ? `${report.review.rating}/5 · ${report.review.authorName}`
                          : 'Avis supprimé depuis le signalement'}
                      </CardTitle>
                      <p className="text-muted-foreground text-sm">
                        Signalé le
                        {' '}
                        {formatDate(report.reportedAt)}
                        {' — '}
                        {report.reason}
                      </p>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {report.review?.comment != null && (
                        <p className="text-sm whitespace-pre-line">{report.review.comment}</p>
                      )}
                      {report.review !== null && (
                        <div className="flex gap-2">
                          <Button
                            variant="destructive"
                            disabled={pendingId === report.review.id}
                            onClick={() => decide(report.review!.id, true)}
                          >
                            Masquer l'avis
                          </Button>
                          <Button
                            variant="outline"
                            disabled={pendingId === report.review.id}
                            onClick={() => decide(report.review!.id, false)}
                          >
                            Rejeter le signalement
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
    </div>
  )
}

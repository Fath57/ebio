import { Button } from '@boilerstone/ui/components/primitives/button'
import { ArrowLeft } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation, useNavigate } from 'react-router'

interface BackLinkProps {
  /** Where to go when the page was opened directly (shared link, reload in a new tab). */
  fallback: string
}

/**
 * "Back" from a detail page returns to the list exactly as it was left —
 * filters, page and sort live in that entry's URL. A page opened with no
 * history behind it falls back to the bare list.
 */
export function BackLink({ fallback }: BackLinkProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const hasHistory = location.key !== 'default'

  return (
    <Button variant="ghost" size="sm" asChild>
      <Link
        to={fallback}
        onClick={(event) => {
          if (!hasHistory || event.metaKey || event.ctrlKey || event.shiftKey)
            return
          event.preventDefault()
          navigate(-1)
        }}
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        {t('common.back')}
      </Link>
    </Button>
  )
}

import { Badge } from '@boilerstone/ui/components/primitives/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@boilerstone/ui/components/primitives/card'
import { cn } from '@boilerstone/ui/lib/utils'
import { Handshake, ShoppingCart } from 'lucide-react'
import { useTranslation } from 'react-i18next'

export type SupplierMode = 'CONTACT' | 'ORDER'

interface ModeSelectorProps {
  currentMode: SupplierMode
  onModeChange: (mode: SupplierMode) => void
  isPending: boolean
}

const MODES: Array<{ key: SupplierMode, icon: typeof Handshake, titleKey: string, descriptionKey: string }> = [
  { key: 'CONTACT', icon: Handshake, titleKey: 'settings.mode.contact', descriptionKey: 'settings.mode.contactDescription' },
  { key: 'ORDER', icon: ShoppingCart, titleKey: 'settings.mode.order', descriptionKey: 'settings.mode.orderDescription' },
]

export function ModeSelector({ currentMode, onModeChange, isPending }: ModeSelectorProps) {
  const { t } = useTranslation()

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {MODES.map(({ key, icon: Icon, titleKey, descriptionKey }) => {
        const isActive = currentMode === key

        return (
          <Card
            key={key}
            className={cn(
              'cursor-pointer transition-all',
              isActive && 'border-primary ring-2 ring-primary/20',
              isPending && 'pointer-events-none opacity-60',
            )}
            onClick={() => {
              if (!isActive && !isPending)
                onModeChange(key)
            }}
          >
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-base">
                <span className="flex items-center gap-2">
                  <Icon className="h-5 w-5" />
                  {t(titleKey)}
                </span>
                {isActive && (
                  <Badge variant="default">{t('settings.mode.active')}</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {t(descriptionKey)}
              </p>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

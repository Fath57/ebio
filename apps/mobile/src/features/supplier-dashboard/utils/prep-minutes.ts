import { appAlert } from '../../common/components/app-alert'

/** Preparation-time choices offered when a delivery order enters PREPARING (minutes). */
export const PREP_MINUTES_OPTIONS: ReadonlyArray<{ label: string, minutes: number }> = [
  { label: '10 min', minutes: 10 },
  { label: '20 min', minutes: 20 },
  { label: '30 min', minutes: 30 },
  { label: '45 min', minutes: 45 },
  { label: '1 h', minutes: 60 },
]

/**
 * Asks the shop how long the preparation will take; the courier search
 * starts 10 minutes before that estimate. Cancelling calls nothing.
 */
export function askPrepMinutes(onPick: (minutes: number) => void): void {
  appAlert('Prête dans combien de temps ?', 'Le livreur sera cherché 10 minutes avant.', [
    ...PREP_MINUTES_OPTIONS.map(option => ({
      text: option.label,
      onPress: () => {
        onPick(option.minutes)
      },
    })),
    { text: 'Annuler', style: 'cancel' as const },
  ])
}

/** Same grouping as the app: a thousands space, never a comma. */
export function formatPrice(value: number): string {
  return value.toLocaleString('fr-FR').replace(/,/g, ' ')
}

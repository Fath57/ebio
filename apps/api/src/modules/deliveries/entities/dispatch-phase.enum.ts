/**
 * How the delivery is being offered to couriers, right now.
 *
 * Lives in its own file because both `Delivery` and `DeliveryRun` refer to it:
 * keeping it in either created a circular import, and the enum read as
 * `undefined` while the other was loading.
 */
export enum DispatchPhase {
  /** Created while the shop prepares; the search starts at dispatchAt. */
  SCHEDULED = 'SCHEDULED',
  /** One ranked courier at a time, 40 s each. */
  TARGETED = 'TARGETED',
  /** Everyone within the radius; first to accept wins. */
  BROADCAST = 'BROADCAST',
}

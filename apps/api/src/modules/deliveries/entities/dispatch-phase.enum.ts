/**
 * Comment la course est proposée aux livreurs, à l'instant présent.
 *
 * Vit dans son propre fichier parce que `Delivery` et `DeliveryRun` s'y
 * réfèrent toutes deux : le garder dans l'une des deux créait un import
 * circulaire, et l'enum se lisait `undefined` au chargement de l'autre.
 */
export enum DispatchPhase {
  /** Créée pendant que la boutique prépare ; la recherche démarre à dispatchAt. */
  SCHEDULED = 'SCHEDULED',
  /** Un livreur classé à la fois, 40 s chacun. */
  TARGETED = 'TARGETED',
  /** Tout le monde dans le rayon, le premier qui accepte l'emporte. */
  BROADCAST = 'BROADCAST',
}

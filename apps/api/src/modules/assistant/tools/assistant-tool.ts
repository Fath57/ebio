import type { z } from 'zod'

/**
 * Ce qu'un outil sait faire, et rien de plus.
 *
 * Le modèle ne connaît du domaine que ce que cette liste expose. C'est ce qui
 * rend l'ancrage tenable : ce n'est pas une consigne qu'on lui donne, c'est la
 * seule chose qu'il puisse faire. Un outil de paiement n'existe pas — et ce
 * qui n'existe pas ne s'appelle pas par erreur.
 */
export interface AssistantTool<TArgs extends z.ZodTypeAny = z.ZodTypeAny> {
  /** Le nom que le modèle appelle. En français : il raisonne dans cette langue. */
  name: string
  /**
   * À quoi il sert, écrit pour le modèle. C'est la seule documentation qu'il
   * aura : dire quand *ne pas* s'en servir vaut autant que dire quand s'en
   * servir.
   */
  description: string
  parameters: TArgs
  /** `buyerId` vient de la session, jamais du modèle : on ne lui confie pas l'identité. */
  execute: (args: z.infer<TArgs>, context: AssistantToolContext) => Promise<unknown>
}

export interface AssistantToolContext {
  buyerId: string
  sessionId: string
}

/** Un appel d'outil tel qu'il est journalisé, pour pouvoir le relire. */
export interface RecordedToolCall {
  name: string
  args: unknown
  result: unknown
  ms: number
}

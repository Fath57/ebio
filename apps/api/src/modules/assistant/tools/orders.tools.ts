import type { EntityManager } from '@mikro-orm/postgresql'
import type { AssistantToolContext } from './assistant-tool'
import { QueryOrder } from '@mikro-orm/core'
import { z } from 'zod'
import { Delivery } from '../../deliveries/entities/delivery.entity'
import { Order, OrderStatus } from '../../orders/entities/order.entity'

/** Ce qu'une commande est en train de faire, dit comme on le dirait. */
const ORDER_STATUS_LABELS: Record<string, string> = {
  PENDING_PAYMENT: 'en attente de paiement',
  PLACED: 'reçue par la boutique',
  ACCEPTED: 'acceptée par la boutique',
  PREPARING: 'en préparation',
  READY: 'prête, en attente du livreur',
  IN_DELIVERY: 'en cours de livraison',
  DELIVERED: 'livrée',
  CANCELLED: 'annulée',
}

const DELIVERY_STATUS_LABELS: Record<string, string> = {
  AWAITING_COURIER: 'aucun livreur n\'a encore pris la course',
  ACCEPTED: 'un livreur a pris la course',
  PICKED_UP: 'le livreur a récupéré la commande',
  IN_TRANSIT: 'le livreur est en route',
  DELIVERED: 'livrée',
  FAILED: 'la livraison a échoué',
}

const OPEN_STATUSES = [
  OrderStatus.PLACED,
  OrderStatus.ACCEPTED,
  OrderStatus.PREPARING,
  OrderStatus.READY,
  OrderStatus.IN_DELIVERY,
]

export function ongoingOrdersTool(em: EntityManager) {
  const parameters = z.object({})
  return {
    name: 'commandes_en_cours',
    description: [
      'Liste les commandes en cours de l\'acheteur.',
      'À utiliser quand il demande où en est sa commande et qu\'il peut en avoir plusieurs :',
      'les désigner par la boutique et leur contenu, jamais par un numéro — personne ne connaît ses numéros.',
    ].join(' '),
    parameters,
    async execute(_args: z.infer<typeof parameters>, context: AssistantToolContext) {
      const orders = await em.find(
        Order,
        { buyer: { id: context.buyerId }, status: { $in: OPEN_STATUSES } },
        { populate: ['supplier', 'items', 'items.product'], orderBy: { createdAt: QueryOrder.DESC }, limit: 5 },
      )
      return {
        commandes: orders.map(order => ({
          id: order.id,
          boutique: order.supplier.shopName,
          contenu: order.items.getItems().map(i => i.product.name).slice(0, 3),
          etat: ORDER_STATUS_LABELS[order.status] ?? order.status,
          passeeLe: order.createdAt.toISOString(),
        })),
      }
    },
  }
}

export function orderStatusTool(em: EntityManager) {
  const parameters = z.object({
    commandeId: z.string().uuid().describe('L\'identifiant rendu par commandes_en_cours.'),
  })

  return {
    name: 'statut_commande',
    description: [
      'Donne l\'état d\'une commande et de sa livraison.',
      'Énoncer ce qui est rendu, et rien de plus : ne jamais estimer un délai ni une heure d\'arrivée.',
    ].join(' '),
    parameters,
    async execute(args: z.infer<typeof parameters>, context: AssistantToolContext) {
      const order = await em.findOne(
        Order,
        { id: args.commandeId, buyer: { id: context.buyerId } },
        { populate: ['supplier', 'items', 'items.product'] },
      )
      if (!order) {
        return { erreur: 'Commande introuvable.' }
      }

      const delivery = await em.findOne(Delivery, { order: { id: order.id } }, { populate: ['courier'] })

      return {
        boutique: order.supplier.shopName,
        contenu: order.items.getItems().map(i => `${i.quantity} × ${i.product.name}`),
        etat: ORDER_STATUS_LABELS[order.status] ?? order.status,
        total: Number(order.totalAmount),
        livraison: delivery
          ? {
              etat: DELIVERY_STATUS_LABELS[delivery.status] ?? delivery.status,
              livreur: delivery.courier?.fullName ?? null,
            }
          : null,
      }
    },
  }
}

export function lastOrdersTool(em: EntityManager) {
  const parameters = z.object({})
  return {
    name: 'dernieres_commandes',
    description: 'Les dernières commandes livrées de l\'acheteur, pour un « comme la dernière fois ».',
    parameters,
    async execute(_args: z.infer<typeof parameters>, context: AssistantToolContext) {
      const orders = await em.find(
        Order,
        { buyer: { id: context.buyerId }, status: OrderStatus.DELIVERED },
        { populate: ['supplier', 'items', 'items.product'], orderBy: { createdAt: QueryOrder.DESC }, limit: 3 },
      )
      return {
        commandes: orders.map(order => ({
          boutique: order.supplier.shopName,
          livreeLe: order.deliveredAt?.toISOString() ?? order.createdAt.toISOString(),
          articles: order.items.getItems().map(i => ({
            produitId: i.product.id,
            nom: i.product.name,
            quantite: i.quantity,
          })),
        })),
      }
    },
  }
}

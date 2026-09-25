import { randomUUID } from 'node:crypto'
import { Injectable } from '@nestjs/common'

/** Long enough to open the stream, short enough to be worthless if leaked. */
const TTL_MS = 120_000

interface Ticket {
  texte: string
  userId: string
  expiresAt: number
}

/**
 * A one-time claim on a sentence to be spoken.
 *
 * The phone plays the answer straight from the network so the sound starts
 * before the file is whole — and a player reads a **URL**, it cannot send a
 * body. Putting the sentence in the query string would write a buyer's
 * conversation into every proxy log between here and the phone, so the text
 * stays on the server and the URL carries nothing but a random identifier.
 *
 * In memory rather than in Redis: a ticket that outlives a restart is a ticket
 * nobody is waiting for any more.
 */
@Injectable()
export class AssistantVoiceTickets {
  private readonly tickets = new Map<string, Ticket>()

  issue(texte: string, userId: string): string {
    this.sweep()
    const id = randomUUID()
    this.tickets.set(id, { texte, userId, expiresAt: Date.now() + TTL_MS })
    return id
  }

  /**
   * Redeems a ticket, as many times as the player asks within its life.
   *
   * It used to be consumed on first read, which sounded tidy and was wrong: a
   * native player does not fetch a stream once. It reconnects, asks for a byte
   * range, retries a stall — and every one of those got a 404, so the voice
   * cut out mid-sentence. The ticket expires on time instead, which is what
   * actually bounds it.
   */
  redeem(id: string, userId: string): string | null {
    const ticket = this.tickets.get(id)
    if (!ticket || ticket.expiresAt <= Date.now() || ticket.userId !== userId) {
      return null
    }
    return ticket.texte
  }

  private sweep(): void {
    const now = Date.now()
    for (const [id, ticket] of this.tickets) {
      if (ticket.expiresAt <= now) {
        this.tickets.delete(id)
      }
    }
  }
}

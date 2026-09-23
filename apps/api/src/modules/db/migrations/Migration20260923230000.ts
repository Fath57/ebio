import { Migration } from '@mikro-orm/migrations'

/**
 * Les deux tables de l'assistant vocal.
 *
 * Écrite à la main et purement additive, comme les précédentes : `migration:create`
 * diffère l'ensemble du schéma, qui porte des années de dérive appliquée par
 * `schema:update`, et produirait un fichier voulant supprimer la moitié de la base.
 */
export class Migration20260923230000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`CREATE TABLE IF NOT EXISTS "assistant_sessions" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "buyer_id" uuid NOT NULL REFERENCES "users" ("id"),
      "messages" jsonb NOT NULL DEFAULT '[]',
      "state" jsonb NOT NULL DEFAULT '{}',
      "closed_at" timestamptz NULL,
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      "updatedAt" timestamptz NOT NULL DEFAULT now()
    );`)

    this.addSql(`CREATE INDEX IF NOT EXISTS "assistant_sessions_buyer_idx"
      ON "assistant_sessions" ("buyer_id", "createdAt" DESC);`)

    this.addSql(`CREATE TABLE IF NOT EXISTS "assistant_turns" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "session_id" uuid NOT NULL REFERENCES "assistant_sessions" ("id") ON DELETE CASCADE,
      "input" text NOT NULL,
      "output" text NULL,
      "tool_calls" jsonb NOT NULL DEFAULT '[]',
      "input_tokens" integer NOT NULL DEFAULT 0,
      "output_tokens" integer NOT NULL DEFAULT 0,
      "cost" numeric(10,2) NULL,
      "createdAt" timestamptz NOT NULL DEFAULT now()
    );`)

    this.addSql(`CREATE INDEX IF NOT EXISTS "assistant_turns_session_idx"
      ON "assistant_turns" ("session_id", "createdAt");`)
  }

  override async down(): Promise<void> {
    this.addSql(`DROP TABLE IF EXISTS "assistant_turns" CASCADE;`)
    this.addSql(`DROP TABLE IF EXISTS "assistant_sessions" CASCADE;`)
  }
}

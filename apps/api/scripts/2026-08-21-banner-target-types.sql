-- Banners gain two target types: URL (external link) and NONE (plain ad).
-- The target id becomes optional and the link gets its own column.
-- Idempotent: safe to replay.

BEGIN;

ALTER TABLE banners ALTER COLUMN target_id DROP NOT NULL;
ALTER TABLE banners ADD COLUMN IF NOT EXISTS target_url text;
ALTER TABLE banners DROP CONSTRAINT IF EXISTS banners_target_type_check;
ALTER TABLE banners ADD CONSTRAINT banners_target_type_check
  CHECK (target_type = ANY (ARRAY['SUPPLIER'::text, 'PRODUCT'::text, 'URL'::text, 'NONE'::text]));

COMMIT;

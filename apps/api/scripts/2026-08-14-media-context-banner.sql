-- Allows BANNER_IMAGE as a media context.
--
-- The value was added to the entity and to the Zod contract when banners were
-- introduced, but never to the table's CHECK constraint — the repository has no
-- migration history, so schema changes are applied by hand and this one was
-- missed. Every attempt to upload a banner image therefore failed with a 500,
-- silently, since the front swallowed upload errors.
--
-- The list is rewritten in full rather than patched: a CHECK constraint cannot
-- be extended in place.
--
--   ssh digit_immo_server "dokku postgres:connect ebio-postgres" < this-file.sql

BEGIN;

ALTER TABLE media DROP CONSTRAINT IF EXISTS media_context_check;

ALTER TABLE media ADD CONSTRAINT media_context_check CHECK (context = ANY (ARRAY[
  'PRODUCT_PHOTO',
  'SUPPLIER_COVER',
  'SUPPLIER_PROFILE',
  'IDENTITY_DOCUMENT',
  'BUSINESS_PROOF',
  'CHAT_ATTACHMENT',
  'VOICE_NOTE',
  'VOICE_DESCRIPTION',
  'TRAINING_CONTENT',
  'TRAINING_THUMBNAIL',
  'COMMUNITY_MEDIA',
  'CATEGORY_IMAGE',
  'BANNER_IMAGE'
]::text[]));

\echo '--- accepted contexts ---'
SELECT pg_get_constraintdef(oid) FROM pg_constraint
WHERE conrelid = 'media'::regclass AND conname = 'media_context_check';

COMMIT;

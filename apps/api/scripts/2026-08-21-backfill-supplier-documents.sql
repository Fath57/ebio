-- Registration used to drop the document media ids on the floor: the media
-- rows exist, linked to their uploader, but the supplier record never learned
-- about them. Link each supplier to the most recent document of its user.
-- Idempotent: only fills NULL columns.

BEGIN;

UPDATE suppliers s
SET identity_document = m.id::text
FROM (
  SELECT DISTINCT ON (uploaded_by) id, uploaded_by
  FROM media
  WHERE context = 'IDENTITY_DOCUMENT' AND status = 'READY'
  ORDER BY uploaded_by, "createdAt" DESC
) m
WHERE s.user_id = m.uploaded_by AND s.identity_document IS NULL;

UPDATE suppliers s
SET business_proof = m.id::text
FROM (
  SELECT DISTINCT ON (uploaded_by) id, uploaded_by
  FROM media
  WHERE context = 'BUSINESS_PROOF' AND status = 'READY'
  ORDER BY uploaded_by, "createdAt" DESC
) m
WHERE s.user_id = m.uploaded_by AND s.business_proof IS NULL;

COMMIT;

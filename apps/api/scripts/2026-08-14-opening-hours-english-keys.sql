-- Migrates opening hours from French to English day keys.
--
-- Shops created before the opening-hours format was unified store their week as
-- {"lundi": {...}, ..., "dimanche": null}. Neither `isOpenNow` nor the two
-- back-office screens can read those keys, so the affected shops are reported
-- closed at all times, in the app and in the back office alike.
--
-- A day stored as JSON null becomes an explicit closed day. `openingHoursSchema`
-- requires `open` and `close`, so the neutral 08:00-18:00 used as the web form's
-- default fills them in; the `closed` flag is what actually decides.
--
-- Idempotent: the WHERE clause only matches rows still holding a French key, so
-- a second run touches nothing. Wrapped in a transaction — check the counts
-- printed before COMMIT, and ROLLBACK instead if they look wrong.
--
-- Run with:
--   ssh digit_immo_server "dokku postgres:connect ebio-postgres" < this-file.sql

BEGIN;

-- Keeps the original payloads should anything need to be replayed.
CREATE TABLE IF NOT EXISTS suppliers_opening_hours_backup_20260814 AS
SELECT id, shop_name, opening_hours, now() AS saved_at
FROM suppliers
WHERE opening_hours IS NOT NULL;

\echo '--- before ---'
SELECT count(*) FILTER (WHERE opening_hours ?| array['lundi','mardi','mercredi','jeudi','vendredi','samedi','dimanche']) AS rows_with_french_keys,
       count(*) FILTER (WHERE opening_hours ?| array['monday','tuesday','wednesday','thursday','friday','saturday','sunday']) AS rows_with_english_keys,
       count(*) FILTER (WHERE opening_hours IS NULL) AS rows_without_hours
FROM suppliers;

UPDATE suppliers s
SET opening_hours = (
  SELECT jsonb_object_agg(
    -- An unmapped key is kept as-is rather than dropped: no silent data loss.
    coalesce(m.en, e.k),
    CASE
      WHEN jsonb_typeof(e.v) = 'null'
        THEN jsonb_build_object('open', '08:00', 'close', '18:00', 'closed', true)
      ELSE e.v
    END
  )
  FROM jsonb_each(s.opening_hours) e(k, v)
  LEFT JOIN (VALUES
    ('lundi', 'monday'),
    ('mardi', 'tuesday'),
    ('mercredi', 'wednesday'),
    ('jeudi', 'thursday'),
    ('vendredi', 'friday'),
    ('samedi', 'saturday'),
    ('dimanche', 'sunday')
  ) AS m(fr, en) ON m.fr = e.k
)
WHERE s.opening_hours IS NOT NULL
  AND s.opening_hours ?| array['lundi','mardi','mercredi','jeudi','vendredi','samedi','dimanche'];

\echo '--- after ---'
SELECT count(*) FILTER (WHERE opening_hours ?| array['lundi','mardi','mercredi','jeudi','vendredi','samedi','dimanche']) AS rows_with_french_keys,
       count(*) FILTER (WHERE opening_hours ?| array['monday','tuesday','wednesday','thursday','friday','saturday','sunday']) AS rows_with_english_keys,
       count(*) FILTER (WHERE opening_hours IS NULL) AS rows_without_hours
FROM suppliers;

\echo '--- day entries still holding a JSON null (expected: 0 rows) ---'
SELECT s.id, s.shop_name, e.k
FROM suppliers s, LATERAL jsonb_each(s.opening_hours) e(k, v)
WHERE s.opening_hours IS NOT NULL AND jsonb_typeof(e.v) = 'null';

COMMIT;

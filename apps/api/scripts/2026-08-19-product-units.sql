-- Units of sale become a reference list managed from the backoffice.
--
-- `products.unit` keeps holding the code, so no product is rewritten: only the
-- check constraint goes, because it froze the five original units and would
-- reject every unit an admin adds from now on.
--
-- Idempotent: safe to replay.

BEGIN;

CREATE TABLE IF NOT EXISTS product_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  label text NOT NULL,
  short_label text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

-- The five units the enum used to carry, with the labels the apps displayed.
INSERT INTO product_units (code, label, short_label, sort_order) VALUES
  ('KG',     'Kilogramme', 'kg',     0),
  ('LITER',  'Litre',      'litre',  1),
  ('SACHET', 'Sachet',     'sachet', 2),
  ('PIECE',  'Pièce',      'pièce',  3),
  ('LOT',    'Lot',        'lot',    4)
ON CONFLICT (code) DO NOTHING;

-- Any code already worn by a product but absent above. The list has to describe
-- what exists, otherwise those products could no longer be edited.
INSERT INTO product_units (code, label, short_label, sort_order)
SELECT DISTINCT p.unit, p.unit, p.unit, 100
FROM products p
WHERE NOT EXISTS (SELECT 1 FROM product_units u WHERE u.code = p.unit)
ON CONFLICT (code) DO NOTHING;

ALTER TABLE products DROP CONSTRAINT IF EXISTS products_unit_check;

COMMIT;

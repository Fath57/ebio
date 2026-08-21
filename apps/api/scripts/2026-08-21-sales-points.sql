-- Sales points: the places a supplier sells at besides the main shop.
-- Idempotent: safe to replay.

BEGIN;

CREATE TABLE IF NOT EXISTS sales_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES suppliers(id) ON UPDATE CASCADE ON DELETE CASCADE,
  name varchar(255) NOT NULL,
  address varchar(255),
  phone varchar(255),
  location geography(Point, 4326),
  opening_hours jsonb,
  is_active boolean NOT NULL DEFAULT true,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sales_points_supplier_id_index ON sales_points (supplier_id);
CREATE INDEX IF NOT EXISTS sales_points_location_index ON sales_points USING GIST (location);

COMMIT;

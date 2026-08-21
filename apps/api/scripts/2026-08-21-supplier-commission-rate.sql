-- Negotiated commission rate per supplier (fraction, e.g. 0.03).
-- NULL means the per-category grid in commission_rates applies.
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS commission_rate float;
